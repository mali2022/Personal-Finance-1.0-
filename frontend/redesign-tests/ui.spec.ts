import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../e2e/fixtures';
import { agentFixture } from './agent-fixture';

const output = path.resolve('verification/redesign');
fs.mkdirSync(output, { recursive: true });
const navigationSource = fs.readFileSync(
  path.resolve('src/design/navigation.ts'),
  'utf8',
);
const navigationRoutes = [
  ...navigationSource.matchAll(/localizedPair\('([^']+)'/g),
].map((match) => match[1]);
const routes = [
  ...new Set([
    ...navigationRoutes,
    '/ai',
    '/login',
    '/register',
    '/accounts/bank',
    '/categories/lunch',
    '/transactions/t1',
  ]),
];
const commonRoutes = [
  '/',
  '/transactions',
  '/accounts',
  '/budgets',
  '/reports',
  '/calendar',
  '/ai-center',
  '/settings',
];

// Existing fixtures fix the clock to 2026-10-07 and reject every unhandled API request.
// These supplements cover newer AI read endpoints that are outside the original MSW seed.
async function prepare(page: Page) {
  await page
    .context()
    .route('**/api/auth/options', (route) =>
      route.fulfill({ json: { data: { registrationEnabled: true } } }),
    );
  await page.context().route('**/api/auth/profile', (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'demo-user',
          email: 'demo@example.com',
          displayName: '个人用户',
          realName: '',
          phone: '',
          birthday: null,
          gender: 'Unspecified',
          country: '',
          region: '',
          city: '',
          occupation: '',
          bio: '',
          language: 'zh-CN',
          timeZone: 'Asia/Shanghai',
          preferredCurrency: 'CNY',
          createdAt: '2026-10-01T00:00:00Z',
          version: 1,
          hasAvatar: false,
          avatarUpdatedAt: null,
        },
      },
    }),
  );
  await page
    .context()
    .route(/http:\/\/127\.0\.0\.1:\d+\/api\/ai\/.*/, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/ai/agent/')) { await route.fulfill({ json: { data: agentFixture(url.pathname) } }); return; }
      const settings = {
        provider: 'DeepSeek',
        enabled: true,
        configured: true,
        model: 'UI fixture',
        reasoningModel: 'UI fixture',
        foundationVersion: 1,
        dailyCallLimit: 100,
        transmission: '仅用于本地界面验收',
        legacyModels: '',
        documentation: '',
        privacy: {
          enabled: true,
          allowSummary: true,
          allowDetails: true,
          allowPayroll: false,
          allowFamily: false,
          allowRecognitionText: false,
          saveHistory: false,
        },
        capabilities: {},
        historyRetentionDays: 30,
      };
      const data = url.pathname.endsWith('/settings')
        ? settings
        : url.pathname.endsWith('/usage')
          ? { items: [], costNote: '本地界面样本' }
          : { items: [], total: 0, page: 1, pageSize: 20 };
      await route.fulfill({ json: { data } });
    });
}

async function expectWithinViewport(locator: Locator, page: Page) {
  await expect(locator).toBeVisible();
  const width = page.viewportSize()!.width;
  // Ant portals measure themselves outside the screen before their alignment pass.
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        return box
          ? { left: box.x >= -1, right: box.x + box.width <= width + 1 }
          : null;
      },
      {
        message:
          'visible control is horizontally reachable after portal alignment',
      },
    )
    .toEqual({ left: true, right: true });
}

async function inspectPage(page: Page, route: string) {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByText('页面遇到问题', { exact: true })).toHaveCount(0);
  await expect(page.locator('.ant-skeleton:visible')).toHaveCount(0);
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize()!.width + 2);
  const audit = await page.evaluate(() => {
    const width = innerWidth;
    const clippedControls = [
      ...document.querySelectorAll<HTMLElement>(
        '.topbar button, .content button, .content input, .content .ant-select, .content .ant-picker',
      ),
    ]
      .filter((element) => {
        if (
          element.closest(
            '.ant-table, .ant-tabs-nav-list, .ant-select-selection-overflow, .ant-picker-dropdown',
          )
        )
          return false;
        if (element.offsetWidth === 0 || element.offsetHeight === 0)
          return false;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none')
          return false;
        const bounds = element.getBoundingClientRect();
        return bounds.left < -2 || bounds.right > width + 2;
      })
      .map((element) => ({
        label:
          element.getAttribute('aria-label') ||
          element.textContent?.trim() ||
          element.getAttribute('placeholder'),
        class: element.className,
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      }));
    return {
      path: location.pathname,
      viewport: width,
      scrollWidth: document.documentElement.scrollWidth,
      headings: [...document.querySelectorAll('h1')].map(
        (element) => element.textContent,
      ),
      alerts: [...document.querySelectorAll('.ant-alert-error')].map(
        (element) => element.textContent,
      ),
      clippedControls,
    };
  });
  expect(audit.clippedControls, JSON.stringify(audit)).toEqual([]);
  return audit;
}

