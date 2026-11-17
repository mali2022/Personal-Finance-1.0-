import { http, HttpResponse } from 'msw';
import { accounts, categories, transactions } from './seed';
import { directory, applyBalance } from './phase3';
import {
  suggestImportMapping,
  standardIncomeExpenseHeaders,
} from '../features/imports/mapping';
import { categoryPath } from '../utils/categories';
import { decimal, minor } from '../utils/finance';
import { parseCsv, parseXlsx } from './files';
import type {
  ImportJob,
  ImportMapping,
  ImportRow,
  ImportRowPatch,
  ImportSource,
  ImportAttempt,
  ImportOutcome,
  Transaction,
} from '../types';
interface StoredJob {
  job: ImportJob;
  raw: string[][];
  rows: ImportRow[];
  patches: Map<string, ImportRowPatch>;
  reviews: Map<
    string,
    { decision: 'Keep' | 'Skip'; signature: string; reviewedAt: string }
  >;
  signatures: Map<string, string>;
}
const jobs = new Map<string, StoredJob>();
const attempts = new Map<
  string,
  (ImportAttempt & { rows: ImportOutcome[] })[]
>();
function recordAttempt(
  stored: StoredJob,
  completed: boolean,
  rows = stored.rows,
) {
  const entry = {
    id: crypto.randomUUID(),
    state: completed ? ('Completed' as const) : ('Failed' as const),
    code: completed ? 'IMPORT_COMPLETED' : 'IMPORT_PREVIEW_STALE',
    message: completed
      ? '有效记录整批导入完成；跳过记录保留在逐行结果中'
      : '导入条件已变化，请重新检查预览后确认',
    total: stored.rows.length,
    imported: completed ? stored.job.imported || 0 : 0,
    skipped: completed
      ? stored.rows.filter((r) => r.status !== 'Imported').length
      : 0,
    createdAt: new Date().toISOString(),
    traceId: 'mock',
    rows: rows.map((r) => ({
      id: r.id,
      index: r.index,
      status: r.status,
      issues: [...r.issues],
    })),
  };
  attempts.set(stored.job.id, [entry, ...(attempts.get(stored.job.id) || [])]);
}
export const importCategoryReferences = (id: string) =>
  [...jobs.values()].reduce(
    (count, job) => count + job.rows.filter((r) => r.categoryId === id).length,
    0,
  );
const keys = new Map<string, { fingerprint: string; result: ImportJob }>();
const ok = (data: unknown) => HttpResponse.json({ data });
const fail = (message: string, status = 422) =>
  HttpResponse.json({ message, code: 'IMPORT_ERROR' }, { status });
