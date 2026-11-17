import { afterEach, describe, expect, it } from 'vitest';
import { transactionDisplayLabel } from '../constants/mappings';
import { readTransactionFilters } from '../utils/finance';
import { suggestImportMapping } from '../pages/ImportPage';
import { useUI } from '../stores/ui';

afterEach(() => useUI.setState({ language: 'zh-CN' }));
describe('transfer purposes', () => {
  it('keeps accounting type and presents top-ups and withdrawals in both languages', () => {
    expect(transactionDisplayLabel({ type: 'Transfer', transferKind: 'TopUp' })).toBe('充值');
    expect(transactionDisplayLabel({ type: 'Transfer', transferKind: 'Withdrawal' })).toBe('提现');
    expect(transactionDisplayLabel({ type: 'Transfer' })).toBe('转账');
    expect(transactionDisplayLabel({ type: 'Expense', transferKind: 'TopUp' })).toBe('支出');
    useUI.setState({ language: 'en' });
    expect(transactionDisplayLabel({ type: 'Transfer', transferKind: 'TopUp' })).toBe('Top-up');
    expect(transactionDisplayLabel({ type: 'Transfer', transferKind: 'Withdrawal' })).toBe('Withdrawal');
  });
  it('retains authorized presentation filters without adding backend transaction types', () => {
    const { filters } = readTransactionFilters(new URLSearchParams('type=Transfer&transferKind=Withdrawal'));
    expect(filters).toMatchObject({ type: 'Transfer', transferKind: 'Withdrawal' });
    expect(readTransactionFilters(new URLSearchParams('transferKind=invalid')).filters.transferKind).toBeUndefined();
  });
  it('maps principal, fees, both accounts and FX to distinct template columns', () => {
    const mapping = suggestImportMapping(['日期时间', '交易类型', '转出账户', '转入账户', '金额', '币种', '手续费', '手续费分类', '到账金额', '汇率', '订单/流水号', '备注']);
    expect(mapping).toMatchObject({ amount: '金额', account: '转出账户', toAccount: '转入账户', fee: '手续费', feeCategory: '手续费分类', receivedAmount: '到账金额', exchangeRate: '汇率' });
    const columns = Object.values(mapping).filter(Boolean);
    expect(new Set(columns).size).toBe(columns.length);
  });
});
