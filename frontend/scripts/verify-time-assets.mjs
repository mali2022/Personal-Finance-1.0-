import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
const fixture = JSON.parse(
  fs.readFileSync('src/tests/fixtures/time-assets.json', 'utf8'),
);
fs.mkdirSync('test-results/time-assets', { recursive: true });
fs.writeFileSync(
  'test-results/time-assets/harness.html',
  `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><div id="root" style="padding:16px"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {App,ConfigProvider} from 'antd';import {BrowserRouter} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import Page from '/src/pages/TimeAssetsPage.tsx';import {useUI} from '/src/stores/ui.ts';import '/src/design/tokens.css';import '/src/styles.css';const params=new URLSearchParams(location.search);useUI.setState({language:params.get('lang')==='en'?'en':'zh-CN',hidden:false});history.replaceState({},'', '/time-assets'+(params.get('section')||''));createRoot(document.getElementById('root')).render(React.createElement(ConfigProvider,null,React.createElement(App,null,React.createElement(QueryClientProvider,{client:new QueryClient()},React.createElement(BrowserRouter,null,React.createElement(Page))))));</script></body></html>`,
);
const browser = await chromium.launch({ headless: true });
const errors = [];
const checks = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      timezoneId: 'America/New_York',
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/api/time-assets/**', (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
        json: {
          data: url.pathname.endsWith('/catalog')
            ? {
                categories: ['Work', 'Learning'],
                timers: [],
                valuations: [],
                templates: [],
                projects: [],
              }
            : fixture,
        },
      });
    });
    for (const section of [
      '',
      '/activities',
      '/valuation',
      '/budgets',
      '/finance',
      '/projects',
      '/ai',
      '/reports',
    ]) {
      await page.goto(
        'http://127.0.0.1:5187/test-results/time-assets/harness.html?section=' +
          encodeURIComponent(section),
      );
      await expect(
        page.getByRole('heading', { name: '时间资产管理', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.ant-skeleton')).toHaveCount(0);
      await page.screenshot({
        path: `test-results/time-assets/${width}-${section.slice(1) || 'overview'}.png`,
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      checks.push({ width, section, overflow });
      if (section === '/activities') {
        await expect(
          page.getByText('2026-10-18 09:00:00', { exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: /编\s*辑/ }).click();
        await expect(
          page.locator('input[value="2026-10-18 09:00:00"]'),
        ).toBeVisible();
        await page.getByRole('button', { name: /Cancel|取\s*消/ }).click();
      }
    }
    await page.goto(
      'http://127.0.0.1:5187/test-results/time-assets/harness.html?section=/reports&lang=en',
    );
    await expect(
      page.getByRole('heading', {
        name: 'Time Assets Management',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export complete report JSON' }),
    ).toBeVisible();
    await context.close();
  }
  fs.writeFileSync(
    'test-results/time-assets/browser-proof.json',
    JSON.stringify({ checks, pageErrors: errors }, null, 2),
  );
  if (errors.length) throw new Error(errors.join('\n'));
  if (checks.some((c) => c.overflow))
    throw new Error(
      'Horizontal document overflow: ' +
        JSON.stringify(checks.filter((c) => c.overflow)),
    );
  console.log(
    JSON.stringify({
      viewports: 3,
      pages: 24,
      english: true,
      shanghaiTimeFromNewYork: true,
      pageErrors: errors.length,
    }),
  );
} catch (e) {
  console.error('Browser errors:', errors);
  throw e;
} finally {
  await browser.close();
}
