import { test, expect } from '@playwright/test';
for (const width of [360, 1440]) for (const theme of ['light', 'dark']) test(`AI report, evidence and follow-up at ${width}px ${theme}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  await page.addInitScript(theme => localStorage.setItem('finance-ui', JSON.stringify({ state: { language: 'zh-CN', hidden: false, theme }, version: 0 })), theme);
  const bodies: { conversationId?: string; message: string }[] = [];
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const evidence = { tool: 'GetIncomeExpenseSummary', start: '2026-10-01', end: '2026-10-28', currency: 'CNY', scope: '原币；转账不算支出，退款冲减费用。', source: 'FinanceService.Report', detailLink: '/reports', queriedAt: '2026-10-28T00:00:00Z', data: { income: '10000.00', expense: '3100.00' }, truncated: false };
  const result = { conversationId, model: 'synthetic', financialDataVerified: false, answer: '已完成合成数据分析。', sources: [evidence], analysis: {
    schemaVersion: 1, reportTitle: '月度财务分析', reportType: 'monthly', reportingPeriod: '2026-10-01 — 2026-10-28', generatedAt: '2026-10-28T00:00:00Z', dataAsOf: '2026-10-28T00:00:00Z', currency: 'CNY', executiveSummary: '本月未结束，按上月同期比较。',
    keyMetrics: [{ key: 'expense', label: '支出', value: '3100.00', currency: 'CNY', evidenceId: 'e0' }],
    insights: [{ title: '主要支出贡献', text: '**车辆支出**需要结合用途核对。\n\n| 指标 | 金额 |\n|---|---:|\n| 支出 | 3100.00 |', status: 'supported', evidenceIds: ['e0'] }],
    anomalies: [], recommendations: [], categoryBreakdown: [{ id: 'category', label: '车辆', amount: '3100.00', evidenceId: 'e0' }], trendSeries: [{ label: '9月', income: '9000.00', expense: '5000.00' }, { label: '10月', income: '10000.00', expense: '3100.00' }],
    confidence: 'partial', limitations: ['截至当前更新时点；不能据此证明支出原因。'], followUpActions: [{ label: '剔除最大交易', prompt: '排除最大一笔支出后呢？' }],
  } };
  await page.route(/^http:\/\/127\.0\.0\.1:5194\/api\//, async route => {
    const path = new URL(route.request().url()).pathname.slice(4);
    if (path === '/ai/chat/stream') {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({ contentType: 'text/event-stream', body: `event: progress\ndata: {"stage":"Running","tool":"SearchTransactions"}\n\nevent: completed\ndata: ${JSON.stringify(result)}\n\n` });
    }
    let data: unknown = [];
    if (path === '/auth/me') data = { id: 'ai-ui-test', displayName: '测试', permissions: [] };
    if (path === '/auth/profile') data = { preferredCurrency: 'CNY' };
    if (path === '/ai/settings') data = { enabled: true, configured: true, privacy: { enabled: true, allowSummary: true, allowDetails: true, saveHistory: false } };
    await route.fulfill({ json: { data } });
  });
  await page.goto('/ai/copilot');
  await page.getByLabel('AI 问题或记账描述').fill('分析我本月的财务状况。');
  await page.getByRole('button', { name: '发送问题', exact: true }).click();
  const report = page.getByRole('article', { name: '月度财务分析' }).first();
  await expect(report.getByRole('heading', { name: '月度财务分析' })).toBeVisible();
  await expect(report.getByRole('table')).toBeVisible();
  await expect(report.getByText('车辆支出', { exact: true })).toBeVisible();
  await expect(report.getByText(/3,100\.00/).first()).toBeVisible();
  await report.getByRole('button', { name: '查看依据' }).click();
  await expect(report.getByText('GetIncomeExpenseSummary', { exact: true })).toBeVisible();
  await page.screenshot({ path: `../verification/ai-analysis-${width}-${theme}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await report.getByRole('button', { name: '剔除最大交易' }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1].conversationId).toBe(conversationId); expect(bodies[1].message).toContain('排除最大一笔支出');
});
