/** Development-only adapter. Production calculations always use the authenticated API. */
import { http, HttpResponse } from 'msw';
import dayjs from 'dayjs';
import { managementDefaults } from '../features/reports/statisticsPolicyCatalog';
import type {
  ManagedPolicy,
  PolicyOptions,
  PolicyHistory,
} from '../features/reports/statisticsPolicyApi';
import { accounts, transactions } from './seed';
import { statisticsRules } from './preferences';
import { expenseItems, accountDelta } from './analytics';
import { minor, decimal } from '../utils/finance';
import { CURRENCY_CODES } from '../constants/currencies';
let options = { ...managementDefaults },
  revision = 0;
const history: PolicyHistory[] = [];
const root = '/api/settings/statistics/management';
const ok = (data: unknown) => HttpResponse.json({ data });
const fail = (message: string, status = 422) =>
  HttpResponse.json({ message, code: 'STATISTICS_POLICY_ERROR' }, { status });
function period(o: PolicyOptions, anchor: string, kind: string) {
  const day = dayjs(anchor);
  if (!day.isValid() || day.format('YYYY-MM-DD') !== anchor)
    throw Error('统计日期无效');
  const boundary = (d: dayjs.Dayjs) =>
    d.startOf('month').date(Math.min(o.monthStartDay, d.daysInMonth()));
  let start = boundary(day),
    end = boundary(day.add(1, 'month'));
  if (kind === 'month') {
    if (start.isAfter(day)) {
      start = boundary(day.subtract(1, 'month'));
      end = boundary(day);
    }
  } else if (kind === 'year') {
    start = day.startOf('year').month(o.yearStartMonth - 1);
    if (start.isAfter(day)) start = start.subtract(1, 'year');
    end = start.add(1, 'year');
  } else if (kind === 'week') {
    start = day
      .startOf('day')
      .subtract(((day.day() || 7) - o.weekStartsOn + 7) % 7, 'day');
    end = start.add(7, 'day');
  } else throw Error('统计周期无效');
  return { start, end };
}
function daily(
  o: PolicyOptions,
  rules: ManagedPolicy['ledgerRules'],
  anchor: string,
  kind: string,
  currency: string,
) {
  const { start, end } = period(o, anchor, kind),
    cutoff = end.isBefore(dayjs()) ? end : dayjs();
  if (start.isAfter(dayjs())) throw Error('未来账期尚无已发生统计');
  const all = transactions.filter(
    (t) =>
      t.status === 'Confirmed' &&
      dayjs(t.occurredAt).valueOf() >= start.valueOf() &&
      dayjs(t.occurredAt).valueOf() < cutoff.valueOf(),
  );
  const rows = all.filter((t) => t.currency === currency);
  const previous = { ...statisticsRules };
  let positive = 0n,
    refund = 0n;
  try {
    Object.assign(statisticsRules, rules);
    for (const t of rows) {
      const amount = expenseItems(t).reduce((s, e) => s + minor(e.amount), 0n);
      if (t.type === 'Refund') refund += amount;
      else positive += amount;
    }
  } finally {
    Object.assign(statisticsRules, previous);
  }
  const income = rows
      .filter((t) => t.type === 'Income')
      .reduce((s, t) => s + minor(t.amount), 0n),
    net = positive - refund;
  const metrics = {
    income: decimal(income),
    grossExpense: decimal(positive),
    refunds: decimal(refund),
    netExpense: decimal(net),
    displayedExpense: decimal(o.refundDisplay === 'Net' ? net : positive),
    surplus: decimal(income - net),
    excludedIncome: '0.00',
    oneTimeIncome: '0.00',
    savingsIncome: decimal(income),
    savingsRate:
      income > 0n
        ? ((Number(income - net) / Number(income)) * 100).toFixed(2)
        : null,
    cashRewardIncome: '0.00',
    depositInterest: '0.00',
    investmentCashIncome: '0.00',
    ledgerIncome: decimal(income),
    ledgerExpense: decimal(net),
  };
  return { start, end, cutoff, rows, all, metrics };
}
export const statisticsManagementHandlers = [
  http.get(root, () =>
    ok({
      options,
      version: String(revision),
      ledgerVersion: statisticsRules.version,
      ledgerRules: {
        includeFees: statisticsRules.includeFees,
        includeAssetLoss: statisticsRules.includeAssetLoss,
        includeDecreasingAdjustments:
          statisticsRules.includeDecreasingAdjustments,
      },
    }),
  ),
  http.get(root + '/history', () => ok(history.slice(0, 50))),
  http.put(root, async ({ request }) => {
    const b = (await request.json()) as ManagedPolicy;
    if (
      request.headers.get('If-Match') !== String(revision) ||
      b.ledgerVersion !== statisticsRules.version
    )
      return fail('统计口径版本冲突', 409);
    const o = b.options;
    if (
      !o ||
      !b.ledgerRules ||
      ![o.monthStartDay, o.yearStartMonth, o.weekStartsOn].every(
        Number.isInteger,
      ) ||
      o.monthStartDay < 1 ||
      o.monthStartDay > 31 ||
      o.yearStartMonth < 1 ||
      o.yearStartMonth > 12 ||
      o.weekStartsOn < 1 ||
      o.weekStartsOn > 7 ||
      !CURRENCY_CODES.includes(o.baseCurrency) ||
      Number(o.largeTransactionThreshold) <= 0
    )
      return fail('统计口径无效');
    const changes = (Object.keys(o) as (keyof PolicyOptions)[])
      .filter((k) => o[k] !== options[k])
      .map((k) => ({ field: k, before: options[k], after: o[k] }));
    history.unshift({
      id: crypto.randomUUID(),
      resourceType: 'StatisticsManagementPolicy',
      createdAt: new Date().toISOString(),
      changes,
    });
    options = structuredClone(o);
    revision++;
    Object.assign(statisticsRules, b.ledgerRules, {
      version: String(Number(statisticsRules.version) + 1),
    });
    return ok({
      version: String(revision),
      ledgerVersion: statisticsRules.version,
    });
  }),
  http.post(root + '/preview', async ({ request }) => {
    try {
      const b = (await request.json()) as {
        options: PolicyOptions;
        ledgerRules: ManagedPolicy['ledgerRules'];
        anchor: string;
        period: string;
        currency?: string;
      };
      const currency = b.currency ?? b.options.baseCurrency;
      if (!CURRENCY_CODES.includes(currency)) return fail('统计币种无效');
      const r = daily(b.options, b.ledgerRules, b.anchor, b.period, currency),
        before = daily(options, statisticsRules, b.anchor, b.period, currency);
      const cashAccounts = accounts.filter(
        (a) =>
          a.currency === currency &&
          ['Cash', 'Bank', 'Alipay', 'WeChat', 'ElectronicWallet'].includes(
            a.type,
          ),
      );
      const net = r.all
        .filter((t) => !['Adjustment', 'AssetLoss'].includes(t.type))
        .map((t) =>
          cashAccounts.reduce((s, a) => s + accountDelta(t, a.id), 0n),
        );
      const inflow = net.filter((v) => v > 0n).reduce((s, v) => s + v, 0n),
        outflow = -net.filter((v) => v < 0n).reduce((s, v) => s + v, 0n);
      return ok({
        currency,
        start: r.start.toISOString(),
        endExclusive: r.cutoff.toISOString(),
        plannedEndExclusive: r.end.toISOString(),
        generatedAt: new Date().toISOString(),
        isPeriodClosed: r.end.isBefore(dayjs()),
        transactionCount: r.rows.length,
        daily: {
          ...r.metrics,
          savedLedgerExpense: before.metrics.netExpense,
          ledgerExpenseDifference: decimal(
            minor(r.metrics.netExpense) - minor(before.metrics.netExpense),
          ),
        },
        comparison: {
          start: before.start.toISOString(),
          endExclusive: before.cutoff.toISOString(),
          daily: before.metrics,
          samePeriod: r.start.valueOf() === before.start.valueOf(),
        },
        accounts: b.options.showAccountFlows
          ? {
              inflow: decimal(inflow),
              outflow: decimal(outflow),
              surplus: decimal(inflow - outflow),
              surplusRate:
                inflow > 0n
                  ? ((Number(inflow - outflow) / Number(inflow)) * 100).toFixed(
                      2,
                    )
                  : null,
              items: accounts
                .filter((a) => a.currency === currency)
                .map((a) => {
                  const values = r.all.map((t) => accountDelta(t, a.id));
                  return {
                    id: a.id,
                    name: a.name,
                    type: a.type,
                    status: a.status,
                    inflow: decimal(
                      values.filter((v) => v > 0n).reduce((s, v) => s + v, 0n),
                    ),
                    outflow: decimal(
                      -values.filter((v) => v < 0n).reduce((s, v) => s + v, 0n),
                    ),
                    change: decimal(values.reduce((s, v) => s + v, 0n)),
                  };
                }),
              note: '模拟账本数据；实际统计由认证API提供。',
            }
          : null,
        debt: null,
        investment: null,
        wealth: null,
        payroll: {
          gross: '0.00',
          deductions: '0.00',
          net: '0.00',
          displayedSalary: '0.00',
          actual: '0.00',
          adjustments: '0.00',
          tax: '0.00',
          personalSocial: '0.00',
          personalHousing: '0.00',
          annualBonus: '0.00',
          note: '模拟数据未包含关联工资条，请连接真实API验证专项附表。',
        },
        quality: {
          unclassifiedExpense: '0.00',
          unclassifiedCount: 0,
          futureExcluded: 0,
          unsettledExcluded: 0,
          largeTransactions: b.options.highlightLargeTransactions
            ? r.rows
                .filter(
                  (t) =>
                    t.type === 'Expense' &&
                    minor(t.amount) >=
                      minor(b.options.largeTransactionThreshold),
                )
                .slice(0, 20)
                .map((t) => ({
                  id: t.id,
                  amount: t.amount,
                  occurredAt: t.occurredAt,
                }))
            : [],
        },
        notes: [
          '模拟环境仅提供种子账本的基础收支与账户资金流，未包含奖励、存款利息、分析属性和专项业务关联。真实计算以认证API为准。',
        ],
      });
    } catch {
      return fail('模拟预览参数无效');
    }
  }),
];
