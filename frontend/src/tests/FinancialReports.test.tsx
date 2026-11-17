import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FinancialReportsPage from '../pages/FinancialReportsPage';
import {
  financialReportsApi as api,
  type FinancialReport,
} from '../api/financialReports';
import { financialReportPages } from '../features/financialReports/sections';
import fixture from './fixtures/financial-report.json';
import { useUI } from '../stores/ui';
vi.mock('../hooks/useCurrency', () => ({ usePreferredCurrency: () => 'CNY' }));
vi.mock('../components/Chart', () => ({ default: () => <div>专业图表</div> }));
vi.mock('../features/financialReports/ReportAi', () => ({
  ReportAi: () => <div>报告 AI 区域</div>,
}));
vi.mock('../api/financialReports', () => ({
  financialReportsApi: {
    get: vi.fn(),
    snapshot: vi.fn(),
    archives: vi.fn(),
    preferences: vi.fn(),
    archive: vi.fn(),
    remove: vi.fn(),
    savePreferences: vi.fn(),
  },
}));
const pref = {
  currency: 'CNY',
  autoAi: false,
  reducedMotion: false,
  redactSharing: true,
  version: '3',
};
beforeEach(() => {
  vi.mocked(api.get).mockResolvedValue(fixture as FinancialReport);
  vi.mocked(api.snapshot).mockResolvedValue(fixture as FinancialReport);
  vi.mocked(api.preferences).mockResolvedValue(pref);
  vi.mocked(api.archives).mockResolvedValue({ items: [], total: 0 });
  useUI.setState({ hidden: false, language: 'zh-CN' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function mount(
  page: (typeof financialReportPages)[number]['id'],
  entry = '/financial-reports?mode=annual&period=2025&currency=CNY',
) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={cache}>
        <App>
          <FinancialReportsPage page={page} />
        </App>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return cache;
}
describe('Financial Reports 4.1', () => {
  it.each(financialReportPages)('$title 可独立打开', async ({ id, title }) => {
    mount(id);
    expect(
      await screen.findByRole('heading', { name: title }),
    ).toBeInTheDocument();
    if (id === 'archives') await screen.findByText('历史报告快照');
    else if (id === 'preferences') await screen.findByText('保存报告偏好');
    else await screen.findByText('2025 · CNY');
  });
  it('年度报告有十二个章节，三级分类可以下钻', async () => {
    mount('annual');
    await screen.findByText('2025 · CNY');
    for (const title of [
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
    ])
      expect(
        screen.getByText(new RegExp(title), { selector: 'h2.fr-chapter-title' }),
      ).toBeInTheDocument();
    const categories = within(document.getElementById('fr-chapter-3')!);
    fireEvent.click(categories.getByRole('button', { name: '下钻' }));
    await categories.findByText('正餐');
    fireEvent.click(categories.getByRole('button', { name: '下钻' }));
    expect(await categories.findByText('工作午餐')).toBeInTheDocument();
  });
  it('隐私模式不展示金额、商户及导出', async () => {
    useUI.setState({ hidden: true });
    mount('export');
    await screen.findByText(
      '隐私模式已隐藏报告金额、排名及明细；导出、分享与 AI 已暂停。',
    );
    expect(
      screen.queryByRole('button', { name: '导出 CSV' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('示例超市')).not.toBeInTheDocument();
  });
  it('加载失败可重试，不显示虚构指标', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(Error('offline'));
    mount('monthly');
    const retry = await screen.findByRole('button', { name: /重\s*试/ });
    expect(screen.queryByText('120,000.00')).not.toBeInTheDocument();
    fireEvent.click(retry);
    await screen.findByText('2025 · CNY');
  });
  it('故事模式有键盘控制、进度和12章边界', async () => {
    mount('story');
    const story = await screen.findByLabelText(
      '年度故事，方向键翻页，Home首章，End末章',
    );
    expect(screen.getByRole('button', { name: '上一章' })).toBeDisabled();
    fireEvent.keyDown(story, { key: 'End' });
    expect(screen.getByRole('button', { name: '下一章' })).toBeDisabled();
    fireEvent.keyDown(story, { key: 'Home' });
    fireEvent.keyDown(story, { key: 'ArrowRight' });
    expect(screen.getByText('第 2 / 12 章 · 年度收支')).toBeInTheDocument();
  });
  it('历史报告使用快照接口而非重新生成数据', async () => {
    mount('annual', '/financial-reports/annual?snapshot=archived');
    await screen.findByText('2025 · CNY');
    expect(api.snapshot).toHaveBeenCalledWith('archived');
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '保存快照归档' })).toBeDisabled();
  });
  it('偏好保存保留服务器版本，默认分享脱敏', async () => {
    vi.mocked(api.savePreferences).mockResolvedValue({ ...pref, version: '4' });
    mount('preferences');
    await screen.findByText('保存报告偏好');
    fireEvent.click(screen.getByRole('button', { name: '保存报告偏好' }));
    await waitFor(() =>
      expect(api.savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          version: '3',
          redactSharing: true,
          autoAi: false,
        }),
        expect.any(String),
      ),
    );
  });
});
