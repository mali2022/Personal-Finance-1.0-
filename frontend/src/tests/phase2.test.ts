import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { apiClient } from '../api/client';
import {
  accountApi,
  budgetApi,
  dashboardApi,
  reportApi,
  transactionApi,
} from '../api/finance';
import { convertAmount } from '../utils/exchange';
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
  amount: '200.00',
  accountId: 'alipay',
  occurredAt: '2026-10-07T10:00:00Z',
  note: '二阶段测试',
  tagIds: [],
  splits: [],
  fee: '0.00',
};
const filters = {
  start: '2026-10-01',
  end: '2026-10-31',
  currency: 'CNY' as const,
  granularity: 'month' as const,
};
describe('第二阶段业务边界', () => {
  it('幂等键与请求内容绑定，冲突不能二次过账', async () => {
    const key = crypto.randomUUID();
    await transactionApi.save({ ...base, categoryId: 'lunch' }, undefined, key);
    await expect(
      transactionApi.save(
        { ...base, amount: '199.00', categoryId: 'lunch' },
        undefined,
        key,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('精确汇率八位、分位舍入与非法汇率', () => {
    expect(convertAmount('100', '0.12345678')).toBe('12.35');
    expect(convertAmount('1', '0.005')).toBe('0.01');
    expect(() => convertAmount('100', '0')).toThrow();
    expect(() => convertAmount('1', '0.123456789')).toThrow();
  });
  it('跨币种转账仅改变原币账户，本金不计收支，手续费单独计入', async () => {
    const before = await accountApi.list();
    const stats = await reportApi.get(filters);
    await transactionApi.save({
      ...base,
      type: 'Transfer',
      amount: '100.00',
      toAccountId: 'usd',
      exchangeRate: '0.14',
      receivedAmount: '14.00',
      fee: '2.00',
      feeCategoryId: 'fee',
    });
    const after = await accountApi.list();
    expect(
      minor(after.find((a) => a.id === 'usd')!.balance) -
        minor(before.find((a) => a.id === 'usd')!.balance),
    ).toBe(1400n);
    expect(
      minor(after.find((a) => a.id === 'alipay')!.balance) -
        minor(before.find((a) => a.id === 'alipay')!.balance),
    ).toBe(-10200n);
    const next = await reportApi.get(filters);
    expect(minor(next.expense) - minor(stats.expense)).toBe(200n);
    await expect(
      transactionApi.save({
        ...base,
        type: 'Transfer',
        toAccountId: 'usd',
        exchangeRate: '0.14',
        receivedAmount: '99.00',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('拆分原消费按分类退款、编辑排除自身额度、删除恢复与超分类额度校验', async () => {
    const result = await transactionApi.save({
      ...base,
      merchant: '拆分退款原消费',
      splits: [
        { categoryId: 'lunch', amount: '120.00' },
        { categoryId: 'daily', amount: '80.00' },
      ],
    });
    const originalId = (result.data as { data: { id: string } }).data.id;
    const before = await reportApi.get(filters);
    const refundResult = await transactionApi.save({
      ...base,
      type: 'Refund',
      originalTransactionId: originalId,
      amount: '50.00',
      splits: [{ categoryId: 'lunch', amount: '50.00' }],
    });
    const refundId = (refundResult.data as { data: { id: string } }).data.id;
    const source = await transactionApi.refundSource(originalId);
    expect(source.refundableAmount).toBe('150.00');
    expect(
      source.refundableSplits.find((s) => s.categoryId === 'lunch')?.amount,
    ).toBe('70.00');
    const after = await reportApi.get(filters);
    expect(
      minor(before.categories.find((c) => c.categoryId === 'food')!.amount) -
        minor(after.categories.find((c) => c.categoryId === 'food')!.amount),
    ).toBe(5000n);
    await expect(
      transactionApi.save({
        ...base,
        type: 'Refund',
        originalTransactionId: originalId,
        amount: '80.00',
        splits: [{ categoryId: 'lunch', amount: '80.00' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const refund = await transactionApi.detail(refundId);
    await transactionApi.save(
      {
        ...base,
        type: 'Refund',
        originalTransactionId: originalId,
        amount: '60.00',
        splits: [{ categoryId: 'lunch', amount: '60.00' }],
        version: refund.version,
      },
      refundId,
    );
    expect(
      (await transactionApi.refundSource(originalId, refundId))
        .refundableAmount,
    ).toBe('200.00');
    const updated = await transactionApi.detail(refundId);
    await transactionApi.remove(refundId, updated.version);
    expect(
      (await transactionApi.refundSource(originalId)).refundableAmount,
    ).toBe('200.00');
    await transactionApi.restore(
      refundId,
      (await transactionApi.detail(refundId)).version,
    );
    expect(
      (await transactionApi.refundSource(originalId)).refundableAmount,
    ).toBe('140.00');
  });
  it('预算保存、版本冲突、分类重复和总额超限', async () => {
    const current = await budgetApi.get('2026-11');
    await budgetApi.save('2026-11', {
      total: '1000.00',
      items: [{ categoryId: 'food', limit: '500.00' }],
      version: current.version,
    });
    const saved = await budgetApi.get('2026-11');
    expect(saved.total).toBe('1000.00');
    expect(saved.version).toBe('1');
    await expect(
      budgetApi.save('2026-11', { total: '2000', items: [], version: '0' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      budgetApi.save('2026-11', {
        total: '100',
        items: [{ categoryId: 'food', limit: '101' }],
        version: saved.version,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      budgetApi.save('2026-11', {
        total: '1000',
        items: [
          { categoryId: 'food', limit: '100' },
          { categoryId: 'food', limit: '100' },
        ],
        version: saved.version,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('父子预算互斥且失败不改变版本，二级分类可单独设置', async () => {
    const month = '2038-02';
    const before = await budgetApi.get(month);
    await expect(
      budgetApi.save(month, {
        total: '1000',
        version: before.version,
        items: [
          { categoryId: 'food', limit: '400' },
          { categoryId: 'lunch', limit: '200' },
        ],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('父分类') });
    expect(await budgetApi.get(month)).toEqual(before);
    await budgetApi.save(month, {
      total: '1000',
      version: before.version,
      items: [{ categoryId: 'lunch', limit: '200' }],
    });
    expect((await budgetApi.get(month)).items[0].categoryId).toBe('lunch');
  });
  it('报表一级二级可核对、不同币种隔离、时间范围限制、日周月年粒度', async () => {
    const summary = await reportApi.get(filters);
    expect(summary.categories.reduce((s, c) => s + minor(c.amount), 0n)).toBe(
      minor(summary.expense),
    );
    const food = await reportApi.get({ ...filters, parentId: 'food' });
    expect(food.categories.reduce((s, c) => s + minor(c.amount), 0n)).toBe(
      minor(summary.categories.find((c) => c.categoryId === 'food')!.amount),
    );
    for (const granularity of ['day', 'week', 'year'] as const) {
      const result = await reportApi.get({ ...filters, granularity });
      expect(result.points.reduce((s, p) => s + minor(p.expense), 0n)).toBe(
        minor(result.expense),
      );
    }
    const usd = await reportApi.get({ ...filters, currency: 'USD' });
    expect(usd.expense).toBe('0.00');
    await expect(
      reportApi.get({ ...filters, start: '2020-01-01' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('信用卡还款不重复记支出，账单日期处理短月份', async () => {
    const before = await dashboardApi.get('2026-10');
    await transactionApi.save({
      ...base,
      type: 'CreditCardPayment',
      accountId: 'bank',
      toAccountId: 'credit',
      amount: '100.00',
    });
    const after = await dashboardApi.get('2026-10');
    expect(after.expense).toBe(before.expense);
    const card = (await accountApi.list()).find((a) => a.id === 'credit')!;
    await accountApi.save(
      { ...card, statementDay: 31, paymentDay: 3 },
      card.id,
    );
    const statement = await accountApi.statement(card.id, '2026-02');
    expect(statement.statementDate).toBe('2026-02-28');
    expect(statement.dueDate).toBe('2026-03-03');
    await accountApi.save(
      {
        ...card,
        version: (await accountApi.list()).find((a) => a.id === card.id)!
          .version,
      },
      card.id,
    );
  });
  it('远程退款查询按关键词分页，而非只搜索最近100条', async () => {
    const result = await transactionApi.refundSources('拆分退款原消费', 1);
    expect(result.items.some((t) => t.merchant === '拆分退款原消费')).toBe(
      true,
    );
    expect(result.pageSize).toBe(20);
  });
});
