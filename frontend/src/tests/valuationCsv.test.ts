import { describe, expect, it } from 'vitest';
import { parseValuationCsv } from '../utils/valuationCsv';
describe('估值CSV精确导入', () => {
  it('保留8位价格及引用来源', () => {
    expect(
      parseValuationCsv(
        '\uFEFFassetId,date,price,source\r\na,2026-01-01,0.12345678,"银行,手动"\r\n',
      ),
    ).toEqual([
      {
        assetId: 'a',
        date: '2026-01-01',
        price: '0.12345678',
        source: '银行,手动',
      },
    ]);
  });
  it('拒绝超精度及畸形文件', () => {
    for (const text of [
      'assetId,date,price,source\na,2026-01-01,1.123456789,x',
      'assetId,date,price,source\na,2026-01-01,1e5,x',
      'assetId,date,price,source\na,2026-01-01,1,"x',
      'wrong\na,2026-01-01,1,x',
    ])
      expect(() => parseValuationCsv(text)).toThrow();
  });
});
