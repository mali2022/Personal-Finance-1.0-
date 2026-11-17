/** 演示环境使用；正式财务统计由数据库接口计算。 */
import { http, HttpResponse } from 'msw';
import dayjs from 'dayjs';
import { categories, accounts, transactions } from './seed';
import { expenseItems, budgetSettings } from './analytics';
import { categoryPath, categoriesOverlap } from '../utils/categories';
import { minor, decimal, formatDate } from '../utils/finance';
import type { CategorySummary } from '../api/categoryStatistics';
const inside = (parent: string, id: string) =>
  categoryPath(categories, id).some((c) => c.id === parent);
type Row = {
  id: string;
  category: string;
  date: string;
  amount: bigint;
  discount: bigint;
  merchant: string;
  account: string;
  refund: boolean;
};
function ledger(kind: string, currency: string): Row[] {
  return transactions
    .filter(
      (t) =>
        t.status !== 'Deleted' &&
        t.currency === currency &&
        dayjs(t.occurredAt).valueOf() <= Date.now(),
    )
    .flatMap((t) => {
      const items =
        kind === 'Income'
          ? t.type === 'Income' && t.categoryId
            ? [{ categoryId: t.categoryId, amount: t.amount }]
            : []
          : expenseItems(t);
      const discount =
        t.type === 'Expense'
          ? t.promotion?.lines
              .filter((l) => l.type !== 'FeeWaiver')
              .reduce((s, l) => s + minor(l.amount), 0n) || 0n
          : 0n;
      const weights = items.reduce((s, i) => s + minor(i.amount), 0n);
      const allocated = items.map((i) =>
        weights > 0n ? (discount * minor(i.amount)) / weights : 0n,
      );
      if (allocated.length)
        allocated[0] += discount - allocated.reduce((s, v) => s + v, 0n);
      return items.map((item, i) => ({
        id: t.id,
        category: item.categoryId,
        date: t.occurredAt,
        amount: minor(item.amount) * (t.type === 'Refund' ? -1n : 1n),
        discount: allocated[i],
        merchant: t.merchant || '未填写商户',
        account: t.accountId,
        refund: t.type === 'Refund',
      }));
    });
}
const sum = (rows: Row[]) => rows.reduce((s, r) => s + r.amount, 0n);
function summary(rows: Row[]): CategorySummary {
  const groups = new Map<string, bigint>();
  rows.forEach((r) => groups.set(r.id, (groups.get(r.id) || 0n) + r.amount));
  const positive = [...groups.values()].filter((a) => a > 0n);
  const dates = rows
    .map((r) => r.date)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    gross: decimal(
      rows.filter((r) => r.amount > 0n).reduce((s, r) => s + r.amount, 0n),
    ),
    net: decimal(sum(rows)),
    refunds: decimal(-sum(rows.filter((r) => r.refund))),
    otherCredits: '0.00',
    count: groups.size,
    positiveCount: positive.length,
    refundCount: new Set(rows.filter((r) => r.refund).map((r) => r.id)).size,
    average: decimal(
      positive.length
        ? positive.reduce((s, a) => s + a, 0n) / BigInt(positive.length)
        : 0n,
    ),
    maximum: decimal(positive.reduce((s, a) => (a > s ? a : s), 0n)),
    discount: decimal(rows.reduce((s, r) => s + r.discount, 0n)),
    firstDate: dates[0],
    lastDate: dates.at(-1),
  };
}
const success = (data: unknown) => HttpResponse.json({ data });
export const categoryStatisticsHandlers = [
  http.get('/api/categories/overview', ({ request }) => {
    const currency = new URL(request.url).searchParams.get('currency') || 'CNY';
    const rows = [
      ...ledger('Expense', currency),
      ...ledger('Income', currency),
    ];
    return success({
      currency,
      items: categories.map((c) => ({
        id: c.id,
        level: categoryPath(categories, c.id).length,
        summary: summary(rows.filter((r) => inside(c.id, r.category))),
      })),
    });
  }),
  http.get('/api/categories/:id/statistics', ({ request, params }) => {
    const c = categories.find((c) => c.id === params.id);
    if (!c)
      return HttpResponse.json({ message: '分类不存在' }, { status: 404 });
    const query = new URL(request.url).searchParams,
      currency = query.get('currency') || 'CNY',
      month = query.get('month') || dayjs().format('YYYY-MM'),
      start = dayjs(month + '-01'),
      year = start.year();
    const all = ledger(c.kind, currency),
      rows = all.filter((r) => inside(c.id, r.category));
    const within = (from: dayjs.Dayjs, to: dayjs.Dayjs) =>
      rows.filter(
        (r) =>
          dayjs(formatDate(r.date)).valueOf() >= from.valueOf() &&
          dayjs(formatDate(r.date)).valueOf() < to.valueOf(),
      );
    const change = (a: bigint, b: bigint) =>
      b === 0n ? null : Number(((a - b) * 10000n) / (b < 0n ? -b : b)) / 100;
    const period = (date: dayjs.Dayjs) =>
      summary(within(date, date.add(1, 'month')));
    const current = within(start, start.add(1, 'month')),
      previous = within(start.subtract(1, 'month'), start),
      same = within(
        start.subtract(1, 'year'),
        start.subtract(1, 'year').add(1, 'month'),
      );
    const grouped = (key: (r: Row) => string) =>
      [...new Set(rows.map(key))]
        .map((name) => ({
          name,
          summary: summary(rows.filter((r) => key(r) === name)),
        }))
        .sort((a, b) => Number(b.summary.net) - Number(a.summary.net));
    const share = (part: Row[]) =>
      sum(rows) === 0n
        ? null
        : (Number((sum(part) * 10000n) / sum(rows)) / 100).toFixed(2);
    const budgetPeriod = (
      limits: { categoryId: string; limit: string }[],
      ledger: Row[],
    ) => {
      const allocated = limits.filter((l) => inside(c.id, l.categoryId)),
        overlapping = categoriesOverlap(
          categories,
          allocated.map((l) => l.categoryId),
        );
      const cap =
          !allocated.length || overlapping
            ? null
            : allocated.reduce((s, l) => s + minor(l.limit), 0n),
        used = sum(ledger.filter((r) => inside(c.id, r.category)));
      const line = (l: { categoryId: string; limit: string }) => {
        const amount = sum(
          ledger.filter((r) => inside(l.categoryId, r.category)),
        );
        return {
          id: l.categoryId,
          name: categories.find((c) => c.id === l.categoryId)!.name,
          limit: l.limit,
          used: decimal(amount),
          remaining: decimal(minor(l.limit) - amount),
          executionPercent:
            minor(l.limit) === 0n
              ? null
              : (Number((amount * 10000n) / minor(l.limit)) / 100).toFixed(2),
        };
      };
      return {
        limit: cap === null ? null : decimal(cap),
        used: decimal(used),
        remaining: cap === null ? null : decimal(cap - used),
        executionPercent:
          cap === null || cap === 0n
            ? null
            : (Number((used * 10000n) / cap) / 100).toFixed(2),
        overlapping,
        allocatedLines: allocated.map(line),
        sharedLines: limits
          .filter((l) => l.categoryId !== c.id && inside(l.categoryId, c.id))
          .map(line),
      };
    };
    const analysis = (predicate: (r: Row) => boolean, discount = false) =>
      [
        ...new Set(
          rows.filter(predicate).map((r) => formatDate(r.date).slice(0, 7)),
        ),
      ]
        .sort()
        .map((period) => {
          const selected = rows.filter(
            (r) => predicate(r) && formatDate(r.date).startsWith(period),
          );
          return {
            period,
            amount: decimal(
              discount
                ? selected.reduce((s, r) => s + r.discount, 0n)
                : -sum(selected),
            ),
            count: new Set(selected.map((r) => r.id)).size,
          };
        });
    return success({
      category: {
        ...c,
        level: categoryPath(categories, c.id).length,
        path: categoryPath(categories, c.id),
      },
      currency,
      month,
      year,
      cumulative: summary(rows),
      currentMonth: summary(current),
      previousMonth: summary(previous),
      currentYear: summary(
        within(start.startOf('year'), start.startOf('year').add(1, 'year')),
      ),
      lastYearSameMonth: summary(same),
      monthOverMonth: change(sum(current), sum(previous)),
      yearOverYear: change(sum(current), sum(same)),
      monthlyTrend: Array.from({ length: 12 }, (_, i) => ({
        period: start.startOf('year').add(i, 'month').format('YYYY-MM'),
        summary: period(start.startOf('year').add(i, 'month')),
      })),
      annualTrend: [...new Set(rows.map((r) => formatDate(r.date).slice(0, 4)))]
        .sort()
        .map((period) => ({
          period,
          summary: summary(
            rows.filter((r) => formatDate(r.date).startsWith(period)),
          ),
        })),
      merchants: grouped((r) => r.merchant).slice(0, 20),
      accounts: grouped((r) => r.account).map((r) => ({
        ...r,
        id: r.name,
        name: accounts.find((a) => a.id === r.name)?.name || '原账户',
        share: share(rows.filter((row) => row.account === r.name)),
      })),
      childContributions: [
        ...categories
          .filter((ch) => ch.parentId === c.id)
          .map((ch) => ({
            id: ch.id,
            name: ch.name,
            summary: summary(rows.filter((r) => inside(ch.id, r.category))),
            share: share(rows.filter((r) => inside(ch.id, r.category))),
          })),
        ...(categories.some((ch) => ch.parentId === c.id) &&
        rows.some((r) => r.category === c.id)
          ? [
              {
                id: c.id,
                name: '本级直接记账',
                summary: summary(rows.filter((r) => r.category === c.id)),
                share: share(rows.filter((r) => r.category === c.id)),
              },
            ]
          : []),
      ],
      refunds: analysis((r) => r.refund),
      discounts: analysis((r) => r.discount > 0n, true),
      budgets:
        c.kind === 'Expense' && currency === 'CNY'
          ? {
              supported: true,
              monthly: budgetPeriod(
                budgetSettings.get(month)?.items || [],
                all.filter((r) => formatDate(r.date).startsWith(month)),
              ),
              annual: budgetPeriod(
                [],
                all.filter((r) => formatDate(r.date).startsWith(String(year))),
              ),
              scope: '演示环境展示月度预算；正式年度预算由数据库接口计算。',
            }
          : { supported: false, reason: '支出预算仅支持人民币' },
      scope:
        '演示数据；父级汇总全部下级，交易笔数去重，退款冲减净额，币种分别统计。',
    });
  }),
];
