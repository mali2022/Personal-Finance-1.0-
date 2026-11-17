import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
const origin = process.env.STARTUP_ORIGIN ?? 'http://127.0.0.1:4182';
const output = process.env.STARTUP_OUTPUT;
if (!output) throw Error('STARTUP_OUTPUT is required');
const browser = await chromium.launch(); const results = [];
try {
  for (const route of ['/login', '/updates']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage(); const assets = []; const pending = []; const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (/\/assets\/.*\.(js|css)$/.test(response.url())) pending.push(response.body().then(body => assets.push({ file: new URL(response.url()).pathname, bytes: body.length, type: response.url().endsWith('.js') ? 'js' : 'css' }))); });
    const start = performance.now(); await page.goto(origin + route);
    if (route === '/login') await expect(page.getByLabel('邮箱', { exact: true })).toBeVisible();
    else await expect(page.getByRole('heading', { name: '版本更新', exact: true })).toBeVisible();
    const readyMs = performance.now() - start;
    await page.waitForLoadState('networkidle'); await Promise.all(pending);
    expect(errors).toEqual([]);
    results.push({ route, readyMs, javascriptBytes: assets.filter(a => a.type === 'js').reduce((sum, a) => sum + a.bytes, 0), cssBytes: assets.filter(a => a.type === 'css').reduce((sum, a) => sum + a.bytes, 0), assets, errors });
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(output, JSON.stringify({ measuredAt: new Date().toISOString(), cache: 'fresh browser contexts, service workers blocked, uncompressed response bytes', results }, null, 2));
console.log(JSON.stringify(results.map(({ route, readyMs, javascriptBytes, cssBytes }) => ({ route, readyMs, javascriptBytes, cssBytes }))));
