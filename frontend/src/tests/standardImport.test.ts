import { expect, it } from 'vitest';
import fs from 'node:fs';
import {
  suggestImportMapping,
  standardIncomeExpenseHeaders,
} from '../features/imports/mapping';
import { parseCsv } from '../utils/valuationCsv';
it('standard CSV contains every requested field and an optional transaction ID', () => {
  const rows = parseCsv(fs.readFileSync('public/import-template.csv', 'utf8'));
  expect(rows[0]).toEqual([
    '日期时间',
    '金额',
    '交易类型',
    '商户',
    '商品',
    '分类',
    '二级分类',
    '三级分类',
    '备注',
    '交易状态',
    '币种',
    '优惠金额',
    '交易单号',
  ]);
  expect(rows.slice(1).every((r) => r.length === rows[0].length)).toBe(true);
  expect(rows.slice(1).map((r) => r[2])).toEqual(['支出', '收入']);
  expect(rows[1][7]).toBe('');
  expect(rows[2][4]).toBe('');
  expect(rows[2][11]).toBe('0');
  const mapping = suggestImportMapping(rows[0]);
  expect(mapping).toMatchObject({
    productName: '商品',
    note: '备注',
    category: '分类',
    category2: '二级分类',
    category3: '三级分类',
    discountAmount: '优惠金额',
    externalId: '交易单号',
  });
  expect(standardIncomeExpenseHeaders(rows[0])).toBe(true);
});
it('legacy note/product columns and transfer templates retain separate mappings', () => {
  const legacy = suggestImportMapping([
    '日期时间',
    '金额',
    '交易类型',
    '商户',
    '备注/商品',
    '分类',
  ]);
  expect(legacy.note).toBe('备注/商品');
  expect(legacy.productName).toBe('');
  const transfer = parseCsv(
    fs.readFileSync('public/transfer-import-template.csv', 'utf8'),
  );
  expect(standardIncomeExpenseHeaders(transfer[0])).toBe(false);
  expect(suggestImportMapping(transfer[0]).toAccount).toBe('转入账户');
  const english = suggestImportMapping([
    'occurredAt',
    'amount',
    'type',
    'productName',
    'category',
    'category2',
    'category3',
    'discountAmount',
    'note',
  ]);
  expect(english.productName).toBe('productName');
  expect(english.note).toBe('note');
  expect(english.discountAmount).toBe('discountAmount');
});
