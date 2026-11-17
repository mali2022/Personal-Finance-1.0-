import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { navigationGroups } from '../src/design/navigation';

// Existing local account; credentials are never copied to reports or traces.
test.use({ trace: 'off' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (
      !['GET', 'HEAD'].includes(request.method()) &&
      !new URL(request.url()).pathname.startsWith('/api/auth/')
    ) {
      throw new Error(
        'UI audit blocked a financial write: ' +
          request.method() +
          ' ' +
          new URL(request.url()).pathname,
      );
    }
    await route.continue();
  });
  const credentials = JSON.parse(
    await readFile(
      '../backend/src/PersonalFinance.Api/bootstrap-credentials.local.json',
      'utf8',
    ),
  );
  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(credentials.email);
  await page.getByLabel('密码', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: /^登\s*录$/ }).click();
  await expect(page.locator('#main-content')).toBeVisible();
});

for (const mode of ['light', 'dark', 'mobile', 'private', 'wide'] as const) {
  test(`all registered navigation pages: ${mode}`, async ({ page }) => {
    test.setTimeout(240000);
    await mkdir('verification/ui/screenshots', { recursive: true });
    await page.setViewportSize(
      mode === 'mobile'
        ? { width: 390, height: 844 }
        : mode === 'wide'
          ? { width: 1920, height: 1080 }
          : { width: 1440, height: 960 },
    );
    if (mode === 'dark')
      await page.getByLabel('切换主题', { exact: true }).click();
    if (mode === 'private')
      await page.getByLabel('隐藏金额', { exact: true }).click();
    const results: unknown[] = [];
    for (const [path, label] of navigationGroups.flatMap((g) => g.routes)) {
      await page.goto(path);
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(page.locator('#main-content .ant-skeleton')).toHaveCount(0, {
        timeout: 30000,
      });
      await expect(page.getByText('页面遇到问题', { exact: true })).toHaveCount(
        0,
      );
      const name =
        path === '/' ? 'dashboard' : path.slice(1).replaceAll('/', '-');
      await page.screenshot({
        path: `verification/ui/screenshots/${mode}-${name}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      const metrics = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        headings: [...document.querySelectorAll('#main-content h1')].map(
          (h) => h.textContent,
        ),
        alerts: [
          ...document.querySelectorAll('#main-content .ant-alert-error'),
        ].map((h) => h.textContent),
      }));
      results.push({ path, label, ...metrics });
      expect(metrics.headings.length, `${path} page title`).toBeGreaterThan(0);
      expect(metrics.alerts, `${path} API error state`).toEqual([]);
      expect(
        metrics.scroll,
        `${path} horizontal page overflow`,
      ).toBeLessThanOrEqual(metrics.width + 1);
      if (mode === 'private')
        await expect(page.locator('#main-content canvas')).toHaveCount(0);
    }
    await writeFile(
      `verification/ui/${mode}-audit.json`,
      JSON.stringify(results, null, 2),
    );
  });
}

test('dashboard category expansion and financial privacy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.locator('.overview-metrics')).toBeVisible();
  await expect(page.locator('.networth-card')).toBeVisible();
  await expect(page.locator('.dashboard-page .ant-skeleton')).toHaveCount(0);
  await expect(page.locator('.dashboard-trend-panel canvas')).toHaveCount(1);
  const ranking = page.locator('.dashboard-category-ranking');
  const toggle = page.getByRole('button', { name: /^展开全部/ });
  const initial = await ranking.locator('.dashboard-category-row').count();
  expect(initial).toBeLessThanOrEqual(5);
  if (await toggle.count()) {
    await toggle.click();
    await expect(
      page.getByRole('button', { name: '收起分类', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      await ranking.locator('.dashboard-category-row').count(),
    ).toBeGreaterThan(initial);
    await page.getByRole('button', { name: '收起分类', exact: true }).click();
    await expect(ranking.locator('.dashboard-category-row')).toHaveCount(
      initial,
    );
  }
  await page.keyboard.press('Control+Home');
  await page.mouse.move(0, 0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({
    path: 'verification/ui/screenshots/preview-dashboard-desktop.png',
    animations: 'disabled',
  });
  await page.getByLabel('隐藏金额', { exact: true }).click();
  await expect(page.locator('.overview-metrics .comparison-icon')).toHaveCount(
    0,
  );
  await expect(page.locator('.dashboard-page canvas')).toHaveCount(0);
  await expect(page.locator('.dashboard-category-track')).toHaveCount(0);
  await expect(page.locator('.overview-metrics .money').first()).toContainText(
    '••••••',
  );
  await page.screenshot({
    path: 'verification/ui/screenshots/preview-dashboard-private.png',
    animations: 'disabled',
  });
  await page.getByLabel('显示金额', { exact: true }).click();
  await expect(page.locator('.overview-metrics .comparison-icon')).toHaveCount(
    2,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.dashboard-page .ant-skeleton')).toHaveCount(0);
  await expect(page.locator('.dashboard-trend-panel canvas')).toHaveCount(1);
  await page.mouse.move(0, 0);
  const mobilePanels = await page
    .locator('.dashboard-secondary')
    .evaluate((aside) => ({
      width: aside.getBoundingClientRect().width,
      cards: [...aside.querySelectorAll(':scope > .dashboard-panel')].map(
        (card) => card.getBoundingClientRect().width,
      ),
    }));
  expect(mobilePanels.cards).toHaveLength(3);
  expect(
    mobilePanels.cards.every((width) => width >= mobilePanels.width - 1),
  ).toBe(true);
  await page.screenshot({
    path: 'verification/ui/screenshots/preview-dashboard-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('mobile navigation, theme, filters and entry keyboard interaction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('打开全部导航', { exact: true }).click();
  const nav = page.getByRole('dialog', { name: '全部功能' });
  await nav.getByText('专项管理', { exact: true }).click();
  await nav.getByText('工资社保', { exact: true }).click();
  await expect(page).toHaveURL(/\/payroll$/);
  await expect(nav).not.toBeVisible();
  await page.getByLabel('切换主题', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/transactions?keyword=UI只读检查');
  await expect(page.getByLabel('已应用筛选')).toContainText('关键词');
  await page.getByLabel('已应用筛选').locator('.ant-tag-close-icon').click();
  await expect(page).toHaveURL(/\/transactions$/);
  await page.getByLabel('快速记账', { exact: true }).click();
  const entry = page.getByRole('dialog', { name: '记一笔', exact: true });
  await expect(entry.getByPlaceholder('0.00').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(entry).not.toBeVisible();
  await expect(page.getByLabel('快速记账', { exact: true })).toBeFocused();
});

for (const mode of ['dark', 'mobile'] as const) {
  test(`read-only form and drawer review: ${mode}`, async ({ page }) => {
    test.setTimeout(180000);
    if (mode === 'dark')
      await page.getByLabel('切换主题', { exact: true }).click();
    else await page.setViewportSize({ width: 390, height: 844 });
    const forms: [string, RegExp][] = [
      ['/accounts', /新增账户/],
      ['/categories', /一级分类/],
      ['/budgets', /创建预算|编辑预算/],
      ['/goals', /创建目标/],
      ['/loans', /新增借出/],
      ['/reimbursements', /新增垫付/],
      ['/projects', /新增/],
      ['/merchants', /新增/],
      ['/tags', /新增/],
      ['/recurring', /新增周期规则/],
      ['/subscriptions', /新增订阅/],
      ['/automation', /新增规则/],
      ['/term-deposits', /登记存款/],
      ['/physical-assets', /登记资产/],
      ['/accounts/fund-status', /新增记录/],
      ['/prepayments', /新增记录/],
      ['/payroll', /新增记录/],
      ['/advances', /新增记录/],
      ['/settings/payment-instruments', /新增记录/],
      ['/analytics/living-cost', /新增记录/],
      ['/settings/currencies', /编辑名称与排序/],
    ];
    for (const [path, name] of forms) {
      await page.goto(path);
      await page
        .locator('#main-content')
        .getByRole('button', { name })
        .first()
        .click();
      const dialog = page.getByRole('dialog').last();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.ant-form')).toBeVisible();
      await dialog.locator('input').first().focus();
      // Ant Motion starts in requestAnimationFrame; capture after its 240ms entry.
      await page.waitForTimeout(350);
      await page.screenshot({
        path: `verification/ui/screenshots/${mode}-form-${path.slice(1).replaceAll('/', '-')}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  });
}

test('details, chart data and tablet keyboard reflow', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/transactions');
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('#main-content .ant-skeleton')).toHaveCount(0);
  await expect(page.locator('#main-content .ant-spin-spinning')).toHaveCount(0);
  const details = page
    .locator('#main-content')
    .getByRole('button', { name: '详情', exact: true });
  if (await details.count()) {
    const key = await page
      .locator('#main-content .ant-table-row')
      .first()
      .getAttribute('data-row-key');
    if (key) await page.goto('/transactions/' + encodeURIComponent(key));
    else await details.first().click();
    await expect(page.getByRole('dialog', { name: '交易详情' })).toBeVisible();
    await page.screenshot({
      path: 'verification/ui/screenshots/tablet-transaction-detail.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
  }
  await page.goto('/');
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('#main-content .ant-skeleton')).toHaveCount(0);
  const viewData = page.getByRole('button', { name: '查看数据', exact: true });
  await viewData.first().click();
  await expect(
    page.getByRole('columnheader', { name: '原始数值（单位沿用图表）' }),
  ).toBeVisible();
  await page.getByText('净资产趋势', { exact: true }).click();
  await expect(page.locator('.finance-chart .ant-table')).toContainText(
    '净资产',
  );
  await page.getByLabel('隐藏金额', { exact: true }).click();
  await expect(page.locator('#main-content canvas')).toHaveCount(0);
  await expect(
    page.getByRole('columnheader', { name: '原始数值（单位沿用图表）' }),
  ).toHaveCount(0);
  await page.getByLabel('显示金额', { exact: true }).click();
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 720, height: 480 }); // 1440px desktop at equivalent 200% layout scale.
  await page.screenshot({
    path: 'verification/ui/screenshots/reflow-200-percent-dashboard.png',
    fullPage: true,
    animations: 'disabled',
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(721);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    'BODY',
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  const collapse = page.getByRole('button', { name: '折叠侧边导航' });
  await collapse.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: '展开侧边导航' }),
  ).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({
    path: 'verification/ui/screenshots/desktop-collapsed-navigation.png',
    // Keep the layout viewport fixed while verifying the responsive Sider.
    fullPage: false,
    animations: 'disabled',
  });
  const expand = page.getByRole('button', { name: '展开侧边导航' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click();
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
});

test('Stage G secondary views and account detail remain reachable', async ({
  page,
}) => {
  const views: [string, string[]][] = [
    ['/payroll', ['年度工资与缴费', '社保', '公积金']],
    ['/settings/payment-instruments', ['账本外第三方付款']],
    ['/advances', ['待购与取消']],
    ['/analytics/living-cost', ['商品价格']],
  ];
  for (const [path, tabs] of views) {
    await page.goto(path);
    await expect(page.locator('#main-content')).toBeVisible();
    for (const name of tabs) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(
        page.locator('#main-content .ant-spin-spinning'),
      ).toHaveCount(0);
      await expect(page.locator('#main-content .ant-alert-error')).toHaveCount(
        0,
      );
      await page.screenshot({
        path: `verification/ui/screenshots/secondary-${name}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto('/');
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('#main-content .ant-skeleton')).toHaveCount(0);
  const accounts = page.locator('.dashboard-account-row');
  if (await accounts.count()) {
    await accounts.first().click();
    await expect(page).toHaveURL(/\/accounts\/[^/]+$/);
    await expect(page.locator('#main-content h1')).toBeVisible();
    await page.screenshot({
      path: 'verification/ui/screenshots/account-detail.png',
      fullPage: true,
    });
  }
});
