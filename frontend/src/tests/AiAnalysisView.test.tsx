import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AiAnalysisView } from '../components/ai/AiAnalysisView';
import { AiMarkdown } from '../components/ai/AiMarkdown';
import type { AiAnswer } from '../api/ai';
import { useUI } from '../stores/ui';
vi.mock('../components/Chart', () => ({ default: ({ option }: { option: unknown }) => <div aria-label="数据图表">{JSON.stringify(option)}</div> }));
const result: AiAnswer = {
  conversationId: 'c', answer: '历史兼容正文', model: 'synthetic', financialDataVerified: false,
  sources: [{ tool: 'GetIncomeExpenseSummary', start: '2026-10-01', end: '2026-10-28', currency: 'CNY', scope: '原币；退款冲减费用', source: 'FinanceService.Report', detailLink: '/reports', queriedAt: '2026-10-28T00:00:00Z', data: { income: '10000.00', expense: '3100.00' }, truncated: false }],
  analysis: { schemaVersion: 1, reportTitle: '月度财务分析', reportType: 'monthly', reportingPeriod: '2026-10-01 — 2026-10-28', generatedAt: '2026-10-28T00:00:00Z', dataAsOf: '2026-10-28T00:00:00Z', currency: 'CNY', executiveSummary: '本期数据截至今天。',
    keyMetrics: [{ key: 'expense', label: '支出', value: '3100.00', currency: 'CNY', evidenceId: 'e0' }],
    insights: [{ title: '大额支出影响', text: '**需要核对用途**，不能仅凭金额判断一次性。', status: 'unverified', evidenceIds: ['e0'] }], anomalies: [], recommendations: [],
    categoryBreakdown: [{ id: 'category', label: '车辆', amount: '3100.00', evidenceId: 'e0' }], trendSeries: [{ label: '9月', income: '9000.00', expense: '5000.00' }, { label: '10月', income: '10000.00', expense: '3100.00' }],
    confidence: 'partial', limitations: ['本月尚未结束。'], followUpActions: [{ label: '剔除最大交易', prompt: '排除最大一笔支出后呢？' }],
  },
};
beforeEach(() => useUI.setState({ hidden: false, language: 'zh-CN' }));
afterEach(cleanup);
function show(value = result, follow = vi.fn()) { render(<MemoryRouter><AiAnalysisView result={value} onFollowUp={follow} /></MemoryRouter>); return follow; }
describe('shared AI report renderer', () => {
  it('renders structured amounts, safe findings and charts; evidence starts collapsed', async () => {
    show();
    expect(screen.getByRole('heading', { name: '月度财务分析' })).toBeInTheDocument();
    expect(screen.getByText(/3,100\.00/)).toBeInTheDocument();
    expect(screen.getByText('需要核对用途').tagName).toBe('STRONG');
    expect(screen.getByText('尚未核实的解释')).toBeInTheDocument();
    expect(screen.getAllByLabelText('数据图表')).toHaveLength(2);
    expect(screen.queryByText('原币；退款冲减费用')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看依据' }));
    expect(await screen.findByText('GetIncomeExpenseSummary')).toBeInTheDocument();
  });
  it('continues with the existing reporting period and currency', () => {
    const follow = show(); fireEvent.click(screen.getByRole('button', { name: '剔除最大交易' }));
    expect(follow).toHaveBeenCalledWith(expect.stringContaining('2026-10-28 CNY。排除最大一笔支出后呢？'));
  });
  it('hides report details and charts under privacy mode', () => {
    useUI.setState({ hidden: true }); show();
    expect(screen.queryByText('大额支出影响')).not.toBeInTheDocument(); expect(screen.queryByLabelText('数据图表')).not.toBeInTheDocument();
  });
  it('renders legacy markdown headings, emphasis, tables, quotes and code', () => {
    render(<AiMarkdown text={'## 财务结论\n\n**重点**与*说明*\n\n| 指标 | 金额 |\n|---|---:|\n| 收入 | 100 |\n\n> 统计范围\n\n```text\nexample\n```'} />);
    expect(screen.getByRole('heading', { name: '财务结论' })).toBeInTheDocument(); expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('重点').tagName).toBe('STRONG'); expect(screen.getByText('说明').tagName).toBe('EM');
  });
  it('disables raw HTML, unsafe URLs and third-party image fetching', () => {
    const view = render(<AiMarkdown text={'<script>window.hacked=1</script>\n\n<img src=x onerror=alert(1)>\n\n[危险](javascript:alert(1))\n\n![不能自动上传或请求](https://third-party.test/tracking.png)\n\n[依据](/reports)'} />);
    expect(view.container.querySelector('script, img, iframe')).toBeNull(); expect(view.container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(screen.getByRole('link', { name: '依据' })).toHaveAttribute('href', '/reports');
  });
  it('supports bounded math without enabling trusted HTML commands', () => {
    const view = render(<AiMarkdown text={'净额：$100-38=62$。'} />);
    expect(view.container.querySelector('.katex')).not.toBeNull(); expect(view.container.querySelector('script')).toBeNull();
  });
  it('falls back to historical messages without requiring a structured schema', () => {
    show({ ...result, analysis: undefined, answer: '## 历史报告\n\n**保存的快照**' });
    expect(screen.getByRole('heading', { name: '历史报告' })).toBeInTheDocument();
  });
});
