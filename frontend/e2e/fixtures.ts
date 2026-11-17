import type { Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';
// Keep seeded financial periods reproducible without pausing request/animation timers.
export const test = base.extend<{ fixedTime: void }>({
  fixedTime: [
    async ({ page, context }, use) => {
      // MSW-handled requests remain in-memory. Unhandled requests must never reach a real ledger.
      await context.route(/http:\/\/127\.0\.0\.1:\d+\/api\/.*/, (route) =>
        route.fulfill({
          status: 503,
          json: { code: 'TEST_UNSUPPORTED', message: '模拟测试未提供此接口' },
        }),
      );
      await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
      await use();
    },
    { auto: true },
  ],
});
export { expect };

const navigationGroupKeys: Record<string, string> = {
  总览: 'overview',
  记账: 'bookkeeping',
  账户与资产: 'assets',
  薪酬与社保: 'payroll-center',
  预算与计划: 'planning',
  分析与报告: 'analysis',
  'AI 智能中心': 'ai-center',
};

// The desktop sidebar is a rail of group buttons plus a detail panel: opening a
// group only swaps the panel, so an already-open group needs no second click.
export async function openNavigationGroup(page: Page, label: string) {
  const key = navigationGroupKeys[label];
  if (!key) throw new Error(`未知的导航分组：${label}`);
  const group = page.locator(
    `.shell-sidebar .shell-rail button.rail-group[data-group="${key}"]`,
  );
  if ((await group.getAttribute('aria-expanded')) !== 'true')
    await group.click();
  await expect(page.locator('.shell-panel .panel-title')).toHaveText(label);
}
