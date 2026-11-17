import dayjs from 'dayjs';
import { decimal, minor } from '../../utils/finance';
import type {
  Account,
  AccountType,
  Currency,
  ReportGranularity,
} from '../../types';
import { accountLabels } from '../../constants/mappings';
import { useUI } from '../../stores/ui';

/** Net-worth look-back windows shared by Home and Dashboard. */
export type RangeKey = '7d' | '30d' | '90d' | '1y';

export interface RangeDefinition {
  key: RangeKey;
  label: string;
  shortLabel: string;
  days: number;
  granularity: ReportGranularity;
}

export const RANGES: readonly RangeDefinition[] = [
  { key: '7d', label: '近 7 天', shortLabel: '7 天', days: 7, granularity: 'day' },
  { key: '30d', label: '近 30 天', shortLabel: '30 天', days: 30, granularity: 'day' },
  { key: '90d', label: '近 90 天', shortLabel: '90 天', days: 90, granularity: 'week' },
  { key: '1y', label: '近 1 年', shortLabel: '1 年', days: 365, granularity: 'month' },
];

export function isRangeKey(value: unknown): value is RangeKey {
  return RANGES.some((range) => range.key === value);
}

export function rangeOf(key: RangeKey): RangeDefinition {
  return RANGES.find((range) => range.key === key) || RANGES[1];
}

/**
 * Closed reporting window. `end` is inclusive (YYYY-MM-DD) which matches the
 * backend `/reports/summary` contract; the opening balance is the net worth at
 * the end of the day *before* `start`, so the change covers exactly N days.
 */
export function rangeWindow(
  range: RangeKey,
  end: dayjs.Dayjs = dayjs(),
): { start: string; end: string; openingDate: string; granularity: ReportGranularity } {
  const definition = rangeOf(range);
  const last = end.endOf('day');
  const first = last.subtract(definition.days - 1, 'day').startOf('day');
  return {
    start: first.format('YYYY-MM-DD'),
    end: last.format('YYYY-MM-DD'),
    openingDate: first.subtract(1, 'day').format('YYYY-MM-DD'),
    granularity: definition.granularity,
  };
}

export interface NetWorthPoint {
  period: string;
  income: string;
  expense: string;
  assets: string;
  liabilities: string;
  netWorth: string;
}

export interface NetWorthSeries {
  currency: Currency;
  range: RangeKey;
  start: string;
  end: string;
  granularity: ReportGranularity;
  points: NetWorthPoint[];
  income: string;
  expense: string;
  assets: string;
  liabilities: string;
  netWorth: string;
  opening: string;
  change: string;
  changePercent: number | null;
  excludedCurrencies: Currency[];
}

/** Exact bigint percentage; null when a denominator is zero. */
export function percentOf(part: bigint, whole: bigint): number | null {
  if (whole === 0n) return null;
  return Number((part * 10000n) / (whole < 0n ? -whole : whole)) / 100;
}

export function changeBetween(
  opening: string,
  latest: string,
): { amount: string; percent: number | null } {
  const difference = minor(latest) - minor(opening);
  return {
    amount: decimal(difference),
    percent: percentOf(difference, minor(opening)),
  };
}

export function savingsRateOf(
  income: string,
  expense: string,
): number | null {
  const earned = minor(income);
  if (earned <= 0n) return null;
  return percentOf(earned - minor(expense), earned);
}

export function surplusOf(income: string, expense: string): string {
  return decimal(minor(income) - minor(expense));
}

/** Savings rate for every month of the dashboard trend, excluding empty months. */
export function trendSavingsRate(points: { month: string; income: string; expense: string }[]) {
  return points.map((point) => ({
    month: point.month,
    surplus: surplusOf(point.income, point.expense),
    rate: savingsRateOf(point.income, point.expense),
  }));
}

export interface StructureSlice {
  key: string;
  label: string;
  amount: string;
  percent: number | null;
}

const ASSET_TYPES: AccountType[] = ['Bank', 'Alipay', 'WeChat', 'Cash', 'ElectronicWallet', 'StoredValue', 'Investment', 'Receivable', 'Other'];
const LIABILITY_TYPES: AccountType[] = ['CreditCard', 'ConsumerCredit', 'ConsumerLoan', 'SecuredLoan', 'Payable'];

export function isLiabilityAccount(type: AccountType): boolean {
  return LIABILITY_TYPES.includes(type);
}

export function isAssetAccount(type: AccountType): boolean {
  return ASSET_TYPES.includes(type);
}

/**
 * Account-ledger asset / liability structure using only positive balances.
 * When `currency` is provided, accounts in other currencies are excluded from
 * every total (they are reported back in `excludedCurrencies`) so the module
 * can never add unconverted USD/EUR balances into a CNY net worth.
 */
export function structureFromAccounts(
  accounts: readonly Account[],
  currency?: Currency,
): {
  assets: StructureSlice[];
  liabilities: StructureSlice[];
  assetTotal: string;
  liabilityTotal: string;
  excludedCurrencies: Currency[];
} {
  const sums = new Map<AccountType, bigint>();
  const excluded = new Set<Currency>();
  for (const account of accounts) {
    let balance: bigint;
    try {
      balance = minor(account.balance);
    } catch {
      continue;
    }
    if (balance === 0n) continue;
    if (currency && account.currency !== currency) {
      excluded.add(account.currency);
      continue;
    }
    const type = account.type;
    const signed = isLiabilityAccount(type) ? -balance : balance;
    if (signed <= 0n) continue;
    sums.set(type, (sums.get(type) || 0n) + signed);
  }
  const build = (types: AccountType[]) =>
    types
      .map((type) => ({ type, amount: sums.get(type) || 0n }))
      .filter((entry) => entry.amount > 0n)
      .map((entry) => ({ type: entry.type, amount: entry.amount }));
  const assetEntries = build(ASSET_TYPES);
  const liabilityEntries = build(LIABILITY_TYPES);
  const assetTotal = assetEntries.reduce((sum, entry) => sum + entry.amount, 0n);
  const liabilityTotal = liabilityEntries.reduce((sum, entry) => sum + entry.amount, 0n);
  const slice = (entry: { type: AccountType; amount: bigint }, total: bigint) => ({
    key: entry.type,
    label: accountLabels[entry.type] || entry.type,
    amount: decimal(entry.amount),
    percent: percentOf(entry.amount, total),
  });
  return {
    assets: assetEntries
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
      .map((entry) => slice(entry, assetTotal)),
    liabilities: liabilityEntries
      .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
      .map((entry) => slice(entry, liabilityTotal)),
    assetTotal: decimal(assetTotal),
    liabilityTotal: decimal(liabilityTotal),
    excludedCurrencies: [...excluded].sort(),
  };
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatCompactAmount(value: string, currency: Currency = 'CNY'): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const english = useUI.getState().language === 'en';
  const symbol =
    currency === 'CNY'
      ? english
        ? 'CN¥'
        : '¥'
      : currency === 'USD'
        ? '$'
        : currency === 'HKD'
          ? 'HK$'
          : currency;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 100000000)
    return `${sign}${symbol}${(abs / 100000000).toFixed(2)}${english ? 'B' : '亿'}`;
  if (abs >= 10000)
    return `${sign}${symbol}${(abs / 10000).toFixed(2)}${english ? 'K' : '万'}`;
  return `${sign}${symbol}${abs.toFixed(2)}`;
}

export function formatRangeLabel(range: RangeKey): string {
  return rangeOf(range).label;
}
