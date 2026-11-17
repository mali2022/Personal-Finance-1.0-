export const financialReportPages = [
  { id: 'home', path: '/financial-reports', title: '财务报告中心' },
  { id: 'monthly', path: '/financial-reports/monthly', title: '月度财务报告' },
  {
    id: 'annual',
    path: '/financial-reports/annual',
    title: '年度专业分析报告',
  },
  { id: 'story', path: '/financial-reports/story', title: '年度财务故事' },
  { id: 'ai', path: '/financial-reports/ai', title: 'AI 财务分析' },
  {
    id: 'archives',
    path: '/financial-reports/archives',
    title: '历史报告归档',
  },
  { id: 'export', path: '/financial-reports/export', title: '报告导出与分享' },
  {
    id: 'preferences',
    path: '/financial-reports/preferences',
    title: '报告偏好设置',
  },
] as const;
export type FinancialReportPage = (typeof financialReportPages)[number]['id'];
export const annualChapters = [
  '年度序章',
  '年度收支',
  '十二个月收支趋势',
  '消费分类结构',
  '消费行为特征',
  '年度商户排行榜',
  '账户资产变化',
  '净资产和负债分析',
  '储蓄及财务目标',
  '年度交易里程碑',
  'AI 年度总结',
  '下一年度财务规划',
];
