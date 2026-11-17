import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FinancialInsights } from '../features/dashboard/FinancialInsights';
import { CopilotContext } from '../features/ai/copilotContext';
import { aiApi, type AiSettings, type AiAnswer } from '../api/ai';
import { useUI } from '../stores/ui';
vi.mock('../api/ai', () => ({ aiApi: { settings: vi.fn(), chat: vi.fn() } }));
vi.mock('../components/AiEvidenceCards', () => ({
  AiEvidenceCards: () => <a href="/reports">工具分析依据</a>,
}));
const settings = {
  enabled: true,
  configured: true,
  privacy: { enabled: true, allowSummary: true, allowDetails: true },
} as AiSettings;
const answer = {
  answer: '支出增长主要来自数码设备，单次大额不代表异常。',
  sources: [{ tool: 'GetCategoryReport' }],
  financialDataVerified: true,
} as AiAnswer;
beforeEach(() => {
  useUI.setState({ hidden: false, language: 'zh-CN' });
  vi.mocked(aiApi.settings).mockResolvedValue(settings);
  vi.mocked(aiApi.chat).mockResolvedValue(answer);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  useUI.setState({ hidden: false });
});
function show() {
  const open = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CopilotContext.Provider value={{ open, register: () => () => {} }}>
          <FinancialInsights month="2026-10" />
        </CopilotContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { open, client };
}
it('automatically queries DeepSeek with permitted data, reveals evidence, and opens Copilot', async () => {
  const { open } = show();
  await screen.findByText(answer.answer);
  expect(aiApi.chat).toHaveBeenCalledTimes(1);
  expect(vi.mocked(aiApi.chat).mock.calls[0][0]).toContain('相同已过天数');
  fireEvent.click(screen.getByText('分析依据'));
  expect(
    await screen.findByRole('link', { name: '工具分析依据' }),
  ).toHaveAttribute('href', '/reports');
  fireEvent.click(screen.getByRole('button', { name: '一键追问 AI Copilot' }));
  expect(open).toHaveBeenCalledWith(expect.stringContaining('2026-10'), answer.conversationId);
  fireEvent.click(screen.getByRole('button', { name: '刷新财务洞察' }));
  await waitFor(() => expect(aiApi.chat).toHaveBeenCalledTimes(2));
});
it('does not send automatic AI requests without summary authorization', async () => {
  vi.mocked(aiApi.settings).mockResolvedValue({
    ...settings,
    privacy: { ...settings.privacy, allowSummary: false },
  });
  show();
  await screen.findByRole('link', { name: '配置 AI 与数据授权' });
  expect(aiApi.chat).not.toHaveBeenCalled();
});
it('does not request or reveal financial insights in privacy mode', async () => {
  useUI.setState({ hidden: true });
  show();
  await screen.findByText('隐私模式已隐藏财务洞察');
  expect(aiApi.chat).not.toHaveBeenCalled();
  expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
});
it('shows a retry state after DeepSeek fails and does not retry in the background', async () => {
  vi.mocked(aiApi.chat).mockRejectedValue(new Error('DeepSeek 暂时不可用'));
  show();
  await screen.findByText('DeepSeek 暂时不可用');
  expect(aiApi.chat).toHaveBeenCalledTimes(1);
});
