import { http, HttpResponse } from 'msw';
import { accounts, categories, transactions } from './seed';
import { accountDelta, expenseItems } from './analytics';
import { decimal, minor } from '../utils/finance';
import type {
  BusinessRecord,
  CreateBusinessRequest,
  DirectoryRecord,
  SettleBusinessRequest,
  Transaction,
} from '../types';
export const directory: DirectoryRecord[] = [
  {
    id: 'work',
    kind: 'tags',
    name: '工作',
    currency: 'CNY',
    budget: '0',
    spent: '0',
    transactionCount: 0,
    status: 'Active',
    version: '1',
  },
  {
    id: 'travel',
    kind: 'projects',
    name: '日本旅行',
    currency: 'CNY',
    budget: '15000',
    spent: '0',
    transactionCount: 0,
    startDate: '2026-10-01',
    status: 'Active',
    version: '1',
  },
  {
    id: 'mcd',
    kind: 'merchants',
    name: '麦当劳',
    categoryId: 'lunch',
    currency: 'CNY',
    budget: '0',
    spent: '0',
    transactionCount: 0,
    status: 'Active',
    version: '1',
  },
  {
    id: 'starbucks',
    kind: 'merchants',
    name: '星巴克',
    categoryId: 'coffee',
    currency: 'CNY',
    budget: '0',
    spent: '0',
    transactionCount: 0,
    status: 'Active',
    version: '1',
  },
];
export const records: BusinessRecord[] = [];
const keys = new Map<string, { fingerprint: string; result: unknown }>();
const ok = (data: unknown) => HttpResponse.json({ data });
const fail = (message: string, status = 422) =>
  HttpResponse.json({ message, code: 'BUSINESS_ERROR' }, { status });
