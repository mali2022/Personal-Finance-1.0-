import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const origin = process.env.FUEL_VERIFY_ORIGIN || 'http://127.0.0.1:4173';
const output = 'verification/fuel';
mkdirSync(output, { recursive: true });
const id = '11111111-1111-1111-1111-111111111111';
const user = {
  id: 'test-user',
  email: 'fuel@example.test',
  displayName: 'Fuel tester',
  permissions: ['finance:read', 'finance:write'],
};
const vehicle = {
  id,
  version: '1',
  name: 'Test car',
  plate: 'TEST123',
  fuelType: 'Petrol',
};
const record = {
  id: '22222222-2222-2222-2222-222222222222',
  version: '1',
  vehicleId: id,
  date: '2026-10-10',
  odometer: 1500,
  litres: 30,
  amount: 210,
  currency: 'CNY',
  fullTank: true,
  missedFill: false,
  station: 'Test station',
  note: 'Test note',
  unitPrice: 7,
  interval: { distance: 500, litres: 50, litresPer100Km: 10 },
};
const report = {
  records: [record],
  summary: {
    count: 1,
    litres: 30,
    amount: 210,
    currency: 'CNY',
    otherCurrencyCount: 0,
    completedIntervals: 1,
    distance: 500,
    consumedLitres: 50,
    litresPer100Km: 10,
  },
  monthly: [{ month: '2026-10', litres: 30, amount: 210 }],
};
const browser = await chromium.launch();
const errors = [];
const results = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname;
      let data = {};
      if (
        route.request().method() === 'POST' &&
        p.startsWith('/api/fuel/records/') && p.endsWith('/delete')
      ) {
        await route.fulfill({
          status: 409,
          json: {
            code: 'VERSION_CONFLICT',
            message: '测试版本冲突，请刷新后重试',
          },
        });
        return;
      }
      if (p === '/api/auth/me') data = user;
      else if (p === '/api/fuel/vehicles') data = [vehicle];
      else if (p === '/api/fuel/report') data = report;
      else if (/accounts|categories|operations/.test(p)) data = [];
      else if (/conversations/.test(p)) data = { items: [], total: 0 };
      else if (p === '/api/ai/settings')
        data = {
          enabled: false,
          configured: false,
          privacy: { enabled: false },
        };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data }),
      });
    });
    await page.goto(origin + '/analytics/fuel');
    await expect(
      page.getByRole('heading', { name: '加油与油耗', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Test station · Test note')).toBeVisible();
    if (width === 1440)
      await expect(
        page.getByRole('menuitem', { name: /加油与油耗/ }),
      ).toHaveCount(1);
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    if (overflow.scroll > width + 1) throw Error(JSON.stringify(overflow));
    await page.getByRole('button', { name: '记录加油', exact: true }).click();
    await expect(page.getByLabel('累计里程（km）')).toBeVisible();
    await page.getByRole('button', { name: /取\s*消/ }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    if (width === 1440) {
      await page.getByRole('button', { name: /^删\s*除$/ }).click();
      const dialog = page.getByRole('dialog', { name: '确认删除？' });
      await dialog.getByRole('button', { name: /^确\s*定$/ }).click();
      await expect(
        page.getByText('测试版本冲突，请刷新后重试', { exact: true }),
      ).toBeVisible();
      await expect(dialog).toBeVisible();
      await expect(page.getByText('Test station · Test note')).toBeVisible();
      await dialog.getByRole('button', { name: /取\s*消/ }).click();
    }
    await page.screenshot({
      path: `${output}/fuel-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '导出 CSV', exact: true }),
    ).toBeDisabled();
    await expect(page.getByText('Test station · Test note')).toHaveCount(0);
    results.push({ width, noOverflow: true, recordForm: true, privacy: true });
    await context.close();
  }
} finally {
  await browser.close();
}
expect(errors).toEqual([]);
writeFileSync(
  output + '/browser-proof.json',
  JSON.stringify({ results, errors }, null, 2),
);
console.log(JSON.stringify({ results, errors }));
