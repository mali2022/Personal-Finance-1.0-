import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/budgets');
await expect(page.getByRole('button', { name: '编辑预算' })).toBeEnabled();
await page.screenshot({
  path: 'docs/screenshots/budgets-phase2.png',
  fullPage: true,
});
await page.goto('http://127.0.0.1:5173/reports');
await page.getByRole('tab', { name: '分类分析' }).click();
await expect(
  page.getByRole('row').filter({ hasText: '餐饮食品' }),
).toBeVisible();
await page.screenshot({
  path: 'docs/screenshots/reports-phase2.png',
  fullPage: true,
});
await page.goto('http://127.0.0.1:5173/accounts/credit');
await expect(page.getByText('待还款', { exact: true })).toBeVisible();
await page.screenshot({
  path: 'docs/screenshots/credit-card-phase2.png',
  fullPage: true,
});
await page.goto('http://127.0.0.1:5173/settings');
await page.getByText('深色', { exact: true }).click();
await page.goto('http://127.0.0.1:5173/reports');
await expect(page.getByRole('tab', { name: '收支趋势' })).toBeVisible();
await expect(
  page.getByRole('row').filter({ hasText: '2026-10' }),
).toBeVisible();
await page.screenshot({
  path: 'docs/screenshots/reports-dark-phase2.png',
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:5173/budgets');
await expect(page.getByRole('button', { name: '编辑预算' })).toBeEnabled();
await page.screenshot({
  path: 'docs/screenshots/budgets-mobile-phase2.png',
  fullPage: true,
});
console.log(JSON.stringify({ pageErrors: errors }));
await browser.close();
