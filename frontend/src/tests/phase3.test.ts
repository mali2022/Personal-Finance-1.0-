import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { apiClient } from '../api/client';
import { businessApi, directoryApi } from '../api/business';
import { accountApi, reportApi, transactionApi } from '../api/finance';
import { formatDate, minor } from '../utils/finance';
import type {
  ApiResponse,
  BusinessRecord,
  CreateBusinessRequest,
  DirectoryRecord,
} from '../types';
const server = setupServer(...handlers);
beforeAll(() => {
  apiClient.defaults.baseURL = window.location.origin + '/api';
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => server.close());
const base: CreateBusinessRequest = {
  kind: 'Lent',
  counterparty: '测试对象',
  accountId: 'alipay',
  amount: '100.01',
  occurredAt: '2026-10-07T10:00:00Z',
  note: '',
};
const range = {
  start: '2026-10-01',
  // 资产损失与对账调整按当前时间记账，结束日必须覆盖今天
  end: formatDate(new Date().toISOString()),
  currency: 'CNY' as const,
  granularity: 'month' as const,
};
async function create(kind: BusinessRecord['kind'] = 'Lent') {
  const r = await businessApi.create({ ...base, kind }, crypto.randomUUID());
  return (r.data as ApiResponse<BusinessRecord>).data;
}
describe('第三阶段资金与元数据边界', () => {
  it.each(['Lent', 'Borrowed', 'Reimbursement'] as const)(
    '%s 不计收支且保留净资产',
    async (kind) => {
      const before = await reportApi.get(range);
      const accountsBefore = await accountApi.list();
      const b = await create(kind);
      const after = await reportApi.get(range);
      expect(after.income).toBe(before.income);
      expect(after.expense).toBe(before.expense);
      expect(after.netWorth).toBe(before.netWorth);
      const rows = await accountApi.list();
      expect(
        minor(rows.find((a) => a.id === 'alipay')!.balance) -
          minor(accountsBefore.find((a) => a.id === 'alipay')!.balance),
      ).toBe(kind === 'Borrowed' ? 10001n : -10001n);
      expect(rows.find((a) => a.id === b.contractAccountId)!.balance).toBe(
        kind === 'Borrowed' ? '-100.01' : '100.01',
      );
    },
  );
  it('幂等、分次还款、超额及版本冲突', async () => {
    const key = crypto.randomUUID();
    const first = await businessApi.create(base, key);
    const again = await businessApi.create(base, key);
    expect(again.data).toEqual(first.data);
    await expect(
      businessApi.create({ ...base, amount: '101' }, key),
    ).rejects.toMatchObject({ code: 'BUSINESS_ERROR' });
    const b = (first.data as ApiResponse<BusinessRecord>).data;
    const body = { ...base, amount: '50.00', version: b.version };
    const result = await businessApi.settle(b.id, body, crypto.randomUUID());
    const next = (result.data as ApiResponse<BusinessRecord>).data;
    expect(next.outstanding).toBe('50.01');
    expect(next.status).toBe('Partial');
    await expect(
      businessApi.settle(b.id, body, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'BUSINESS_ERROR' });
    await expect(
      businessApi.settle(
        b.id,
        { ...body, amount: '50.02', version: next.version },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'BUSINESS_ERROR' });
  });
  it('报销放弃确认资产损失，撤销和恢复保持余额', async () => {
    const b = await create('Reimbursement');
    const before = await reportApi.get(range);
    const response = await businessApi.status(b.id, 'Abandoned', b.version);
    const abandoned = (response.data as ApiResponse<BusinessRecord>).data;
    const after = await reportApi.get(range);
    expect(minor(before.netWorth) - minor(after.netWorth)).toBe(10001n);
    expect(after.expense).toBe(before.expense);
    expect(abandoned.outstanding).toBe('0.00');
    const loss = abandoned.history.find((t) => t.type === 'AssetLoss')!;
    const undo = await businessApi.transaction(
      b.id,
      loss.id,
      'delete',
      abandoned.version,
    );
    const restored = (undo.data as ApiResponse<BusinessRecord>).data;
    expect(restored.outstanding).toBe('100.01');
    expect((await reportApi.get(range)).netWorth).toBe(before.netWorth);
    await businessApi.transaction(b.id, loss.id, 'restore', restored.version);
    expect((await reportApi.get(range)).netWorth).toBe(after.netWorth);
  });
  it('原记录必须先撤销归还，且不能通过普通交易接口绕过', async () => {
    const b = await create();
    const result = await businessApi.settle(
      b.id,
      { ...base, amount: '10', version: b.version },
      crypto.randomUUID(),
    );
    const next = (result.data as ApiResponse<BusinessRecord>).data;
    const original = next.history.find((t) => t.type === 'LoanGiven')!;
    await expect(
      businessApi.transaction(b.id, original.id, 'delete', next.version),
    ).rejects.toMatchObject({ code: 'BUSINESS_ERROR' });
    await expect(
      transactionApi.remove(original.id, original.version),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('项目、标签筛选与退款净消费一致，项目报表不混入其他消费', async () => {
    const record: DirectoryRecord = {
      id: '',
      kind: 'projects',
      name: '测试项目',
      currency: 'CNY',
      budget: '500',
      spent: '0',
      transactionCount: 0,
      status: 'Active',
      version: '0',
    };
    const response = await directoryApi.save(record);
    const project = (response.data as ApiResponse<DirectoryRecord>).data;
    const saved = await transactionApi.save({
      ...base,
      type: 'Expense',
      categoryId: 'lunch',
      projectId: project.id,
      merchant: '测试商户',
      tagIds: ['work'],
      splits: [],
      fee: '0',
    });
    const t = saved.data.data;
    await transactionApi.save({
      ...base,
      type: 'Refund',
      amount: '30',
      originalTransactionId: t.id,
      tagIds: [],
      splits: [],
      fee: '0',
    });
    const rows = await transactionApi.list({
      page: 1,
      pageSize: 20,
      sort: 'date:desc',
      projectId: project.id,
      tagId: 'work',
    });
    expect(rows.total).toBe(2);
    expect(
      (await directoryApi.list('projects')).items.find(
        (p) => p.id === project.id,
      )!.spent,
    ).toBe('70.01');
    expect(
      (await reportApi.get({ ...range, projectId: project.id })).expense,
    ).toBe('70.01');
    const refundRow = rows.items.find((row) => row.type === 'Refund')!;
    expect(refundRow.merchant).toBe('测试商户');
    const original = await transactionApi.detail(t.id);
    await transactionApi.save(
      {
        ...base,
        type: 'Expense',
        categoryId: 'lunch',
        tagIds: [],
        splits: [],
        fee: '0',
        version: original.version,
      },
      t.id,
    );
    expect(
      (
        await transactionApi.list({
          page: 1,
          pageSize: 20,
          sort: 'date:desc',
          projectId: project.id,
        })
      ).total,
    ).toBe(0);
    expect(
      (await reportApi.get({ ...range, projectId: project.id })).expense,
    ).toBe('0.00');
  });
  it('模板验证账户币种及金额，目录记录版本保护', async () => {
    const record: DirectoryRecord = {
      id: '',
      kind: 'templates',
      name: '测试早餐',
      currency: 'USD',
      budget: '0',
      spent: '0',
      transactionCount: 0,
      status: 'Active',
      version: '0',
      accountId: 'alipay',
      categoryId: 'lunch',
      amount: '15',
    };
    await expect(directoryApi.save(record)).rejects.toMatchObject({
      code: 'BUSINESS_ERROR',
    });
    const response = await directoryApi.save({ ...record, currency: 'CNY' });
    const template = (response.data as ApiResponse<DirectoryRecord>).data;
    await expect(
      directoryApi.save({ ...template, version: '0' }, template.id),
    ).rejects.toMatchObject({ code: 'BUSINESS_ERROR' });
  });
});
