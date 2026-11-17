import { t as tr, localizedLabels } from '../i18n';
import type { AccountType, TransactionType } from '../types';
export const transactionLabels: Record<TransactionType, string> =
  localizedLabels({
    Expense: '支出',
    Income: '收入',
    RewardReversal: '奖励收入追回',
    Transfer: '转账',
    Refund: '退款',
    CreditCardPayment: '信用卡还款',
    ReimbursementAdvance: '报销垫付',
    ReimbursementReceived: '报销到账',
    LoanGiven: '借出',
    LoanReceived: '借入',
    LoanRepaymentPaid: '偿还借款',
    LoanRepaymentReceived: '收回借款',
    Adjustment: '余额调整',
    AssetLoss: '资产损失',
    InvestmentPrincipal: '投资本金',
  });
export function transactionDisplayLabel(transaction: { type: TransactionType; transferKind?: string | null }) {
  return transaction.type === 'Transfer' && transaction.transferKind === 'TopUp' ? tr('充值')
    : transaction.type === 'Transfer' && transaction.transferKind === 'Withdrawal' ? tr('提现')
    : transactionLabels[transaction.type];
}
export const accountLabels: Record<AccountType, string> = localizedLabels({
  Cash: '现金',
  Bank: '银行卡',
  CreditCard: '信用卡',
  ElectronicWallet: '电子钱包',
  ConsumerCredit: '消费信用',
  ConsumerLoan: '消费贷款',
  SecuredLoan: '抵押/担保贷款',
  Alipay: '支付宝',
  WeChat: '微信支付',
  StoredValue: '储值卡',
  Investment: '投资账户',
  Receivable: '应收账户',
  Payable: '应付账户',
  Other: '其他',
});
export const transactionColors: Partial<Record<TransactionType, string>> = {
  Expense: 'red',
  Income: 'green',
  Transfer: 'blue',
  Refund: 'cyan',
  CreditCardPayment: 'blue',
};
