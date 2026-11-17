import { demoAnomalies, demoMerchantValues, transactionWorkspaceHandlers } from './transactionWorkspace';
import { http, HttpResponse, delay } from 'msw';
import { categoryStatisticsHandlers } from './categoryStatistics';
import { categoryPath, categoryActive } from '../utils/categories';
import { accounts, categories, transactions } from './seed';
import {
  budget,
  budgetSettings,
  expenseItems,
  refundSource,
  report,
} from './analytics';
import { phase3Handlers, directory, records } from './phase3';
import { importHandlers, importCategoryReferences } from './imports';
import { planningHandlers } from './planning';
import { operationsHandlers, attachmentsFor } from './operations';
import { statisticsManagementHandlers } from './statisticsManagement';
import { matchesCategory, searchText } from './transaction-query';
import { phase2Handlers } from './phase2';
import { appleHandlers, appleShellHandlers } from './apple';
import { convertAmount } from '../utils/exchange';
import dayjs from 'dayjs';
import {
  decimal,
  minor,
  validateRefund,
  validateSplits,
  validateTransfer,
  formatDate,
} from '../utils/finance';
import type {
  Account,
  Category,
  SaveTransactionRequest,
  Transaction,
} from '../types';
const ok = (data: unknown) => HttpResponse.json({ data });
const fail = (message: string, status = 422) =>
  HttpResponse.json({ message, code: 'VALIDATION_ERROR' }, { status });
const versionConflict = () =>
  HttpResponse.json(
    { message: '数据已更新，请刷新后重试', code: 'VERSION_CONFLICT' },
    { status: 409 },
  );
const categoryReferences = (id: string) => [
  {
    kind: 'children',
    label: '子分类',
    count: categories.filter((c) => c.parentId === id).length,
  },
  {
    kind: 'transactions',
    label: '交易（含已删除记录）',
    count: transactions.filter(
      (t) =>
        t.categoryId === id ||
        t.feeCategoryId === id ||
        t.splits?.some((s) => s.categoryId === id),
    ).length,
  },
  {
    kind: 'budgets',
    label: '预算明细',
    count: [...budgetSettings.values()].reduce(
      (n, b) => n + b.items.filter((i) => i.categoryId === id).length,
      0,
    ),
  },
  {
    kind: 'directory',
    label: '商户或记账模板',
    count: directory.filter((d) => d.categoryId === id).length,
  },
  { kind: 'imports', label: '导入记录', count: importCategoryReferences(id) },
];
let loggedIn = true;
const user = {
  id: 'demo',
  displayName: '林予安',
  email: 'demo@example.com',
  permissions: ['finance:read', 'finance:write'],
};
const idempotency = new Map<
  string,
  { data: Transaction; fingerprint: string }
