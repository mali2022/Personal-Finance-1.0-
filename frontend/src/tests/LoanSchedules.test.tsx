import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import LoanSchedulesPage from '../pages/LoanSchedulesPage';
import { apiClient } from '../api/client';
import { activeNavigation } from '../design/navigation';
import { useUI } from '../stores/ui';
vi.mock('../api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), request: vi.fn() },
}));
const plan = {
  id: 'plan',
  version: '3',
  input: {
    name: '测试借款',
    principal: '1000',
    borrowDate: '2026-01-01',
    firstDate: '2026-02-01',
    periods: 1,
    annualRate: 6,
    overdueDailyRate: 0.05,
    mode: 'InterestOnly',
    overrides: [],
    note: '',
  },
};
const row = {
  sequence: 1,
  date: '2026-02-01',
  principal: 1000,
  interest: 5,
  overdueInterest: 10,
  total: 1015,
  remainingPrincipal: 0,
  overdueDays: 20,
  status: '逾期',
};
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ hidden: false, language: 'zh-CN' });
  vi.mocked(apiClient.get).mockImplementation(
    async (url) =>
      ({
        data: {
          data: String(url).endsWith('/plan')
            ? { ...plan, schedule: [row] }
            : [plan],
        },
      }) as never,
  );
  vi.mocked(apiClient.post).mockResolvedValue({ data: { data: [row] } });
  vi.mocked(apiClient.request).mockResolvedValue({
    data: { data: { id: 'plan', version: '4' } },
  });
});
afterEach(cleanup);
function show() {
  render(
    <App>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <LoanSchedulesPage />
      </QueryClientProvider>
    </App>,
  );
}
it('belongs to special finances and preserves zero overrides when saving an existing plan', async () => {
  expect(activeNavigation('/loan-schedules')?.group).toBe('special');
  show();
  fireEvent.click(await screen.findByText('查看 / 修改'));
  fireEvent.click(await screen.findByText('修改金额'));
  fireEvent.change(screen.getByLabelText('利息（元）'), {
    target: { value: '0' },
  });
  fireEvent.change(screen.getByLabelText('逾期利息（元）'), {
    target: { value: '2.50' },
  });
  fireEvent.click(screen.getByText('应用修改'));
  await waitFor(() =>
    expect(apiClient.post).toHaveBeenCalledWith(
      '/loan-schedules/preview',
      expect.objectContaining({
        overrides: [
          expect.objectContaining({
            sequence: 1,
            principal: null,
            interest: '0',
            overdueInterest: '2.50',
          }),
        ],
      }),
    ),
  );
  fireEvent.click(screen.getByText('保存计划'));
  await waitFor(() =>
    expect(apiClient.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'put',
        url: '/loan-schedules/plan',
        headers: expect.objectContaining({ 'If-Match': '3' }),
        data: expect.objectContaining({
          overrides: [
            expect.objectContaining({ interest: '0', overdueInterest: '2.50' }),
          ],
        }),
      }),
    ),
  );
});
it('keeps the editor open with entered amounts after a failed save', async () => {
  vi.mocked(apiClient.request).mockRejectedValue({
    message: '数据已更新，请重新加载',
  });
  show();
  fireEvent.click(await screen.findByText('查看 / 修改'));
  await screen.findByText('修改金额');
  fireEvent.click(screen.getByText('保存计划'));
  expect(await screen.findByText('数据已更新，请重新加载')).toBeVisible();
  expect(screen.getByDisplayValue('测试借款')).toBeVisible();
});
