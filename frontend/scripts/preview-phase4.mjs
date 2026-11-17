import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto('http://127.0.0.1:5173/import');
  await page.locator('input[type=file]').setInputFiles({
    name: 'preview.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '日期,金额,交易类型,商户,交易单号\n2026-10-07 20:30:00,25.50,支出,麦当劳,PREVIEW-1\n2026-10-07 20:30:00,25.50,支出,麦当劳,PREVIEW-1\n2026-10-07 21:00:00,-1,支出,异常记录,PREVIEW-2',
    ),
  });
  await page.getByRole('button', { name: '生成预览并检测重复' }).click();
  await expect(
    page.getByRole('row').filter({ hasText: '异常记录' }),
  ).toBeVisible();
  await expect(page.locator('.ant-spin-spinning')).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('.ant-table-wrapper .ant-spin-container')
        .evaluate((el) => globalThis.getComputedStyle(el).opacity),
    )
    .toBe('1');
  await page.screenshot({
    path: 'docs/screenshots/phase4-import.png',
    fullPage: true,
  });
  await page.goto('http://127.0.0.1:5173/reconciliation?accountId=cash');
  await page.getByLabel('实际余额', { exact: true }).fill('330.00');
  await page.getByRole('button', { name: '计算差额' }).click();
  await expect(page.getByText('资产调整差额')).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/phase4-reconciliation.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5173/import');
  await expect(page.locator('input[type=file]')).toBeAttached();
  await expect(
    page.getByRole('heading', { name: '账单，一次整理好' }),
  ).toBeVisible();
  await page.screenshot({
    path: 'docs/screenshots/phase4-mobile-import.png',
    fullPage: true,
  });
} finally {
  await browser.close();
}
