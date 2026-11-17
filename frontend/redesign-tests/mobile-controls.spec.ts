import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../e2e/fixtures';

const output = path.resolve('verification/mobile-controls');
fs.mkdirSync(output, { recursive: true });
async function prepare(page: Page) {
  await page.context().route('**/api/auth/profile', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'demo-user',
          email: 'demo@example.com',
          displayName: '个人用户',
          language: 'zh-CN',
          timeZone: 'Asia/Shanghai',
          preferredCurrency: 'CNY',
          version: 1,
          hasAvatar: false,
        },
      },
    }),
  );
}
async function withinScreen(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => {
      const bounds = await locator.boundingBox();
      return (
        !!bounds &&
        bounds.x >= -1 &&
        bounds.x + bounds.width <= page.viewportSize()!.width + 1
      );
    })
    .toBe(true);
}

for (const width of [320, 390, 430]) {
  test(`${width}px dropdown dates, searchable category and preserved form`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await prepare(page);
    await page.goto('/');
    await expect(page.locator('.dashboard-skeleton')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    const quick = page.getByRole('button', { name: '快速记账', exact: true });
    await quick.scrollIntoViewIfNeeded();
    await quick.click();
    const drawer = page.getByRole('dialog', { name: '记一笔', exact: true });
    await drawer.getByPlaceholder('0.00').first().fill('38.50');
    const category = drawer.getByLabel('分类', { exact: true });
    await category.click();
    await expect(category).toHaveAttribute('readonly', '');
    const popup = page.locator(
      '.touch-select-anchor .ant-select-dropdown:visible',
    );
    await withinScreen(popup, page);
    await expect(popup).toHaveCSS('opacity', '1');
    await expect
      .poll(() =>
        popup.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + 20),
          );
        }),
      )
      .toBe(true);
    const search = popup.getByRole('textbox', { name: '搜索选项' });
    await expect(search).not.toBeFocused();
    await search.fill('午餐');
    await search.press('Enter');
    await expect(
      popup.getByText('餐饮食品 / 日常午餐', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(output, `${width}-category-dropdown.png`),
    });
    await popup.getByText('餐饮食品 / 日常午餐', { exact: true }).click();
    await drawer.getByLabel('日期时间', { exact: true }).click();
    const dates = drawer.locator('.mobile-date-choices');
    await withinScreen(dates, page);
    await dates
      .getByLabel('选择日期 · 年', { exact: true })
      .selectOption('2026');
    await dates.getByLabel('选择日期 · 月', { exact: true }).selectOption('2');
    await dates.getByLabel('选择日期 · 日', { exact: true }).selectOption('28');
    await dates.getByLabel('选择日期 · 时', { exact: true }).selectOption('12');
    await dates.getByLabel('选择日期 · 分', { exact: true }).selectOption('34');
    await dates.getByLabel('选择日期 · 秒', { exact: true }).selectOption('56');
    for (const select of await dates.locator('select').all()) {
      await select.scrollIntoViewIfNeeded();
      await withinScreen(select, page);
      const box = (await select.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
      );
      expect(
        await select.evaluate((element) =>
          parseFloat(getComputedStyle(element).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
    }
    await page.screenshot({
      path: path.join(output, `${width}-date-time-dropdown.png`),
    });
    await dates.getByRole('button', { name: '确定', exact: true }).click();
    await expect(drawer.getByLabel('日期时间', { exact: true })).toContainText(
      '2026-02-28 12:34:56',
    );
    await expect(drawer.getByPlaceholder('0.00').first()).toHaveValue('38.50');
    await withinScreen(drawer.getByRole('button', { name: /^保\s*存$/ }), page);
    if (width === 390) {
      const posting = page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          new URL(request.url()).pathname.startsWith('/api/transactions/'),
      );
      await drawer.getByRole('button', { name: /^保\s*存$/ }).click();
      const payload = (await posting).postDataJSON();
      expect(payload.occurredAt).toBe('2026-02-28T04:34:56.000Z');
      expect(payload.amount).toBe('38.50');
      expect(payload.categoryId).toBe('lunch');
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
  });
  test(`${width}px date range preset updates transaction query without a calendar`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await prepare(page);
    await page.goto('/transactions');
    await page.getByRole('button', { name: '更多筛选', exact: true }).click();
    await page
      .locator('.filter-fields .mobile-date-range .mobile-date-trigger')
      .click();
    const panel = page.locator('.mobile-date-choices');
    await withinScreen(panel, page);
    await panel
      .getByLabel('快捷时间范围', { exact: true })
      .selectOption({ label: '上月' });
    await expect(panel).toHaveCount(0);
    const query = new URL(page.url()).searchParams;
    expect(query.get('start')).toBe('2026-08-31T16:00:00.000Z');
    expect(query.get('end')).toBe('2026-09-30T15:59:59.999Z');
    await expect(page.locator('.ant-picker-dropdown')).toHaveCount(0);
    await page.screenshot({
      path: path.join(output, `${width}-transaction-filters.png`),
      fullPage: true,
    });
  });
}
