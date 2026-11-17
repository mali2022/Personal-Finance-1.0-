/** 仅用于 Mock 服务端。生产财务结果由 ASP.NET Core 服务计算。 */
import dayjs from 'dayjs';
import { categoryPath } from '../utils/categories';
import { statisticsRules } from './preferences';
import { accounts, categories, transactions } from './seed';
import { decimal, formatDate, minor } from '../utils/finance';
import type {
  Budget,
  CreditCardStatementDto,
  RefundSourceDto,
  ReportDto,
  ReportFilters,
  SaveBudgetRequest,
  SplitItem,
  Transaction,
} from '../types';
export function expenseItems(t: Transaction): SplitItem[] {
  if (t.type === 'AssetLoss' && statisticsRules.includeAssetLoss)
    return [{ categoryId: 'asset-loss', amount: t.amount }];
  if (
    t.type === 'Adjustment' &&
    t.adjustmentDirection === 'Decrease' &&
    statisticsRules.includeDecreasingAdjustments
  )
    return [{ categoryId: 'balance-adjustment', amount: t.amount }];
  if (t.type === 'Expense' || t.type === 'Refund')
    return t.splits.length
      ? t.splits
      : t.categoryId
        ? [{ categoryId: t.categoryId, amount: t.amount }]
        : [];
  if (
    (t.type === 'Transfer' || t.type === 'CreditCardPayment') &&
    statisticsRules.includeFees &&
    minor(t.fee) > 0n
  )
    return [{ categoryId: t.feeCategoryId || 'fee', amount: t.fee }];
  return [];
}
export function refundSource(
  original: Transaction,
  excludeId?: string,
): RefundSourceDto {
  const refunded = transactions.filter(
    (t) =>
      t.status !== 'Deleted' &&
      t.type === 'Refund' &&
      t.originalTransactionId === original.id &&
      t.id !== excludeId,
  );
  const refundedAmount = decimal(
    refunded.reduce((s, t) => s + minor(t.amount), 0n),
  );
  return {
    ...original,
    refundedAmount,
    refundableAmount: decimal(minor(original.amount) - minor(refundedAmount)),
    refundableSplits: expenseItems(original).map((item) => ({
      ...item,
      amount: decimal(
        minor(item.amount) -
          refunded.reduce(
            (sum, t) =>
              sum +
              expenseItems(t)
                .filter((s) => s.categoryId === item.categoryId)
                .reduce((a, s) => a + minor(s.amount), 0n),
            0n,
          ),
      ),
    })),
  };
}
export function accountDelta(t: Transaction, id: string): bigint {
  let delta = 0n;
  if (t.accountId === id) {
    if (t.type === 'Adjustment')
      delta +=
        minor(t.amount) * (t.adjustmentDirection === 'Increase' ? 1n : -1n);
    if (
      [
        'Expense',
        'AssetLoss',
        'LoanGiven',
        'LoanRepaymentPaid',
        'ReimbursementAdvance',
      ].includes(t.type)
    )
      delta -= minor(t.amount);
    if (
      [
        'LoanReceived',
        'LoanRepaymentReceived',
        'ReimbursementReceived',
      ].includes(t.type)
    )
      delta += minor(t.amount);
    if (t.type === 'Income' || t.type === 'Refund') delta += minor(t.amount);
    if (t.type === 'Transfer' || t.type === 'CreditCardPayment')
      delta -= minor(t.amount) + minor(t.fee);
  }
  if (
    t.toAccountId === id &&
    (t.type === 'Transfer' || t.type === 'CreditCardPayment')
  )
    delta += minor(t.receivedAmount || t.amount);
  if (t.toAccountId === id) {
    if (
      ['LoanGiven', 'LoanRepaymentPaid', 'ReimbursementAdvance'].includes(
        t.type,
      )
    )
      delta += minor(t.amount);
    if (
      [
        'LoanReceived',
        'LoanRepaymentReceived',
        'ReimbursementReceived',
      ].includes(t.type)
    )
      delta -= minor(t.amount);
  }
  return delta;
}
export function balanceAt(id: string, date: string): bigint {
  const a = accounts.find((a) => a.id === id);
  if (!a) return 0n;
  return (
    minor(a.balance) -
    transactions
      .filter((t) => t.status !== 'Deleted' && formatDate(t.occurredAt) > date)
      .reduce((s, t) => s + accountDelta(t, id), 0n)
  );
}
function period(date: string, g: ReportFilters['granularity']) {
  const d = dayjs(date);
  return g === 'year'
    ? date.slice(0, 4)
    : g === 'month'
      ? date.slice(0, 7)
      : g === 'week'
        ? d.subtract((d.day() + 6) % 7, 'day').format('YYYY-MM-DD')
        : date;
}
export function report(filters: ReportFilters): ReportDto {
  const { start, end, currency, granularity, parentId } = filters;
  const live = transactions.filter((t) => t.status !== 'Deleted');
  const rows = live.filter(
    (t) =>
      (!filters.projectId || t.projectId === filters.projectId) &&
      t.currency === currency &&
      formatDate(t.occurredAt) >= start &&
      formatDate(t.occurredAt) <= end,
  );
  const sumIncome = (items: Transaction[]) =>
    items
      .filter((t) => t.type === 'Income')
      .reduce((s, t) => s + minor(t.amount), 0n);
  const sumExpense = (items: Transaction[]) =>
    items.reduce(
      (s, t) =>
        s +
        expenseItems(t).reduce((a, item) => a + minor(item.amount), 0n) *
          (t.type === 'Refund' ? -1n : 1n),
      0n,
    );
  const income = sumIncome(rows),
    expense = sumExpense(rows);
  const categoryStats = categories
    .filter(
      (c) =>
        c.kind === 'Expense' &&
        (parentId ? c.parentId === parentId : !c.parentId),
    )
    .map((c) => {
      const amount = rows.reduce(
        (sum, t) =>
          sum +
          expenseItems(t)
            .filter((item) =>
              categoryPath(categories, item.categoryId).some(
                (x) => x.id === c.id,
              ),
            )
            .reduce((s, item) => s + minor(item.amount), 0n) *
            (t.type === 'Refund' ? -1n : 1n),
        0n,
      );
      return {
        categoryId: c.id,
        name: c.name,
        amount: decimal(amount),
        share: expense ? (Number(amount) / Number(expense)) * 100 : 0,
      };
    });
  const at = (date: string) => {
    const balances = accounts
      .filter((a) => a.currency === currency)
      .map((a) => balanceAt(a.id, date));
    const assets = balances.filter((b) => b > 0n).reduce((s, b) => s + b, 0n),
      liabilities = balances.filter((b) => b < 0n).reduce((s, b) => s - b, 0n);
    return {
      assets: decimal(assets),
      liabilities: decimal(liabilities),
      netWorth: decimal(assets - liabilities),
    };
  };
  const buckets = new Map<string, string>();
  for (
    let date = dayjs(start);
    date.format('YYYY-MM-DD') <= end;
    date = date.add(1, 'day')
  )
    buckets.set(
      period(date.format('YYYY-MM-DD'), granularity),
      date.format('YYYY-MM-DD'),
    );
  return {
    income: decimal(income),
    expense: decimal(expense),
    ...at(end),
    currency,
    categories: categoryStats,
    points: [...buckets].map(([p, date]) => {
      const items = rows.filter(
        (t) => period(formatDate(t.occurredAt), granularity) === p,
      );
      return {
        period: p,
        income: decimal(sumIncome(items)),
        expense: decimal(sumExpense(items)),
        ...at(date),
      };
    }),
    excludedCurrencies: [
      ...new Set(
        accounts.filter((a) => a.currency !== currency).map((a) => a.currency),
      ),
    ],
  };
}
export const budgetSettings = new Map<
  string,
  SaveBudgetRequest & { version: string }
