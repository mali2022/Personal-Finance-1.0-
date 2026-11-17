import { test, expect } from '@playwright/test';
import fs from 'node:fs';

for (const width of [360, 1440])
  test(`退款与编辑 ${width}px`, async ({ page }) => {
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
      else if (p === '/refund-sources/t1') data = {...row, refundableAmount:'10.00',refundableSplits:[]};
      else if (p === '/refund-sources') data = {items:[{...row,refundableAmount:'10.00',refundableSplits:[]}],total:1,page:1,pageSize:20};
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
    await page.goto('/transactions/t1');
    const detail=page.getByRole('dialog',{name:'交易详情',exact:true});
    await detail.getByRole('button',{name:'添加退款',exact:true}).click();
    const entry=page.getByRole('dialog',{name:'记一笔',exact:true});
    await expect(entry.getByText('原消费交易',{exact:true})).toBeVisible();
    await expect(entry.getByText(/午餐商户.*可退/)).toBeVisible();
    await entry.getByRole('button',{name:/昨\s*天/,exact:true}).click();
    await entry.locator('.ant-drawer-close').click();
    await detail.getByRole('button',{name:/编\s*辑/,exact:true}).click();
    const edit=page.getByRole('dialog',{name:'编辑交易',exact:true});
    if(width===360) {await edit.getByTitle('支出',{exact:true}).click();await page.getByTitle('收入',{exact:true}).click();}
    else await edit.getByRole('tab',{name:'收入',exact:true}).click();
    await expect(edit.getByText('商品名',{exact:true})).toHaveCount(0);
    await edit.getByRole('button',{name:/昨\s*天/,exact:true}).scrollIntoViewIfNeeded();
    fs.mkdirSync('test-results/entry-workflow',{recursive:true});
    await page.screenshot({path:'test-results/entry-workflow/entry-'+width+'.png'});
  });
