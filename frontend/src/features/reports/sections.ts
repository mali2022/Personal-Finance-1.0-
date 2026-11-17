export const reportAnalysisSections = [
  { id: 'comparison', path: '/reports/comparison', title: '期间对比' },
  { id: 'periods', path: '/reports/periods', title: '月报与年报' },
  { id: 'structure', path: '/reports/structure', title: '收支结构' },
  { id: 'net-worth', path: '/reports/net-worth', title: '资产负债归因' },
  { id: 'metrics', path: '/reports/metrics', title: '指标说明' },
  { id: 'debt-pressure', path: '/reports/debt-pressure', title: '债务压力' },
  { id: 'health', path: '/reports/health', title: '财务健康' },
] as const;
export type ReportAnalysisSection =
  (typeof reportAnalysisSections)[number]['id'];
