import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:5173');
await page.locator('.home-page').waitFor();
await page.screenshot({
  path: 'docs/screenshots/dashboard-desktop.png',
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: 'docs/screenshots/dashboard-mobile.png',
  fullPage: true,
});
await page.getByRole('button', { name: '快速记账' }).click();
await page.getByPlaceholder('0.00').first().waitFor();
await expect(page.getByPlaceholder('0.00').first()).toBeFocused();
await page.screenshot({
  path: 'docs/screenshots/entry-mobile.png',
  fullPage: false,
});
console.log(JSON.stringify({ pageErrors: errors }));
await browser.close();
