import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportAi } from '../features/financialReports/ReportAi';
import { aiApi, type AiSettings, type AiAnswer } from '../api/ai';
import type { FinancialReport } from '../api/financialReports';
import fixture from './fixtures/financial-report.json';
import { useUI } from '../stores/ui';
vi.mock('../api/ai', () => ({ aiApi: { settings: vi.fn(), chat: vi.fn() } }));
vi.mock('../components/AiEvidenceCards', () => ({
  AiEvidenceCards: () => <div>查询依据</div>,
}));
const settings = {
  enabled: true,
  configured: true,
  privacy: { enabled: true, allowSummary: true },
} as AiSettings;
const result = {
  conversationId: 'report-chat',
  answer: '本期结余需结合记录完整性判断。',
  sources: [],
  financialDataVerified: false,
  model: 'test',
} as AiAnswer;
beforeEach(() => {
  vi.mocked(aiApi.settings).mockResolvedValue(settings);
  vi.mocked(aiApi.chat).mockResolvedValue(result);
  useUI.setState({ hidden: false, language: 'zh-CN' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const mount = (auto = false) =>
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ReportAi report={fixture as FinancialReport} auto={auto} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
describe('报告 DeepSeek 授权与问答', () => {
  it('默认不自动请求模型，点击生成后包含期间币种及只读约束', async () => {
    mount();
    const button = await screen.findByRole('button', {
      name: '生成月度 / 年度 AI 总结',
    });
    await waitFor(() => expect(button).toBeEnabled());
    expect(aiApi.chat).not.toHaveBeenCalled();
    fireEvent.click(button);
    await screen.findByText(result.answer);
    expect(aiApi.chat).toHaveBeenCalledWith(
      expect.stringContaining('CNY'),
      undefined,
      expect.any(AbortSignal),
      expect.any(Function),
      undefined,
      undefined,
      false,
    );
    expect(vi.mocked(aiApi.chat).mock.calls[0][0]).toContain(
      '下一期预算只建议',
    );
    expect(
      screen.getByText('未取得充分账本验证，请勿作为已确认财务结论'),
    ).toBeInTheDocument();
  });
  it('自动生成也必须已有财务汇总授权', async () => {
    vi.mocked(aiApi.settings).mockResolvedValue({
      ...settings,
      privacy: { ...settings.privacy, allowSummary: false },
    });
    mount(true);
    await screen.findByText('请先在 AI 设置中启用服务并授权财务汇总。');
    expect(aiApi.chat).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: '生成月度 / 年度 AI 总结' }),
    ).toBeDisabled();
  });
  it('授权后自动生成，追问复用报告会话', async () => {
    vi.mocked(aiApi.settings).mockResolvedValue({
      ...settings,
      privacy: { ...settings.privacy, saveHistory: true },
    });
    mount(true);
    await screen.findByText(result.answer);
    expect(aiApi.chat).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiApi.chat).mock.calls[0][6]).toBe(true);
    fireEvent.change(screen.getByLabelText('财务报告问题'), {
      target: { value: '收入是否稳定？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '询问报告' }));
    await waitFor(() => expect(aiApi.chat).toHaveBeenCalledTimes(2));
    expect(vi.mocked(aiApi.chat).mock.calls[1][1]).toBe('report-chat');
    expect(vi.mocked(aiApi.chat).mock.calls[1][6]).toBe(false);
  });
  it('隐私模式阻止自动生成', async () => {
    useUI.setState({ hidden: true });
    mount(true);
    await screen.findByText('金额隐藏时暂停 AI 分析');
    expect(aiApi.chat).not.toHaveBeenCalled();
  });
});

