import { describe, expect, it } from 'vitest';
import { reportCsv } from '../features/financialReports/export';
import type { FinancialReport } from '../api/financialReports';
import fixture from './fixtures/financial-report.json';
describe('报告导出', () => {
  it('exports investment statuses and leaves unavailable rates blank rather than zero',()=>{
    const r=structuredClone(fixture) as FinancialReport;
    r.investmentReturns={status:'Available',start:'2025-01-01',end:'2025-12-31',currency:'CNY',explanation:'Actual/365',items:[{id:'asset-a',xirr:{status:'ValuationMissing',rate:null},amounts:{reportTotalProfit:null}},{id:'asset-b',xirr:{status:'Success',rate:.1},amounts:{reportTotalProfit:'100.123456789'}}]};
    const csv=reportCsv(r);expect(csv).toContain('ValuationMissing');expect(csv).toContain('100.123456789');expect(csv).toContain('年化XIRR百分数');expect(csv).toContain('"asset-a","不适用","不适用","ValuationMissing"');
  });
  it('UTF-8 CSV保留精确金额与统计口径并转义公式', () => {
    const r = structuredClone(fixture) as FinancialReport;
    r.merchants = [
      { name: '=HYPERLINK("malicious")', amount: '90071992547409.93' },
    ];
    const csv = reportCsv(r);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('90071992547409.93');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(r.coverage);
    expect(csv).toContain('累计收入');
  });
});
