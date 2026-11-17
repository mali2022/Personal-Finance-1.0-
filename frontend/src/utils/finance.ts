import { currencySymbol } from '../constants/currencies';
import { CURRENCY_CODES } from '../constants/currencies';
import type {
  Account,
  Currency,
  SplitItem,
  TransactionFilters,
  TransactionType,
} from '../types';
import { transactionLabels } from '../constants/mappings';
import dayjs from 'dayjs';
import { useUI } from '../stores/ui';
import { t } from '../i18n';
export function minor(value: string): bigint {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value))
    throw new Error('金额最多支持两位小数');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  return (
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) *
    (negative ? -1n : 1n)
  );
}
export function decimal(value: bigint): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
export function formatMoney(
  value: string,
  currency: Currency = 'CNY',
  hidden = false,
): string {
  if (hidden)
    return `${currencySymbol(currency)}••••••`;
  const cents = minor(value);
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const integer = cents < 0n ? (whole === 0n ? -0 : -whole) : whole;
  return new Intl.NumberFormat(useUI.getState().language === 'en' ? 'en-US' : 'zh-CN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(integer)
    .map((part) =>
      part.type === 'fraction'
        ? String(abs % 100n).padStart(2, '0')
        : part.value,
    )
    .join('');
}
export function validateTransfer(
  from: string,
  to?: string,
): string | undefined {
  return !to
    ? '请选择转入账户'
    : from === to
      ? '转出与转入账户不能相同'
      : undefined;
}
export function validateRefund(
  amount: string,
  original: string,
  refunded: string,
): string | undefined {
  return minor(amount) <= 0n
    ? '退款金额必须大于 0'
    : minor(amount) > minor(original) - minor(refunded)
      ? '退款金额超过剩余可退款金额'
      : undefined;
}
export function validateSplits(
  amount: string,
  splits: SplitItem[],
): string | undefined {
  const total = minor(amount);
  if (total === 0n)
    return splits.length > 1
      ? t('0 元交易只能有一条拆分')
      : splits.some((s) => minor(s.amount) !== 0n)
        ? '拆分金额必须等于总金额'
        : undefined;
  return splits.some((s) => minor(s.amount) <= 0n)
    ? '每项拆分金额必须大于 0'
    : splits.reduce((sum, s) => sum + minor(s.amount), 0n) !== total
      ? '拆分金额必须等于总金额'
      : undefined;
}
export function formatAccountBalance(account: Account, hidden = false): string {
  const balance = minor(account.balance);
  if (!['CreditCard', 'ConsumerCredit'].includes(account.type))
    return formatMoney(account.balance, account.currency, hidden);
  return `${t(balance > 0n ? '溢缴款 ' : '欠款 ')}${formatMoney(decimal(balance < 0n ? -balance : balance), account.currency, hidden)}`;
}
export function preferredAccount(
  accounts: readonly Account[],
  preferred?: string,
): string | undefined {
  const usable = accounts.filter(
    (a) => a.status === 'Active' && !['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(a.type),
  );
  return (
    usable.find((a) => a.id === preferred) ||
    usable.find((a) => ['Alipay', 'WeChat', 'Cash'].includes(a.type)) ||
    usable[0]
  )?.id;
}
export function readTransactionFilters(params: URLSearchParams): {
  filters: TransactionFilters;
  issues: string[];
} {
  const issues: string[] = [];
  const positive = (key: string, fallback: number, maximum: number) => {
    const raw = params.get(key);
    if (!raw) return fallback;
    const number = Number(raw);
    if (!Number.isSafeInteger(number) || number < 1) {
      issues.push('分页参数无效，已使用默认值');
      return fallback;
    }
    return Math.min(maximum, number);
  };
  const enumValue = <T extends string>(
    key: string,
    values: readonly T[],
  ): T | undefined => {
    const value = params.get(key);
    if (!value) return undefined;
    const found = values.find((item) => item === value);
    if (!found) issues.push('筛选选项无效，已忽略');
    return found;
  };
  const date = (key: string) => {
    const raw = params.get(key);
    if (!raw) return undefined;
    if (
      !/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(raw) ||
      !Number.isFinite(Date.parse(raw))
    ) {
      issues.push('筛选时间无效或缺少时区，已忽略');
      return undefined;
    }
    return new Date(raw).toISOString();
  };
  const amount = (key: string) => {
    const raw = params.get(key);
    if (!raw) return undefined;
    if (!/^\d{1,18}(\.\d{1,2})?$/.test(raw)) {
      issues.push('金额筛选无效，已忽略');
      return undefined;
    }
    return decimal(minor(raw));
  };
  let start = date('start'),
    end = date('end');
  if (
    !start &&
    !end &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') || '')
  ) {
    const month = dayjs(params.get('month') + '-01');
    start = dayjs(`${month.startOf('month').format('YYYY-MM-DD')}T00:00:00+08:00`).toISOString();
    end = dayjs(`${month.endOf('month').format('YYYY-MM-DD')}T23:59:59.999+08:00`).toISOString();
  }
  if (start && end && start > end) {
    issues.push('起止时间顺序有误，已忽略');
    start = end = undefined;
  }
  let min = amount('min'),
    max = amount('max');
  if (min && max && minor(min) > minor(max)) {
    issues.push('最低金额大于最高金额，已忽略');
    min = max = undefined;
  }
  const rawSort = params.get('sort') || 'occurredAt:desc';
  const sortParts = rawSort.split(',');
  const validSort = sortParts.length <= 3 && new Set(sortParts.map(p => p.split(':')[0])).size === sortParts.length && sortParts.every(p => /^(occurredAt|amount|createdAt):(asc|desc)$/.test(p));
  if (!validSort) issues.push('排序参数无效');
  const sort = validSort ? rawSort : 'occurredAt:desc';
  const multi = (key: string) => {
    const raw = params.get(key);
    if (!raw) return undefined;
    let values: string[];
    try {
      const parsed: unknown = key === 'merchants' && raw.startsWith('[') ? JSON.parse(raw) : raw.split(',').map(v=>v.trim());
      if(!Array.isArray(parsed)||parsed.some(v=>typeof v!=='string'))throw new Error('invalid');
      values=parsed;
    }catch{issues.push('多选筛选无效');return undefined;}
    if (raw.length > 12000 || !values.length || values.length > 100 || values.some(v => !v.trim() || v.length > 200)) { issues.push('多选筛选无效'); return undefined; }
    return key==='merchants'?JSON.stringify([...new Set(values)]):[...new Set(values)].join(',');
  };
  const filters: TransactionFilters = {
    accountIds: multi('accountIds'), categoryIds: multi('categoryIds'), merchants: multi('merchants'), projectIds: multi('projectIds'), tagIds: multi('tagIds'),
    source: enumValue('source', ['Imported','Manual','Ai']),
    anomaly: enumValue('anomaly', ['Any','Extreme','Duplicate','Balance','Category','Merchant','Refund','Transfer','Date']),
    reconciliation: enumValue('reconciliation', ['Matched','Unmatched']),
    reviewState: enumValue('reviewState', [
      'Open',
      'Resolved',
      'Ignored',
      'Deferred',
      'All',
    ]),
    currency: enumValue('currency', CURRENCY_CODES),
    page: positive('page', 1, 1000000),
    pageSize: positive('pageSize', 20, 100),
    sort,
    type: enumValue(
      'type',
      Object.keys(transactionLabels) as TransactionType[],
    ),
    transferKind: enumValue('transferKind', ['TopUp', 'Withdrawal']),
    status: enumValue('status', ['Confirmed', 'Deleted', 'NeedsReview']),
    statusFlag: enumValue('statusFlag', ['NeedsReview']),
    keyword: params.get('keyword')?.trim() || undefined,
    merchant: params.get('merchant')?.trim() || undefined,
    importJobId: params.get('importJobId') || undefined,
    accountId: params.get('accountId') || undefined,
    categoryId: params.get('categoryId') || params.get('category') || undefined,
    projectId: params.get('projectId') || undefined,
    tagId: params.get('tagId') || undefined,
    start,
    end,
    min,
    max,
  };
  return { issues: [...new Set(issues)], filters };
}
export function parseFilters(params: URLSearchParams): TransactionFilters {
  return readTransactionFilters(params).filters;
}
export const formatDate = (iso: string, detail = false, seconds = false) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(detail ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    ...(detail && seconds ? { second: '2-digit' } : {}),
  }).format(new Date(iso));