>();
/** Mock 服务端模拟；生产账户余额与统计必须由 ASP.NET Core 计算。 */
function balanceEffect(t: Transaction, direction: bigint) {
  const change = (id: string, amount: bigint) => {
    const a = accounts.find((x) => x.id === id);
    if (a && amount !== 0n) {
      a.balance = decimal(minor(a.balance) + amount * direction);
      a.version = String(Number(a.version || '1') + 1);
    }
  };
  const amount = minor(t.amount);
  if (t.type === 'Expense' || t.type === 'AssetLoss')
    change(t.accountId, -amount);
  else if (t.type === 'Income' || t.type === 'Refund')
    change(t.accountId, amount);
  else if (t.type === 'Transfer' || t.type === 'CreditCardPayment') {
    change(t.accountId, -amount - minor(t.fee));
    if (t.toAccountId)
      change(t.toAccountId, minor(t.receivedAmount || t.amount));
  }
}
function filtered(url: URL) {
  const p = url.searchParams;
  return transactions
    .filter(
      (t) =>
        (p.get('status')
          ? p.get('status') === 'NeedsReview'
            ? t.status !== 'Deleted' &&
              (t.status === 'NeedsReview' || t.categoryId === 'unknown')
            : t.status === p.get('status')
          : t.status !== 'Deleted') &&
        (!p.get('statusFlag') || t.status === p.get('statusFlag')) &&
        (!p.get('type') || t.type === p.get('type')) &&
        (!p.get('accountIds') || p.get('accountIds')!.split(',').some(id=>id===t.accountId||id===t.toAccountId||t.payments?.some(payment=>payment.accountId===id))) &&
        (!p.get('categoryIds') || p.get('categoryIds')!.split(',').some(id=>matchesCategory(t,id))) &&
        (!p.get('merchants') || demoMerchantValues(p.get('merchants')!).includes(t.merchant||'')) &&
        (!p.get('projectIds') || p.get('projectIds')!.split(',').includes(t.projectId||'')) &&
        (!p.get('tagIds') || p.get('tagIds')!.split(',').some(id=>t.tagIds.includes(id))) &&
        (!p.get('source') || (p.get('source')==='Imported'?!!t.importJobId:p.get('source')==='Manual'?!t.importJobId:false)) &&
        (!p.get('anomaly') || (p.get('anomaly')==='Any'?demoAnomalies(t).length>0:demoAnomalies(t).includes(p.get('anomaly')!))) &&
        (p.get('reconciliation')!=='Matched') &&
        (!p.get('transferKind') ||
          (t.type === 'Transfer' &&
            t.transferKind === p.get('transferKind'))) &&
        (!p.get('projectId') || t.projectId === p.get('projectId')) &&
        (!p.get('importJobId') || t.importJobId === p.get('importJobId')) &&
        (!p.get('tagId') || t.tagIds.includes(p.get('tagId')!)) &&
        (!p.get('currency') || t.currency === p.get('currency')) &&
        (!p.get('accountId') ||
          t.accountId === p.get('accountId') ||
          t.toAccountId === p.get('accountId')) &&
        (!p.get('merchant') || t.merchant === p.get('merchant')) &&
        (!p.get('categoryId') || matchesCategory(t, p.get('categoryId')!)) &&
        (!p.get('keyword') ||
          searchText(t).includes(p.get('keyword')!.toLowerCase())) &&
        (!p.get('start') || t.occurredAt >= p.get('start')!) &&
        (!p.get('end') || t.occurredAt <= p.get('end')!) &&
        (!p.get('min') || minor(t.amount) >= minor(p.get('min')!)) &&
        (!p.get('max') || minor(t.amount) <= minor(p.get('max')!)),
    )
    .sort((a, b) =>
      p.get('sort') === 'amount:asc'
        ? minor(a.amount) < minor(b.amount)
          ? -1
          : minor(a.amount) > minor(b.amount)
            ? 1
            : a.id.localeCompare(b.id)
        : p.get('sort') === 'amount:desc'
          ? minor(a.amount) > minor(b.amount)
            ? -1
            : minor(a.amount) < minor(b.amount)
              ? 1
              : a.id.localeCompare(b.id)
          : p.get('sort') === 'occurredAt:asc'
            ? a.occurredAt.localeCompare(b.occurredAt)
            : b.occurredAt.localeCompare(a.occurredAt),
    );
}
async function save(request: Request, id?: string) {
  const body = (await request.json()) as SaveTransactionRequest;
  const key = request.headers.get('Idempotency-Key');
  const fingerprint = JSON.stringify({
    path: new URL(request.url).pathname,
    body,
  });
  if (key && idempotency.has(key)) {
    const saved = idempotency.get(key)!;
    return saved.fingerprint === fingerprint
      ? ok(saved.data)
      : fail('同一幂等键不能提交不同交易内容', 409);
  }
  const old = id ? transactions.find((t) => t.id === id) : undefined;
  if (id && !old) return fail('交易不存在', 404);
  if (old?.businessId) return fail('请在关联业务页面管理该记录');
  if (old && (old.status === 'Deleted' || !['Expense', 'Income', 'Transfer', 'Refund', 'CreditCardPayment', 'AssetLoss'].includes(old.type)))
    return fail('已删除交易不可编辑，交易类型不能更改');
  if (
    ![
      'Expense',
      'Income',
      'Transfer',
      'Refund',
      'CreditCardPayment',
      'AssetLoss',
    ].includes(body.type)
  )
    return fail('当前版本尚未实现该交易类型');
  if (old && request.headers.get('If-Match') !== old.version)
    return fail('交易已被修改，请刷新后重试', 409);
  try {
    if (
      !Number.isFinite(Date.parse(body.occurredAt)) ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(body.occurredAt)
    )
      return fail('交易时间须包含时区');
    if (minor(body.amount) <= 0n) return fail('金额必须大于 0');
    const account = accounts.find(
      (a) => a.id === body.accountId && a.status === 'Active',
    );
    if (body.type === 'AssetLoss' && account?.type === 'CreditCard')
      return fail('资产损失请选择资产账户，信用卡差额请通过对账处理');
    if (
      !account ||
      ['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(
        account.type,
      )
    )
      return fail('请选择启用的资金账户');
    if (body.type === 'Transfer' || body.type === 'CreditCardPayment') {
      const error = validateTransfer(body.accountId, body.toAccountId);
      if (error) return fail(error);
      const to = accounts.find(
        (a) => a.id === body.toAccountId && a.status === 'Active',
      );
      if (
        !to ||
        ['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(
          to.type,
        )
      )
        return fail('转入资金账户不可用');
      if (to.currency !== account.currency) {
        if (!body.exchangeRate || !body.receivedAmount)
          return fail('跨币种转账需要汇率和转入金额');
        if (
          minor(body.receivedAmount) <= 0n ||
          convertAmount(body.amount, body.exchangeRate) !==
            decimal(minor(body.receivedAmount))
        )
          return fail('转入金额与汇率计算结果不一致');
      } else {
        body.receivedAmount = body.amount;
        body.exchangeRate = '1';
      }
      if (
        body.type === 'CreditCardPayment' &&
        !['CreditCard', 'ConsumerCredit'].includes(to.type)
      )
        return fail('请选择信用卡账户');
      if (minor(body.fee) < 0n) return fail('手续费不能为负');
      if (
        minor(body.fee) > 0n &&
        !categories.some(
          (c) =>
            c.id === (body.feeCategoryId || 'fee') &&
            c.kind === 'Expense' &&
            c.parentId &&
            c.status === 'Active',
        )
      )
        return fail('请选择手续费分类');
    }
    if (
      body.type === 'Expense' ||
      body.type === 'Income' ||
      body.type === 'AssetLoss'
    ) {
      if (
        body.type === 'AssetLoss' &&
        (body.splits.length || !body.note?.trim())
      )
        return fail('资产损失请填写原因，不支持拆分');
      if (!body.splits.length && !body.categoryId) return fail('请选择分类');
      const ids = body.splits.length
        ? body.splits.map((s) => s.categoryId)
        : [body.categoryId];
      if (
        ids.some(
          (id) =>
            !categories.some(
              (c) =>
                c.id === id &&
                c.parentId &&
                c.kind ===
                  (body.type === 'AssetLoss' ? 'Expense' : body.type) &&
                c.status === 'Active',
            ),
        )
      )
        return fail('请选择有效的二级分类');
    }
    if (body.splits.length) {
      if (
        new Set(body.splits.map((s) => s.categoryId)).size !==
        body.splits.length
      )
        return fail('拆分分类不能重复');
      const error = validateSplits(body.amount, body.splits);
      if (error) return fail(error);
    }
    if (
      body.projectId &&
      !directory.some(
        (d) =>
          d.id === body.projectId &&
          d.kind === 'projects' &&
          (d.status === 'Active' || old?.projectId === d.id) &&
          d.currency === account.currency,
      )
    )
      return fail('项目不可用或币种不一致');
    if (
      body.tagIds.some(
        (id) =>
          !directory.some(
            (d) =>
              d.id === id &&
              d.kind === 'tags' &&
              (d.status === 'Active' || old?.tagIds.includes(d.id)),
          ),
      )
    )
      return fail('标签不可用');
    if (body.type === 'Refund') {
      const original = transactions.find(
        (t) =>
          t.id === body.originalTransactionId &&
          t.type === 'Expense' &&
          t.status !== 'Deleted',
      );
      if (!original) return fail('原消费交易不可用');
      const source = refundSource(original, old?.id);
      const refunded = minor(source.refundedAmount);
      const error = validateRefund(
        body.amount,
        original.amount,
        decimal(refunded),
      );
      if (error) return fail(error);
      if (original.currency !== account.currency)
        return fail('退款币种必须与原交易一致');
      body.categoryId = original.categoryId;
      body.merchant = original.merchant;
      body.projectId = original.projectId;
      body.tagIds = original.tagIds;
      if (original.splits.length) {
        if (!body.splits.length) return fail('请填写退款分类分配');
        for (const item of body.splits) {
          const available = source.refundableSplits.find(
            (s) => s.categoryId === item.categoryId,
          );
          if (!available || minor(item.amount) > minor(available.amount))
            return fail('退款分类金额超过该分类剩余额度');
        }
      } else body.splits = [];
      if (
        old?.originalTransactionId &&
        old.originalTransactionId !== original.id
      )
        return fail('编辑退款不能更换原交易');
      // 所有校验完成后再更新原交易，避免失败请求改变退款额度。
    }
    if (
      old?.refundedAmount &&
      minor(old.refundedAmount) > 0n &&
      minor(body.amount) < minor(old.refundedAmount)
    )
      return fail('金额不能小于已退款金额');
    if (
      old &&
      minor(old.refundedAmount) > 0n &&
      (old.accountId !== body.accountId ||
        old.categoryId !== body.categoryId ||
        JSON.stringify(old.splits) !== JSON.stringify(body.splits))
    )
      return fail('已有退款的原消费不能更改账户或分类分配，请先撤销退款');
    if (body.type === 'Refund') {
      const original = transactions.find(
        (t) => t.id === body.originalTransactionId,
      )!;
      original.refundedAmount = decimal(
        minor(refundSource(original, old?.id).refundedAmount) +
          minor(body.amount),
      );
      original.version = String(Number(original.version) + 1);
    }
    if (old) balanceEffect(old, -1n);
    const t: Transaction = {
      ...body,
      transferKind: body.type === 'Transfer' ? body.transferKind || null : null,
      projectId: body.projectId,
      merchant: body.merchant,
      categoryId: body.splits.length ? undefined : body.categoryId,
      id: id || crypto.randomUUID(),
      currency: account.currency,
      status: body.categoryId === 'unknown' ? 'NeedsReview' : 'Confirmed',
      refundedAmount: old?.refundedAmount || '0.00',
      version: String(Number(old?.version || 0) + 1),
      createdAt: old?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (old) Object.assign(old, t);
    else transactions.unshift(t);
    balanceEffect(t, 1n);
    if (old?.type === 'Expense') {
      for (const refund of transactions.filter(
        (x) => x.originalTransactionId === t.id && x.status !== 'Deleted',
      )) {
        refund.merchant = t.merchant;
        refund.projectId = t.projectId;
        refund.tagIds = [...t.tagIds];
        refund.version = String(Number(refund.version) + 1);
        refund.updatedAt = t.updatedAt;
      }
    }
    if (key) idempotency.set(key, { data: structuredClone(t), fingerprint });
    return ok(t);
  } catch {
    return fail('金额格式不正确');
  }
}
type CategoryImportBody = {
  kind: Category['kind'];
  rows: { row: number; name: string; parentPath: string; status: string }[];
};
interface CategoryImportPlanItem {
  row: number;
  name: string;
  parentPath: string;
  status: string;
  state: 'Ready' | 'Duplicate' | 'Error';
  reason?: string;
}
function categoryImportPlan(body: CategoryImportBody) {
  const byPath = new Map(
    categories
      .filter((c) => c.kind === body.kind)
      .map((c) => [
        categoryPath(categories, c.id)
          .map((x) => x.name)
          .join('/'),
        c,
      ]),
  );
  const pending = new Map<string, { row: number; status: string }>();
  const items: CategoryImportPlanItem[] = [];
  const creates: {
    row: number;
    name: string;
    parentId?: string;
    parentRow?: number;
    status: string;
  }[] = [];
  for (const row of body.rows) {
    const parentPath = row.parentPath.trim();
    let reason = '';
    let parentId: string | undefined;
    let parentRow: number | undefined;
    if (parentPath) {
      const parent = byPath.get(parentPath);
      if (parent) {
        if (parent.status !== 'Active') reason = '上级分类已停用';
        else parentId = parent.id;
      } else {
        const queued = pending.get(parentPath);
        if (!queued) reason = '父级分类不存在：' + parentPath;
        else if (queued.status !== '启用') reason = '上级分类已停用';
        else parentRow = queued.row;
      }
    }
    const path = parentPath ? parentPath + '/' + row.name : row.name;
    if (!reason && (byPath.has(path) || pending.has(path)))
      reason = byPath.has(path) ? '同名分类已存在' : '与文件内其它行重名';
    if (reason) {
      items.push({
        ...row,
        state: byPath.has(path) ? 'Duplicate' : 'Error',
        reason,
      });
      continue;
    }
    pending.set(path, { row: row.row, status: row.status || '启用' });
    creates.push({
      row: row.row,
      name: row.name,
      parentId,
      parentRow,
      status: row.status || '启用',
    });
    items.push({ ...row, state: 'Ready' });
  }
  return { items, creates };
}
function categoryBatchPlan(kind: Category['kind']) {
  const stored = categories.filter((c) => c.kind === kind);
  const depth = (c: Category) => categoryPath(categories, c.id).length;
  const blocked = new Map<string, string>();
  [...stored].sort((a, b) => depth(b) - depth(a)).forEach((category) => {
    const reasons: string[] = [];
    const used = categoryReferences(category.id).filter((r) => r.count > 0);
    if (used.length) reasons.push('仍被' + used.map((r) => r.label).join('、') + '引用');
    if (stored.some((c) => c.parentId === category.id && blocked.has(c.id)))
      reasons.push('子分类未删除');
    if (reasons.length) blocked.set(category.id, reasons.join('；'));
  });
  return stored
    .map((category) => ({
      id: category.id,
      version: category.version,
      name: category.name,
      path: categoryPath(categories, category.id)
        .map((c) => c.name)
        .join('/'),
      depth: depth(category),
      allowed: !blocked.has(category.id),
      reason: blocked.get(category.id) ?? null,
    }))
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
}
export const handlers = [
  ...appleHandlers,
  ...appleShellHandlers,
  http.get("/api/spaces", () => ok([])),
  http.get("/api/space-invitations", () => ok([])),
  http.get("/api/transactions/:id/collaboration", () => ok(null)),
  ...transactionWorkspaceHandlers(filtered),
  ...statisticsManagementHandlers,
  ...categoryStatisticsHandlers,
  ...importHandlers,
  ...planningHandlers,
  ...operationsHandlers,
  ...phase3Handlers,
  ...phase2Handlers,
  http.get('/api/auth/me', () => (loggedIn ? ok(user) : fail('请先登录', 401))),
  http.post('/api/auth/login', async ({ request }) => {
    const b = (await request.json()) as { email: string; password: string };
    if (!b.email || !b.password) return fail('请输入邮箱和密码');
    loggedIn = true;
    return ok({ user, accessToken: 'mock-session' });
  }),
  http.post('/api/auth/logout', () => {
    loggedIn = false;
    return ok(null);
  }),
  http.post('/api/auth/refresh', () =>
    loggedIn ? ok({ accessToken: 'mock-session' }) : fail('登录已过期', 401),
  ),
  http.get('/api/accounts', () => ok(accounts)),
  http.post('/api/accounts', async ({ request }) => {
    const b = (await request.json()) as Account;
    const a = { ...b, id: crypto.randomUUID(), balance: '0.00' };
    accounts.push(a);
    return ok(a);
  }),
  http.put('/api/accounts/:id', async ({ request, params }) => {
    const a = accounts.find((x) => x.id === params.id);
    if (!a) return fail('账户不存在', 404);
    if (request.headers.get('If-Match') !== (a.version || '1'))
      return fail('账户已被修改，请刷新后重试', 409);
    const b = (await request.json()) as Account;
    a.version = String(Number(a.version || '1') + 1);
    Object.assign(a, {
      name: b.name,
      status: b.status,
      institution: b.institution,
      creditLimit: b.creditLimit,
      statementDay: b.statementDay,
      paymentDay: b.paymentDay,
    });
    return ok(a);
  }),
  http.get('/api/categories', () => ok(categories)),
  http.post('/api/categories/reorder', async ({ request }) => {
    const { items } = (await request.json()) as {
      items: { id: string; version: string }[];
    };
    const ids = items.map((i) => i.id);
    const siblings = categories.filter((c) => ids.includes(c.id));
    if (
      !ids.length ||
      siblings.length !== ids.length ||
      new Set(ids).size !== ids.length ||
      siblings.some(
        (c) =>
          c.parentId !== siblings[0]?.parentId || c.kind !== siblings[0]?.kind,
      )
    )
      return fail('排序必须为同级分类');
    if (
      categories.filter(
        (c) =>
          c.parentId === siblings[0].parentId && c.kind === siblings[0].kind,
      ).length !== ids.length ||
      siblings.some(
        (c) => items.find((i) => i.id === c.id)?.version !== c.version,
      )
    )
      return versionConflict();
    ids.forEach((id, index) => {
      const c = categories.find((c) => c.id === id);
      if (c) {
        c.sortOrder = index;
        c.version = String(Number(c.version) + 1);
      }
    });
    return ok(categories);
  }),
  http.post('/api/categories', async ({ request }) => {
    const b = (await request.json()) as Category;
    if (
      b.parentId &&
      !categories.some(
        (c) =>
          c.id === b.parentId &&
          categoryPath(categories, c.id).length < 3 &&
          categoryActive(categories, c.id) &&
          c.kind === b.kind,
      )
    )
      return fail('最多支持三级同类型分类');
    const c = { ...b, id: crypto.randomUUID(), version: '2' };
    categories.push(c);
    return ok(c);
  }),
  http.put('/api/categories/:id', async ({ request, params }) => {
    const c = categories.find((x) => x.id === params.id);
    if (!c) return fail('分类不存在', 404);
    if (request.headers.get('If-Match') !== c.version) return versionConflict();
    const b = (await request.json()) as Category;
    if (b.parentId !== c.parentId || b.kind !== c.kind)
      return fail('已有分类不能更改层级或类型');
    Object.assign(c, b, { id: c.id, version: String(Number(c.version) + 1) });
    return ok(c);
  }),
  http.get('/api/categories/:id/deletion-preview', ({ params }) => {
    const c = categories.find((c) => c.id === params.id);
    if (!c) return fail('分类不存在', 404);
    const references = categoryReferences(c.id);
    return ok({
      id: c.id,
      name: c.name,
      version: c.version,
      canDelete: references.every((r) => r.count === 0),
      references,
    });
  }),
  http.delete('/api/categories/:id', ({ params, request }) => {
    const index = categories.findIndex((c) => c.id === params.id);
    if (index < 0) return fail('分类不存在', 404);
    const c = categories[index];
    if (request.headers.get('If-Match') !== c.version) return versionConflict();
    if (categoryReferences(c.id).some((r) => r.count > 0))
      return HttpResponse.json(
        { message: '分类仍有引用，建议停用', code: 'CATEGORY_IN_USE' },
        { status: 409 },
      );
    categories.splice(index, 1);
    return ok({ id: c.id });
  }),
  http.post('/api/categories/import-preview', async ({ request }) => {
    const plan = categoryImportPlan((await request.json()) as CategoryImportBody);
    return ok({
      total: plan.items.length,
      ready: plan.items.filter((i) => i.state === 'Ready').length,
      duplicates: plan.items.filter((i) => i.state === 'Duplicate').length,
      errors: plan.items.filter((i) => i.state === 'Error').length,
      items: plan.items,
    });
  }),
  http.post('/api/categories/import', async ({ request }) => {
    const body = (await request.json()) as CategoryImportBody;
    const plan = categoryImportPlan(body);
    const createdByRow = new Map<number, Category>();
    for (const item of plan.creates) {
      const parentId =
        item.parentId ??
        (item.parentRow ? createdByRow.get(item.parentRow)?.id : undefined);
      const category: Category = {
        id: crypto.randomUUID(),
        version: '1',
        name: item.name,
        parentId,
        kind: body.kind,
        status: item.status === '启用' ? 'Active' : 'Disabled',
        sortOrder: categories.filter(
          (c) => c.kind === body.kind && c.parentId === parentId,
        ).length,
      };
      categories.push(category);
      createdByRow.set(item.row, category);
    }
    return ok({
      imported: plan.creates.length,
      skipped: plan.items
        .filter((i) => i.state !== 'Ready')
        .map((i) => ({ row: i.row, name: i.name, reason: i.reason })),
    });
  }),
  http.post('/api/categories/deletion-preview', async ({ request }) => {
    const { kind } = (await request.json()) as { kind: Category['kind'] };
    const items = categoryBatchPlan(kind);
    return ok({
      total: items.length,
      allowed: items.filter((i) => i.allowed).length,
      blocked: items.filter((i) => !i.allowed).length,
      items,
    });
  }),
  http.post('/api/categories/batch-delete', async ({ request }) => {
    const body = (await request.json()) as {
      kind: Category['kind'];
      items: { id: string; version: string }[];
    };
    const rows = categoryBatchPlan(body.kind).filter((row) =>
      body.items.some((item) => item.id === row.id),
    );
    if (
      !body.items.length ||
      rows.length !== body.items.length ||
      new Set(body.items.map((item) => item.id)).size !== body.items.length
    )
      return fail('部分分类不存在或不可访问，请刷新后重新选择');
    if (
      rows.some(
        (row) =>
          body.items.find((item) => item.id === row.id)?.version !== row.version,
      )
    )
      return versionConflict();
    const removable = rows
      .filter((row) => row.allowed)
      .sort((a, b) => b.depth - a.depth);
    for (const row of removable) {
      const index = categories.findIndex((c) => c.id === row.id);
      if (index >= 0) categories.splice(index, 1);
    }
    return ok({
      deleted: removable.length,
      skipped: rows.filter((row) => !row.allowed),
    });
  }),
  http.get('/api/transactions', async ({ request }) => {
    await delay(150);
    const u = new URL(request.url);
    const all = filtered(u).map((t) => ({
      ...t,
      projectName: directory.find((d) => d.id === t.projectId)?.name,
      tagNames: directory
        .filter((d) => t.tagIds.includes(d.id))
        .map((d) => d.name),
    }));
    const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(u.searchParams.get('pageSize')) || 20),
    );
    return ok({
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
    });
  }),
  http.get('/api/transactions/:id', ({ params }) => {
    const t = transactions.find((t) => t.id === params.id);
    return t
      ? ok({
          ...t,
          entries: [],
          attachments: attachmentsFor(t.id),
          relatedTransactions: transactions.filter(
            (x) =>
              (!!t.businessId &&
                x.businessId === t.businessId &&
                x.id !== t.id) ||
              x.originalTransactionId === t.id ||
              x.id === t.originalTransactionId,
          ),
        })
      : fail('交易不存在', 404);
  }),
  http.post('/api/transactions/:type', ({ request, params }) =>
    params.type === 'restore' ? fail('路径无效') : save(request),
  ),
  http.put('/api/transactions/:id/:type', ({ request, params }) =>
    save(request, String(params.id)),
  ),
  http.delete('/api/transactions/:id', ({ request, params }) => {
    const t = transactions.find((t) => t.id === params.id);
    if (!t) return fail('交易不存在', 404);
    if (t.businessId) return fail('请在关联业务页面管理该记录');
    if (request.headers.get('If-Match') !== t.version)
      return fail('交易已修改，请刷新', 409);
    if (
      ![
        'Expense',
        'Income',
        'Transfer',
        'Refund',
        'CreditCardPayment',
        'AssetLoss',
      ].includes(t.type)
    )
      return fail('请在关联业务页面管理该记录');
    if (minor(t.refundedAmount) > 0n) return fail('请先删除关联退款');
    if (t.status === 'Deleted') return ok(t);
    balanceEffect(t, -1n);
    if (t.originalTransactionId) {
      const original = transactions.find(
        (x) => x.id === t.originalTransactionId,
      );
      if (original) {
        original.refundedAmount = decimal(
          minor(original.refundedAmount) - minor(t.amount),
        );
        original.version = String(Number(original.version) + 1);
      }
    }
    t.status = 'Deleted';
    t.version = String(Number(t.version) + 1);
    return ok(t);
  }),
  http.post('/api/transactions/:id/restore', ({ params, request }) => {
    const t = transactions.find((t) => t.id === params.id);
    if (!t) return fail('交易不存在', 404);
    if (request.headers.get('If-Match') !== t.version) return versionConflict();
    if (records.some((b) => b.history.some((x) => x.id === t.id)))
      return fail('请通过专用业务接口恢复');
    if (t.status !== 'Deleted') return ok(t);
    if (t.originalTransactionId) {
      const original = transactions.find(
        (x) => x.id === t.originalTransactionId && x.status !== 'Deleted',
      );
      if (!original) return fail('原交易已删除');
      const error = validateRefund(
        t.amount,
        original.amount,
        original.refundedAmount,
      );
      if (error) return fail(error);
      const source = refundSource(original);
      if (
        expenseItems(t).some(
          (item) =>
            minor(item.amount) >
            minor(
              source.refundableSplits.find(
                (s) => s.categoryId === item.categoryId,
              )?.amount || '0',
            ),
        )
      )
        return fail('原分类退款额度已变化，无法恢复');
      t.projectId = original.projectId;
      t.tagIds = [...original.tagIds];
      t.merchant = original.merchant;
      original.refundedAmount = decimal(
        minor(original.refundedAmount) + minor(t.amount),
      );
      original.version = String(Number(original.version) + 1);
    }
    balanceEffect(t, 1n);
    t.status = 'Confirmed';
    t.version = String(Number(t.version) + 1);
    return ok(t);
  }),
  http.get('/api/dashboard', ({ request }) => {
    const month =
      new URL(request.url).searchParams.get('month') ||
      dayjs().format('YYYY-MM');
    const range = {
      start: month + '-01',
      end: dayjs(month + '-01')
        .endOf('month')
        .format('YYYY-MM-DD'),
      currency: 'CNY' as const,
      granularity: 'month' as const,
    };
    const summary = report(range),
      previous = dayjs(month + '-01').subtract(1, 'month');
    const last = report({
      ...range,
      start: previous.startOf('month').format('YYYY-MM-DD'),
      end: previous.endOf('month').format('YYYY-MM-DD'),
    });
    const history = report({
      ...range,
      start: dayjs(month + '-01')
        .subtract(5, 'month')
        .format('YYYY-MM-DD'),
    });
    const recent = transactions
      .filter(
        (t) =>
          t.status !== 'Deleted' && formatDate(t.occurredAt).startsWith(month),
      )
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 10);
    return ok({
      month,
      ...summary,
      surplus: decimal(minor(summary.income) - minor(summary.expense)),
      previousIncome: last.income,
      previousExpense: last.expense,
      accounts,
      budget: budget(month),
      trend: history.points.map((p) => ({
        month: p.period,
        income: p.income,
        expense: p.expense,
        netWorth: p.netWorth,
      })),
      recentTransactions: recent,
    });
  }),
];
