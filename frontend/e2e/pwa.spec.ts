import { test, expect } from '@playwright/test';

test('生产离线缓存：版本页可阅读，按需模块可复用，API 与版本检查不缓存', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/updates');
    await expect(page.getByRole('heading', { name: '版本更新', exact: true })).toBeVisible();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const lazy = await page.evaluate(async () => {
      const script = await (await fetch('/sw.js')).text();
      const assets: string[] = JSON.parse(script.match(/const ASSETS=(\[[^;]+\]);/)![1]);
      const path = assets.find(path => path.includes('/ImportPage-'))!;
      const response = await fetch(path);
      if (!response.ok) throw Error('Lazy module fetch failed');
      await fetch('/release-info.json', { cache: 'no-store' });
      return { path, body: await response.text() };
    });
    await expect.poll(() => page.evaluate(async path => !!await caches.match(path), lazy.path)).toBe(true);
    const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat());
    expect(cached.some(path => path.startsWith('/api/') || path === '/release-info.json')).toBe(false);
    await context.setOffline(true);
    await page.goto('http://127.0.0.1:4173/updates');
    await expect(page.getByRole('heading', { name: '版本更新', exact: true })).toBeVisible();
    expect(await page.evaluate(async path => (await (await fetch(path)).text()), lazy.path)).toBe(lazy.body);
    await page.goto('http://127.0.0.1:4173/login');
    await expect(page.getByRole('button', { name: /登\s*录/ })).toBeVisible();
    await expect(page.getByText('当前离线：仅缓存应用资源，财务操作需要联网，未保存交易不会排队提交。')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
