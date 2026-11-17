import { http, HttpResponse } from 'msw';
import { categoriesOverlap } from '../utils/categories';
import dayjs from 'dayjs';
import { accounts, categories, transactions } from './seed';
import {
  budget,
  budgetSettings,
  cardStatement,
  refundSource,
  report,
} from './analytics';
import { decimal, formatDate, minor } from '../utils/finance';
import type { ReportFilters, SaveBudgetRequest } from '../types';
const ok = (data: unknown) => HttpResponse.json({ data });
const fail = (message: string, status = 422) =>
  HttpResponse.json({ message, code: 'VALIDATION_ERROR' }, { status });
export const phase2Handlers = [
  http.get('/api/refund-sources', ({ request }) => {
    const p = new URL(request.url).searchParams;
    const keyword = (p.get('keyword') || '').toLowerCase();
    const page = Math.max(1, Number(p.get('page')) || 1);
    const rows = transactions
      .filter(
        (t) =>
          t.type === 'Expense' &&
          t.status !== 'Deleted' &&
          [t.id, t.merchant, t.note, t.productName, t.amount, formatDate(t.occurredAt)]
            .join(' ')
            .toLowerCase()
            .includes(keyword),
      )
      .map((t) => refundSource(t))
      .filter((t) => minor(t.refundableAmount) > 0n)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return ok({
      items: rows.slice((page - 1) * 20, page * 20),
      total: rows.length,
      page,
      pageSize: 20,
    });
  }),
  http.get('/api/refund-sources/:id', ({ request, params }) => {
    const t = transactions.find(
      (t) =>
        t.id === params.id && t.type === 'Expense' && t.status !== 'Deleted',
    );
    return t
      ? ok(
          refundSource(
            t,
            new URL(request.url).searchParams.get('excludeRefundId') ||
              undefined,
          ),
        )
      : fail('原消费不存在或已删除', 404);
  }),
  http.get('/api/budgets/:month', ({ params }) =>
    /^\d{4}-(0[1-9]|1[0-2])$/.test(String(params.month))
      ? ok(budget(String(params.month)))
      : fail('月份格式不正确'),
  ),
  http.put('/api/budgets/:month', async ({ request, params }) => {
    const month = String(params.month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail('月份格式不正确');
    const body = (await request.json()) as SaveBudgetRequest;
    const current = budgetSettings.get(month);
    if (request.headers.get('If-Match') !== (current?.version || '0'))
      return fail('预算已更新，请刷新后重试', 409);
    try {
      if (minor(body.total) <= 0n) return fail('月度预算必须大于 0');
      if (
        new Set(body.items.map((i) => i.categoryId)).size !== body.items.length
      )
        return fail('预算分类不能重复');
      if (
        body.items.some(
          (i) =>
            minor(i.limit) <= 0n ||
            !categories.some(
              (c) =>
                c.id === i.categoryId &&
                c.kind === 'Expense' &&
                c.status === 'Active' &&
                (!c.parentId ||
                  categories.some(
                    (p) => p.id === c.parentId && p.status === 'Active',
                  )),
            ),
        )
      )
        return fail('请选择启用的支出分类，预算金额须大于 0');
      const selected = new Set(body.items.map((i) => i.categoryId));
      if (categoriesOverlap(categories, [...selected]))
        return fail('同月不能同时设置父分类及其子分类预算，请保留其中一层');
      if (
        body.items.reduce((s, i) => s + minor(i.limit), 0n) > minor(body.total)
      )
        return fail('分类预算合计不能超过月度预算');
      budgetSettings.set(month, {
        total: decimal(minor(body.total)),
        items: body.items.map((i) => ({
          ...i,
          limit: decimal(minor(i.limit)),
        })),
        version: String(Number(current?.version || 0) + 1),
      });
      return ok(budget(month));
    } catch {
      return fail('请输入正确金额');
    }
  }),
  http.get('/api/reports/summary', ({ request }) => {
    const p = new URL(request.url).searchParams;
    const start = p.get('start') || '',
      end = p.get('end') || '',
      granularity = p.get('granularity') || 'month',
      currency = p.get('currency') || 'CNY';
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      dayjs(start).format('YYYY-MM-DD') !== start ||
      dayjs(end).format('YYYY-MM-DD') !== end ||
      start > end ||
      dayjs(end).diff(dayjs(start), 'day') > 730
    )
      return fail('请选择有效时间范围，最多两年');
    if (
      !['day', 'week', 'month', 'year'].includes(granularity) ||
      !['CNY', 'USD', 'HKD'].includes(currency)
    )
      return fail('统计参数不正确');
    return ok(
      report({
        start,
        end,
        granularity,
        currency,
        parentId: p.get('parentId') || undefined,
        projectId: p.get('projectId') || undefined,
      } as ReportFilters),
    );
  }),
  http.get('/api/accounts/:id/credit-card-statement', ({ request, params }) => {
    const a = accounts.find(
      (a) =>
        a.id === params.id && ['CreditCard', 'ConsumerCredit'].includes(a.type),
    );
    if (!a) return fail('信用卡账户不存在', 404);
    const month = new URL(request.url).searchParams.get('month') || undefined;
    if (
      month &&
      (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
        dayjs(month + '-01').isAfter(dayjs()))
    )
      return fail('只能查询当前或历史账期');
    const statement = cardStatement(a.id, month);
    if (statement.statementDate > dayjs().format('YYYY-MM-DD'))
      return fail('该账期尚未出账，请选择已出账月份');
    return ok(statement);
  }),
];
