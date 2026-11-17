import type { Account, Category, Transaction } from '../types';
export const accounts: Account[] = [
  {
    id: 'bank',
    name: '招商银行',
    type: 'Bank',
    currency: 'CNY',
    balance: '42680.50',
    institution: '招商银行',
    status: 'Active',
  },
  {
    id: 'alipay',
    name: '支付宝',
    type: 'Alipay',
    currency: 'CNY',
    balance: '3256.80',
    status: 'Active',
  },
  {
    id: 'wechat',
    name: '微信钱包',
    type: 'WeChat',
    currency: 'CNY',
    balance: '860.00',
    status: 'Active',
  },
  {
    id: 'cash',
    name: '随身现金',
    type: 'Cash',
    currency: 'CNY',
    balance: '300.00',
    status: 'Active',
  },
  {
    id: 'credit',
    name: '招商银行信用卡',
    type: 'CreditCard',
    currency: 'CNY',
    balance: '-2180.00',
    creditLimit: '30000.00',
    statementDay: 15,
    paymentDay: 3,
    status: 'Active',
  },
  {
    id: 'usd',
    name: '美元储蓄',
    type: 'Bank',
    currency: 'USD',
    balance: '1200.00',
    status: 'Active',
  },
];
export const categories: Category[] = [
  ['food', '餐饮食品', '', 'Expense'],
  ['lunch', '日常午餐', 'food', 'Expense'],
  ['coffee', '咖啡茶饮', 'food', 'Expense'],
  ['dinner', '聚餐宴请', 'food', 'Expense'],
  ['transport', '交通出行', '', 'Expense'],
  ['metro', '公共交通', 'transport', 'Expense'],
  ['shopping', '购物消费', '', 'Expense'],
  ['daily', '日常用品', 'shopping', 'Expense'],
  ['home', '住房居住', '', 'Expense'],
  ['rent', '房租', 'home', 'Expense'],
  ['other', '其他支出', '', 'Expense'],
  ['unknown', '不明消费', 'other', 'Expense'],
  ['fee', '手续费', 'other', 'Expense'],
  ['salary', '职业收入', '', 'Income'],
  ['wage', '工资薪酬', 'salary', 'Income'],
].map(([id, name, parentId, kind], i) => ({
  id,
  name,
  parentId: parentId || undefined,
  kind: kind as Category['kind'],
  version: '1',
  status: 'Active',
  sortOrder: i,
}));
export const transactions: Transaction[] = Array.from(
  { length: 36 },
  (_, i) => {
    const type =
      i === 0
        ? 'Income'
        : i === 3
          ? 'Transfer'
          : i === 6
            ? 'Refund'
            : i === 9
              ? 'CreditCardPayment'
              : 'Expense';
    return {
      id: `t${i}`,
      type,
      amount:
        i === 0
          ? '18000.00'
          : i === 3
            ? '500.00'
            : i === 6
              ? '30.00'
              : i === 9
                ? '1000.00'
                : String([32, 28.5, 68, 125.8, 15, 220][i % 6]),
      currency: 'CNY',
      accountId:
        i === 0 || i === 3 || i === 9
          ? 'bank'
          : i % 4 === 0
            ? 'credit'
            : 'alipay',
      toAccountId: i === 3 ? 'alipay' : i === 9 ? 'credit' : undefined,
      categoryId:
        type === 'Income'
          ? 'wage'
          : type === 'Expense' || type === 'Refund'
            ? ['lunch', 'coffee', 'daily', 'metro'][i % 4]
            : undefined,
      merchant:
        type === 'Income'
          ? '公司薪资'
          : ['麦当劳', '星巴克', '盒马鲜生', '上海地铁'][i % 4],
      occurredAt: new Date(
        2026,
        9,
        7 - Math.floor(i / 3),
        12,
        i % 60,
      ).toISOString(),
      note: i === 0 ? '十月工资' : i % 3 === 0 ? '工作日午餐' : '',
      tagIds: [],
      status: 'Confirmed',
      originalTransactionId: i === 6 ? 't2' : undefined,
      refundedAmount: i === 2 ? '30.00' : '0.00',
      fee: '0.00',
      splits: [],
      version: '1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },
);
