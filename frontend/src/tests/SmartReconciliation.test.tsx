import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { SmartWorkbench } from '../features/reconciliation/SmartWorkbench';
import { smartApi } from '../features/reconciliation/api';
import { useUI } from '../stores/ui';
vi.mock('../features/reconciliation/api', () => ({
  smartApi: {
    list: vi.fn(),
    candidates: vi.fn(),
    history: vi.fn(),
    rules: vi.fn(),
    tasks: vi.fn(),
    confirm: vi.fn(),
    resolve: vi.fn(),
    previewRule: vi.fn(),
    saveRule: vi.fn(),
  },
}));
vi.mock('../features/imports/api412', () => ({
  importCleaningApi: { jobs: vi.fn(async () => ({ items: [], total: 0 })) },
}));
const statement = {
  id: 's',
  accountId: 'a',
  importJobId: 'job',
  importRowId: 'source',
  reference: 'source-1',
  amount: '-10.00',
  currency: 'CNY',
  occurredAt: '2026-10-01T12:00:00+08:00',
  merchant: 'Synthetic shop',
  note: '',
  type: 'Expense',
  state: 'Pending',
  resolution: '',
  version: '7',
};
const clients = new Set<QueryClient>();
afterEach(() => {
  // Stop inactive retries/refetches from earlier test renderings before mocks change.
  for (const client of clients) client.clear();
  clients.clear();
});
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ language: 'zh-CN', hidden: false });
  vi.mocked(smartApi.list).mockResolvedValue({
    items: [statement],
    total: 1,
    numerator: 0,
    denominator: 1,
    summary: [{ state: 'Pending', count: 1, grossAmount: '10.00' }],
  });
  vi.mocked(smartApi.rules).mockResolvedValue([]);
  vi.mocked(smartApi.tasks).mockResolvedValue([]);
  vi.mocked(smartApi.candidates).mockResolvedValue({
    statement,
    candidates: [
      {
        transactionId: 'tx',
        version: '3',
        type: 'Expense',
        merchant: 'Synthetic shop',
        amount: '-10.00',
        score: 80,
        confidence: 'High',
        difference: '0',
        dateDeviation: 1,
        reasons: ['AmountExact', 'MerchantExact'],
      },
    ],
    truncated: false,
    competing: false,
    ruleMatches: [],
  });
  vi.mocked(smartApi.history).mockResolvedValue({ items: [] });
  vi.mocked(smartApi.confirm).mockResolvedValue({});
  vi.mocked(smartApi.resolve).mockResolvedValue({});
  vi.mocked(smartApi.previewRule).mockResolvedValue({
    totalPending: 1,
    evaluated: 1,
    results: [
      {
        statementId: 's',
        merchant: 'Synthetic shop',
        amount: '-10.00',
        matchingCount: 1,
        competing: false,
        truncated: false,
      },
    ],
  });
});
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.add(client);
  return render(
    <MemoryRouter>
      <App>
        <QueryClientProvider client={client}>
          <SmartWorkbench accountId="a" currency="CNY" />
        </QueryClientProvider>
      </App>
    </MemoryRouter>,
  );
}
it('previews an unsaved fixed amount rule without confirming or saving it', async () => {
  show();
  fireEvent.click(await screen.findByRole('tab', { name: '匹配规则' }));
  fireEvent.change(screen.getByLabelText('规则名称'), {
    target: { value: 'Unsaved rule' },
  });
  fireEvent.change(screen.getByLabelText('规则目标金额（绝对值，可空）'), {
    target: { value: '10.00' },
  });
  fireEvent.click(screen.getByRole('button', { name: '预览当前规则' }));
  await screen.findByRole('dialog', { name: '规则影响预览（不保存、不确认）' });
  expect(smartApi.previewRule).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: 'a', expectedAmount: '10.00' }),
  );
  expect(smartApi.saveRule).not.toHaveBeenCalled();
  expect(smartApi.confirm).not.toHaveBeenCalled();
});
it('shows real denominator, candidate reasons, and requires a reason before confirmation', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '复核与解释' }));
  await screen.findByText('金额一致');
  await screen.findByText('商户一致');
  expect(screen.getByRole('button', { name: '确认匹配' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('复核说明'), {
    target: { value: '人工核查来源' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认匹配' }));
  fireEvent.click(
    await screen.findByRole('button', { name: /^(OK|确\s*定)$/ }),
  );
  await waitFor(() =>
    expect(smartApi.confirm).toHaveBeenCalledWith(
      's',
      {
        transactionId: 'tx',
        version: '7',
        transactionVersion: '3',
        reason: '人工核查来源',
      },
      expect.any(String),
    ),
  );
});
it('shows accurate empty state without fabricating a success rate', async () => {
  vi.mocked(smartApi.list).mockResolvedValue({
    items: [],
    total: 0,
    numerator: 0,
    denominator: 0,
    summary: [],
  });
  show();
  await screen.findByText(/暂无可对账数据/);
  expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
});
it('exposes competing candidates and stale matched transaction conflicts', async () => {
  const c = await smartApi.candidates('s');
  vi.mocked(smartApi.candidates).mockResolvedValue({
    ...c,
    competing: true,
    truncated: true,
  });
  vi.mocked(smartApi.history).mockResolvedValue({
    items: [
      {
        id: 'h',
        transactionId: 'tx',
        state: 'Confirmed',
        createdAt: '2026-10-01',
        reason: 'review',
        engineVersion: 'rules-2.0.0',
        conflict: true,
      },
    ],
  });
  show();
  fireEvent.click(await screen.findByRole('button', { name: '复核与解释' }));
  await screen.findByText('存在竞争候选，必须人工核查');
  await screen.findByText('原交易已修改或删除，请撤销重核');
});
it('retains the review when saving fails and permits retry', async () => {
  vi.mocked(smartApi.confirm).mockRejectedValue(new Error('VERSION_CONFLICT'));
  show();
  fireEvent.click(await screen.findByRole('button', { name: '复核与解释' }));
  await screen.findByText('金额一致');
  fireEvent.change(screen.getByLabelText('复核说明'), {
    target: { value: '复核' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认匹配' }));
  fireEvent.click(
    await screen.findByRole('button', { name: /^(OK|确\s*定)$/ }),
  );
  await screen.findByText('VERSION_CONFLICT');
  expect(screen.getByLabelText('复核说明')).toHaveValue('复核');
}, 30000);
it('requires a reason for revocation and sends the current statement version', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: '复核与解释' }));
  await screen.findByText('金额一致');
  const revoke = screen.getByRole('button', { name: '撤销 / 重新匹配' });
  expect(revoke).toBeDisabled();
  fireEvent.change(screen.getByLabelText('复核说明'), {
    target: { value: '来源有误' },
  });
  fireEvent.click(revoke);
  await waitFor(() =>
    expect(smartApi.resolve).toHaveBeenCalledWith(
      's',
      { version: '7', state: 'Pending', reason: '来源有误' },
      expect.any(String),
    ),
  );
});
