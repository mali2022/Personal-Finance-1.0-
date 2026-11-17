import { test, expect } from '@playwright/test';
import fs from 'node:fs';

for (const width of [360, 768, 1440])
  test(`交易工作台 ${width}px`, async ({ page }) => {
    page.on('pageerror', (error) => console.log('PAGE ERROR', error.stack));
    await page.setViewportSize({ width, height: 1000 });
    const queries: URL[] = [];
    const row = {
      id: 't1',
      type: 'Expense',
      amount: '10.00',
      currency: 'CNY',
      accountId: 'a',
      categoryId: 'leaf',
      merchant: '午餐商户',
      occurredAt: '2026-10-22T04:00:00Z',
      note: '测试备注',
      tagIds: [],
      refundedAmount: '0.00',
      fee: '0.00',
      splits: [],
      version: '1',
      createdAt: '2026-10-22T04:00:00Z',
      updatedAt: '2026-10-22T04:00:00Z',
      accountBalances: [
        { accountId: 'a', name: '现金', currency: 'CNY', balance: '90.00' },
      ],
    };
    await page.route(/http:\/\/127\.0\.0\.1:5186\/api\/.*/, async (route) => {
      const url = new URL(route.request().url());
      const p = url.pathname.slice(4);
      let data: unknown = [];
      if (p === '/auth/me')
        data = {
          id: 'workspace-test',
          displayName: '测试',
          email: 'fixture@example.test',
          permissions: [],
        };
      else if (p === '/auth/profile') data = { preferredCurrency: 'CNY' };
      else if (p === '/accounts')
        data = [
          {
            id: 'a',
            name: '现金',
            type: 'Cash',
            currency: 'CNY',
            balance: '100.00',
            status: 'Active',
            version: '1',
          },
        ];
      else if (p === '/categories')
        data = [
          { id: 'root', name: '生活', kind: 'Expense', status: 'Active' },
          {
            id: 'middle',
            name: '餐饮',
            kind: 'Expense',
            parentId: 'root',
            status: 'Active',
          },
          {
            id: 'leaf',
            name: '午餐',
            kind: 'Expense',
            parentId: 'middle',
            status: 'Active',
          },
        ];
      else if (p === '/currencies') data = [{ code: 'CNY', enabled: true }];
      else if (p === '/transactions') {
        queries.push(url);
        data = {
          items: [row],
          total: 120,
          page: Number(url.searchParams.get('page') || 1),
          pageSize: 20,
        };
      } else if (p === '/transactions/summary')
        data = {
          total: 120,
          pending: 2,
          anomalies: 1,
          uncategorized: 0,
          currencies: [
            {
              currency: 'CNY',
              income: '9000.00',
              expense: '1200.00',
              netExpense: '1180.00',
              netCashFlow: '7820.00',
              transferIn: '100.00',
              transferOut: '100.00',
              refunds: '20.00',
              averageExpense: '10.00',
              maxExpense: '100.00',
            },
          ],
          basis: 'fixture',
        };
      else if (p === '/transactions/daily-summary')
        data = [
          {
            day: '2026-10-22',
            currency: 'CNY',
            income: '0.00',
            expense: '180.00',
          },
        ];
      else if (p === '/transactions/t1')
        data = {
          ...row,
          entries: [
            {
              kind: 'Account',
              accountId: 'a',
              amount: '-10.00',
              currency: 'CNY',
            },
          ],
          attachments: [],
          relatedTransactions: [],
        };
      else if (p.endsWith('/issues'))
        data = { rules: ['Duplicate'], threshold: 'fixture' };
      else if (p.endsWith('/promotions')) data = { cashbacks: [], usages: [] };
      else if (p.endsWith('/history'))
        data = { items: [], total: 0, page: 1, pageSize: 20 };
      else if (p.startsWith('/directory/'))
        data = { items: [], total: 0, page: 1, pageSize: 20 };
      else if (p === '/ai/settings')
        data = {
          enabled: false,
          configured: false,
          privacy: { enabled: false },
        };
      await route.fulfill({ json: { data } });
    });
    await page.goto('/transactions');
    await expect(
      page.getByRole('heading', { name: '全部交易', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: '当前筛选结果统计' }),
    ).toContainText('120');
    await expect(page.getByText('¥1,200.00', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '高级筛选', exact: true }).click();
    await expect(page.getByText('三级分类', { exact: true })).toBeVisible();
    const merchantInput=page.locator('.workspace-filter-grid > label').filter({hasText:'多商户'}).getByRole('combobox');
    await merchantInput.fill('A, Inc.');
    await merchantInput.press('Enter');
    await expect.poll(()=>queries.at(-1)?.searchParams.get('merchants')).toBe('["A, Inc."]');
    if (width < 768) {
      await expect(
        page.getByRole('dialog', { name: '搜索及筛选' }),
      ).toBeVisible();
      await page.getByRole('button', { name: '查看筛选结果' }).click();
      await expect(page.locator('.mobile-transaction-card')).toBeVisible();
      await expect(page.locator('.workspace-day')).toContainText('180.00');
      const context = page.locator('.mobile-transaction-context').first();
      await context.scrollIntoViewIfNeeded();
      const bounds = (await context.boundingBox())!;
      await page.mouse.move(bounds.x + 10, bounds.y + 10);
      await page.mouse.down();
      await expect(
        page.getByRole('checkbox', { name: '选择交易 t1' }),
      ).toBeChecked();
      await page.mouse.up();
      await page.getByRole('checkbox', { name: '选择交易 t1' }).uncheck();
    }
    await page.getByRole('button', { name: '异常交易', exact: true }).click();
    await expect
      .poll(() => queries.at(-1)?.searchParams.get('anomaly'))
      .toBe('Any');
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    await expect(page).not.toHaveURL(/anomaly=/);
    await page.getByRole('button', { name: '恢复筛选', exact: true }).click();
    await expect(page).toHaveURL(/anomaly=Any/);
    await page.getByRole('button', { name: '表格配置', exact: true }).click();
    const settings = page.getByRole('dialog', {
      name: '表格配置',
      exact: true,
    });
    await expect(settings).toBeVisible();
    await settings
      .getByRole('spinbutton', { name: '列宽 amount', exact: true })
      .fill('230');
    await settings
      .getByRole('spinbutton', { name: '列宽 amount', exact: true })
      .blur();
    await settings.locator('.ant-drawer-close').click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem(
                'finance-transaction-table:v1:workspace-test',
              )!,
            ).widths.amount,
        ),
      )
      .toBe(230);
    await page
      .getByRole('button', { name: '详情', exact: true })
      .first()
      .click();
    const detail = page.getByRole('dialog', { name: '交易详情', exact: true });
    await expect(detail).toBeVisible();
    await detail.getByText('异常复核与逐笔对账', { exact: true }).click();
    await expect(
      detail.getByText('重复交易嫌疑', { exact: true }),
    ).toBeVisible();
    if (width === 360)
      expect((await detail.boundingBox())!.width).toBeLessThanOrEqual(360);
    await detail.locator('.ant-drawer-close').click();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
    fs.mkdirSync('test-results/transaction-workspace', { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/transaction-workspace/${width}.png`,
      fullPage: true,
    });
    if (width === 1440) {
      await page.evaluate(() => {
        const saved = JSON.parse(
          localStorage.getItem('finance-ui') || '{"state":{},"version":0}',
        );
        saved.state.language = 'en';
        saved.state.theme = 'dark';
        localStorage.setItem('finance-ui', JSON.stringify(saved));
      });
      await page.reload();
      await expect(
        page.getByRole('region', { name: 'Filtered totals' }),
      ).toContainText('Total income');
      await expect(
        page.getByRole('button', { name: 'Table settings', exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: 'test-results/transaction-workspace/english-dark.png',
        fullPage: true,
      });
    }
  });
