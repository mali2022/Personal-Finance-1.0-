import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
async function prepare(page: Page) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const vehicle = {
    id: 'car',
    version: '1',
    name: '浏览器验收车辆',
    plate: 'UI-ONLY',
    fuelType: 'Petrol',
    status: 'Active',
  };
  const record = {
    id: 'fill',
    version: '1',
    vehicleId: 'car',
    date: '2026-01-10',
    odometer: 1500,
    litres: 30,
    amount: 210,
    currency: 'CNY',
    fullTank: true,
    tankStatus: 'Full',
    fuelGrade: 'Petrol95',
    missedFill: false,
    station: '浏览器验收站点',
    note: '隔离UI数据',
    enteredUnitPrice: null,
    quantitySource: 'Manual',
    unitPrice: 7,
    assessment: {
      recordId: 'fill',
      status: 'VALID',
      reason: 'FULL_TO_FULL',
      start: {
        id: 'start',
        date: '2026-01-01',
        odometer: 1000,
        litres: 40,
        tankStatus: 'Full',
      },
      end: {
        id: 'fill',
        date: '2026-01-10',
        odometer: 1500,
        litres: 30,
        tankStatus: 'Full',
      },
      participatingRecords: [],
      litres: 30,
      distance: 500,
      litresPer100Km: 6,
      ruleVersion: '2.0',
      calculatedAt: '2026-10-07T12:00:00Z',
    },
    interval: { distance: 500, litres: 30, litresPer100Km: 6 },
  };
  await page
    .context()
    .route(/http:\/\/127\.0\.0\.1:\d+\/api\/fuel\/.*/, async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      let data: unknown = [];
      if (request.method() !== 'GET') {
        const body = request.postDataJSON();
        writes.push({ path, body });
        data = { id: 'saved-fill' };
      } else if (path.endsWith('/vehicles')) data = [vehicle];
      else if (path.endsWith('/report'))
        data = {
          records: [record],
          stationPrices: [],
          quality: { ruleVersion: '1.0', issues: [], samples: [] },
          insights: { windows: [], rule: '' },
          summary: {
            count: 1,
            litres: 30,
            amount: 210,
            currency: 'CNY',
            otherCurrencyCount: 0,
            completedIntervals: 1,
            distance: 500,
            consumedLitres: 30,
            litresPer100Km: 6,
          },
          monthly: [{ month: '2026-01', litres: 30, amount: 210 }],
        };
      else if (path.endsWith('/costs'))
        data = {
          rows: [],
          originalExpenses: [],
          summary: [],
          monthly: [],
          categories: [],
          vehicles: [],
          rule: '',
        };
      else if (path.endsWith('/planning'))
        data = {
          link: null,
          asset: null,
          choices: [],
          opening: null,
          closing: null,
          modelConsumption: null,
          economicEstimate: null,
          rules: [],
          valuations: [],
          budgets: [],
        };
      else if (path.endsWith('/trash'))
        data = { records: [], total: 0, page: 1, limit: 50 };
      await route.fulfill({ json: { data } });
    });
  return writes;
}
test('七个工作台标签支持URL与浏览器返回，原记录可查看计算依据', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/analytics/fuel?tab=records&from=2026-01-01&to=2026-10-07');
  await expect(page.getByText('浏览器验收站点 · 隔离UI数据')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(7);
  await page.getByRole('tab', { name: '用车成本', exact: true }).click();
  await expect(page).toHaveURL(/tab=costs/);
  await expect(
    page.getByText('车辆预算、资产与经济成本', { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: '油耗分析', exact: true }).click();
  await expect(
    page.getByText('有效油耗趋势与滚动窗口', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('出行价值比较与费用审批', { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('tab', { name: '用车成本', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(
    page.getByRole('tab', { name: '加油记录', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '展开行' }).click();
  await expect(
    page.getByText('30 L ÷ 500 km × 100 = 6 L/100km', { exact: true }),
  ).toBeVisible();
});
test('真实浏览器本地OCR需确认后填入，保存原图与识别来源且不新增财务流水', async ({
  page,
}) => {
  test.setTimeout(90000);
  const writes = await prepare(page);
  await page.goto('/analytics/fuel?tab=records&from=2026-01-01&to=2026-10-07');
  await page.getByRole('button', { name: '记录加油', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '加油记录', exact: true });
  await expect(dialog).toBeVisible();
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 280;
    const x = c.getContext('2d')!;
    x.fillStyle = 'white';
    x.fillRect(0, 0, 1000, 280);
    x.fillStyle = 'black';
    x.font = '36px Arial';
    ['Amount paid: 150.00', 'Litres: 20.000', 'Odometer: 12345'].forEach(
      (t, i) => x.fillText(t, 30, 60 + i * 75),
    );
    return c.toDataURL('image/png').split(',')[1];
  });
  await dialog
    .getByLabel('选择加油凭证')
    .setInputFiles({
      name: 'fuel-ui-test.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
  await dialog.getByRole('button', { name: /本地识别图片/ }).click();
  await expect(dialog.getByLabel('识别原文')).toHaveValue(
    /Amount paid[\s\S]*150/,
    { timeout: 60000 },
  );
  await expect(
    dialog.getByRole('button', { name: '填入已核对字段', exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole('checkbox', { name: '已核对识别字段，填入后仍需确认保存' })
    .check();
  await dialog
    .getByRole('button', { name: '填入已核对字段', exact: true })
    .click();
  await expect(dialog.getByLabel('实付金额', { exact: true })).toHaveValue(
    /^150(?:\.00)?$/,
  );
  await expect(
    dialog.getByLabel('累计里程（km）', { exact: true }),
  ).toHaveValue(/^12345(?:\.0)?$/);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toBe('/api/fuel/record-receipts');
  expect(writes[0].body.receipt).toMatchObject({
    fileName: 'fuel-ui-test.png',
    ocrEngine: 'tesseract-browser',
    fieldsConfirmed: true,
  });
  expect(writes[0].body.record).toMatchObject({
    amount: 150,
    litres: 20,
    odometer: 12345,
    tankStatus: 'Unknown',
  });
});
test('移动端深色模式保持表格横向滚动并可隐藏原始站点', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    localStorage.setItem(
      'finance-ui',
      JSON.stringify({
        state: { theme: 'dark', language: 'zh-CN', hidden: false },
        version: 0,
      }),
    ),
  );
  await prepare(page);
  await page.goto('/analytics/fuel?tab=records&from=2026-01-01&to=2026-10-07');
  await expect(page.getByText('浏览器验收站点 · 隔离UI数据')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
  await expect(page.getByText('浏览器验收站点 · 隔离UI数据')).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: '显示金额', exact: true }),
  ).toBeVisible();
});
