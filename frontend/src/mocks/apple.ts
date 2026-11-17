import { http, HttpResponse } from 'msw';
import dayjs from 'dayjs';
import { accounts, transactions } from './seed';
import { demoAnomalies } from './transactionWorkspace';
import { budget, report } from './analytics';
import { decimal, minor } from '../utils/finance';
import type { AccountType, ReportFilters } from '../types';

/**
 * Development-only MSW fixtures for the Apple Home / Dashboard surfaces.
 * They are derived from the same demo seed as every other mock endpoint, are
 * registered first so they win over the legacy handlers, and are never part of
 * a production bundle (`VITE_ENABLE_MOCK`). No figure here reaches a real
 * ledger or a real report.
 */
const ok = (data: unknown) => HttpResponse.json({ data });
const month = () => dayjs().format('YYYY-MM');
const currency = 'CNY' as const;

const liveTransactions = () => transactions.filter((item) => item.status !== 'Deleted');

function monthlyReport(filters: Partial<ReportFilters> = {}) {
  return report({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().endOf('month').format('YYYY-MM-DD'),
    granularity: 'month',
    currency,
    ...filters,
  } as ReportFilters);
}

function curveReport(start: string, end: string, granularity: ReportFilters['granularity']) {
  return report({ start, end, granularity, currency } as ReportFilters);
}

function accountTypeSlices(items: typeof accounts, total: bigint) {
  const grouped = new Map<string, bigint>();
  for (const account of items) {
    if (account.currency !== currency) continue;
    let value = minor(account.balance);
    if (value <= 0n) continue;
    grouped.set(account.type, (grouped.get(account.type) || 0n) + value);
  }
  return [...grouped.entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .map(([type, value]) => ({
      type: type as AccountType,
      amount: decimal(value),
      percent: total > 0n ? decimal((value * 10000n) / total) : null,
    }));
}

function allocationSnapshot() {
  const cny = accounts.filter((account) => account.currency === currency);
  let assets = 0n;
  let liabilities = 0n;
  for (const account of cny) {
    const value = minor(account.balance);
    if (value > 0n) assets += value;
    else liabilities += -value;
  }
  return {
    date: dayjs().format('YYYY-MM-DD'),
    complete: true,
    uncovered: 0,
    scope: '演示账本：账户账本余额，不含第三方估值。',
    items: cny.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      reportCurrency: currency,
      originalAmount: account.balance,
      amount: decimal(minor(account.balance) < 0n ? -minor(account.balance) : minor(account.balance)),
      missing: null,
      valuationDate: null,
      source: 'Ledger',
      rate: null,
      rateDate: null,
      rateSource: null,
      stale: false,
    })),
    groups: [
      {
        currency,
        assets: decimal(assets),
        liabilities: decimal(liabilities),
        netWorth: decimal(assets - liabilities),
        allocation: accountTypeSlices(
          cny.filter((account) => minor(account.balance) > 0n),
          assets,
        ),
      },
    ],
    policies: [],
  };
}

function goalItems() {
  const today = dayjs();
  const base = [
    {
      id: 'goal-travel',
      name: '年度旅行基金',
      type: 'Travel',
      target: '20000.00',
      monthlySaving: '1800.00',
      allocated: '14500.00',
      startDate: today.subtract(8, 'month').format('YYYY-MM-DD'),
      targetDate: today.add(4, 'month').format('YYYY-MM-DD'),
      priority: 1,
    },
    {
      id: 'goal-emergency',
      name: '应急储备金',
      type: 'Emergency',
      target: '60000.00',
      monthlySaving: '3000.00',
      allocated: '42600.00',
      startDate: today.subtract(14, 'month').format('YYYY-MM-DD'),
      targetDate: today.add(6, 'month').format('YYYY-MM-DD'),
      priority: 2,
    },
    {
      id: 'goal-device',
      name: '设备更新',
      type: 'Purchase',
      target: '12000.00',
      monthlySaving: '800.00',
      allocated: '3800.00',
      startDate: today.subtract(4, 'month').format('YYYY-MM-DD'),
      targetDate: today.add(8, 'month').format('YYYY-MM-DD'),
      priority: 3,
    },
  ];
  return base.map((goal) => {
    const target = minor(goal.target);
    const allocated = minor(goal.allocated);
    const remaining = target - allocated;
    return {
      ...goal,
      currency,
      state: 'Active',
      note: '',
      version: '1',
      remaining: decimal(remaining < 0n ? 0n : remaining),
      progress: target > 0n ? decimal((allocated * 10000n) / target) : '0.00',
      recommendedMonthly: goal.monthlySaving,
      estimatedCompletion: goal.targetDate,
      overdue: false,
    };
  });
}

