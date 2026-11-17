import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import StatisticsManagementPage from '../pages/StatisticsManagementPage';
import {
  policyApi,
  policyPreset,
  type ManagedPolicy,
} from '../features/reports/statisticsPolicyApi';
import {
  managementDefaults,
  policyModules,
} from '../features/reports/statisticsPolicyCatalog';
import { useUI } from '../stores/ui';
vi.mock('../features/reports/statisticsPolicyApi', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../features/reports/statisticsPolicyApi')
  >()),
  policyApi: {
    get: vi.fn(),
    save: vi.fn(),
    preview: vi.fn(),
    history: vi.fn(),
  },
}));
vi.mock('../features/transactions/TransactionDrawer', () => ({
  TransactionDrawer: () => null,
}));
const managed = (): ManagedPolicy => ({
  version: '0',
  ledgerVersion: '7',
  ledgerRules: {
    includeFees: true,
    includeAssetLoss: false,
    includeDecreasingAdjustments: false,
  },
  options: { ...managementDefaults },
});
beforeEach(() => {
  vi.resetAllMocks();
  useUI.setState({ language: 'zh-CN', hidden: false });
  vi.mocked(policyApi.get).mockResolvedValue(managed());
  vi.mocked(policyApi.history).mockResolvedValue([]);
  vi.mocked(policyApi.save).mockResolvedValue({} as never);
});
function show() {
  render(
    <App>
      <MemoryRouter>
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
          <StatisticsManagementPage />
        </QueryClientProvider>
      </MemoryRouter>
    </App>,
  );
}
it('ten modules have unique identities and presets preserve calendar choices', () => {
  expect(policyModules).toHaveLength(10);
  const ids = policyModules.flatMap((m) => m.rules.map((r) => r.id));
  expect(new Set(ids).size).toBe(ids.length);
  const current = { ...managementDefaults, monthStartDay: 15 };
  expect(policyPreset('Assets', current)).toMatchObject({
    monthStartDay: 15,
    showInvestmentAnalysis: true,
    showWealthAnalysis: true,
    showDebtAnalysis: false,
  });
  expect(policyPreset('Comprehensive', current).showDebtAnalysis).toBe(true);
});
it('changes income inclusion locally and explicit save includes both version tokens', async () => {
  show();
  fireEvent.click(
    await screen.findByRole('switch', { name: '已关联现金奖励参与分析收入' }),
  );
  expect(policyApi.save).not.toHaveBeenCalled();
  expect(policyApi.preview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '保存统计方案' }));
  await waitFor(() =>
    expect(policyApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        version: '0',
        ledgerVersion: '7',
        options: expect.objectContaining({
          mode: 'Custom',
          includeCashRewards: false,
        }),
      }),
      expect.anything(),
    ),
  );
});
it('searches unsupported principles without offering a nonfunctional toggle', async () => {
  show();
  await screen.findByRole('switch', { name: '已关联现金奖励参与分析收入' });
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索统计规则' }), {
    target: { value: '折旧' },
  });
  expect(screen.getByText('资产折旧与实物处置损益')).toBeVisible();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.getByText('尚缺核算数据')).toBeVisible();
});
it('retains edits after conflict and allows a local discard', async () => {
  vi.mocked(policyApi.save).mockRejectedValue({ message: '版本冲突' });
  show();
  fireEvent.click(
    await screen.findByRole('switch', { name: '已关联现金奖励参与分析收入' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存统计方案' }));
  expect(
    await screen.findByText(
      '保存失败，修改已保留。版本冲突时刷新服务器配置后再核对；不会自动覆盖他人的修改。',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('switch', { name: '已关联现金奖励参与分析收入' }),
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: '撤销未保存修改' }));
  expect(
    screen.getByRole('switch', { name: '已关联现金奖励参与分析收入' }),
  ).toBeChecked();
});
it('shows English labels and switches module controls without mutating ledger facts', async () => {
  useUI.setState({ language: 'en', hidden: true });
  show();
  await screen.findByRole('switch', {
    name: 'Include linked cash rewards in analysis income',
  });
  fireEvent.click(screen.getByRole('tab', { name: /Periods and timing/ }));
  expect(
    screen.getByRole('spinbutton', { name: 'Monthly period starts on' }),
  ).toHaveValue('1');
  expect(policyApi.save).not.toHaveBeenCalled();
});
