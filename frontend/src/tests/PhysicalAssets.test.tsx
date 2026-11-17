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
import PhysicalAssetsPage from '../pages/PhysicalAssetsPage';
import { apiClient } from '../api/client';
import { useUI } from '../stores/ui';
vi.mock('../api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
const row = {
  id: 'asset-1',
  name: '测试相机',
  type: 'Other',
  currency: 'CNY',
  acquiredDate: '2026-01-01',
  note: '',
  version: '4',
  categoryName: '相机',
  profile: null,
  value: {
    quantity: 2,
    state: 'Active',
    originalCost: 1000,
    remainingCost: 1000,
    bookValue: 1000,
    value: 800,
    method: 'Manual',
    marketValue: null,
    netRealizableValue: null,
  },
  usageCost: 0,
  ownershipCost: 0,
  depreciation: 0,
  anomalies: [],
  costs: [],
  events: [],
  rules: [],
  valuations: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ hidden: false, language: 'zh-CN' });
  vi.mocked(apiClient.get).mockImplementation(
    async (url) =>
      ({
        data: {
          data:
            url === '/physical-center'
              ? {
                  date: '2026-10-22',
                  scope: '原币分组，不重复记账',
                  items: [row],
                  groups: [],
                  reminders: [],
                }
              : [],
        },
      }) as never,
  );
  vi.mocked(apiClient.post).mockResolvedValue({
    data: { data: { explanation: '无市场价格，无法推算。' } },
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
        <PhysicalAssetsPage />
      </QueryClientProvider>
    </App>,
  );
}
it('saves quantity-price observations with concurrency and idempotency headers', async () => {
  show();
  fireEvent.click(await screen.findByRole('tab', { name: '资产档案' }));
  fireEvent.click(
    await screen.findByRole('button', { name: /^估\s*值$/ }),
  );
  const select = screen.getByLabelText('估值模式');
  fireEvent.mouseDown(select);
  fireEvent.click(await screen.findByText('数量 × 单价'));
  fireEvent.change(screen.getByLabelText('单价'), { target: { value: '300' } });
  fireEvent.change(screen.getByLabelText('估值依据 / 市场观察来源'), {
    target: { value: '实际观察' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  await waitFor(() =>
    expect(apiClient.post).toHaveBeenCalledWith(
      '/physical-assets/asset-1/rules',
      expect.objectContaining({
        method: 'QuantityPrice',
        amount: 300,
        source: '实际观察',
        marketValue: null,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-Match': '4',
          'Idempotency-Key': expect.any(String),
        }),
      }),
    ),
  );
});
it('requires explicit summary consent and shows provider analysis', async () => {
  show();
  fireEvent.click(await screen.findByRole('tab', { name: 'AI 分析与检索' }));
  expect(screen.getByRole('button', { name: '开始分析' })).toBeDisabled();
  fireEvent.click(
    screen.getByText('同意向 AI 发送当前资产汇总、资产名称与分类名称'),
  );
  fireEvent.click(screen.getByRole('button', { name: '开始分析' }));
  expect(await screen.findByText('无市场价格，无法推算。')).toBeInTheDocument();
  expect(apiClient.post).toHaveBeenCalledWith(
    '/physical-center/analysis',
    expect.objectContaining({ sendSummary: true, mode: 'health' }),
    expect.objectContaining({ params: expect.any(Object) }),
  );
});
it('hides asset details and AI controls in privacy mode', async () => {
  useUI.setState({ hidden: true });
  show();
  expect(
    await screen.findByText('隐私模式已开启，实物档案与分析已隐藏'),
  ).toBeInTheDocument();
  expect(screen.queryByText('测试相机')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新增资产' })).toBeDisabled();
});