function cashForecast(days: number) {
  const start = dayjs();
  const opening = accounts
    .filter(
      (account) =>
        account.currency === currency &&
        ['Bank', 'Alipay', 'WeChat', 'Cash'].includes(account.type),
    )
    .reduce((sum, account) => sum + minor(account.balance), 0n);
  const series = Array.from({ length: days + 1 }, (_, index) => ({
    date: start.add(index, 'day').format('YYYY-MM-DD'),
    inflow: '0.00',
    outflow: '0.00',
    balance: decimal(opening),
  }));
  return {
    sampled: false,
    opening: decimal(opening),
    inflow: '0.00',
    outflow: '0.00',
    closing: decimal(opening),
    minimum: decimal(opening),
    minimumDate: start.format('YYYY-MM-DD'),
    reserved: '0.00',
    availableCash: decimal(opening),
    nearTermCommitments: '0.00',
    freelyAvailable: decimal(opening),
    assumptions:
      '仅根据已记录的周期交易、订阅与未来计划推算；未记录的收入与支出不会自动生成。演示账本暂无未来事件。',
    days: series,
    accounts: accounts
      .filter((account) => account.currency === currency)
      .map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        opening: account.balance,
        closing: account.balance,
        minimum: account.balance,
        minimumDate: start.format('YYYY-MM-DD'),
        gap: '0.00',
      })),
    gaps: [],
    events: { items: [], total: 0 },
    unresolved: [],
  };
}

