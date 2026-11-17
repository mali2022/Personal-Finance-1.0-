import type { ImportMapping } from '../../types';
export function suggestImportMapping(headers: string[]): ImportMapping {
  const normalize = (s: string) =>
    s.normalize('NFKC').replace(/\s/g, '').toLowerCase();
  const find = (...names: string[]) => {
    for (const name of names) {
      const header = headers.find((h) => normalize(h) === normalize(name));
      if (header) return header;
    }
    return '';
  };
  return {
    occurredAt: find(
      '日期时间',
      '交易时间',
      '交易日期',
      '记账时间',
      '记账日期',
      '消费时间',
      '日期',
      '时间',
      'occurredAt',
      'date',
    ),
    amount: find(
      '金额',
      '金额(元)',
      '交易金额',
      '收支金额',
      '转账本金',
      'amount',
    ),
    type: find('收/支', '收支类型', '收支方向', '交易类型', '类型', 'type'),
    account: find('转出账户', '资金账户', '付款账户', '账户', 'account'),
    toAccount: find('转入账户', '收款账户', 'toAccount'),
    currency: find('币种', '交易币种', 'currency'),
    fee: find('手续费', 'fee'),
    feeCategory: find('手续费分类', 'feeCategory'),
    receivedAmount: find('到账金额', 'receivedAmount'),
    exchangeRate: find('汇率', 'exchangeRate'),
    merchant: find(
      '商户',
      '商户/对象',
      '交易对方',
      '对方名称',
      '对方户名',
      '收付款对象',
      'merchant',
    ),
    productName: find('商品', '商品名称', '商品名', '商品说明', 'productName'),
    category2: find('二级分类', 'category2'),
    category3: find('三级分类', '三级分类（可空）', 'category3'),
    discountAmount: find('优惠金额', 'discountAmount'),
    note: find('备注', '备注/商品', '交易摘要', '摘要', 'note'),
    category: find('分类', 'category'),
    externalId: find(
      '订单/流水号',
      '交易单号',
      '交易号',
      '银行流水号',
      '流水号',
      'externalId',
      'reference',
    ),
    status: find('交易状态', '当前状态', '支付状态', 'status'),
    postedAt: find('入账日期', '银行入账日期', 'postedAt'),
    counterpartyAccount: find(
      '对方账号',
      '对方账户号码',
      'counterpartyAccount',
    ),
    paymentSource: find('付款来源', '支付渠道', 'paymentSource'),
    statementDirection: find('流水方向', '借贷方向', 'statementDirection'),
  };
}

export const standardIncomeExpenseHeaders = (headers: string[]) =>
  headers.includes('二级分类') &&
  headers.includes('优惠金额') &&
  (headers.includes('商品') || headers.includes('商品名称'));
