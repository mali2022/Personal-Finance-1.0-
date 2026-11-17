import { CURRENCY_CODES } from '../constants/currencies';
import { parseCsv } from './valuationCsv';
export type TemplateKind =
  'merchants' | 'projects' | 'assets' | 'prices' | 'loans';
const definitions = {
  merchants: {
    path: '/directory/merchants',
    headers: ['name', 'currency', 'status', 'categoryId'],
    example: ['示例商户', 'CNY', 'Active', ''],
  },
  projects: {
    path: '/directory/projects',
    headers: ['name', 'currency', 'budget', 'startDate', 'endDate', 'status'],
    example: [
      '示例项目',
      'CNY',
      '1000.00',
      '2026-10-01',
      '2026-12-31',
      'Active',
    ],
  },
  assets: {
    path: '/investments/assets',
    headers: [
      'name',
      'type',
      'code',
      'market',
      'currency',
      'accountId',
      'unit',
      'state',
      'note',
    ],
    example: [
      '示例基金',
      'Fund',
      '000001',
      'CN',
      'CNY',
      '请填写投资账户名称',
      '份',
      'Active',
      '',
    ],
  },
  prices: {
    path: '/product-prices',
    headers: [
      'product',
      'brand',
      'specification',
      'quantity',
      'unit',
      'currency',
      'date',
      'amount',
      'priceKind',
      'source',
      'merchant',
    ],
    example: [
      '示例商品',
      '',
      '500g',
      '1',
      '件',
      'CNY',
      '2026-10-18',
      '10.00',
      'Paid',
      '手动采集',
      '',
    ],
  },
  loans: {
    path: '/business',
    headers: [
      'kind',
      'counterparty',
      'accountId',
      'amount',
      'occurredAt',
      'note',
    ],
    example: [
      'Lent',
      '示例对象',
      '请填写资金账户名称',
      '100.00',
      '2026-10-18T12:00:00+08:00',
      '',
    ],
  },
};
export const templateDefinition = (kind: TemplateKind) => definitions[kind];
const dateValid = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export function parseTemplate(
  kind: TemplateKind,
  text: string,
): Record<string, unknown>[] {
  const rows = parseCsv(text);
  const { headers } = definitions[kind];
  if (
    rows.length < 2 ||
    rows.length > 201 ||
    rows[0].map((x) => x.trim()).join(',') !== headers.join(',')
  )
    throw new Error('请使用本页模板，填写 1—200 行，保留原表头。');
  const seen = new Set<string>();
  return rows.slice(1).map((cells, index) => {
    const fail = (reason: string): never => {
      throw new Error(`第 ${index + 2} 行：${reason}`);
    };
    if (cells.length !== headers.length) fail('列数与模板不符');
    const row = Object.fromEntries(headers.map((h, i) => [h, cells[i].trim()]));
    const optional = [
      'categoryId',
      'startDate',
      'endDate',
      'code',
      'market',
      'note',
      'brand',
      'merchant',
    ];
    for (const h of headers)
      if (!optional.includes(h) && !row[h]) fail(`${h} 不能为空`);
    if (row.currency && !CURRENCY_CODES.includes(row.currency))
      fail('currency 须为支持的币种代码');
    for (const h of ['budget', 'amount', 'quantity'])
      if (
        row[h] !== undefined &&
        (!/^\d{1,12}(\.\d{1,2})?$/.test(row[h]) ||
          (h !== 'budget' && Number(row[h]) <= 0))
      )
        fail(`${h} 须为有效金额或数量（大于 0，最多两位小数；预算可为 0）`);
    for (const h of ['startDate', 'endDate', 'date'])
      if (row[h] && !dateValid(row[h])) fail(`${h} 日期无效，应为 YYYY-MM-DD`);
    if (row.startDate && row.endDate && row.startDate > row.endDate)
      fail('结束日期不能早于开始日期');
    if (
      row.status &&
      !(
        kind === 'projects'
          ? ['Active', 'Disabled', 'Completed']
          : ['Active', 'Disabled']
      ).includes(row.status)
    )
      fail('status 无效');
    if (
      kind === 'assets' &&
      (![
        'Stock',
        'ETF',
        'Fund',
        'Bond',
        'Gold',
        'CashManagement',
        'Wealth',
        'Other',
      ].includes(row.type) ||
        !['Active', 'Archived'].includes(row.state))
    )
      fail('type 或 state 无效');
    if (kind === 'prices' && !['Paid', 'Listed'].includes(row.priceKind))
      fail('priceKind 仅支持 Paid / Listed');
    if (
      kind === 'loans' &&
      (!['Lent', 'Borrowed'].includes(row.kind) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(
          row.occurredAt,
        ) ||
        !Number.isFinite(Date.parse(row.occurredAt)) ||
        !dateValid(row.occurredAt.slice(0, 10)))
    )
      fail('kind 应为 Lent / Borrowed，occurredAt 须包含日期、时间及时区');
    const signature = JSON.stringify(row);
    if (seen.has(signature)) fail('文件内存在完全重复行');
    seen.add(signature);
    const body: Record<string, unknown> = { ...row };
    for (const h of optional) if (body[h] === '') delete body[h];
    if (kind === 'loans') body.note = row.note || '';
    if (kind === 'assets')
      for (const h of ['code', 'market', 'note']) body[h] = row[h] || '';
    if (kind === 'projects' || kind === 'merchants')
      Object.assign(body, {
        kind,
        budget: row.budget || '0',
        spent: '0',
        transactionCount: 0,
        version: '0',
        id: '',
      });
    return body;
  });
}
import type { Account, Category } from '../types';
import { categoryActive, categoryLabel } from './categories';
export function resolveTemplateReferences(
  kind: TemplateKind,
  rows: Record<string, unknown>[],
  accounts: Account[],
  categories: Category[],
) {
  return rows.map((body, index) => {
    const row = { ...body };
    const fail = (reason: string): never => {
      throw new Error(`第 ${index + 2} 行：${reason}`);
    };
    if (row.accountId) {
      const value = String(row.accountId);
      const matches = accounts.filter((a) => a.id === value);
      const candidates = matches.length
        ? matches
        : accounts.filter((a) => a.name === value || a.accountCode === value);
      if (candidates.length !== 1)
        fail('账户不存在或名称不唯一，请填写唯一账户名称、编号或 ID');
      const account = candidates[0];
      if (
        account.status !== 'Active' ||
        (kind === 'assets'
          ? account.type !== 'Investment'
          : ['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(
              account.type,
            ))
      )
        fail('账户状态或类型不适用于此导入');
      if (kind === 'assets' && account.currency !== row.currency)
        fail('投资资产币种必须与投资账户币种一致');
      row.accountId = account.id;
    }
    if (row.categoryId) {
      const value = String(row.categoryId);
      const exact = categories.filter((c) => c.id === value);
      const matches = exact.length
        ? exact
        : categories.filter(
            (c) =>
              c.name === value || categoryLabel(categories, c.id) === value,
          );
      if (matches.length !== 1 || !categoryActive(categories, matches[0].id))
        fail('分类不存在、已停用或名称不唯一，请填写完整分类路径或 ID');
      row.categoryId = matches[0].id;
    }
    return row;
  });
}
