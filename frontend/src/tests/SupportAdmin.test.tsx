import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import HelpPage from '../pages/HelpPage';
import AdminPage from '../pages/AdminPage';
import { supportApi } from '../api/support';
import { authApi } from '../api/client';
import { useUI } from '../stores/ui';
vi.mock('../api/support', () => ({
  supportApi: {
    tickets: vi.fn(),
    submit: vi.fn(),
    overview: vi.fn(),
    users: vi.fn(),
    adminTickets: vi.fn(),
    audit: vi.fn(),
    reply: vi.fn(),
    revoke: vi.fn(),
  },
}));
vi.mock('../api/client', () => ({ authApi: { me: vi.fn() } }));
afterEach(() => {
  vi.clearAllMocks();
  useUI.setState({ language: 'zh-CN' });
});
function show(element: React.ReactNode) {
  return render(
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
        <MemoryRouter>{element}</MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}
it('searches help and submits feedback with progress and reply', async () => {
  vi.mocked(supportApi.tickets).mockResolvedValue({
    items: [
      {
        id: 't',
        userId: 'u',
        subject: '原有反馈',
        content: '问题详情',
        kind: 'Bug',
        status: 'Resolved',
        reply: '已修复',
        version: '2',
        createdAt: '2026-10-17T00:00:00Z',
        updatedAt: '2026-10-17T00:00:00Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  });
  vi.mocked(supportApi.submit).mockResolvedValue({} as never);
  show(<HelpPage />);
  fireEvent.change(screen.getByPlaceholderText('搜索帮助'), {
    target: { value: '充值' },
  });
  expect(screen.getByText('充值、提现和转账如何记录？')).toBeVisible();
  expect(screen.queryByText('如何开始记账？')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '反馈与进度' }));
  expect(await screen.findByText('原有反馈')).toBeVisible();
  expect(screen.getByText('已修复')).toBeVisible();
  fireEvent.change(screen.getByLabelText('标题'), {
    target: { value: '新问题' },
  });
  fireEvent.change(screen.getByLabelText('详细描述'), {
    target: { value: '复现步骤' },
  });
  fireEvent.submit(screen.getByLabelText('标题').closest('form')!);
  await waitFor(() =>
    expect(supportApi.submit).toHaveBeenCalledWith(
      { kind: 'Question', subject: '新问题', content: '复现步骤' },
      expect.anything(),
    ),
  );
});
it('blocks ordinary users before requesting administration data', async () => {
  vi.mocked(authApi.me).mockResolvedValue({
    id: 'u',
    email: 'u@test',
    displayName: 'u',
    permissions: ['finance:read'],
  });
  show(<AdminPage />);
  expect(await screen.findByText('仅管理员可访问后台')).toBeVisible();
  expect(supportApi.overview).not.toHaveBeenCalled();
  expect(supportApi.adminTickets).not.toHaveBeenCalled();
});
it('renders administrator overview and feedback queue in English', async () => {
  useUI.setState({ language: 'en' });
  vi.mocked(authApi.me).mockResolvedValue({
    id: 'admin',
    email: 'admin@test',
    displayName: 'Admin',
    permissions: ['admin:manage'],
  });
  vi.mocked(supportApi.overview).mockResolvedValue({
    users: 3,
    activeSessions: 2,
    openTickets: 1,
    resolvedTickets: 0,
  });
  vi.mocked(supportApi.adminTickets).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
  show(<AdminPage />);
  expect(await screen.findByText('Administration')).toBeVisible();
  expect(await screen.findByText('No feedback')).toBeVisible();
  expect(supportApi.overview).toHaveBeenCalled();
});
