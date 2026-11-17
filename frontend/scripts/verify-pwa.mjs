import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.route('**/api/**', (route) =>
  route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ message: '请先登录', code: 'UNAUTHORIZED' }),
  }),
);
await page.goto('http://127.0.0.1:4173/');
await expect(page).toHaveURL(/login/);
await page.evaluate(() => navigator.serviceWorker.ready);
await expect
  .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
  .toBe(true);
const cached = await page.evaluate(async () => {
  const names = await globalThis.caches.keys();
  const result = [];
  for (const name of names) {
    const cache = await globalThis.caches.open(name);
    for (const request of await cache.keys())
      result.push(new URL(request.url).pathname);
  }
  return result;
});
expect(cached.some((path) => path.startsWith('/api'))).toBe(false);
expect(cached).toContain('/manifest.webmanifest');
expect(cached.some((path) => path.startsWith('/assets/'))).toBe(true);
await context.setOffline(true);
await page.reload();
await expect(
  page.getByText(
    '当前离线：仅缓存应用资源，财务操作需要联网，未保存交易不会排队提交。',
  ),
).toBeVisible();
await expect(page.getByRole('button', { name: /登\s*录/ })).toBeVisible();
console.log(
  JSON.stringify({
    cachedResources: cached.length,
    cachedFinancialEndpoints: 0,
    offlineShell: true,
  }),
);
await browser.close();
