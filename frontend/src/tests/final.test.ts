import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { apiClient } from '../api/client';
import { accountApi, dashboardApi, transactionApi } from '../api/finance';
import { advancedApi } from '../api/operations';
import {
  decimal,
  formatAccountBalance,
  minor,
  parseFilters,
  readTransactionFilters,
} from '../utils/finance';
import type {
  Account,
  ApiResponse,
  Transaction,
  SaveTransactionRequest,
} from '../types';
const server = setupServer(...handlers);
beforeAll(() => {
  apiClient.defaults.baseURL = window.location.origin + '/api';
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => server.close());
const base: SaveTransactionRequest = {
  type: 'AssetLoss',
  accountId: 'cash',
  amount: '20.00',
  categoryId: 'asset-loss',
  occurredAt: '2026-10-07T12:00:00Z',
  note: '现金遗失',
  splits: [],
  tagIds: [],
  fee: '0.00',
};
describe('最终财务验收', () => {
  it('拆分后的分类筛选只按有效分配，不保留拆分前的总分类', async () => {
    await transactionApi.save({
      ...base,
      type: 'Expense',
      categoryId: 'lunch',
      merchant: '最终拆分查询',
      splits: [
        { categoryId: 'metro', amount: '12.00' },
        { categoryId: 'daily', amount: '8.00' },
      ],
    });
    const filters = {
      page: 1,
      pageSize: 20,
      sort: 'occurredAt:desc',
      merchant: '最终拆分查询',
    };
    expect(
      (await transactionApi.list({ ...filters, categoryId: 'food' })).total,
    ).toBe(0);
    expect(
      (await transactionApi.list({ ...filters, categoryId: 'transport' }))
        .total,
    ).toBe(1);
    expect(
      (
        await advancedApi.export(
          'CSV',
          { ...filters, categoryId: 'food' },
          crypto.randomUUID(),
        )
      ).count,
    ).toBe(0);
  });
  it('恶意或损坏 URL 不生成非法分页、金额与类型请求', () => {
    const result = readTransactionFilters(
      new URLSearchParams(
        'page=Infinity&pageSize=2.5&min=NaN&max=-1&type=Ledger&status=Hacked&sort=SQL&start=2026-99-99',
      ),
    );
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.filters).toMatchObject({
      page: 1,
      pageSize: 20,
      sort: 'occurredAt:desc',
    });
    expect(result.filters.min).toBeUndefined();
    expect(result.filters.type).toBeUndefined();
    const reversed = parseFilters(
      new URLSearchParams(
        'min=100&max=20&start=2026-10-08T00:00:00Z&end=2026-10-01T00:00:00Z',
      ),
    );
    expect(reversed.min).toBeUndefined();
    expect(reversed.start).toBeUndefined();
  });
  it('旧分类/月度收藏链接兼容，带时区日期转换为 UTC', () => {
    const f = parseFilters(
      new URLSearchParams('category=food&month=2026-10&merchant=麦当劳'),
    );
    expect(f.categoryId).toBe('food');
    expect(f.merchant).toBe('麦当劳');
    expect(f.start).toBeTruthy();
    expect(f.end).toBeTruthy();
    expect(
      parseFilters(new URLSearchParams('start=2026-10-07T08:00:00%2B08:00'))
        .start,
    ).toBe('2026-10-07T00:00:00.000Z');
  });
  it('信用卡巨大欠款与溢缴款不通过浮点转换', () => {
    const account: Account = {
      id: 'c',
      name: '测试卡',
      type: 'CreditCard',
      currency: 'CNY',
      status: 'Active',
      balance: '-9007199254740993.25',
    };
    expect(formatAccountBalance(account)).toBe(
      '欠款 ¥9,007,199,254,740,993.25',
    );
    expect(formatAccountBalance({ ...account, balance: '0.01' })).toBe(
      '溢缴款 ¥0.01',
    );
    expect(formatAccountBalance(account, true)).toBe('欠款 ¥••••••');
  });
  it('收入一级/二级分类筛选和导出均包含收入，转入账户可以全局搜索', async () => {
    const filters = {
      page: 1,
      pageSize: 20,
      sort: 'occurredAt:desc',
      type: 'Income' as const,
      categoryId: 'salary',
    };
    const income = await transactionApi.list(filters);
    expect(income.total).toBeGreaterThan(0);
    expect(income.items.every((t) => t.type === 'Income')).toBe(true);
    expect(
      (await transactionApi.list({ ...filters, categoryId: 'wage' })).total,
    ).toBe(income.total);
    const exported = await advancedApi.export(
      'CSV',
      filters,
      crypto.randomUUID(),
    );
    expect(exported.count).toBe(income.total);
    const transfer = await transactionApi.list({
      ...filters,
      type: 'Transfer',
      categoryId: undefined,
      keyword: '支付宝',
    });
    expect(transfer.items.some((t) => t.id === 't3')).toBe(true);
  });
  it('不明消费进入待整理；按精确商户筛选不会匹配名字相似的对象', async () => {
    await transactionApi.save({
      ...base,
      type: 'Expense',
      categoryId: 'unknown',
      merchant: '最终测试商户',
      note: '待分类',
    });
    const rows = await transactionApi.list({
      page: 1,
      pageSize: 20,
      sort: 'occurredAt:desc',
      status: 'NeedsReview',
      merchant: '最终测试商户',
    });
    expect(rows.total).toBe(1);
    expect(rows.items[0].status).toBe('NeedsReview');
    expect(
      (
        await transactionApi.list({
          page: 1,
          pageSize: 20,
          sort: 'occurredAt:desc',
          merchant: '最终测试',
        })
      ).total,
    ).toBe(0);
  });
  it('资产损失减少资产、默认不计消费；编辑、删除、恢复保持一致', async () => {
    const balances = await accountApi.list();
    const cash = minor(balances.find((a) => a.id === 'cash')!.balance);
    const before = await dashboardApi.get('2026-10');
    const saved = await transactionApi.save(
      base,
      undefined,
      crypto.randomUUID(),
    );
    const t = (saved.data as ApiResponse<Transaction>).data;
    expect(
      (await accountApi.list()).find((a) => a.id === 'cash')!.balance,
    ).toBe(decimal(cash - 2000n));
    const after = await dashboardApi.get('2026-10');
    expect(after.expense).toBe(before.expense);
    expect(after.income).toBe(before.income);
    expect(minor(after.netWorth) - minor(before.netWorth)).toBe(-2000n);
    await transactionApi.save(
      { ...base, amount: '25.00', version: t.version },
      t.id,
    );
    const edited = await transactionApi.detail(t.id);
    await transactionApi.remove(t.id, edited.version);
    expect(
      (await accountApi.list()).find((a) => a.id === 'cash')!.balance,
    ).toBe(decimal(cash));
    await transactionApi.restore(
      t.id,
      (await transactionApi.detail(t.id)).version,
    );
    expect(
      (await accountApi.list()).find((a) => a.id === 'cash')!.balance,
    ).toBe(decimal(cash - 2500n));
    await expect(
      transactionApi.save({ ...base, note: '' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      transactionApi.save({ ...base, accountId: 'credit' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
