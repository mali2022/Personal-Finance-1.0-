import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto('http://127.0.0.1:5173/');
  await expect(page.locator('.home-page')).toBeVisible();
  await expect
    .poll(() => page.locator('canvas').count())
    .toBeGreaterThanOrEqual(2);
  await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
  await page.screenshot({
    path: 'docs/screenshots/final-dashboard.png',
    fullPage: true,
  });
  await page.goto(
    'http://127.0.0.1:5173/transactions?type=Income&categoryId=salary',
  );
  await expect(
    page.getByRole('row').filter({ hasText: '工资薪酬' }),
  ).toHaveCount(1);
  await expect
    .poll(() =>
      page
        .locator('.ant-table-wrapper .ant-spin-container')
        .evaluate((el) => globalThis.getComputedStyle(el).opacity),
    )
    .toBe('1');
  await page.screenshot({
    path: 'docs/screenshots/final-income-filter.png',
    fullPage: true,
  });
  await page.goto('http://127.0.0.1:5173/settings');
  await page.getByLabel('深色', { exact: true }).check();
  await expect(page.locator('[data-theme=dark]')).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/final-dark-settings.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '记录资产损失' }).click();
  const entry = page.getByRole('dialog', { name: '记一笔', exact: true });
  await expect(entry.getByPlaceholder('0.00').first()).toBeFocused();
  await page.screenshot({ path: 'docs/screenshots/final-mobile-entry.png' });
} finally {
  await browser.close();
}