export function importDate(value: string): string {
  if (/^\d{4,5}(\.\d+)?$/.test(value))
    return new Date(
      Date.UTC(1899, 11, 30) +
        Math.round(Number(value) * 86400000) -
        8 * 3600000,
    ).toISOString();
  const text = value.trim().replaceAll('/', '-');
  const match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (match) {
    const [, y, m, d, h = '00', min = '00', sec = '00'] = match;
    const canonical = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${min}:${sec}+08:00`;
    const date = new Date(canonical);
    if (
      !Number.isFinite(date.getTime()) ||
      Number(h) > 23 ||
      Number(min) > 59 ||
      Number(sec) > 59 ||
      new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) !==
        canonical.slice(0, 10)
    )
      throw new Error('日期无效');
    return date.toISOString();
  }
  if (/(Z|[+-]\d{2}:\d{2})$/.test(text) && Number.isFinite(Date.parse(text)))
    return new Date(text).toISOString();
  throw new Error('日期无效，请使用含时区时间或上海时间 YYYY-MM-DD HH:mm:ss');
}
export const suggestMapping = suggestImportMapping;
function preview(stored: StoredJob) {
  const { job, raw, patches } = stored;
  const mapping = job.mapping!;
  const standard = standardIncomeExpenseHeaders(job.headers);
  const field = (values: string[], key: keyof ImportMapping) =>
    mapping[key]
      ? values[job.headers.indexOf(mapping[key]!)]?.trim() || ''
      : '';
  const prior: ImportRow[] = [];
  stored.signatures.clear();
  stored.rows = raw.map((values, index) => {
    const id = String(index + 1),
      patch = patches.get(id);
    const issues: string[] = [];
    const rawType = field(values, 'type');
    const type: ImportRow['type'] =
      patch?.type ||
      (['收入', 'Income', 'income', '收款'].includes(rawType)
        ? 'Income'
        : [
              '转账',
              'Transfer',
              'transfer',
              '充值',
              '提现',
              'TopUp',
              'Withdrawal',
            ].includes(rawType)
          ? 'Transfer'
          : 'Expense');
    if (
      !patch?.type &&
      ![
        '支出',
        'Expense',
        'expense',
        '消费',
        '收入',
        'Income',
        'income',
        '收款',
        '转账',
        '充值',
        '提现',
        'TopUp',
        'Withdrawal',
        'Transfer',
        'transfer',
      ].includes(rawType)
    )
      issues.push('交易类型不明确；退款与借贷请使用专用入口');
    const accountField = patch?.accountId ?? field(values, 'account');
    const account = accounts.find(
      (a) =>
        a.id === (accountField || job.accountId) ||
        (accountField && a.name === accountField),
    );
    if (
      !account ||
      account.status !== 'Active' ||
      ['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(
        account.type,
      )
    )
      issues.push('资金账户不可用');
    let occurredAt = '',
      amount = '0.00';
    try {
      occurredAt = importDate(field(values, 'occurredAt'));
    } catch (e) {
      issues.push((e as Error).message);
    }
    try {
      amount = decimal(
        minor(
          patch?.amount || field(values, 'amount').replace(/[¥￥$,\s]/g, ''),
        ),
      );
      if (minor(amount) <= 0n) issues.push('金额必须大于 0');
    } catch {
      issues.push('金额无效或超过两位小数');
    }
    const status = field(values, 'status');
    const excluded = [
      '交易关闭',
      '已关闭',
      '交易失败',
      '失败',
      '已撤销',
      '已取消',
      '已作废',
      'Closed',
      'Failed',
      'Cancelled',
    ].some((x) => x.toLowerCase() === status.toLowerCase());
    if (standard && type === 'Transfer')
      issues.push('标准收支模板仅支持支出和收入，转账请使用专用模板');
    if (
      status &&
      ![
        '交易成功',
        '支付成功',
        '付款成功',
        '已收款',
        '已入账',
        '成功',
        '完成',
        '已支付',
        'SUCCESS',
        'Confirmed',
        'Completed',
        '已完成',
      ].some((value) => value.toLowerCase() === status.toLowerCase())
    )
      issues.push(`未成功交易：${status}`);
    if (
      field(values, 'currency') &&
      field(values, 'currency') !== account?.currency
    )
      issues.push('币种与账户不一致');
    const merchant = field(values, 'merchant'),
      note = field(values, 'note'),
      rawCategory = field(values, 'category');
    const targetName = field(values, 'toAccount');
    const target = accounts.find(
      (a) =>
        a.id === (patch?.toAccountId || targetName) ||
        (!!targetName && a.name === targetName),
    );
    if (
      type === 'Transfer' &&
      (!target ||
        !account ||
        target.status !== 'Active' ||
        target.id === account.id ||
        target.currency !== account.currency ||
        ['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(
          target.type,
        ))
    )
      issues.push('转账需指定不同的同币种资金账户');
    let candidate = categories.find(
      (c) =>
        c.kind === type &&
        c.parentId &&
        (c.name === rawCategory ||
          `${categories.find((p) => p.id === c.parentId)?.name} / ${c.name}` ===
            rawCategory),
    );
    const second = field(values, 'category2'),
      third = field(values, 'category3');
    const hierarchical = !!mapping.category2 || !!mapping.category3;
    if (standard || (hierarchical && (rawCategory || second || third))) {
      const pathNames = third
        ? [rawCategory, second, third]
        : [rawCategory, second];
      const matches = categories
        .filter((c) => c.kind === type && c.status === 'Active')
        .filter((c) => {
          const path = categoryPath(categories, c.id);
          return (
            path.length === pathNames.length &&
            path.every(
              (part, i) =>
                part.status === 'Active' &&
                (part.name === pathNames[i] || part.id === pathNames[i]),
            )
          );
        });
      candidate =
        matches.length === 1 && rawCategory && second ? matches[0] : undefined;
      if (!patch?.categoryId && !candidate)
        issues.push('分类路径不存在、层级不匹配或已停用，请核对完整分类路径');
    }
    const productName =
      patch?.productName ??
      (type === 'Expense' || standard ? field(values, 'productName') : '');
    let discountAmount = (
      patch?.discountAmount ??
      field(values, 'discountAmount') ??
      '0'
    ).replace(/[¥￥,\s]/g, '');
    let originalAmount = amount;
    try {
      const discount = minor(discountAmount || '0');
      if (discount < 0n || (discount > 0n && type !== 'Expense'))
        throw new Error();
      discountAmount = decimal(discount);
      originalAmount = decimal(minor(amount) + discount);
      if (minor(originalAmount) > 10000000000n) throw new Error();
    } catch {
      issues.push('优惠金额无效或不适用于该交易类型');
    }
    if (productName.length > 200 || (type !== 'Expense' && !!productName))
      issues.push('商品仅用于支出，最多200字');
    const merchantCategory = directory.find(
      (d) =>
        d.kind === 'merchants' && d.name === merchant && d.status === 'Active',
    )?.categoryId;
    const historical = transactions.find(
      (t) =>
        t.status !== 'Deleted' &&
        t.type === type &&
        t.merchant === merchant &&
        t.currency === account?.currency &&
        t.categoryId,
    )?.categoryId;
    let categoryId =
      patch?.categoryId ||
      candidate?.id ||
      (type === 'Expense'
        ? merchantCategory || historical || 'unknown'
        : historical);
    if (type === 'Transfer') categoryId = undefined;
    if (
      type !== 'Transfer' &&
      !categories.some(
        (c) =>
          c.id === categoryId &&
          c.kind === type &&
          c.parentId &&
          c.status === 'Active' &&
          categories.some(
            (parent) => parent.id === c.parentId && parent.status === 'Active',
          ),
      )
    )
      issues.push('请匹配有效的二级分类');
    const externalId = field(values, 'externalId');
    if (externalId.length > 256) issues.push('外部流水号最多256字符');
    const row: ImportRow = {
      id,
      index: index + 1,
      occurredAt,
      amount,
      type,
      transferKind:
        type === 'Transfer'
          ? patch?.transferKind ||
            (['充值', 'TopUp'].includes(rawType)
              ? 'TopUp'
              : ['提现', 'Withdrawal'].includes(rawType)
                ? 'Withdrawal'
                : null)
          : null,
      accountId: account?.id || '',
      toAccountId: type === 'Transfer' ? target?.id : undefined,
      currency: account?.currency || 'CNY',
      merchant,
      productName,
      discountAmount,
      originalAmount,
      sourceStatus: status,
      sourceExcluded: excluded,
      note,
      categoryId,
      externalId: externalId || undefined,
      status: 'Ready',
      issues,
      needsReview: type === 'Expense' && categoryId === 'unknown',
      recommendation: patch?.categoryId
        ? '手动匹配'
        : candidate
          ? '账单分类'
          : merchantCategory
            ? '商户默认分类'
            : historical
              ? '历史分类'
              : type === 'Expense'
                ? '待整理：不明消费'
                : undefined,
    };
    if (excluded) {
      row.status = 'Skipped';
      row.issues = ['来源为空行或账单明确标记关闭、失败、取消，不入账'];
    } else if (issues.length) row.status = 'Invalid';
    else {
      const exact = externalId
        ? prior.find(
            (r) =>
              r.externalId === externalId &&
              r.accountId === row.accountId &&
              ['Ready', 'Suspected', 'Duplicate'].includes(r.status),
          ) ||
          [...jobs.values()]
            .filter(
              (j) => j.job.state === 'Completed' && j.job.source === job.source,
            )
            .flatMap((j) => j.rows)
            .find(
              (r) =>
                r.status === 'Imported' &&
                r.accountId === row.accountId &&
                r.externalId === externalId,
            ) ||
          transactions.find(
            (t) =>
              t.importSource === job.source &&
              t.accountId === row.accountId &&
              t.externalId === externalId,
          )
        : undefined;
      if (exact) {
        const same = coreSignature(exact) === coreSignature(row);
        row.status = same ? 'Duplicate' : 'Invalid';
        row.duplicateKind = same ? 'Deterministic' : 'Conflict';
        row.issues.push(
          same
            ? '同一来源、账户与流水号已存在，本行不会重复入账'
            : '流水号身份相同，但财务信息冲突，请核对账单',
        );
        stored.reviews.delete(id);
      } else {
        const similar = (r: Transaction | ImportRow) =>
          r.accountId === row.accountId &&
          r.currency === row.currency &&
          r.type === row.type &&
          minor(r.amount) === minor(row.amount) &&
          Math.abs(Date.parse(r.occurredAt) - Date.parse(row.occurredAt)) <=
            300000 &&
          (r.merchant || '').trim().toLowerCase() ===
            row.merchant.trim().toLowerCase();
        const tx = transactions.filter(
          (t) =>
            t.status !== 'Deleted' &&
            similar(t) &&
            !(externalId && t.externalId && t.importSource === job.source),
        );
        const peers = prior.filter(
          (r) =>
            ['Ready', 'Suspected'].includes(r.status) &&
            similar(r) &&
            !(externalId && r.externalId),
        );
        row.candidateCount = tx.length + peers.length;
        row.duplicateCandidates = [
          ...tx.map((t) => ({ kind: 'Transaction' as const, id: t.id })),
          ...peers.map((r) => ({
            kind: 'Row' as const,
            id: r.id,
            index: r.index,
          })),
        ].slice(0, 20);
        if (row.candidateCount) {
          const signature = JSON.stringify([
            coreSignature(row),
            tx.map((t) => [t.id, t.version]).sort(),
            peers.map((r) => [r.id, coreSignature(r)]).sort(),
          ]);
          stored.signatures.set(id, signature);
          const review = stored.reviews.get(id);
          if (review?.signature !== signature) stored.reviews.delete(id);
          const accepted = stored.reviews.get(id);
          row.duplicateKind = 'Suspected';
          row.reviewDecision = accepted?.decision;
          row.reviewedAt = accepted?.reviewedAt;
          row.status =
            accepted?.decision === 'Keep'
              ? 'Ready'
              : accepted?.decision === 'Skip'
                ? 'Skipped'
                : 'Suspected';
          row.issues.push(
            '前后5分钟内存在同账户、币种、类型、金额与商户的相似记录，请人工核对',
          );
        } else {
          row.duplicateKind = 'None';
          stored.reviews.delete(id);
        }
      }
    }
    prior.push(row);
    return row;
  });
  job.summary = {
    total: stored.rows.length,
    ready: stored.rows.filter((r) => r.status === 'Ready').length,
    duplicate: stored.rows.filter((r) => r.status === 'Duplicate').length,
    suspected: stored.rows.filter((r) => r.status === 'Suspected').length,
    skipped: stored.rows.filter((r) => r.status === 'Skipped').length,
    invalid: stored.rows.filter((r) => r.status === 'Invalid').length,
    needsReview: stored.rows.filter(
      (r) => r.status === 'Ready' && r.needsReview,
    ).length,
  };
}
function coreSignature(row: ImportRow | Transaction) {
  return JSON.stringify([
    row.accountId,
    row.currency,
    row.type,
    decimal(minor(row.amount)),
    new Date(row.occurredAt).toISOString(),
    row.toAccountId || '',
  ]);
}
function mutable(request: Request, stored?: StoredJob) {
  if (!stored) throw new Error('导入任务不存在或已过期');
  if (stored.job.state === 'Completed')
    throw new Error('已完成任务不能再次修改');
  if (request.headers.get('If-Match') !== stored.job.version)
    throw new Error('导入预览已更新，请刷新');
}
function bump(stored: StoredJob) {
  stored.job.version = String(Number(stored.job.version) + 1);
  preview(stored);
  return ok(stored.job);
}
export const importHandlers = [
  http.post(
    '/api/imports/:id/rows/:rowId/duplicate-review',
    async ({ request, params }) => {
      try {
        const stored = jobs.get(String(params.id));
        mutable(request, stored);
        const { decision } = (await request.json()) as {
          decision: 'Keep' | 'Skip' | 'Clear';
        };
        if (!['Keep', 'Skip', 'Clear'].includes(decision))
          return fail('判定无效');
        const id = String(params.rowId),
          signature = stored!.signatures.get(id);
        const previous = structuredClone(stored!.rows),
          summary = structuredClone(stored!.job.summary),
          reviews = new Map(stored!.reviews),
          signatures = new Map(stored!.signatures);
        preview(stored!);
        if (signature !== stored!.signatures.get(id)) {
          stored!.rows = previous;
          stored!.job.summary = summary;
          stored!.reviews = reviews;
          stored!.signatures = signatures;
          return HttpResponse.json(
            {
              message: '相似记录已变化，请重新检查预览后判定',
              code: 'IMPORT_PREVIEW_STALE',
            },
            { status: 409 },
          );
        }
        const row = stored!.rows.find((r) => r.id === id);
        if (!row || row.duplicateKind !== 'Suspected' || !signature)
          return fail('当前行没有可人工覆盖的疑似重复');
        if (decision === 'Clear') stored!.reviews.delete(id);
        else
          stored!.reviews.set(id, {
            decision,
            signature,
            reviewedAt: new Date().toISOString(),
          });
        return bump(stored!);
      } catch (error) {
        return fail((error as Error).message, 409);
      }
    },
  ),
  http.get('/api/imports/:id/attempts', ({ request, params }) => {
    const page = Math.max(
      1,
      Number(new URL(request.url).searchParams.get('page')) || 1,
    );
    const all = attempts.get(String(params.id)) || [];
    return ok({
      items: all
        .slice((page - 1) * 10, page * 10)
        .map((entry) =>
          Object.fromEntries(
            Object.entries(entry).filter(([key]) => key !== 'rows'),
          ),
        ),
      total: all.length,
      page,
      pageSize: 10,
    });
  }),
  http.get(
    '/api/imports/:id/attempts/:attemptId/rows',
    ({ request, params }) => {
      const entry = attempts
        .get(String(params.id))
        ?.find((r) => r.id === params.attemptId);
      if (!entry) return fail('处理记录不存在', 404);
      const page = Math.max(
        1,
        Number(new URL(request.url).searchParams.get('page')) || 1,
      );
      return ok({
        items: entry.rows.slice((page - 1) * 20, page * 20),
        total: entry.rows.length,
        page,
        pageSize: 20,
      });
    },
  ),
  http.post('/api/imports/:id/recheck', ({ request, params }) => {
    const stored = jobs.get(String(params.id));
    try {
      mutable(request, stored);
      return bump(stored!);
    } catch (e) {
      return fail((e as Error).message, 409);
    }
  }),
  http.get('/api/imports', () => ok({ items: [], total: 0, page: 1, pageSize: 10 })),
  http.post('/api/imports', async ({ request }) => {
    try {
      const form = await request.formData(),
        file = form.get('file'),
        source = String(form.get('source')) as ImportSource;
      if (
        !file ||
        typeof file === 'string' ||
        !['CSV', 'Excel', 'Alipay', 'WeChat', 'Bank'].includes(source)
      )
        return fail('请选择账单文件与来源');
      if (file.size > 5 * 1024 * 1024 || !file.size)
        return fail('文件须为 1 字节至 5 MB');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let rows: string[][];
      if (/\.xlsx$/i.test(file.name)) rows = await parseXlsx(bytes);
      else if (/\.csv$/i.test(file.name)) {
        let text: string;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          text = new TextDecoder('gb18030').decode(bytes);
        }
        rows = parseCsv(text.replace(/^\ufeff/, ''));
      } else return fail('仅支持 CSV 和 XLSX；旧版 XLS 请另存为 XLSX');
      const headerIndex = rows.findIndex(
        (r) =>
          r.some((c) => /交易时间|日期|date|occurredAt/i.test(c)) &&
          r.some((c) => /金额|amount/i.test(c)),
      );
      if (headerIndex < 0)
        return fail('未识别到日期和金额表头，请使用标准模板');
      const headers = rows[headerIndex].map((h, i) => h || `列${i + 1}`);
      if (new Set(headers).size !== headers.length) return fail('表头不能重复');
      const raw = rows.slice(headerIndex + 1);
      if (!raw.length || raw.length > 2000 || headers.length > 100)
        return fail('演示导入支持 1 至 2000 笔、最多100列');
      const job: ImportJob = {
        id: crypto.randomUUID(),
        fileName: file.name,
        source,
        headers,
        sampleRows: raw.slice(0, 3),
        total: raw.length,
        version: '1',
        state: 'Uploaded',
        mapping: suggestMapping(headers),
      };
      if (jobs.size >= 20) jobs.delete(jobs.keys().next().value!);
      jobs.set(job.id, {
        job,
        raw,
        rows: [],
        patches: new Map(),
        reviews: new Map(),
        signatures: new Map(),
      });
      return ok(job);
    } catch (e) {
      return fail(e instanceof Error ? e.message : '文件解析失败');
    }
  }),
  http.get('/api/imports/:id', ({ params }) => {
    const stored = jobs.get(String(params.id));
    return stored ? ok(stored.job) : fail('导入任务不存在或已过期', 404);
  }),
  http.put('/api/imports/:id/mapping', async ({ request, params }) => {
    try {
      const stored = jobs.get(String(params.id));
      mutable(request, stored);
      const body = (await request.json()) as {
        mapping: ImportMapping;
        accountId: string;
      };
      const columns = Object.values(body.mapping).filter(Boolean);
      if (
        !body.mapping.occurredAt ||
        !body.mapping.amount ||
        !body.mapping.type ||
        columns.some((c) => !stored!.job.headers.includes(c)) ||
        new Set(columns).size !== columns.length
      )
        return fail('日期、金额、类型必填，映射列不能重复');
      if (
        !accounts.some(
          (a) =>
            a.id === body.accountId &&
            a.status === 'Active' &&
            !['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(
              a.type,
            ),
        )
      )
        return fail('默认账户不可用');
      stored!.job.mapping = body.mapping;
      stored!.job.accountId = body.accountId;
      stored!.job.state = 'Preview';
      stored!.reviews.clear();
      return bump(stored!);
    } catch (e) {
      return fail((e as Error).message, 409);
    }
  }),
  http.get('/api/imports/:id/rows', ({ request, params }) => {
    const stored = jobs.get(String(params.id));
    if (!stored) return fail('导入任务不存在', 404);
    const p = new URL(request.url).searchParams,
      page = Math.max(1, Number(p.get('page')) || 1);
    const rows = stored.rows.filter(
      (r) => !p.get('status') || r.status === p.get('status'),
    );
    return ok({
      items: rows.slice((page - 1) * 20, page * 20),
      total: rows.length,
      page,
      pageSize: 20,
    });
  }),
  http.patch('/api/imports/:id/rows/:rowId', async ({ request, params }) => {
    try {
      const stored = jobs.get(String(params.id));
      mutable(request, stored);
      if (!stored!.rows.some((r) => r.id === params.rowId))
        return fail('记录不存在', 404);
      const patch = (await request.json()) as ImportRowPatch;
      if (patch.type && !['Expense', 'Income', 'Transfer'].includes(patch.type))
        return fail('交易类型无效');
      stored!.patches.set(String(params.rowId), {
        ...stored!.patches.get(String(params.rowId)),
        ...patch,
      });
      return bump(stored!);
    } catch (e) {
      return fail((e as Error).message, 409);
    }
  }),
  http.post('/api/imports/:id/categories', async ({ request, params }) => {
    try {
      const stored = jobs.get(String(params.id));
      mutable(request, stored);
      const { categoryId } = (await request.json()) as { categoryId: string };
      if (
        !categories.some(
          (c) =>
            c.id === categoryId &&
            c.kind === 'Expense' &&
            c.parentId &&
            c.status === 'Active',
        )
      )
        return fail('请选择有效支出分类');
      for (const row of stored!.rows.filter(
        (r) => r.needsReview && r.status === 'Ready',
      ))
        stored!.patches.set(row.id, {
          ...stored!.patches.get(row.id),
          categoryId,
        });
      return bump(stored!);
    } catch (e) {
      return fail((e as Error).message, 409);
    }
  }),
  http.post('/api/imports/:id/commit', async ({ request, params }) => {
    try {
      const body = (await request.json()) as {
        skipInvalid: boolean;
        skipDuplicates: boolean;
      };
      const key = request.headers.get('Idempotency-Key'),
        fingerprint = JSON.stringify({ id: params.id, body });
      if (!key) return fail('缺少幂等键');
      const cached = keys.get(key);
      if (cached)
        return cached.fingerprint === fingerprint
          ? ok(cached.result)
          : fail('幂等键内容不同', 409);
      const stored = jobs.get(String(params.id));
      mutable(request, stored);
      if (stored!.job.state !== 'Preview') return fail('必须先预览');
      const previous = JSON.stringify(stored!.rows);
      const oldSummary = structuredClone(stored!.job.summary);
      const oldReviews = new Map(stored!.reviews),
        oldSignatures = new Map(stored!.signatures);
      preview(stored!);
      if (previous !== JSON.stringify(stored!.rows)) {
        recordAttempt(stored!, false);
        stored!.rows = JSON.parse(previous) as ImportRow[];
        stored!.job.summary = oldSummary;
        stored!.reviews = oldReviews;
        stored!.signatures = oldSignatures;
        return HttpResponse.json(
          {
            message: '导入条件已变化，请重新检查预览后确认',
            code: 'IMPORT_PREVIEW_STALE',
          },
          { status: 409 },
        );
      }
      if (stored!.rows.some((r) => r.status === 'Suspected'))
        return HttpResponse.json(
          {
            message: '请逐行确认疑似重复',
            code: 'IMPORT_DUPLICATE_REVIEW_REQUIRED',
          },
          { status: 409 },
        );
      if (
        stored!.rows.some(
          (r) =>
            (r.status === 'Invalid' && !body.skipInvalid) ||
            (r.status === 'Duplicate' && !body.skipDuplicates),
        )
      )
        return HttpResponse.json(
          {
            message: '请明确确认跳过重复或异常记录',
            code: 'IMPORT_SKIPS_NOT_CONFIRMED',
          },
          { status: 409 },
        );
      const ready = stored!.rows.filter((r):r is ImportRow&{type:Exclude<ImportRow['type'],'Unknown'>} => r.status === 'Ready'&&r.type!=='Unknown');
      if (!ready.length && !stored!.rows.some((r) => r.status === 'Skipped'))
        return fail('没有可导入记录');
      const now = new Date().toISOString();
      const saved: Transaction[] = ready.map((row) => ({
        id: crypto.randomUUID(),
        type: row.type,
        transferKind: row.transferKind,
        amount: row.amount,
        currency: row.currency,
        accountId: row.accountId,
        toAccountId: row.toAccountId,
        categoryId: row.categoryId,
        merchant: row.merchant,
        productName: row.productName,
        promotion:
          row.discountAmount && minor(row.discountAmount) > 0n
            ? {
                originalAmount: row.originalAmount!,
                currency: row.currency,
                shippingAmount: '0',
                lines: [
                  {
                    type: 'OtherDiscount',
                    amount: row.discountAmount,
                    order: 0,
                    source: '标准CSV导入',
                  },
                ],
              }
            : undefined,
        note: row.note,
        occurredAt: row.occurredAt,
        status: row.needsReview ? 'NeedsReview' : 'Confirmed',
        tagIds: [],
        splits: [],
        fee: '0.00',
        refundedAmount: '0.00',
        version: '1',
        createdAt: now,
        updatedAt: now,
        importJobId: stored!.job.id,
        importSource: stored!.job.source,
        externalId: row.externalId,
      }));
      for (const t of saved) applyBalance(t, 1n);
      transactions.unshift(...saved);
      stored!.job.state = 'Completed';
      stored!.job.imported = saved.length;
      stored!.job.version = String(Number(stored!.job.version) + 1);
      ready.forEach((row) => {
        row.status = 'Imported';
      });
      if (stored!.job.summary) stored!.job.summary.ready = 0;
      recordAttempt(stored!, true);
      keys.set(key, { fingerprint, result: structuredClone(stored!.job) });
      return ok(stored!.job);
    } catch (e) {
      return fail((e as Error).message, 409);
    }
  }),
];