>([
  [
    '2026-10',
    {
      total: '8000.00',
      items: categories
        .filter((c) => c.kind === 'Expense' && !c.parentId)
        .map((c) => ({ categoryId: c.id, limit: '1600.00' })),
      version: '1',
    },
  ],
]);
export function budget(month: string): Budget {
  const config = budgetSettings.get(month);
  const stats = report({
    start: month + '-01',
    end: dayjs(month + '-01')
      .endOf('month')
      .format('YYYY-MM-DD'),
    granularity: 'month',
    currency: 'CNY',
  });
  return {
    id: month,
    month,
    total: config?.total || '0.00',
    version: config?.version || '0',
    used: stats.expense,
    items: (config?.items || []).map((item) => ({
      ...item,
      id: item.categoryId,
      used:
        stats.categories.find((c) => c.categoryId === item.categoryId)
          ?.amount || '0.00',
    })),
  };
}
function clipped(month: dayjs.Dayjs, day: number) {
  return month.startOf('month').date(Math.min(day, month.daysInMonth()));
}
export function cardStatement(
  id: string,
  month?: string,
): CreditCardStatementDto {
  const a = accounts.find((a) => a.id === id)!;
  const today = dayjs(formatDate(new Date().toISOString()));
  let cutoff = clipped(
    month ? dayjs(month + '-01') : today,
    a.statementDay || 15,
  );
  if (!month && cutoff.isAfter(today))
    cutoff = clipped(today.subtract(1, 'month'), a.statementDay || 15);
  const previous = clipped(cutoff.subtract(1, 'month'), a.statementDay || 15),
    cycleStart = previous.add(1, 'day').format('YYYY-MM-DD'),
    statementDate = cutoff.format('YYYY-MM-DD');
  let due = clipped(cutoff, a.paymentDay || 3);
  if (!due.isAfter(cutoff))
    due = clipped(cutoff.add(1, 'month'), a.paymentDay || 3);
  const live = transactions.filter((t) => t.status !== 'Deleted');
  const cycle = live.filter(
    (t) =>
      t.accountId === id &&
      formatDate(t.occurredAt) >= cycleStart &&
      formatDate(t.occurredAt) <= statementDate,
  );
  const total = (rows: Transaction[], type: string) =>
    rows
      .filter((t) => t.type === type)
      .reduce((s, t) => s + minor(t.amount), 0n);
  const after = live.filter(
    (t) =>
      formatDate(t.occurredAt) > statementDate &&
      formatDate(t.occurredAt) <= today.format('YYYY-MM-DD'),
  );
  const debt = balanceAt(id, statementDate);
  const amount = debt < 0n ? -debt : 0n;
  const paid = after
    .filter((t) => t.toAccountId === id && t.type === 'CreditCardPayment')
    .reduce((s, t) => s + minor(t.receivedAmount || t.amount), 0n);
  const refundCredit = after
    .filter(
      (t) =>
        t.accountId === id &&
        t.type === 'Refund' &&
        live.some(
          (o) =>
            o.id === t.originalTransactionId &&
            formatDate(o.occurredAt) <= statementDate,
        ),
    )
    .reduce((s, t) => s + minor(t.amount), 0n);
  const remaining =
    amount > paid + refundCredit ? amount - paid - refundCredit : 0n;
  return {
    accountId: id,
    currency: a.currency,
    cycleStart,
    statementDate,
    dueDate: due.format('YYYY-MM-DD'),
    purchases: decimal(total(cycle, 'Expense')),
    refunds: decimal(total(cycle, 'Refund')),
    statementAmount: decimal(amount),
    repaid: decimal(paid),
    remaining: decimal(remaining),
    unbilled: decimal(
      total(
        after.filter((t) => t.accountId === id),
        'Expense',
      ) -
        total(
          after.filter(
            (t) =>
              t.accountId === id &&
              live.some(
                (o) =>
                  o.id === t.originalTransactionId &&
                  formatDate(o.occurredAt) > statementDate,
              ),
          ),
          'Refund',
        ),
    ),
  };
}
