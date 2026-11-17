import type { FinancialReport } from '../../api/financialReports';
import { saveBlob } from '../../utils/download';
export function reportCsv(report: FinancialReport) {
  const r = report;
  const rows: (string | number | null)[][] = [
    ['财务报告', r.selection.mode, r.selection.period, r.selection.currency],
    ['生成时间', r.generatedAt],
    ['截止时间', r.endExclusive],
    ['统计口径', r.coverage],
    ['收入', r.metrics.income],
    ['支出', r.metrics.expense],
    ['结余', r.metrics.surplus],
    ['结余率%', r.metrics.savingsRate],
    ['日均消费', r.metrics.dailyExpense],
    ['消费次数', r.metrics.expenseCount],
    ['日期', '收入', '支出', '累计收入', '累计支出', '推算净资产'],
    ...r.points.map((p) => [
      p.period,
      p.income,
      p.expense,
      p.cumulativeIncome,
      p.cumulativeExpense,
      p.netWorth,
    ]),
    ['分类（父子不可相加）', 'ID', '父ID', '金额'],
    ...r.categories.map((c) => [c.name, c.id, c.parentId, c.amount]),
    ['商户', '金额'],
    ...r.merchants.map((m) => [m.name, m.amount]),
    ['标签（重叠不可相加）', '金额'],
    ...r.tags.map((t) => [t.name, t.amount]),
    ['账户', '收入', '支出', '推算期初', '推算期末'],
    ...r.accounts.map((a) => [
      a.name,
      a.income,
      a.expense,
      a.opening,
      a.closing,
    ]),
  ];
  if(r.investmentReturns){rows.push(['投资收益率',r.investmentReturns.start,r.investmentReturns.end,r.investmentReturns.currency],['资产ID','年化XIRR百分数','期间总收益','状态']);for(const item of r.investmentReturns.items)rows.push([item.id,item.xirr.status==='Success'&&item.xirr.rate!==null?item.xirr.rate*100:null,item.amounts.reportTotalProfit,item.xirr.status]);}
  return (
    '\ufeff' +
    rows
      .map((row) =>
        row
          .map(
            (value) =>
              '"' +
              String(value ?? '不适用')
                .replace(/^[\s]*[=+@\-\t\r]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(','),
      )
      .join('\r\n')
  );
}
export function downloadReport(
  report: FinancialReport,
  format: 'csv' | 'json',
) {
  saveBlob(
    new Blob(
      [format === 'csv' ? reportCsv(report) : JSON.stringify(report, null, 2)],
      {
        type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
      },
    ),
    `financial-report-${report.selection.period}-${report.selection.currency}.${format}`,
  );
}
export async function storyImage(
  report: FinancialReport,
  redacted: boolean,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 2500;
  const c = canvas.getContext('2d')!;
  const bg = c.createLinearGradient(0, 0, 1080, 2500);
  bg.addColorStop(0, '#101c3b');
  bg.addColorStop(1, '#243676');
  c.fillStyle = bg;
  c.fillRect(0, 0, 1080, 2500);
  c.fillStyle = '#a8c3ff';
  c.font = '28px sans-serif';
  c.fillText('PERSONAL FINANCE · FINANCIAL REPORTS', 72, 110);
  c.fillStyle = '#ffffff';
  c.font = 'bold 68px sans-serif';
  c.fillText(`${report.selection.period} 财务故事`, 72, 230);
  c.font = '30px sans-serif';
  c.fillText(
    `${report.selection.currency} · ${report.isPeriodClosed ? '已结束期间' : '截至 ' + report.endExclusive.slice(0, 10)}`,
    72,
    300,
  );
  const rows = [
    ['收入', report.metrics.income],
    ['支出', report.metrics.expense],
    ['结余', report.metrics.surplus],
    [
      '结余率',
      report.metrics.savingsRate === null
        ? '不适用'
        : report.metrics.savingsRate + '%',
    ],
    ['消费次数', String(report.metrics.expenseCount)],
    ['日均消费', report.metrics.dailyExpense],
    ['推算净资产变化', report.netWorth.change],
  ];
  rows.forEach(([name, value], i) => {
    const y = 450 + i * 230;
    c.fillStyle = '#bdcaff';
    c.font = '32px sans-serif';
    c.fillText(name, 72, y);
    c.fillStyle = '#ffffff';
    c.font = 'bold 58px sans-serif';
    c.fillText(redacted ? '••••' : value, 72, y + 90);
  });
  c.fillStyle = '#bdcaff';
  c.font = '26px sans-serif';
  [
    '源自已记录账本 · 不合并外币',
    '历史资产为推算，不代表可信历史估值',
    '仅分享统计摘要，不含商户、标签及交易明细',
    redacted ? '金额与消费次数已隐藏' : '含财务金额，请仅向信任的人分享',
    '生成于 ' + report.generatedAt.slice(0, 10),
  ].forEach((line, i) => c.fillText(line, 72, 2200 + i * 44));
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error('图片生成失败'))),
      'image/png',
    ),
  );
}
