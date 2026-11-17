import { render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { apiClient, setAccessToken } from '../api/client';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
import { useUI } from '../stores/ui';
import type { TransactionDetailDto } from '../types';

const server = setupServer();
const ok = (data: unknown) => HttpResponse.json({ data });
const transaction: TransactionDetailDto = {
  id: 'later-page-transaction',
  type: 'Expense',
  amount: '38.90',
  currency: 'CNY',
  accountId: 'cash',
  merchant: '既有商户',
  productName: '英语口语教材',
  occurredAt: '2026-10-12T06:00:00Z',
  note: '',
  tagIds: ['tag-beyond-first-page', 'second-tag-beyond-first-page'],
  tagNames: ['学习成长·语言学习·口语练习·英语', '收入'],
  projectId: 'project-beyond-first-page',
  projectName: '跨页装修计划',
  status: 'Confirmed',
  refundedAmount: '0.00',
  fee: '0.00',
  splits: [],
  version: '1',
  createdAt: '2026-10-12T06:00:00Z',
  updatedAt: '2026-10-12T06:00:00Z',
  entries: [],
  attachments: [],
  relatedTransactions: [],
};

beforeAll(() => {
  apiClient.defaults.baseURL = `${window.location.origin}/api`;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
  setAccessToken();
  useUI.setState({ language: 'zh-CN', hidden: false });
});
afterAll(() => server.close());

describe('大目录下的交易详情', () => {
  it('显示不在目录第一页的标签和项目名称，并且无需下载目录来补全名称', async () => {
    // The actual detail API supplies authoritative names even when directory pages
    // contain 5000 records. English UI must also leave user-defined names intact.
    useUI.setState({ language: 'en', hidden: false });
    setAccessToken('test-session');
    const directoryRequests: string[] = [];
    server.use(
      http.get('/api/transactions/later-page-transaction', () =>
        ok(transaction),
      ),
      http.get('/api/accounts', () =>
        ok([
          {
            id: 'cash',
            name: '现金',
            currency: 'CNY',
            type: 'Cash',
            balance: '100.00',
            status: 'Active',
          },
        ]),
      ),
      http.get('/api/categories', () => ok([])),
      http.get('/api/transactions/later-page-transaction/promotions', () =>
        ok({ cashbacks: [], usages: [] }),
      ),
      http.get('/api/transactions/later-page-transaction/attachments', () =>
        ok([]),
      ),
      http.get('/api/directory/:kind', ({ request, params }) => {
        directoryRequests.push(request.url);
        return ok({
          items: Array.from({ length: 100 }, (_, index) => ({
            id: `${String(params.kind)}-first-page-${index}`,
            name: `第一页目录记录${index}`,
          })),
          total: 5000,
          page: 1,
          pageSize: 100,
        });
      }),
    );
    const cache = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const view = render(
      <QueryClientProvider client={cache}>
        <MemoryRouter>
          <App>
            <TransactionDrawer id={transaction.id} onClose={vi.fn()} />
          </App>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText('学习成长·语言学习·口语练习·英语、收入'),
    ).toBeVisible();
    expect(screen.getByText('跨页装修计划')).toBeVisible();
    expect(screen.getByText('英语口语教材')).toBeVisible();
    await waitFor(() => expect(cache.isFetching()).toBe(0));
    expect(directoryRequests).toEqual([]);
    view.unmount();
    cache.clear();
  });
});