for (let start = 0; start < routes.length; start += 10) {
  const batch = routes.slice(start, start + 10);
  test(`360px touch route inventory ${start + 1}-${start + batch.length}`, async ({
    page,
  }, testInfo) => {
    await prepare(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const audits = [];
    for (const route of batch) {
      await test.step(route, async () => {
        audits.push(await inspectPage(page, route));
      });
    }
    await testInfo.attach('route-layout-audit', {
      body: JSON.stringify(audits, null, 2),
      contentType: 'application/json',
    });
    expect(errors).toEqual([]);
  });
}

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1440, 960],
] as const) {
  test.describe(`${width}px layout`, () => {
    test.use({
      viewport: { width, height },
      isMobile: width < 768,
      hasTouch: width < 768,
    });
    test('home and everyday pages reflow, screenshots remain reviewable', async ({
      page,
    }, testInfo) => {
      await prepare(page);
      const audits = [];
      for (const route of commonRoutes) {
        audits.push(await inspectPage(page, route));
        if (route === '/') {
          for (const value of await page
            .locator('.overview-metric-value')
            .all()) {
            const lines = await value.evaluate(
              (element) =>
                element.getBoundingClientRect().height /
                parseFloat(getComputedStyle(element).lineHeight),
            );
            expect(
              lines,
              'ordinary monthly amounts stay on one line',
            ).toBeLessThanOrEqual(1.05);
          }
        }
        if (
          route === '/' ||
          (width === 390 &&
            ['/transactions', '/accounts', '/budgets', '/reports'].includes(
              route,
            ))
        ) {
          await page.screenshot({
            path: path.join(
              output,
              `${width}-${route === '/' ? 'dashboard' : route.slice(1)}.png`,
            ),
            fullPage: true,
          });
          if (route === '/')
            await page.screenshot({
              path: path.join(output, `${width}-dashboard-viewport.png`),
            });
        }
      }
      await testInfo.attach('layout-audit', {
        body: JSON.stringify(audits, null, 2),
        contentType: 'application/json',
      });
    });
  });
}

