import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { apiClient } from '../api/client';
import { accountApi, dashboardApi, transactionApi } from '../api/finance';
import { minor } from '../utils/finance';
import type { SaveTransactionRequest } from '../types';
const server = setupServer(...handlers);
beforeAll(() => {
  apiClient.defaults.baseURL = window.location.origin + '/api';
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => server.close());
const base: SaveTransactionRequest = {
  type: 'Expense',
  amount: '10.00',
  accountId: 'alipay',
  categoryId: 'lunch',
  occurredAt: '2026-10-07T11:30:00Z',
  note: '接口验收',
  tagIds: [],
  splits: [],
  fee: '0.00',
};
describe('API 业务一致性', () => {
  it('转账本金不增加支出，两个账户精确变化，重复幂等键不二次过账', async () => {
    const before = await dashboardApi.get('2026-10');
    const beforeAccounts = await accountApi.list();
    const body = {
      ...base,
      type: 'Transfer' as const,
      toAccountId: 'bank',
      categoryId: undefined,
      amount: '123.45',
      fee: '1.20',
    };
    const key = crypto.randomUUID();
    await transactionApi.save(body, undefined, key);
    await transactionApi.save(body, undefined, key);
    const after = await dashboardApi.get('2026-10');
    const afterAccounts = await accountApi.list();
    expect(minor(after.expense) - minor(before.expense)).toBe(120n);
    expect(
      minor(afterAccounts.find((a) => a.id === 'bank')!.balance) -
        minor(beforeAccounts.find((a) => a.id === 'bank')!.balance),
    ).toBe(12345n);
    expect(
      minor(afterAccounts.find((a) => a.id === 'alipay')!.balance) -
        minor(beforeAccounts.find((a) => a.id === 'alipay')!.balance),
    ).toBe(-12465n);
  });
  it('分类分析按拆分费用归属，累计退款不得超额', async () => {
    const before = await dashboardApi.get('2026-10');
    const split = {
      ...base,
      categoryId: undefined,
      amount: '20.00',
      splits: [
        { categoryId: 'lunch', amount: '12.00' },
        { categoryId: 'metro', amount: '8.00' },
      ],
    };
    await transactionApi.save(split);
    const after = await dashboardApi.get('2026-10');
    expect(
      minor(after.categories.find((c) => c.categoryId === 'food')!.amount) -
        minor(before.categories.find((c) => c.categoryId === 'food')!.amount),
    ).toBe(1200n);
    expect(
      minor(
        after.categories.find((c) => c.categoryId === 'transport')!.amount,
      ) -
        minor(
          before.categories.find((c) => c.categoryId === 'transport')!.amount,
        ),
    ).toBe(800n);
    await expect(
      transactionApi.save({
        ...base,
        type: 'Refund',
        originalTransactionId: 't2',
        amount: '1000',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('软删除撤销账户影响，恢复重建影响，旧版本不能覆盖', async () => {
    await transactionApi.save({ ...base, merchant: '版本删除验收' });
    const page = await transactionApi.list({
      page: 1,
      pageSize: 20,
      sort: 'occurredAt:desc',
      keyword: '版本删除验收',
    });
    const t = page.items[0];
    const before = await accountApi.list();
    await transactionApi.remove(t.id, t.version);
    const deleted = await accountApi.list();
    expect(
      minor(deleted.find((a) => a.id === t.accountId)!.balance) -
        minor(before.find((a) => a.id === t.accountId)!.balance),
    ).toBe(1000n);
    await transactionApi.restore(
      t.id,
      (await transactionApi.detail(t.id)).version,
    );
    await expect(
      transactionApi.save({ ...base, version: t.version }, t.id),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
