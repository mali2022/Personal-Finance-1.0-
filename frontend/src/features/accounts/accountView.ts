import type { Account } from '../../types';
import { minor, decimal } from '../../utils/finance';
export const accountNature = (a: Account) =>
  [
    'CreditCard',
    'ConsumerCredit',
    'ConsumerLoan',
    'SecuredLoan',
    'Payable',
  ].includes(a.type)
    ? 'liability'
    : 'asset';
export function balancePresentation(a: Account) {
  const n = minor(a.balance),
    liability = accountNature(a) === 'liability';
  return {
    value: liability ? decimal(n < 0n ? -n : n) : a.balance,
    label: liability
      ? n > 0n
        ? '当前溢缴款'
        : '当前欠款'
      : n < 0n
        ? '异常负余额'
        : '账户余额',
    warning: !liability && n < 0n,
  };
}
export function summarizeAccounts(accounts: Account[]) {
  const codes = [
    ...new Set(['CNY', 'USD', ...accounts.map((a) => a.currency)]),
  ];
  return codes.map((currency) => {
    let assets = 0n,
      debt = 0n,
      net = 0n,
      available = 0n;
    for (const a of accounts.filter((a) => a.currency === currency)) {
      const n = minor(a.balance);
      net += n;
      if (n > 0n) assets += n;
      else debt -= n;
      if (
        a.status === 'Active' &&
        accountNature(a) === 'asset' &&
        !['Receivable', 'Investment'].includes(a.type) &&
        a.availableBalance !== undefined
      )
        available += minor(a.availableBalance);
    }
    return {
      currency,
      assets: decimal(assets),
      debt: decimal(debt),
      net: decimal(net),
      available: decimal(available),
    };
  });
}
export interface AccountFilters {
  search: string;
  nature: string;
  type?: string;
  currency?: string;
  status?: string;
  group?: string;
  sort: string;
  flag?: string;
  hideZero: boolean;
  mode: string;
}
export const defaultFilters: AccountFilters = {
  search: '',
  nature: 'all',
  status: 'main',
  sort: 'custom',
  hideZero: false,
  mode: 'cards',
};
export function filterAccounts(accounts: Account[], f: AccountFilters) {
  const rows = accounts.filter(
    (a) =>
      (f.status === 'main'
        ? a.status !== 'Archived'
        : !f.status || a.status === f.status) &&
      (!f.type || a.type === f.type) &&
      (!f.currency || a.currency === f.currency) &&
      (!f.group || a.groupId === f.group) &&
      (!f.hideZero || minor(a.balance) !== 0n) &&
      (f.nature === 'all' || accountNature(a) === f.nature) &&
      (!f.flag ||
        (f.flag === 'pinned' && a.isPinned) ||
        (f.flag === 'default' && (a.isDefaultIncome || a.isDefaultExpense))) &&
      [a.name, a.alias, a.institution, a.accountCode, a.cardNumber, a.lastFourDigits].some(
        (x) => x?.toLowerCase().includes(f.search.trim().toLowerCase()),
      ),
  );
  if (f.sort !== 'custom')
    rows.sort((a, b) =>
      f.sort === 'name'
        ? a.name.localeCompare(b.name)
        : f.sort === 'type'
          ? a.type.localeCompare(b.type)
          : f.sort === 'created'
            ? String(b.createdAt ?? '').localeCompare(a.createdAt ?? '')
            : f.sort === 'recent'
              ? String(b.lastTransactionAt ?? '').localeCompare(
                  a.lastTransactionAt ?? '',
                )
              : a.currency !== b.currency
                ? a.currency.localeCompare(b.currency)
                : minor(a.balance) === minor(b.balance)
                  ? 0
                  : minor(a.balance) > minor(b.balance)
                    ? -1
                    : 1,
    );
  return rows;
}
