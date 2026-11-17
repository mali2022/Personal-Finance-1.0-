import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
async function prepare(page: Page) {
  let submitted: { message: string; accountIds?: string[] } | undefined;
  await page
    .context()
    .route(/http:\/\/127\.0\.0\.1:\d+\/api\/ai\/.*/, async (route) => {
      if (route.request().url().endsWith('/chat/stream')) {
        submitted = route.request().postDataJSON();
        await route.fulfill({
          contentType: 'text/event-stream',
          body:
            'event: completed\ndata: ' +
            JSON.stringify({
              conversationId: 'fixture',
              answer: '查询完成',
              sources: [],
              model: 'fixture',
              financialDataVerified: false,
            }) +
            '\n\n',
        });
        return;
      }
      const data = route.request().url().endsWith('/settings')
        ? {
            provider: 'DeepSeek',
            enabled: true,
            configured: true,
            model: 'fixture',
            foundationVersion: 1,
            privacy: { enabled: true, allowSummary: true, saveHistory: false },
            capabilities: {},
          }
        : { items: [], total: 0 };
      await route.fulfill({ json: { data } });
    });
  return () => submitted;
}
for (const path of [
    '/',
    '/transactions',
    '/accounts',
    '/budgets',
    '/reports',
    '/subscriptions',
    '/goals',
    '/settings',
    '/import',
]) {
  test(`contextual global entry on ${path}`, async ({ page }) => {
    await prepare(page);
    await page.goto(path);
    const button = page.getByRole('button', { name: '打开全局 AI Copilot' });
    await expect(button).toBeVisible();
    await button.click();
    const drawer = page.locator('.global-copilot-drawer');
    await expect(
      drawer.getByText('当前页面上下文', { exact: true }),
    ).toBeVisible();
    await drawer.locator('.ant-drawer-close').click();
  });
}
test('transaction account and dates are sent without unrelated URL text', async ({
  page,
}) => {
  const submitted = await prepare(page);
  const id = '12345678-1234-1234-1234-123456789abc';
  await page.goto(
    '/transactions?' +
      new URLSearchParams({
        accountId: id,
        start: '2026-10-01T00:00:00+08:00',
        end: '2026-10-31T23:59:59+08:00',
        currency: 'USD',
        password: 'never-send',
      }),
  );
  await page.getByRole('button', { name: '打开全局 AI Copilot' }).click();
  const drawer = page.locator('.global-copilot-drawer');
  await expect(
    drawer.getByText('2026-10-01 00:00 — 2026-10-31 23:59', { exact: true }),
  ).toBeVisible();
  await drawer.getByRole('button', { name: '发送问题', exact: true }).click();
  await expect(drawer.getByText('查询完成', { exact: true })).toBeVisible();
  expect(submitted()?.accountIds).toEqual([id]);
  expect(submitted()?.message).toContain('USD');
  expect(submitted()?.message).not.toContain('never-send');
});
test('page state changes update context and route changes close the old conversation', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/budgets');
  await page.getByRole('textbox', { name: '预算月份', exact: true }).click();
  await page.locator('.ant-picker-dropdown:visible td[title="2026-09"]').click();
  await expect(page.getByText('2026-09 月度预算', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开全局 AI Copilot' }).click();
  await expect(
    page
      .locator('.global-copilot-drawer')
      .getByText('2026-09-01 — 2026-09-30', { exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.locator('.global-copilot-drawer .ant-drawer-content'),
  ).toHaveCount(0);
});
test('mobile navigation exposes the English contextual Copilot without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page);
  await page.goto('/accounts');
  await page.getByRole('button', { name: '打开全部导航' }).click();
  await page
    .locator('.shell-mobile-drawer .ant-select.language-select')
    .click();
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: /^English$/ })
    .click();
  await page
    .locator('.shell-mobile-drawer')
    .getByRole('button', { name: 'Open global AI Copilot' })
    .click();
  await expect(
    page
      .locator('.global-copilot-drawer')
      .getByText('Current page context', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/global-copilot-mobile.png' });
});