test.describe('390px interaction and visual review', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('mobile search, complete navigation and touch controls work', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto('/');
    const search = page.getByRole('button', { name: '打开搜索', exact: true });
    await expectWithinViewport(search, page);
    await search.click();
    const input = page.getByRole('textbox', { name: '全局搜索', exact: true });
    await expectWithinViewport(input, page);
    await input.fill('午餐');
    await input.press('Enter');
    await expect(page).toHaveURL(/transactions\?keyword=/);
    await expect(
      page.getByRole('heading', { name: '每一笔，都清楚', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '打开全部导航', exact: true })
      .click();
    const drawer = page.getByRole('dialog', { name: '全部功能', exact: true });
    await expectWithinViewport(drawer, page);
    await drawer.getByText('预算与规划', { exact: true }).click();
    await drawer.getByRole('menuitem').filter({ hasText: '预算计划' }).click();
    await expect(page).toHaveURL(/\/budgets$/);
    await expect(drawer).toHaveCount(0);
    for (const control of await page
      .locator('.topbar button:visible, .mobile-nav button:visible')
      .all()) {
      await expectWithinViewport(control, page);
      expect(
        (await control.boundingBox())!.height,
        'touch control height',
      ).toBeGreaterThanOrEqual(44);
      expect(
        (await control.boundingBox())!.width,
        'touch control width',
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test('advanced filters and transaction cards remain usable on mobile', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto('/transactions');
    await page.getByRole('button', { name: '更多筛选', exact: true }).click();
    await expect(
      page.getByRole('button', { name: /^收\s*起$/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    for (const control of await page
      .locator('.filter-fields .ant-select, .filter-fields .ant-picker')
      .all()) {
      await expectWithinViewport(control, page);
    }
    await page.getByRole('combobox', { name: '交易类型', exact: true }).click();
    await expectWithinViewport(
      page.locator('.ant-select-dropdown:visible'),
      page,
    );
    await page
      .locator('.ant-select-dropdown:visible')
      .getByText('支出', { exact: true })
      .click();
    await expect(page).toHaveURL(/type=Expense/);
    await expect(
      page.locator('.mobile-transaction-card').first(),
    ).toBeVisible();
    await page
      .getByRole('checkbox', { name: /^选择交易 / })
      .first()
      .check();
    await expect(
      page.getByRole('button', { name: '批量编辑', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: /^重\s*置$/ }).click();
    await expect(page).toHaveURL(/\/transactions$/);
    await page
      .getByRole('button', { name: /^详\s*情$/ })
      .first()
      .click();
    const detail = page.getByRole('dialog', { name: '交易详情', exact: true });
    await expectWithinViewport(detail, page);
    await detail.locator('.ant-drawer-close').click();
    await expect(detail).toHaveCount(0);
  });

  test('report date dropdown fits and a preset can be applied', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto('/reports');
    await page.locator('.content .mobile-date-range .mobile-date-trigger').first().click();
    const popup = page.locator('.mobile-date-choices:visible');
    await expectWithinViewport(popup, page);
    await expectWithinViewport(
      popup.locator('.mobile-date-parts').first(),
      page,
    );
    await page.screenshot({ path: path.join(output, '390-date-range.png') });
    await popup.getByLabel('快捷时间范围', { exact: true }).selectOption({ label: '上月' });
    await expect(popup).toHaveCount(0);
    await expect(
      page.locator('.content .mobile-date-range .mobile-date-trigger').first(),
    ).toContainText('2026-09-01 → 2026-09-30');
  });

  test('quick entry date and time, footer and input remain reachable', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto('/');
    await page.getByRole('button', { name: '快速记账', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '记一笔', exact: true });
    await expectWithinViewport(drawer, page);
    const amount = drawer.getByPlaceholder('0.00').first();
    await expect(amount).toBeFocused();
    expect(
      await amount.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(16);
    await drawer.getByLabel('日期时间', { exact: true }).click();
    const popup = drawer.locator('.mobile-date-choices:visible');
    await expectWithinViewport(popup, page);
    await expectWithinViewport(
      popup.locator('.mobile-date-parts').first(),
      page,
    );
    await page.screenshot({
      path: path.join(output, '390-quick-entry-time.png'),
    });
    await popup.getByRole('button', { name: '确定', exact: true }).click();
    await expect(popup).toHaveCount(0);
    const save = drawer.getByRole('button', { name: /^保\s*存$/ });
    await expectWithinViewport(save, page);
    const saveBounds = (await save.boundingBox())!;
    expect(saveBounds.y + saveBounds.height).toBeLessThanOrEqual(
      page.viewportSize()!.height + 1,
    );
    await drawer.locator('.ant-drawer-body').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expectWithinViewport(
      drawer.getByRole('button', { name: '保存并继续', exact: true }),
      page,
    );
    await page.screenshot({ path: path.join(output, '390-quick-entry.png') });
    await drawer.locator('.ant-drawer-close').click();
    await expect(drawer).toHaveCount(0);
  });

  test('theme and privacy affect the dashboard and historical month can be chosen', async ({
    page,
  }) => {
    await prepare(page);
    await page.goto('/');
    await expect(page.locator('.dashboard-skeleton')).toHaveCount(0);
    await page.getByRole('button', { name: '切换主题', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({
      path: path.join(output, '390-dark-dashboard.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: '隐藏金额', exact: true }).click();
    await expect(page.locator('.dashboard-page canvas')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: '显示金额', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(output, '390-private-dashboard.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: '显示金额', exact: true }).click();
    await page.getByLabel('选择账期', { exact: true }).click();
    const popup = page.locator('.mobile-date-choices:visible');
    await expectWithinViewport(popup, page);
    await popup.getByLabel('选择账期 · 月', { exact: true }).selectOption('9');
    await popup.getByRole('button', { name: '确定', exact: true }).click();
    await expect(page.locator('.overview-month-label')).toHaveText('历史月份');
    await expect(page.getByLabel('选择账期', { exact: true })).toContainText(
      '2026年9月',
    );
  });

  test('authentication forms fit with touch input sizing', async ({ page }) => {
    await prepare(page);
    for (const route of ['/login', '/register']) {
      await inspectPage(page, route);
      const input = page.getByLabel('邮箱', { exact: true });
      await expectWithinViewport(input, page);
      await page.screenshot({
        path: path.join(output, `390-${route.slice(1)}.png`),
        fullPage: true,
      });
      expect(
        await input.evaluate((element) =>
          parseFloat(getComputedStyle(element).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
    }
  });
});

test.describe('landscape touch', () => {
  test.use({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  test('dashboard and entry footer fit a short viewport', async ({ page }) => {
    await prepare(page);
    await inspectPage(page, '/');
    await page.getByRole('button', { name: '记支出', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: '记一笔', exact: true });
    const save = drawer.getByRole('button', { name: /^保\s*存$/ });
    await expectWithinViewport(save, page);
    const bounds = (await save.boundingBox())!;
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(391);
    await page.screenshot({
      path: path.join(output, '844-landscape-entry.png'),
    });
  });
});
