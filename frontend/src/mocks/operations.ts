import { http, HttpResponse } from 'msw';
import dayjs from 'dayjs';
import { accounts, categories, transactions } from './seed';
import { directory, applyBalance } from './phase3';
import { accountDelta, balanceAt, expenseItems } from './analytics';
import { statisticsRules } from './preferences';
import { decimal, minor, formatDate } from '../utils/finance';
import { matchesCategory, searchText } from './transaction-query';
import { makeCsv, makeXlsx } from './files';
import { transactionLabels } from '../constants/mappings';
import type {
  Attachment,
  ExportJob,
  ReconciliationRecord,
  ReconciliationSnapshot,
  StatisticsRules,
  TransactionFilters,
  Transaction,
} from '../types';
const ok = (data: unknown) => HttpResponse.json({ data });
const fail = (message: string, status = 422) =>
  HttpResponse.json({ message, code: 'OPERATIONS_ERROR' }, { status });
const reconciliations: ReconciliationRecord[] = [];
const keys = new Map<string, { fingerprint: string; data: unknown }>();
const files = new Map<
  string,
  {
    transactionId: string;
    attachment: Attachment;
    bytes: Uint8Array<ArrayBuffer>;
  }
>();
const exports = new Map<
  string,
  { job: ExportJob; bytes: Uint8Array<ArrayBuffer>; contentType: string }
