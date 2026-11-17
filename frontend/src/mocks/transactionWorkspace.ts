/** Demo-only API simulation. Production totals and validation are implemented by ASP.NET Core. */
import { http, HttpResponse } from 'msw';
import { accounts, categories, transactions } from './seed';
import { accountDelta } from './analytics';
import { decimal, formatDate, minor } from '../utils/finance';
import type { Transaction } from '../types';
const ok = (data: unknown) => HttpResponse.json({ data });
export function demoMerchantValues(raw: string): string[] {
  try {
    const values: unknown = raw.startsWith('[')
      ? JSON.parse(raw)
      : raw.split(',');
    return Array.isArray(values) && values.every((v) => typeof v === 'string')
      ? values
      : [];
  } catch {
    return [];
  }
}
export function demoAnomalies(t: Transaction): string[] {
  return [
    minor(t.amount) >= 10000000n ? 'Extreme' : null,
    transactions.some(
      (o) =>
        o.id !== t.id &&
        o.status !== 'Deleted' &&
        o.accountId === t.accountId &&
        o.type === t.type &&
        o.amount === t.amount &&
        o.currency === t.currency &&
        o.occurredAt === t.occurredAt &&
        o.merchant === t.merchant,
    )
      ? 'Duplicate'
      : null,
    ['Expense', 'Income'].includes(t.type) &&
    !t.splits.length &&
    (!t.categoryId || !categories.some((c) => c.id === t.categoryId))
      ? 'Category'
      : null,
    t.type === 'Refund' &&
    !transactions.some(
      (o) =>
        o.id === t.originalTransactionId &&
        o.type === 'Expense' &&
        o.status !== 'Deleted' &&
        o.currency === t.currency &&
        o.occurredAt <= t.occurredAt,
    )
      ? 'Refund'
      : null,
    ['Transfer', 'CreditCardPayment'].includes(t.type) &&
    (!t.toAccountId || t.toAccountId === t.accountId)
      ? 'Transfer'
      : null,
    Date.parse(t.occurredAt) > Date.now() + 86400000 ||
    Date.parse(t.occurredAt) < Date.UTC(1900, 0, 1)
      ? 'Date'
      : null,
  ].filter((v): v is string => !!v);
}
export function transactionWorkspaceHandlers(
  filtered: (url: URL) => Transaction[],
) {
  const summarize = (rows: Transaction[]) =>
    [
      ...new Set(
        rows.flatMap((t) => [
          t.currency,
          ...(t.toAccountId
            ? [
                accounts.find((a) => a.id === t.toAccountId)?.currency ||
                  t.currency,
              ]
            : []),
        ]),
      ),
    ].map((currency) => {
      const own = rows.filter((t) => t.currency === currency);
      const sum = (kind: string) =>
        own
          .filter((t) => t.type === kind)
          .reduce((s, t) => s + minor(t.amount), 0n);
      const ordinary = own.filter((t) => t.type === 'Expense');
      const fees = own
        .filter((t) => ['Transfer', 'CreditCardPayment'].includes(t.type))
        .reduce((s, t) => s + minor(t.fee), 0n);
      const expense = sum('Expense') + sum('AssetLoss') + fees;
      const refunds = sum('Refund');
      return {
        currency,
        income: decimal(sum('Income') - sum('RewardReversal')),
        expense: decimal(expense),
        netExpense: decimal(expense - refunds),
        refunds: decimal(refunds),
        averageExpense: decimal(
          ordinary.length ? sum('Expense') / BigInt(ordinary.length) : 0n,
        ),
        maxExpense: decimal(
          ordinary.reduce(
            (s, t) => (minor(t.amount) > s ? minor(t.amount) : s),
            0n,
          ),
        ),
        netCashFlow: decimal(
          rows.filter(t=>!['Adjustment','AssetLoss'].includes(t.type)).reduce(
            (s, t) =>
              s +
              accounts
                .filter((a) => a.currency === currency && ['Cash','Bank','Alipay','WeChat','ElectronicWallet'].includes(a.type))
                .reduce((n, a) => n + accountDelta(t, a.id), 0n),
            0n,
          ),
        ),
        transferIn: decimal(
          rows
            .filter(
              (t) =>
                ['Transfer', 'CreditCardPayment'].includes(t.type) &&
                accounts.find((a) => a.id === t.toAccountId)?.currency ===
                  currency,
            )
            .reduce((s, t) => s + minor(t.receivedAmount || t.amount), 0n),
        ),
        transferOut: decimal(
          own
            .filter((t) => ['Transfer', 'CreditCardPayment'].includes(t.type))
            .reduce((s, t) => s + minor(t.amount) + minor(t.fee), 0n),
        ),
      };
    });
  return [
    http.get('/api/transactions/summary', ({ request }) => {
      const rows = filtered(new URL(request.url));
      return ok({
        total: rows.length,
        pending: rows.filter((t) => t.status === 'NeedsReview').length,
        anomalies: rows.filter((t) => demoAnomalies(t).length).length,
        uncategorized: rows.filter((t) => demoAnomalies(t).includes('Category'))
          .length,
        currencies: summarize(rows),
        basis: 'Demo data',
      });
    }),
    http.get('/api/transactions/daily-summary', ({ request }) => {
      const url = new URL(request.url);
      const rows = filtered(url);
      return ok(
        (url.searchParams.get('days') || '').split(',').flatMap((day) =>
          summarize(rows.filter((t) => formatDate(t.occurredAt) === day)).map(
            (c) => ({
              day,
              currency: c.currency,
              income: c.income,
              expense: c.netExpense,
            }),
          ),
        ),
      );
    }),
    http.get('/api/transactions/:id/issues', ({ params }) => {
      const row = transactions.find((t) => t.id === params.id);
      return row
        ? ok({ rules: demoAnomalies(row), threshold: 'Demo rules' })
        : HttpResponse.json({ message: '交易不存在' }, { status: 404 });
    }),
    http.get('/api/transactions/:id/statement-matches', () => ok([])),
    http.post('/api/transactions/ai', () =>
      HttpResponse.json(
        {
          message: '演示模式不调用DeepSeek，请切换到已配置的真实API。',
          code: 'DEMO_ONLY',
        },
        { status: 503 },
      ),
    ),
  ];
}
