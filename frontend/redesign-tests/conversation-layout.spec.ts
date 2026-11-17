import fs from 'node:fs';
import { test, expect } from '../e2e/fixtures';

const longTitle = '生成本年度的财务报告：汇总全部账户收入支出、分类预算执行情况及未来现金流风险，列出需要关注的问题';
for (const width of [320, 768, 1024, 1440]) {
  test.describe(`${width}px conversation history`, () => {
    test.use({ viewport: { width, height: 960 }, isMobile: width < 768, hasTouch: width < 768 });
    test('long titles keep every delete action inside the panel', async ({ page }) => {
      const items = [longTitle, 'LongUnbrokenConversationTitle'.repeat(5), '本月收支情况'].map((title, i) => ({ id: `history-${i}`, title, archived: false, version: '1' }));
      let deleted = '';
      await page.context().route('**/api/ai/**', async route => {
        const url = new URL(route.request().url());
        if (route.request().method() === 'DELETE') { deleted = url.pathname.split('/').at(-1)!; await route.fulfill({ json: { data: {} } }); return; }
        const data = url.pathname.endsWith('/settings') ? {
          provider: 'DeepSeek', enabled: true, configured: true, model: 'fixture', reasoningModel: 'fixture', foundationVersion: 1,
          dailyCallLimit: 0, capabilities: {}, transmission: '', legacyModels: '', documentation: '',
          privacy: { enabled: true, allowSummary: true, allowDetails: false, allowPayroll: false, allowFamily: false, allowRecognitionText: false, saveHistory: true },
        } : url.pathname.endsWith('/conversations') ? { items, total: 60, page: 1, pageSize: 20 } : {
          conversation: { ...items[0], accountIds: null }, items: [], total: 0, page: 1, pageSize: 20,
        };
        await route.fulfill({ json: { data } });
      });
      await page.goto('/ai-center/copilot');
      const history = page.locator('.ai-chat-history');
      const panel = history.locator('.ai-conversation-panel');
      await expect(panel.getByRole('button', { name: longTitle, exact: true })).toBeVisible();
      await expect.poll(() => history.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const box = (await panel.boundingBox())!;
      for (const button of await panel.locator('.ant-list-item-action button').all()) {
        const bounds = (await button.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(box.x);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(box.x + box.width + 1);
      }
      fs.mkdirSync('verification/conversation-layout', { recursive: true });
      await page.screenshot({ path: `verification/conversation-layout/${width}.png`, fullPage: true });
      await panel.getByRole('button', { name: longTitle, exact: true }).click();
      await expect(panel.getByLabel('会话名称')).toHaveValue(longTitle);
      await expect.poll(() => history.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await panel.locator('.ant-list-item-action button').first().click();
      await page.getByRole('button', { name: '确 定', exact: true }).click();
      await expect.poll(() => deleted).toBe('history-0');
      if (width === 1024) {
        await page.getByRole('button', { name: /打开侧边 Copilot/ }).click();
        const compact = page.locator('.ai-chat-compact .ai-chat-history');
        await expect(compact).toBeVisible();
        await expect.poll(() => compact.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      }
    });
  });
}
