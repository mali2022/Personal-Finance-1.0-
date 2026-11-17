import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ImportCleaningPanel } from '../features/imports/ImportCleaningPanel';
import { MerchantMasterPanel } from '../features/imports/MerchantMasterPanel';
import { useUI } from '../stores/ui';
import type { ImportJob, ImportRow } from '../types';
const api = vi.hoisted(() => ({
  history: vi.fn(),
  suggestions: vi.fn(),
  recognize: vi.fn(),
  decide: vi.fn(),
  normalize: vi.fn(),
  undo: vi.fn(),
  export: vi.fn(),
  list: vi.fn(),
  alias: vi.fn(),
  removeAlias: vi.fn(),
  preview: vi.fn(),
  merge: vi.fn(),
}));
vi.mock('../features/imports/api412', () => ({
  importCleaningApi: api,
  merchantMasterApi: api,
}));
const job: ImportJob = {
  id: 'job-1',
  fileName: 'synthetic.csv',
  source: 'CSV',
  version: '2',
  state: 'Preview',
  headers: [],
  sampleRows: [],
  total: 1,
};
const rows: ImportRow[] = [
  {
    id: 'row-1',
    index: 1,
    occurredAt: '2026-10-18T10:00:00+08:00',
    amount: '25.00',
    type: 'Expense',
    accountId: 'account-1',
    currency: 'CNY',
    merchant: '咖啡门店',
    note: '',
    status: 'Ready',
    issues: [],
    needsReview: false,
  },
];
function mount(child: React.ReactNode) {
  return render(
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
      <MemoryRouter>
        <App>{child}</App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ hidden: false, language: 'zh-CN' });
  api.history.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });
  api.suggestions.mockResolvedValue({ items: [] });
  api.list.mockResolvedValue({
    items: [
      {
        id: 'master-1',
        name: '咖啡标准',
        status: 'Active',
        version: '7',
        aliases: [],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  });
});
it('requires explicit consent for current-page AI and does not automatically accept suggestions', async () => {
  api.recognize.mockResolvedValue({ ...job, version: '3' });
  const changed = vi.fn();
  mount(<ImportCleaningPanel job={job} rows={rows} changed={changed} />);
  const button = screen.getByRole('button', {
    name: 'AI 识别当前页（最多20行）',
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(button);
  await waitFor(() =>
    expect(api.recognize).toHaveBeenCalledWith('job-1', '2', ['row-1']),
  );
  await waitFor(() =>
    expect(changed).toHaveBeenCalledWith({ ...job, version: '3' }),
  );
  expect(api.decide).not.toHaveBeenCalled();
});
it('blocks expired suggestions and permits explicitly dismissing them', async () => {
  api.suggestions.mockResolvedValue({
    items: [
      {
        id: 'suggestion-1',
        rowId: 'row-1',
        index: 1,
        merchant: '咖啡标准',
        confidence: 0.8,
        reason: '待核对',
        stale: true,
      },
    ],
  });
  api.decide.mockResolvedValue({ ...job, version: '3' });
  mount(<ImportCleaningPanel job={job} rows={rows} changed={vi.fn()} />);
  expect(await screen.findByRole('button', { name: /采\s*纳/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /忽\s*略/ }));
  await waitFor(() =>
    expect(api.decide).toHaveBeenCalledWith(
      'job-1',
      'suggestion-1',
      false,
      '2',
    ),
  );
});
it('excludes transfer, closed and suspected rows from AI recognition', async () => {
  mount(
    <ImportCleaningPanel
      job={job}
      rows={[
        { ...rows[0], type: 'Transfer' },
        { ...rows[0], id: 'suspected', status: 'Suspected' },
        { ...rows[0], id: 'closed', status: 'Skipped' },
      ]}
      changed={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('checkbox'));
  expect(
    screen.getByRole('button', { name: 'AI 识别当前页（最多20行）' }),
  ).toBeDisabled();
  expect(api.recognize).not.toHaveBeenCalled();
});
it('saves a merchant alias against the displayed master revision', async () => {
  api.alias.mockResolvedValue({ version: '8' });
  mount(<MerchantMasterPanel />);
  fireEvent.click(screen.getByRole('button', { name: '商户主数据与别名' }));
  fireEvent.click(await screen.findByRole('button', { name: '添加别名' }));
  fireEvent.change(screen.getByRole('textbox', { name: '商户别名' }), {
    target: { value: '咖啡门店A' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存别名' }));
  await waitFor(() =>
    expect(api.alias).toHaveBeenCalledWith('master-1', '咖啡门店A', '7'),
  );
});