export function applyBalance(t: Transaction, direction: bigint) {
  for (const a of accounts) {
    const delta = accountDelta(t, a.id) * direction;
    if (delta !== 0n) {
      a.balance = decimal(minor(a.balance) + delta);
      a.version = String(Number(a.version || '1') + 1);
    }
  }
}
function posting(
  b: BusinessRecord,
  body: SettleBusinessRequest | CreateBusinessRequest,
  settlement: boolean,
  loss = false,
) {
  const type = loss
    ? 'AssetLoss'
    : b.kind === 'Lent'
      ? settlement
        ? 'LoanRepaymentReceived'
        : 'LoanGiven'
      : b.kind === 'Borrowed'
        ? settlement
          ? 'LoanRepaymentPaid'
          : 'LoanReceived'
        : settlement
          ? 'ReimbursementReceived'
          : 'ReimbursementAdvance';
  const now = new Date().toISOString();
  const t: Transaction = {
    id: crypto.randomUUID(),
    businessId: b.id,
    type,
    amount: decimal(minor(body.amount)),
    currency: b.currency,
    accountId: loss ? b.contractAccountId : body.accountId,
    toAccountId: loss ? undefined : b.contractAccountId,
    merchant: b.counterparty,
    occurredAt: body.occurredAt,
    note: body.note,
    tagIds: [],
    status: 'Confirmed',
    refundedAmount: '0',
    fee: '0',
    splits: [],
    version: '1',
    createdAt: now,
    updatedAt: now,
  };
  transactions.unshift(t);
  b.history.unshift(t);
  applyBalance(t, 1n);
}
function valid(
  body: CreateBusinessRequest | SettleBusinessRequest,
  currency?: string,
) {
  const a = accounts.find(
    (a) =>
      a.id === body.accountId &&
      a.status === 'Active' &&
      !['Receivable', 'Payable', 'CreditCard'].includes(a.type),
  );
  if (!a || (currency && a.currency !== currency))
    throw new Error('请选择相同币种的可用资金账户');
  if (minor(body.amount) <= 0n) throw new Error('金额必须大于 0');
  if (
    !Number.isFinite(Date.parse(body.occurredAt)) ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(body.occurredAt)
  )
    throw new Error('日期必须包含时区');
  return a;
}
async function mutate(request: Request, id?: string) {
  const body = (await request.json()) as CreateBusinessRequest &
    SettleBusinessRequest;
  const key = request.headers.get('Idempotency-Key');
  const fingerprint = JSON.stringify({
    path: new URL(request.url).pathname,
    body,
  });
  if (!key) return fail('缺少幂等键');
  const cached = keys.get(key);
  if (cached)
    return cached.fingerprint === fingerprint
      ? ok(cached.result)
      : fail('幂等键内容不同', 409);
  try {
    let b = records.find((r) => r.id === id);
    if (id) {
      if (!b) return fail('记录不存在', 404);
      if (request.headers.get('If-Match') !== b.version)
        return fail('记录已更新，请刷新', 409);
      valid(body, b.currency);
      if (b.status === 'Abandoned' || minor(body.amount) > minor(b.outstanding))
        return fail('金额超过剩余应收或应付');
      if (Date.parse(body.occurredAt) < Date.parse(b.occurredAt))
        return fail('收款或还款日期不能早于原记录');
      posting(b, body, true);
      b.settled = decimal(minor(b.settled) + minor(body.amount));
      b.outstanding = decimal(minor(b.principal) - minor(b.settled));
      b.status = minor(b.outstanding) === 0n ? 'Settled' : 'Partial';
      b.version = String(Number(b.version) + 1);
    } else {
      const a = valid(body);
      if (
        !['Lent', 'Borrowed', 'Reimbursement'].includes(body.kind) ||
        !body.counterparty?.trim()
      )
        return fail('请选择类型并填写对象');
      const contractAccountId = crypto.randomUUID();
      b = {
        id: crypto.randomUUID(),
        kind: body.kind,
        counterparty: body.counterparty.trim(),
        currency: a.currency,
        principal: decimal(minor(body.amount)),
        settled: '0.00',
        outstanding: decimal(minor(body.amount)),
        accountId: a.id,
        contractAccountId,
        occurredAt: body.occurredAt,
        note: body.note,
        status: 'Draft',
        version: '1',
        history: [],
      };
      accounts.push({
        id: contractAccountId,
        name: `${b.kind === 'Borrowed' ? '应付' : '应收'} · ${b.counterparty}`,
        type: b.kind === 'Borrowed' ? 'Payable' : 'Receivable',
        currency: b.currency,
        balance: '0.00',
        status: 'Active',
      });
      posting(b, body, false);
      records.unshift(b);
    }
    keys.set(key, { fingerprint, result: structuredClone(b) });
    return ok(b);
  } catch (error) {
    return fail(error instanceof Error ? error.message : '保存失败');
  }
}
export function directoryStats(d: DirectoryRecord): DirectoryRecord {
  const rows = transactions.filter(
    (t) =>
      t.status !== 'Deleted' &&
      t.currency === d.currency &&
      (d.kind === 'projects'
        ? t.projectId === d.id
        : d.kind === 'tags'
          ? t.tagIds.includes(d.id)
          : d.kind === 'merchants'
            ? (t.type === 'Refund'
                ? transactions.find(
                    (source) => source.id === t.originalTransactionId,
                  )?.merchant
                : t.merchant) === d.name
            : false),
  );
  return {
    ...d,
    transactionCount: rows.length,
    lastTransactionAt: rows
      .filter((t) => t.type === 'Expense')
      .map((t) => t.occurredAt)
      .sort()
      .at(-1),
    spent: decimal(
      rows.reduce(
        (sum, t) =>
          sum +
          expenseItems(t).reduce((s, i) => s + minor(i.amount), 0n) *
            (t.type === 'Refund' ? -1n : 1n),
        0n,
      ),
    ),
  };
}
export const phase3Handlers = [
  http.delete('/api/business/:id', ({request,params}) => {
    const b=records.find(r=>r.id===params.id);
    if(!b) return fail('记录不存在',404);
    if(!['Lent','Borrowed'].includes(b.kind)) return fail('仅支持借贷');
    if(request.headers.get('If-Match')!==b.version) return fail('记录已更新',409);
    for(const t of b.history.filter(t=>t.status!=='Deleted')) {applyBalance(t,-1n);t.status='Deleted';t.version=String(Number(t.version)+1);}
    b.version=String(Number(b.version)+1); b.outstanding='0.00';b.settled='0.00';return ok({id:b.id});
  }),
  http.get('/api/business/:id', ({ params }) => {
    const b = records.find((r) => r.id === params.id);
    return b ? ok(b) : fail('记录不存在', 404);
  }),
  http.post(
    '/api/business/:id/transactions/:transactionId/:action',
    ({ request, params }) => {
      const b = records.find((r) => r.id === params.id);
      const t = b?.history.find((t) => t.id === params.transactionId);
      if (!b || !t) return fail('记录不存在', 404);
      if (request.headers.get('If-Match') !== b.version)
        return fail('记录已更新', 409);
      const restore = params.action === 'restore';
      if (!restore && params.action !== 'delete') return fail('操作无效');
      if (
        (restore && t.status !== 'Deleted') ||
        (!restore && t.status === 'Deleted')
      )
        return ok(b);
      const original = b.history.find((t) =>
        ['LoanGiven', 'LoanReceived', 'ReimbursementAdvance'].includes(t.type),
      )!;
      const settlement = [
        'LoanRepaymentReceived',
        'LoanRepaymentPaid',
        'ReimbursementReceived',
      ].includes(t.type);
      const activeSettlements = b.history.filter(
        (x) =>
          x.id !== t.id &&
          x.status !== 'Deleted' &&
          [
            'LoanRepaymentReceived',
            'LoanRepaymentPaid',
            'ReimbursementReceived',
          ].includes(x.type),
      );
      const settled = activeSettlements.reduce(
        (s, x) => s + minor(x.amount),
        0n,
      );
      if (
        t.id === original.id &&
        !restore &&
        b.history.some((x) => x.id !== t.id && x.status !== 'Deleted')
      )
        return fail('请先撤销关联收款、还款或损失');
      if (restore && t.id !== original.id && original.status === 'Deleted')
        return fail('请先恢复原记录');
      if (
        restore &&
        settlement &&
        (settled + minor(t.amount) > minor(b.principal) ||
          b.history.some(
            (x) => x.type === 'AssetLoss' && x.status !== 'Deleted',
          ))
      )
        return fail('已超过剩余额度或已停止报销');
      if (
        restore &&
        t.type === 'AssetLoss' &&
        settled + minor(t.amount) !== minor(b.principal)
      )
        return fail('剩余额度已变化，不能恢复原损失');
      applyBalance(t, restore ? 1n : -1n);
      t.status = restore ? 'Confirmed' : 'Deleted';
      t.version = String(Number(t.version) + 1);
      b.settled = decimal(
        settled + (settlement && restore ? minor(t.amount) : 0n),
      );
      const loss = b.history
        .filter((x) => x.type === 'AssetLoss' && x.status !== 'Deleted')
        .reduce((s, x) => s + minor(x.amount), 0n);
      b.outstanding =
        original.status === 'Deleted'
          ? '0.00'
          : decimal(minor(b.principal) - minor(b.settled) - loss);
      b.status =
        loss > 0n
          ? 'Abandoned'
          : minor(b.outstanding) === 0n
            ? 'Settled'
            : minor(b.settled) > 0n
              ? 'Partial'
              : 'Draft';
      b.version = String(Number(b.version) + 1);
      return ok(b);
    },
  ),
  http.get('/api/business', ({ request }) => {
    const u = new URL(request.url);
    const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
    const rows = records.filter((r) => r.kind === u.searchParams.get('kind') && r.history.some(t => ['LoanGiven','LoanReceived','ReimbursementAdvance'].includes(t.type) && t.status !== 'Deleted'));
    return ok({
      items: rows.slice((page - 1) * 20, page * 20),
      total: rows.length,
      page,
      pageSize: 20,
    });
  }),
  http.post('/api/business', ({ request }) => mutate(request)),
  http.post('/api/business/:id/settlements', ({ request, params }) =>
    mutate(request, String(params.id)),
  ),
  http.post('/api/business/:id/status', async ({ request, params }) => {
    const b = records.find((r) => r.id === params.id);
    if (!b) return fail('记录不存在', 404);
    if (request.headers.get('If-Match') !== b.version)
      return fail('记录已更新', 409);
    const { status } = (await request.json()) as { status: string };
    if (
      b.kind !== 'Reimbursement' ||
      !['Submitted', 'Abandoned'].includes(status) ||
      ['Settled', 'Abandoned'].includes(b.status)
    )
      return fail('状态不可修改');
    if (status === 'Submitted' && b.status !== 'Draft')
      return fail('仅待提交记录可提交');
    if (status === 'Abandoned') {
      posting(
        b,
        {
          accountId: b.accountId,
          amount: b.outstanding,
          occurredAt: new Date().toISOString(),
          note: '停止报销，剩余应收确认为资产损失',
          version: b.version,
        },
        false,
        true,
      );
      b.outstanding = '0.00';
    }
    b.status = status as BusinessRecord['status'];
    b.version = String(Number(b.version) + 1);
    return ok(b);
  }),
  http.get('/api/directory/:kind', ({ request, params }) => {
    const u = new URL(request.url);
    const keyword = (u.searchParams.get('keyword') || '').toLowerCase();
    const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
    const rows = directory
      .filter(
        (d) => d.kind === params.kind && d.name.toLowerCase().includes(keyword),
      )
      .map(directoryStats);
    return ok({
      items: rows.slice((page - 1) * 100, page * 100),
      total: rows.length,
      page,
      pageSize: 100,
    });
  }),
  ...['post', 'put'].map((method) =>
    (method === 'post' ? http.post : http.put)(
      method === 'post' ? '/api/directory/:kind' : '/api/directory/:kind/:id',
      async ({ request, params }) => {
        const body = (await request.json()) as DirectoryRecord;
        body.kind = params.kind as DirectoryRecord['kind'];
        const old = directory.find((d) => d.id === params.id);
        if (method === 'put' && !old) return fail('记录不存在', 404);
        if (old && request.headers.get('If-Match') !== old.version)
          return fail('记录已更新', 409);
        try {
          if (
            !['projects', 'merchants', 'tags', 'templates'].includes(
              String(params.kind),
            ) ||
            !body.name?.trim() ||
            !['CNY', 'USD', 'HKD'].includes(body.currency) ||
            !['Active', 'Disabled', 'Completed'].includes(body.status)
          )
            return fail('名称、币种或状态无效');
          if (
            directory.some(
              (d) =>
                d.id !== old?.id &&
                d.kind === params.kind &&
                d.name === body.name.trim(),
            )
          )
            return fail('名称已存在');
          if (
            old &&
            (old.currency !== body.currency ||
              (old.kind === 'merchants' && old.name !== body.name)) &&
            directoryStats(old).transactionCount
          )
            return fail('已有历史记录，不能修改币种或商户名称');
          if (minor(body.budget || '0') < 0n) return fail('预算不能为负');
          if (body.endDate && body.startDate && body.endDate < body.startDate)
            return fail('结束日期不能早于开始日期');
          if (
            body.categoryId &&
            !categories.some(
              (c) =>
                c.id === body.categoryId &&
                c.parentId &&
                c.kind === 'Expense' &&
                c.status === 'Active',
            )
          )
            return fail('分类不可用');
          if (
            body.kind === 'templates' &&
            (!body.categoryId ||
              !body.accountId ||
              minor(body.amount || '0') <= 0n ||
              !accounts.some(
                (a) =>
                  a.id === body.accountId &&
                  a.currency === body.currency &&
                  a.status === 'Active',
              ))
          )
            return fail('请完善模板账户、分类与金额');
          const saved = {
            ...body,
            budget: decimal(minor(body.budget || '0')),
            id: old?.id || crypto.randomUUID(),
            name: body.name.trim(),
            kind: params.kind as DirectoryRecord['kind'],
            spent: '0.00',
            transactionCount: 0,
            version: String(Number(old?.version || 0) + 1),
          };
          if (old) Object.assign(old, saved);
          else directory.push(saved);
          return ok(saved);
        } catch {
          return fail('金额格式不正确');
        }
      },
    ),
  ),
];
// 演示原始记录与部分到账；所有余额仍通过同一服务端过账函数更新。
function seedBusiness(
  kind: BusinessRecord['kind'],
  counterparty: string,
  principal: string,
  settled = '0.00',
) {
  const id = `demo-${kind.toLowerCase()}`;
  const contractAccountId = `${id}-account`;
  const b: BusinessRecord = {
    id,
    kind,
    counterparty,
    currency: 'CNY',
    principal,
    settled: '0.00',
    outstanding: principal,
    accountId: 'bank',
    contractAccountId,
    occurredAt: '2026-10-03T08:00:00Z',
    note: '演示记录',
    status: kind === 'Reimbursement' ? 'Submitted' : 'Draft',
    version: '1',
    history: [],
  };
  accounts.push({
    id: contractAccountId,
    name: `${kind === 'Borrowed' ? '应付' : '应收'} · ${counterparty}`,
    type: kind === 'Borrowed' ? 'Payable' : 'Receivable',
    currency: 'CNY',
    balance: '0.00',
    status: 'Active',
  });
  posting(
    b,
    {
      kind,
      counterparty,
      accountId: 'bank',
      amount: principal,
      occurredAt: b.occurredAt,
      note: b.note,
    },
    false,
  );
  if (minor(settled) > 0n) {
    posting(
      b,
      {
        accountId: 'bank',
        amount: settled,
        occurredAt: '2026-10-05T08:00:00Z',
        note: '部分归还',
        version: '1',
      },
      true,
    );
    b.settled = settled;
    b.outstanding = decimal(minor(principal) - minor(settled));
    b.status = 'Partial';
  }
  records.push(b);
}
seedBusiness('Lent', '朋友小陈', '1200.00');
seedBusiness('Borrowed', '家人', '600.00');
seedBusiness('Reimbursement', '公司 · 出差费用', '320.00', '100.00');