export const appleHandlers = [
  http.get('/api/transactions/:id/promotions', () => ok({ cashbacks: [], usages: [] })),
  http.get('/api/transactions/summary', () => {
    const live = liveTransactions();
    const anomalies = live.filter((item) => demoAnomalies(item).length > 0).length;
    const uncategorized = live.filter((item) =>
      demoAnomalies(item).includes('Category'),
    ).length;
    const pending = live.filter((item) => item.status === 'NeedsReview').length;
    const cny = live.filter((item) => item.currency === currency);
    const income = cny
      .filter((item) => item.type === 'Income')
      .reduce((sum, item) => sum + minor(item.amount), 0n);
    const expense = cny
      .filter((item) => item.type === 'Expense')
      .reduce((sum, item) => sum + minor(item.amount), 0n);
    return ok({
      total: live.length,
      pending,
      anomalies,
      uncategorized,
      basis:
        '转账、信用卡还款与借贷本金不计入收支；退款冲减费用。异常按金额与历史分布规则标记，需人工复核。',
      currencies: [
        {
          currency,
          income: decimal(income),
          expense: decimal(expense),
          netExpense: decimal(expense),
          netCashFlow: decimal(income - expense),
          transferIn: '0.00',
          transferOut: '0.00',
          refunds: '0.00',
          averageExpense: live.length ? decimal(expense / BigInt(live.length)) : '0.00',
          maxExpense: decimal(
            live.reduce(
              (max, item) => (minor(item.amount) > max ? minor(item.amount) : max),
              0n,
            ),
          ),
        },
      ],
    });
  }),
  http.get('/api/smart-reconciliation/overview', () =>
    ok({
      denominator: 0,
      numerator: 0,
      coverage: null,
      conflictCount: 0,
      manualReviewCount: 0,
      knownDifferenceCount: 0,
      suspectedDuplicateCount: 0,
      accounts: [],
      trend: [],
      snapshotTrend: [],
    }),
  ),
  http.get('/api/financial-planning/summary', () => {
    const current = monthlyReport();
    const currentBudget = budget(month());
    const income = minor(current.income);
    const expense = minor(current.expense);
    const surplus = income - expense;
    const remaining = minor(currentBudget.total) - minor(currentBudget.used);
    return ok({
      budgetRemaining: decimal(remaining < 0n ? 0n : remaining),
      savingsRate: income > 0n ? decimal((surplus * 10000n) / income) : null,
      emergencyScope: '按近 12 个月必要支出估算，可使用应急储备账户。',
      goals: goalItems(),
      upcoming: [
        {
          id: 'upcoming-rent',
          name: '下月房租',
          expectedDate: dayjs().add(9, 'day').format('YYYY-MM-DD'),
          amount: '3200.00',
          currency,
        },
        {
          id: 'upcoming-subscription',
          name: '年度订阅续费',
          expectedDate: dayjs().add(16, 'day').format('YYYY-MM-DD'),
          amount: '228.00',
          currency,
        },
      ],
    });
  }),
  http.get('/api/savings-goals', () => {
    const items = goalItems();
    const target = items.reduce((sum, item) => sum + minor(item.target), 0n);
    const reserved = items.reduce((sum, item) => sum + minor(item.allocated), 0n);
    return ok({
      items,
      total: items.length,
      active: items.length,
      completed: 0,
      target: decimal(target),
      reserved: decimal(reserved),
      accounts: [],
    });
  }),
  http.get('/api/cashflow/forecast', ({ request }) => {
    const url = new URL(request.url);
    const start = dayjs(url.searchParams.get('start') || dayjs().format('YYYY-MM-DD'));
    const end = dayjs(url.searchParams.get('end') || dayjs().add(30, 'day').format('YYYY-MM-DD'));
    const days = Math.max(1, Math.min(120, end.diff(start, 'day')));
    return ok(cashForecast(days));
  }),
  http.get('/api/assets/allocation', () => ok(allocationSnapshot())),
  http.get('/api/ai/settings', () =>
    ok({
      provider: 'DeepSeek',
      enabled: false,
      configured: false,
      model: '—',
      reasoningModel: '—',
      transmission: '演示账本未配置 AI 服务。',
      legacyModels: '',
      dailyCallLimit: 0,
      capabilities: {},
      documentation: '',
      privacy: {
        enabled: false,
        allowSummary: false,
        allowDetails: false,
        allowPayroll: false,
        allowFamily: false,
        allowRecognitionText: false,
        saveHistory: false,
      },
    }),
  ),
];

/** Exposed for the mock report endpoint so both surfaces share one calculation. */
export const appleFixtures = {
  monthlyReport,
  curveReport,
  allocationSnapshot,
  cashForecast,
};

/** Shell / planning fixtures so the Apple pages can be reviewed without a backend. */
export const appleShellHandlers = [
  http.get('/api/auth/profile', () =>
    ok({
      id: 'demo-user',
      email: 'demo@example.com',
      displayName: '演示用户',
      realName: '',
      phone: '',
      birthday: null,
      gender: 'Unspecified',
      country: '',
      region: '',
      city: '',
      occupation: '',
      bio: '',
      language: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      preferredCurrency: 'CNY',
      createdAt: '2026-10-01T00:00:00Z',
      version: 1,
      hasAvatar: false,
      avatarUpdatedAt: null,
    }),
  ),
  http.get('/api/settings/modules', () => ok({ concerts: true, version: '1' })),
  http.get('/api/planning/capabilities', () =>
    ok({ recurring: true, subscriptions: true, calendar: true, automation: true }),
  ),
  http.get('/api/planning/summary', () =>
    ok({
      pending: 2,
      overdue: 1,
      failed: 0,
      reminders: [
        {
          id: 'reminder-rent',
          name: '下月房租',
          at: dayjs().add(9, 'day').toISOString(),
          currency,
          amount: '3200.00',
        },
      ],
    }),
  ),
];
