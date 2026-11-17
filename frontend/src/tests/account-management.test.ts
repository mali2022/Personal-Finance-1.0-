import { describe, it, expect } from 'vitest';
import type { Account } from '../types';
import {
  accountNature,
  balancePresentation,
  filterAccounts,
  defaultFilters,
  summarizeAccounts,
} from '../features/accounts/accountView';
import { parseAccountCsv } from '../features/accounts/AccountToolbar';
const account = (patch: Partial<Account>): Account => ({
  id: 'a',
  name: '储蓄卡',
  type: 'Bank',
  currency: 'CNY',
  balance: '100.00',
  availableBalance: '80.00',
  status: 'Active',
  ...patch,
});
describe('account management financial presentation', () => {
  it('excludes credit limits, separates currencies, deducts holds and includes archived balances', () => {
    const rows = [
      account({}),
      account({
        id: 'b',
        type: 'CreditCard',
        balance: '-30.00',
        creditLimit: '90000',
        availableCredit: '89970',
        availableBalance: '-30.00',
      }),
      account({
        id: 'c',
        currency: 'USD',
        balance: '5.01',
        availableBalance: '4.01',
      }),
      account({ id: 'd', status: 'Archived', balance: '10.00' }),
      account({ id: 'e', type: 'Investment', balance: '20.00' }),
    ];
    expect(summarizeAccounts(rows)).toEqual([
      {
        currency: 'CNY',
        assets: '130.00',
        debt: '30.00',
        net: '100.00',
        available: '80.00',
      },
      {
        currency: 'USD',
        assets: '5.01',
        debt: '0.00',
        net: '5.01',
        available: '4.01',
      },
    ]);
  });
  it('distinguishes normal debt, overpayment, payable and abnormal asset negatives', () => {
    expect(accountNature(account({ type: 'Payable' }))).toBe('liability');
    expect(
      balancePresentation(account({ type: 'CreditCard', balance: '-100.00' })),
    ).toEqual({ value: '100.00', label: '当前欠款', warning: false });
    expect(balancePresentation(account({ type: 'CreditCard' })).label).toBe(
      '当前溢缴款',
    );
    expect(balancePresentation(account({ balance: '-1.00' })).warning).toBe(
      true,
    );
  });
  it('hides zero balances without mutating account status or saved order and searches card suffix', () => {
    const rows = [
        account({ id: 'z', balance: '0.00' }),
        account({ id: 'a', lastFourDigits: '8826' }),
        account({ id: 'b', status: 'Archived' }),
      ],
      before = JSON.stringify(rows);
    expect(
      filterAccounts(rows, { ...defaultFilters, hideZero: true }).map(
        (a) => a.id,
      ),
    ).toEqual(['a']);
    expect(
      filterAccounts(rows, { ...defaultFilters, search: '8826' }).map(
        (a) => a.id,
      ),
    ).toEqual(['a']);
    filterAccounts(rows, { ...defaultFilters, sort: 'name' });
    expect(JSON.stringify(rows)).toBe(before);
  });
});
const header =
  '账户名称,账户类型,币种,开户银行/机构,卡号末四位,银行网点,信用额度,账单日,还款日\r\n';
describe('account CSV validation', () => {
  it('parses quoted institutions and bank metadata without importing financial facts', () => {
    const rows = parseAccountCsv(
      '\uFEFF' + header + '我的卡,Bank,CNY,"银行,支行",1234,网点,,,',
      [],
    );
    expect(rows[0]).toMatchObject({
      name: '我的卡',
      institution: '银行,支行',
      lastFourDigits: '1234',
      bankBranch: '网点',
      status: 'Active',
    });
    expect(rows[0]).not.toHaveProperty('balance');
  });
  it('accepts full card numbers with either CSV header and preserves leading zeros', () => {
    for (const h of [header, header.replace('卡号末四位', '银行卡号')]) {
      expect(
        parseAccountCsv(h + '新卡,Bank,CNY,,0012345678901234567,,,,', [])[0],
      ).toMatchObject({
        cardNumber: '0012345678901234567',
        lastFourDigits: '4567',
      });
    }
  });
  it('rejects duplicate accounts, invalid card numbers and incomplete credit billing', () => {
    expect(() =>
      parseAccountCsv(header + '储蓄卡,Bank,CNY,,,,,,', [account({})]),
    ).toThrow('重复');
    expect(() =>
      parseAccountCsv(header + '新卡,Bank,CNY,,123x567890,,,,', []),
    ).toThrow('4至30位');
    expect(() =>
      parseAccountCsv(header + '信用卡,CreditCard,CNY,,,,5000,,', []),
    ).toThrow('账单日');
  });
});