>();
export function attachmentMime(bytes: Uint8Array, name: string): string {
  if (
    /\.png$/i.test(name) &&
    bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
  )
    return 'image/png';
  if (
    /\.jpe?g$/i.test(name) &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return 'image/jpeg';
  if (
    /\.pdf$/i.test(name) &&
    new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
  )
    return 'application/pdf';
  throw new Error('仅支持内容与扩展名匹配的 JPG、PNG、PDF');
}
function snapshot(
  accountId: string,
  actualBalance: string,
): ReconciliationSnapshot {
  const a = accounts.find(
    (a) =>
      a.id === accountId &&
      a.status === 'Active' &&
      !['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(a.type),
  );
  if (!a) throw new Error('请选择可用资金账户，业务应收应付需在关联业务中处理');
  const actual = minor(actualBalance);
  return {
    accountId: a.id,
    currency: a.currency,
    systemBalance: a.balance,
    actualBalance: decimal(actual),
    difference: decimal(actual - minor(a.balance)),
    version: a.version || '1',
    capturedAt: new Date().toISOString(),
  };
}
function duplicate(request: Request, body: unknown) {
  const key = request.headers.get('Idempotency-Key');
  if (!key) throw new Error('缺少幂等键');
  const fingerprint = JSON.stringify({
    path: new URL(request.url).pathname,
    body,
  });
  const cached = keys.get(key);
  if (cached && cached.fingerprint !== fingerprint)
    throw new Error('幂等键内容不同');
  return { key, fingerprint, cached };
}
function exportRows(filters: Partial<TransactionFilters>) {
  if (
    (filters.start && !Number.isFinite(Date.parse(filters.start))) ||
    (filters.end && !Number.isFinite(Date.parse(filters.end))) ||
    (filters.start && filters.end && filters.start > filters.end)
  )
    throw new Error('导出时间范围无效');
  return transactions.filter(
    (t) =>
      (filters.status ? t.status === filters.status : t.status !== 'Deleted') &&
      (!filters.type || t.type === filters.type) &&
      (!filters.accountId ||
        t.accountId === filters.accountId ||
        t.toAccountId === filters.accountId) &&
      (!filters.currency || t.currency === filters.currency) &&
      (!filters.projectId || t.projectId === filters.projectId) &&
      (!filters.tagId || t.tagIds.includes(filters.tagId)) &&
      (!filters.start || t.occurredAt >= filters.start) &&
      (!filters.end || t.occurredAt <= filters.end) &&
      (!filters.min || minor(t.amount) >= minor(filters.min)) &&
      (!filters.max || minor(t.amount) <= minor(filters.max)) &&
      (!filters.merchant || t.merchant === filters.merchant) &&
      (!filters.categoryId || matchesCategory(t, filters.categoryId)) &&
      (!filters.keyword ||
        searchText(t).includes(filters.keyword.toLowerCase())),
  );
}
for (const [id, name] of [
  ['asset-loss', '资产损失'],
  ['balance-adjustment', '余额调整'],
])
  if (!categories.some((c) => c.id === id))
    categories.push({
      id,
      name,
      parentId: 'other',
      kind: 'Expense',
      status: 'Active',
      sortOrder: 20,
      version: '1',
    });
export const operationsHandlers = [
  http.post('/api/reconciliations/preview', async ({ request }) => {
    try {
      const b = (await request.json()) as {
        accountId: string;
        actualBalance: string;
      };
      return ok(snapshot(b.accountId, b.actualBalance));
    } catch (e) {
      return fail((e as Error).message);
    }
  }),
  http.post('/api/reconciliations', async ({ request }) => {
    try {
      const b = (await request.json()) as ReconciliationSnapshot & {
        reason: string;
      };
      const idempotent = duplicate(request, b);
      if (idempotent.cached) return ok(idempotent.cached.data);
      const current = snapshot(b.accountId, b.actualBalance);
      if (
        request.headers.get('If-Match') !== current.version ||
        b.systemBalance !== current.systemBalance ||
        b.difference !== current.difference ||
        b.currency !== current.currency
      )
        return fail('账户余额已变化，请重新预览', 409);
      if (!b.reason?.trim()) return fail('请填写对账说明');
      const now = new Date().toISOString(),
        difference = minor(current.difference);
      let transactionId: string | undefined;
      if (difference !== 0n) {
        const t: Transaction = {
          id: crypto.randomUUID(),
          type: 'Adjustment',
          amount: decimal(difference < 0n ? -difference : difference),
          adjustmentDirection: difference > 0n ? 'Increase' : 'Decrease',
          currency: current.currency,
          accountId: current.accountId,
          categoryId: 'balance-adjustment',
          occurredAt: now,
          note: b.reason.trim(),
          tagIds: [],
          splits: [],
          fee: '0.00',
          refundedAmount: '0.00',
          status: 'Confirmed',
          version: '1',
          createdAt: now,
          updatedAt: now,
        };
        applyBalance(t, 1n);
        transactions.unshift(t);
        transactionId = t.id;
      }
      const record: ReconciliationRecord = {
        ...current,
        id: crypto.randomUUID(),
        transactionId,
        reason: b.reason.trim(),
        createdAt: now,
      };
      reconciliations.unshift(record);
      keys.set(idempotent.key, {
        fingerprint: idempotent.fingerprint,
        data: structuredClone(record),
      });
      return ok(record);
    } catch (e) {
      return fail((e as Error).message);
    }
  }),
  http.get('/api/accounts/:id/reconciliations', ({ request, params }) => {
    const p = new URL(request.url).searchParams,
      page = Math.max(1, Number(p.get('page')) || 1),
      rows = reconciliations.filter((r) => r.accountId === params.id);
    return ok({
      items: rows.slice((page - 1) * 20, page * 20),
      total: rows.length,
      page,
      pageSize: 20,
    });
  }),
  http.get('/api/accounts/:id/analysis', ({ params }) => {
    const a = accounts.find((a) => a.id === params.id);
    if (!a) return fail('账户不存在', 404);
    const points = Array.from({ length: 6 }, (_, i) => {
      const month = dayjs().subtract(5 - i, 'month'),
        start = month.startOf('month').format('YYYY-MM-DD'),
        end = month.endOf('month').format('YYYY-MM-DD');
      const deltas = transactions
        .filter(
          (t) =>
            t.status !== 'Deleted' &&
            formatDate(t.occurredAt) >= start &&
            formatDate(t.occurredAt) <= end,
        )
        .map((t) => accountDelta(t, a.id));
      return {
        period: month.format('YYYY-MM'),
        balance: decimal(balanceAt(a.id, end)),
        inflow: decimal(
          deltas.filter((d) => d > 0n).reduce((s, d) => s + d, 0n),
        ),
        outflow: decimal(
          -deltas.filter((d) => d < 0n).reduce((s, d) => s + d, 0n),
        ),
      };
    });
    const latest = points.at(-1)!;
    return ok({
      currency: a.currency,
      inflow: latest.inflow,
      outflow: latest.outflow,
      points,
    });
  }),
  http.get('/api/transactions/:id/attachments', ({ params }) =>
    transactions.some((t) => t.id === params.id)
      ? ok(
          Array.from(files.values())
            .filter((f) => f.transactionId === params.id)
            .map((f) => f.attachment),
        )
      : fail('交易不存在', 404),
  ),
  http.post(
    '/api/transactions/:id/attachments',
    async ({ request, params }) => {
      try {
        const t = transactions.find(
          (t) => t.id === params.id && t.status !== 'Deleted',
        );
        if (!t) return fail('交易不可修改', 404);
        if (
          Array.from(files.values()).filter((f) => f.transactionId === t.id)
            .length >= 5
        )
          return fail('每笔交易最多5个附件');
        const form = await request.formData(),
          file = form.get('file');
        if (
          !file ||
          typeof file === 'string' ||
          !file.size ||
          file.size > 10 * 1024 * 1024
        )
          return fail('附件须为1字节至10MB');
        const bytes = new Uint8Array(await file.arrayBuffer()),
          contentType = attachmentMime(bytes, file.name),
          id = crypto.randomUUID();
        const attachment: Attachment = {
          id,
          name: file.name,
          size: file.size,
          contentType,
          uploadedAt: new Date().toISOString(),
          downloadUrl: `/api/transactions/${t.id}/attachments/${id}/content`,
          version: '1',
        };
        files.set(id, { transactionId: t.id, attachment, bytes });
        t.version = String(Number(t.version) + 1);
        t.updatedAt = attachment.uploadedAt;
        return ok(attachment);
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  ),
  http.delete(
    '/api/transactions/:id/attachments/:attachmentId',
    ({ request, params }) => {
      const file = files.get(String(params.attachmentId)),
        t = transactions.find(
          (t) => t.id === params.id && t.status !== 'Deleted',
        );
      if (!file || file.transactionId !== params.id || !t)
        return fail('附件不可修改', 404);
      if (request.headers.get('If-Match') !== file.attachment.version)
        return fail('附件已更新', 409);
      files.delete(String(params.attachmentId));
      t.version = String(Number(t.version) + 1);
      t.updatedAt = new Date().toISOString();
      return ok(null);
    },
  ),
  http.get(
    '/api/transactions/:id/attachments/:attachmentId/content',
    ({ params }) => {
      const file = files.get(String(params.attachmentId));
      if (!file || file.transactionId !== params.id)
        return fail('附件不存在', 404);
      return new HttpResponse(file.bytes.buffer, {
        headers: {
          'Content-Type': file.attachment.contentType,
          'Content-Disposition': 'inline',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      });
    },
  ),
  http.get('/api/settings/statistics', () => ok(statisticsRules)),
  http.put('/api/settings/statistics', async ({ request }) => {
    const b = (await request.json()) as StatisticsRules;
    if (request.headers.get('If-Match') !== statisticsRules.version)
      return fail('统计规则已更新', 409);
    if (
      [b.includeFees, b.includeAssetLoss, b.includeDecreasingAdjustments].some(
        (v) => typeof v !== 'boolean',
      )
    )
      return fail('统计规则无效');
    Object.assign(statisticsRules, {
      includeFees: b.includeFees,
      includeAssetLoss: b.includeAssetLoss,
      includeDecreasingAdjustments: b.includeDecreasingAdjustments,
      version: String(Number(statisticsRules.version) + 1),
    });
    return ok(statisticsRules);
  }),
  http.get('/api/reports/advanced', ({ request }) => {
    const p = new URL(request.url).searchParams,
      start = p.get('start') || '',
      end = p.get('end') || '',
      currency = p.get('currency');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      !['CNY', 'USD', 'HKD'].includes(currency || '') ||
      start > end ||
      dayjs(end).diff(dayjs(start), 'day') > 730
    )
      return fail('统计参数无效');
    const rows = transactions.filter(
      (t) =>
        t.status !== 'Deleted' &&
        t.currency === currency &&
        formatDate(t.occurredAt) >= start &&
        formatDate(t.occurredAt) <= end,
    );
    const merchantNames = Array.from(
      new Set(
        rows
          .filter((t) => t.type === 'Expense')
          .map((t) => t.merchant || '未填写商户'),
      ),
    );
    const merchants = merchantNames.map((name) => {
      const items = rows.filter(
        (t) =>
          (t.type === 'Refund'
            ? transactions.find((o) => o.id === t.originalTransactionId)
                ?.merchant
            : t.merchant || '未填写商户') === name,
      );
      return {
        name,
        count: items.filter((t) => t.type === 'Expense').length,
        expense: decimal(
          items.reduce(
            (s, t) =>
              s +
              expenseItems(t).reduce((a, c) => a + minor(c.amount), 0n) *
                (t.type === 'Refund' ? -1n : 1n),
            0n,
          ),
        ),
      };
    });
    const expenseSorted = [...merchants]
        .sort((a, b) => (minor(a.expense) > minor(b.expense) ? -1 : 1))
        .slice(0, 10),
      frequent = [...merchants].sort((a, b) => b.count - a.count).slice(0, 10);
    return ok({
      currency,
      merchants: expenseSorted,
      frequentMerchants: frequent,
      accounts: accounts
        .filter((a) => a.currency === currency)
        .map((a) => {
          const deltas = rows.map((t) => accountDelta(t, a.id));
          return {
            id: a.id,
            name: a.name,
            inflow: decimal(
              deltas.filter((d) => d > 0n).reduce((s, d) => s + d, 0n),
            ),
            outflow: decimal(
              -deltas.filter((d) => d < 0n).reduce((s, d) => s + d, 0n),
            ),
            balance: decimal(balanceAt(a.id, end)),
          };
        }),
      projects: directory
        .filter((d) => d.kind === 'projects' && d.currency === currency)
        .map((d) => ({
          id: d.id,
          name: d.name,
          budget: d.budget,
          expense: decimal(
            rows
              .filter((t) => t.projectId === d.id)
              .reduce(
                (s, t) =>
                  s +
                  expenseItems(t).reduce((a, c) => a + minor(c.amount), 0n) *
                    (t.type === 'Refund' ? -1n : 1n),
                0n,
              ),
          ),
        })),
    });
  }),
  http.post('/api/exports', async ({ request }) => {
    try {
      const b = (await request.json()) as {
        format: 'CSV' | 'Excel';
        filters: Partial<TransactionFilters>;
      };
      const cached = duplicate(request, b);
      if (cached.cached) return ok(cached.cached.data);
      if (!['CSV', 'Excel'].includes(b.format)) return fail('导出格式无效');
      const rows = exportRows(b.filters || {});
      if (rows.length > 10000)
        return fail('演示导出最多10000笔，生产请使用服务端后台导出任务');
      const matrix = [
        [
          '交易ID',
          '日期时间',
          '类型',
          '金额',
          '币种',
          '账户',
          '转入账户',
          '分类',
          '商户/对象',
          '项目',
          '标签',
          '备注',
          '状态',
          '原交易ID',
          '来源订单号',
        ],
        ...rows.map((t) => [
          t.id,
          t.occurredAt,
          transactionLabels[t.type],
          t.amount,
          t.currency,
          accounts.find((a) => a.id === t.accountId)?.name || '',
          accounts.find((a) => a.id === t.toAccountId)?.name || '',
          t.splits.length
            ? t.splits
                .map(
                  (s) =>
                    `${categories.find((c) => c.id === s.categoryId)?.name}:${s.amount}`,
                )
                .join(';')
            : categories.find((c) => c.id === t.categoryId)?.name || '',
          t.merchant || '',
          directory.find((d) => d.id === t.projectId)?.name || '',
          directory
            .filter((d) => t.tagIds.includes(d.id))
            .map((d) => d.name)
            .join(';'),
          t.note,
          t.status,
          t.originalTransactionId || '',
          t.externalId || '',
        ]),
      ];
      const job: ExportJob = {
        id: crypto.randomUUID(),
        state: 'Ready',
        fileName: `personal-finance-${dayjs().format('YYYY-MM-DD')}.${b.format === 'Excel' ? 'xlsx' : 'csv'}`,
        count: rows.length,
        format: b.format,
      };
      const bytes =
        b.format === 'CSV'
          ? new TextEncoder().encode(makeCsv(matrix))
          : makeXlsx(matrix);
      if (exports.size >= 10) exports.delete(exports.keys().next().value!);
      exports.set(job.id, {
        job,
        bytes,
        contentType:
          b.format === 'CSV'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      keys.set(cached.key, { fingerprint: cached.fingerprint, data: job });
      return ok(job);
    } catch (e) {
      return fail((e as Error).message);
    }
  }),
  http.get('/api/exports/:id/file', ({ params }) => {
    const file = exports.get(String(params.id));
    return file
      ? new HttpResponse(file.bytes.buffer, {
          headers: {
            'Content-Type': file.contentType,
            'Content-Disposition': `attachment; filename="${file.job.fileName}"`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      : fail('导出已过期，请重新生成', 404);
  }),
];
export function attachmentsFor(id: string): Attachment[] {
  return Array.from(files.values())
    .filter((f) => f.transactionId === id)
    .map((f) => f.attachment);
}

