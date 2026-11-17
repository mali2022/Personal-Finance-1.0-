import { expect, it } from 'vitest';
import { suggestImportMapping } from '../features/imports/mapping';
it('maps wallet headers without confusing business type with the money direction', () => {
  const mapping = suggestImportMapping([
    '交易时间',
    '交易类型',
    '交易对方',
    '商品',
    '收/支',
    '金额（元）',
    '支付方式',
    '当前状态',
    '交易单号',
    '商户单号',
    '备注',
  ]);
  expect(mapping.type).toBe('收/支');
  expect(mapping.amount).toBe('金额（元）');
  expect(mapping.merchant).toBe('交易对方');
  expect(mapping.externalId).toBe('交易单号');
  expect(mapping.status).toBe('当前状态');
});
it('normalizes header width and whitespace while preserving exact source names and leaving unknown values unmapped', () => {
  const mapping = suggestImportMapping([
    ' 交易 日期 ',
    ' 金额（元） ',
    ' 对方户名 ',
    'ＳＴＡＴＵＳ',
  ]);
  expect(mapping.occurredAt).toBe(' 交易 日期 ');
  expect(mapping.amount).toBe(' 金额（元） ');
  expect(mapping.status).toBe('ＳＴＡＴＵＳ');
  expect(mapping.type).toBe('');
  expect(mapping.toAccount).toBe('');
});
