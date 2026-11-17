import { test, expect } from '@playwright/test';

for (const width of [390, 1440])
  test(`independent bookkeeping and global drawer at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/^http:\/\/127\.0\.0\.1:5187\/api\//, async (route) => {
      const path = new URL(route.request().url()).pathname.slice(4);
      let data: unknown = [];
      if (path === '/auth/me')
        data = { id: 'bookkeeping-test', displayName: '测试', permissions: [] };
      else if (path === '/auth/profile') data = { preferredCurrency: 'CNY' };
      else if (path === '/accounts')
        data = [
          {
            id: 'cash',
            name: '现金',
            type: 'Cash',
            currency: 'CNY',
            status: 'Active',
            balance: '100.00',
          },
        ];
      else if (path === '/currencies') data = [{ code: 'CNY', enabled: true }];
      else if (path === '/refund-sources') data = { items: [], total: 0, page: 1, pageSize: 20 };
      else if (path.startsWith('/directory/'))
        data = { items: [], total: 0, page: 1, pageSize: 20 };
      else if (path === '/ai/settings')
        data = {
          enabled: false,
          configured: false,
          privacy: { enabled: false },
        };
      await route.fulfill({ json: { data } });
    });
    await page.goto('/bookkeeping/new');
    await expect(
      page.getByRole('heading', { name: '记账中心', exact: true }),
    ).toBeVisible();
    const form = page.getByRole('region', { name: '记账中心' });
    await form.getByPlaceholder('0.00').first().fill('35.60');
    await expect(
      form.getByRole('button', { name: '保存并继续' }),
    ).toBeVisible();
    if (width >= 768) {
      await expect(
        page.getByRole('menuitem', { name: '记账中心', exact: true }),
      ).toBeVisible();
      for (const name of [
        '收入',
        '转账',
        '充值',
        '提现',
        '退款',
        '信用卡还款',
        '资产损失',
        '支出',
      ]) {
        await form.getByRole('tab', { name, exact: true }).click();
        await expect(
          form.getByRole('tab', { name, exact: true }),
        ).toHaveAttribute('aria-selected', 'true');
      }
    }
    await page.getByRole('button', { name: width < 768 ? '快速记账' : /记一笔/, exact: true }).click();
    const drawer = page.locator('.ant-drawer-content').last();
    await expect(drawer).toBeVisible();
    await drawer.getByPlaceholder('0.00').first().fill('12.00');
    await expect(form.getByPlaceholder('0.00').first()).toHaveValue('35.60');
    await drawer.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect(form.getByPlaceholder('0.00').first()).toHaveValue('35.60');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/bookkeeping-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

