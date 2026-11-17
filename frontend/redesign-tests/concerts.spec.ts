import { test, expect } from '@playwright/test';
for (const width of [360, 1440])
  test(`optional concert module ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let enabled = false;
    let version = 0;
    const scenes: {
      id: string;
      version: string;
      input: Record<string, unknown>;
    }[] = [];
    const id = '33333333-3333-4333-8333-333333333333';
    const report = {
      currency: 'CNY',
      totalBudget: '1000',
      originalCosts: '0',
      confirmedRefunds: '0',
      actual: '0',
      personalNetCost: '0',
      planned: '0',
      remaining: '1000',
      availableAfterPlans: '1000',
      overspent: '0',
      budgetUsage: 0,
      pendingAdvances: '0',
      categories: [],
      budgets: [],
      companions: [],
      costs: [],
      warnings: [],
    };
    await page.route(/http:\/\/127\.0\.0\.1:5177\/api\/.*/, async (route) => {
      const r = route.request(),
        path = new URL(r.url()).pathname;
      let data: unknown = [];
      if (path === '/api/auth/me')
        data = { id: 'test', displayName: '测试', permissions: [] };
      else if (path === '/api/auth/profile')
        data = { preferredCurrency: 'CNY' };
      else if (path === '/api/settings/modules') {
        if (r.method() === 'PUT') {
          enabled = r.postDataJSON().concerts;
          version++;
        }
        data = { concerts: enabled, version: String(version) };
      } else if (path === '/api/concerts') {
        if (r.method() === 'POST') {
          scenes.push({ id, version: '1', input: r.postDataJSON() });
          data = { id, version: '1' };
        } else data = scenes;
      } else if (path === '/api/concerts/' + id) {
        if (r.method() === 'PUT') {
          scenes[0].input = r.postDataJSON();
          scenes[0].version = String(Number(scenes[0].version) + 1);
          data = { id, version: scenes[0].version };
        } else data = { ...scenes[0], report };
      } else if (path === '/api/concerts/report')
        data = {
          year: 2026,
          currency: 'CNY',
          count: scenes.length,
          attended: 0,
          totalCost: '0',
          average: '0',
          highest: null,
          artists: [],
          cities: [],
          months: [],
          categories: [],
          scenes: [],
          rule: '按币种分别统计',
        };
      else if (path.startsWith('/api/operations/')) data = { state: 'Unknown' };
      await route.fulfill({ json: { data } });
    });
    await page.goto('/concerts');
    await expect(
      page.getByText('该模块尚未启用，请在设置的可选模块中开启。'),
    ).toBeVisible();
    await page.getByRole('link', { name: '前往设置', exact: true }).click();
    await page.getByRole('switch', { name: '启用演唱会专项记账' }).click();
    await page.getByRole('link', { name: '进入演唱会档案' }).click();
    await page
      .getByRole('button', { name: '新增演唱会档案', exact: true })
      .click();
    await page.getByLabel('艺人名称', { exact: true }).fill('测试艺人');
    await page.getByLabel('巡演名称', { exact: true }).fill('测试巡演');
    await page.getByLabel('演出标题', { exact: true }).fill('上海演唱会');
    await page.getByLabel('城市', { exact: true }).fill('上海');
    await page.getByLabel('场馆', { exact: true }).fill('测试体育馆');
    await page.getByLabel('场次总预算', { exact: true }).fill('1000');
    await page.screenshot({
      path: `test-results/concert-scene-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect.poll(() => scenes.length).toBe(1);
    expect(scenes[0].input.artist).toBe('测试艺人');
    expect(scenes[0].input.totalBudget).toBe('1000');
    await page.getByRole('button', { name: '管理档案', exact: true }).click();
    await page.getByRole('tab', { name: '门票订单', exact: true }).click();
    await page.getByRole('button', { name: '新增', exact: true }).click();
    await page.getByLabel('票务平台', { exact: true }).fill('平台甲');
    await page.getByLabel('订单编号', { exact: true }).fill('ABC-001');
    await page.getByLabel('单张票面价格', { exact: true }).fill('580');
    await page.screenshot({
      path: `test-results/concert-order-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect
      .poll(() => (scenes[0].input.orders as unknown[]).length)
      .toBe(1);
    expect(
      (
        scenes[0].input.orders as {
          state: string;
          paymentTransactionId: string | null;
        }[]
      )[0],
    ).toEqual(
      expect.objectContaining({
        state: 'Planning',
        paymentTransactionId: null,
      }),
    );
    expect(errors).toEqual([]);
  });

for (const width of [360, 1440])
  test(`music interest purchase without a concert ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const catalog = { topics: [], links: [], budgets: [] };
    let saved: Record<string, unknown> | undefined;
    await page.route(/http:\/\/127\.0\.0\.1:5177\/api\/.*/, async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path === '/api/auth/me')
        data = { id: 'test', displayName: '测试', permissions: [] };
      else if (path === '/api/auth/profile')
        data = { preferredCurrency: 'CNY' };
      else if (path === '/api/settings/modules')
        data = { concerts: true, version: '1' };
      else if (path === '/api/concerts/report')
        data = {
          count: 0,
          attended: 0,
          totalCost: '0',
          average: '0',
          highest: null,
          artists: [],
          cities: [],
          months: [],
          categories: [],
          scenes: [],
          rule: '按币种分别统计',
        };
      else if (path === '/api/concerts/interests/catalog') data = catalog;
      else if (path === '/api/concerts/interests/purchases') {
        if (route.request().method() === 'POST') {
          saved = route.request().postDataJSON();
          data = { id: 'purchase-a', version: '1' };
        } else data = { total: 0, items: [] };
      } else if (path.startsWith('/api/operations/'))
        data = { state: 'Unknown' };
      await route.fulfill({ json: { data } });
    });
    await page.goto('/concerts');
    await page.getByRole('tab', { name: '日常周边', exact: true }).click();
    await page
      .getByRole('button', { name: '新增购买 / 计划', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('商品名称', { exact: true }).fill('STAYREAL T恤');
    await page.getByLabel('单价', { exact: true }).fill('399');
    await page.getByLabel('实付', { exact: true }).fill('399');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /确.*定|OK/, exact: true })
      .click();
    await expect.poll(() => saved).toBeTruthy();
    expect(saved?.state).toBe('Planned');
    expect(saved?.sceneId).toBeNull();
    expect(saved?.transactionId).toBeNull();
    expect((saved?.items as { paid: string }[])[0].paid).toBe('399');
    expect(errors).toEqual([]);
  });
