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
import { StatisticsSettings } from '../features/reports/StatisticsSettings';
import { advancedApi } from '../api/operations';
import { useUI } from '../stores/ui';
vi.mock('../api/operations', () => ({
  advancedApi: {
    rules: vi.fn(),
    rulesHistory: vi.fn(),
    previewRules: vi.fn(),
    saveRules: vi.fn(),
  },
}));
vi.mock('../hooks/useCurrency', () => ({ usePreferredCurrency: () => 'CNY' }));
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ language: 'zh-CN', hidden: false });
  vi.mocked(advancedApi.rules).mockResolvedValue({
    includeFees: true,
    includeAssetLoss: false,
    includeDecreasingAdjustments: false,
    version: '7',
  });
  vi.mocked(advancedApi.rulesHistory).mockResolvedValue([]);
  vi.mocked(advancedApi.previewRules).mockResolvedValue({
    transactionCount: 2,
    income: '100',
    baseExpense: '10',
    fees: '2',
    assetLoss: '3',
    decreasingAdjustments: '4',
    currentExpense: '12',
    proposedExpense: '19',
    expenseDifference: '7',
    currentSurplus: '88',
    proposedSurplus: '81',
  });
});
afterEach(cleanup);
function show() {
  render(
    <App>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: {
              queries: { retry: false },
              mutations: { retry: false },
            },
          })
        }
      >
        <StatisticsSettings />
      </QueryClientProvider>
    </App>,
  );
}
it('presets preview without saving, discard restores saved rules, and explicit save uses version', async () => {
  show();
  const save = await screen.findByRole('button', { name: '保存统计规则' });
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '含损失与调减' }));
  await waitFor(() =>
    expect(advancedApi.previewRules).toHaveBeenLastCalledWith(
      expect.any(String),
      'CNY',
      expect.objectContaining({
        includeAssetLoss: true,
        includeDecreasingAdjustments: true,
      }),
    ),
  );
  expect(advancedApi.saveRules).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '撤销未保存修改' }));
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '不含手续费' }));
  fireEvent.click(save);
  await waitFor(() =>
    expect(advancedApi.saveRules).toHaveBeenCalledWith({
      includeFees: false,
      includeAssetLoss: false,
      includeDecreasingAdjustments: false,
      version: '7',
    }),
  );
});
it('hides preview amounts when financial privacy is enabled', async () => {
  useUI.setState({ hidden: true });
  show();
  await screen.findByText('方案结余');
  expect(screen.queryByText('81.00', { exact: false })).not.toBeInTheDocument();
});
it('renders persisted string audit values correctly', async () => {
  vi.mocked(advancedApi.rulesHistory).mockResolvedValue([
    {
      id: 'audit-1',
      createdAt: '2026-10-21T10:00:00Z',
      source: 'User',
      changes: [{ field: 'IncludeAssetLoss', before: 'False', after: 'True' }],
    },
  ]);
  show();
  await waitFor(() =>
    expect(screen.getByText(/资产损失计入支出: 关闭 → 开启/)).toBeVisible(),
  );
});
it('retains unsaved edits on save failure', async () => {
  vi.mocked(advancedApi.saveRules).mockRejectedValue({ message: '版本冲突' });
  show();
  await screen.findByRole('button', { name: '保存统计规则' });
  fireEvent.click(screen.getByRole('button', { name: '含损失与调减' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '保存统计规则' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存统计规则' }));
  expect(
    await screen.findByText(
      '保存失败，修改尚未生效。如版本冲突，请刷新页面核对最新口径后重试。',
    ),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: '保存统计规则' })).toBeEnabled();
});
