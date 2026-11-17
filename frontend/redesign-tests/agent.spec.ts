import fs from 'node:fs';
import { test, expect } from '../e2e/fixtures';
import { prepareAgent } from './agent-fixture';
fs.mkdirSync('verification/ai-agent', { recursive: true });
for (const width of [320, 390, 1440]) {
  test.describe(String(width), () => {
    test.use({
      isMobile: width < 768,
      hasTouch: width < 768,
      viewport: { width, height: 900 },
    });
    test(`${width}px agent plan review and separate high-risk approval`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await prepareAgent(page, true);
      await page.goto('/ai/agent');
      await expect(
        page.getByRole('heading', { name: '自主财务 Agent' }),
      ).toBeVisible();
      await page.getByRole('button', { name: /跨账户分析并整理商户/ }).click();
      const approve = page.getByRole('button', {
        name: '授权并执行本次高风险计划',
        exact: true,
      });
      await expect(approve).toBeDisabled();
      await page
        .getByText('1. BatchDeleteTransactions', { exact: true })
        .click();
      await expect(
        page.getByText('操作预览与原值', { exact: true }),
      ).toBeVisible();
      await page
        .getByRole('checkbox', {
          name: '已逐项核对完整操作计划、影响范围及原值',
        })
        .check();
      await expect(approve).toBeDisabled();
      await page
        .getByRole('checkbox', {
          name: '单独授权本次高风险计划，不授予长期高风险权限',
        })
        .check();
      await expect(approve).toBeEnabled();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `verification/ai-agent/${width}-plan.png`,
        fullPage: true,
      });
      await approve.click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: '确认执行', exact: true })
        .click();
      await expect
        .poll(fixture.approved)
        .toEqual({ version: '3', planHashes: [fixture.hash], highRisk: true });
    });
    test(`${width}px advanced budgets, mobile dropdowns and emergency stop`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = await prepareAgent(page);
      await page.goto('/settings/ai/advanced');
      await expect(
        page.getByRole('heading', { name: 'AI 智能管理 · 高级功能' }),
      ).toBeVisible();
      const mode = page.getByLabel('AI 自主执行模式', { exact: true });
      await page
        .locator('.ant-select')
        .filter({ has: mode })
        .locator('.ant-select-selector')
        .click();
      const dropdown = page.locator('.ant-select-dropdown:visible');
      await expect(dropdown).toHaveCSS('opacity', '1');
      await expect
        .poll(async () => {
          const b = await dropdown.boundingBox();
          return (
            !!b &&
            b.x >= 0 &&
            b.y >= 0 &&
            b.x + b.width <= width + 1 &&
            b.y + b.height <= 900
          );
        })
        .toBe(true);
      const option = dropdown
        .locator('.ant-select-item-option')
        .filter({ hasText: 'C · 授权自动执行模式' });
      await option.click();
      const toolBudget = page.getByLabel('工具调用预算', { exact: true });
      await toolBudget.fill('500');
      await page
        .getByRole('button', { name: '保存高级设置', exact: true })
        .click();
      await expect
        .poll(
          () =>
            fixture.settingsBody() as {
              configuration?: { mode: string; toolBudget: number };
            },
        )
        .toMatchObject({ configuration: { mode: 'Auto', toolBudget: 500 } });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: `verification/ai-agent/${width}-settings.png`,
        fullPage: true,
      });
      await page
        .getByRole('button', { name: '紧急停止所有自动化任务', exact: true })
        .click();
      await expect.poll(fixture.stopped).toBe(true);
    });
  });
}
