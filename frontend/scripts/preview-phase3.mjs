import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/reimbursements');
await expect(
  page.getByRole('row').filter({ hasText: '公司 · 出差费用' }),
).toBeVisible();
await page.screenshot({
  path: 'docs/screenshots/reimbursements-phase3.png',
  fullPage: true,
});
await page
  .getByRole('row')
  .filter({ hasText: '公司 · 出差费用' })
  .getByRole('button', { name: '查看详情' })
  .click();
await expect(page.getByText('完整资金记录')).toBeVisible();
await page.screenshot({
  path: 'docs/screenshots/reimbursement-detail-phase3.png',
  fullPage: true,
});
await page.goto('http://127.0.0.1:5173/loans');
await expect(
  page.getByRole('row').filter({ hasText: '朋友小陈' }),
).toBeVisible();
await page.screenshot({
  path: 'docs/screenshots/loans-phase3.png',
  fullPage: true,
});
await page.goto('http://127.0.0.1:5173/merchants');
await expect(page.getByRole('row').filter({ hasText: '麦当劳' })).toBeVisible();
await page.screenshot({
  path: 'docs/screenshots/merchants-phase3.png',
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:5173/reimbursements');
await page.getByRole('button', { name: '新增垫付' }).click();
await expect
  .poll(async () =>
    Math.round(
      (await page.getByRole('dialog', { name: '新增垫付' }).boundingBox())?.x ??
        -1,
    ),
  )
  .toBe(0);
await page.screenshot({
  path: 'docs/screenshots/reimbursement-mobile-phase3.png',
  fullPage: true,
});
await page.getByRole('button', { name: '关闭', exact: true }).click();
await page.goto('http://127.0.0.1:5173/settings');
await page.getByText('深色', { exact: true }).click();
await page.goto('http://127.0.0.1:5173/loans');
await expect(
  page.getByRole('row').filter({ hasText: '朋友小陈' }),
).toBeVisible();
await page.screenshot({
  path: 'docs/screenshots/loans-mobile-dark-phase3.png',
  fullPage: true,
});
console.log(JSON.stringify({ pageErrors: errors }));
await browser.close();
