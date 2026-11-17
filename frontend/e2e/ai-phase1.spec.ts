import { test, expect } from './fixtures';

// UI-only fixtures. The global fixture blocks every unhandled API request,
// so this suite cannot reach the real local ledger on port 5085/5174.
async function prepare(page: import('@playwright/test').Page) {
  await page.context().route(/http:\/\/127\.0\.0\.1:\d+\/api\/ai\/.*/, async route => {
    const pathname = new URL(route.request().url()).pathname;
    const data = pathname.endsWith('/settings') ? {
      provider: 'DeepSeek', enabled: true, configured: true, model: 'mock', reasoningModel: 'mock', foundationVersion: 1,
      privacy: { enabled: true, allowSummary: true, allowDetails: false, allowPayroll: false, allowFamily: false, allowRecognitionText: false, saveHistory: false },
      transmission: 'UI fixture', legacyModels: 'UI fixture', dailyCallLimit: 100, capabilities: {}, documentation: 'https://api-docs.deepseek.com',
    } : { items: [], total: 0 };
    await route.fulfill({ json: { data, traceId: 'ui-test-only' } });
  });
  await page.goto('/ai-center/copilot'); await expect(page.getByRole('heading', { name: 'AI 财务助手', exact: true })).toBeVisible();
}
test('scope selection is explicit and an empty selection cannot invoke the model', async ({ page }) => {
  await prepare(page);
  await page.getByText('仅选定账户', { exact: true }).click();
  await page.getByLabel('AI 问题或记账描述').fill('本月支出');
  await expect(page.getByRole('button', { name: '发送问题', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '新建会话', exact: true }).click();
  await expect(page.getByRole('button', { name: '发送问题', exact: true })).toBeDisabled();
});
test('English AI controls and keyboard labels are available', async ({ page }) => {
  await prepare(page);
  await page.locator('.ant-select.language-select:visible').first().click();
  await page.locator('.ant-select-item-option-content').filter({ hasText: /^English$/ }).click();
  await expect(page.getByRole('heading', { name: 'AI finance assistant', exact: true })).toBeVisible();
  await expect(page.getByLabel('AI question or entry description')).toBeVisible();
  await page.getByLabel('AI question or entry description').focus();
  await page.keyboard.type('What did I spend this month?');
  await expect(page.getByRole('button', { name: 'Send question', exact: true })).toBeEnabled();
});
test('mobile drafts remain empty and do not overflow the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page); await page.getByText('自然语言记账草稿', { exact: true }).click();
  await expect(page.getByText('暂无待确认草稿', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认选中草稿', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)).toBe(true);
  await page.screenshot({ path: 'test-results/ai-phase1-mobile.png', fullPage: true });
});
