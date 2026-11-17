import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import CollaborationPage from '../pages/CollaborationPage';
import {
  collaborationApi as api,
  type SpaceReport,
} from '../features/collaboration/api';
import { useUI } from '../stores/ui';
vi.mock('../features/collaboration/api', () => ({
  collaborationApi: {
    list: vi.fn(),
    report: vi.fn(),
    invitations: vi.fn(),
    write: vi.fn(),
  },
}));
const family = {
  id: 'f',
  name: '我们的家',
  kind: 'Family' as const,
  role: 'Owner',
  version: '1',
  description: '共同生活',
  sortOrder: 0,
  archived: false,
};
const book = {
  ...family,
  id: 'b',
  kind: 'Book' as const,
  name: '日常生活',
  familyId: 'f',
};
const fixture: SpaceReport = {
  space: family,
  members: [
    {
      id: 'm',
      name: '妈妈',
      role: 'Owner',
      profile: '家庭管理员',
      active: true,
      version: '1',
    },
  ],
  ownMembers: [
    {
      id: 'm',
      name: '妈妈',
      role: 'Owner',
      profile: '家庭管理员',
      active: true,
      version: '1',
    },
  ],
  transactions: [],
  totals: [{ currency: 'CNY', income: '1000.00', expense: '120.00' }],
  balances: [{ memberId: 'm', currency: 'CNY', paid: 120, share: 60, net: 60 }],
  budgets: [
    {
      currency: 'CNY',
      month: '2026-10',
      amount: '500.00',
      actual: '120.00',
      version: '1',
    },
  ],
  settlements: [],
  invitations: [],
};
function mount(familyPage = false, id?: string) {
  render(
    <MemoryRouter
      initialEntries={[
        `${familyPage ? '/families' : '/books'}${id ? `?id=${id}` : ''}`,
      ]}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <App>
          <CollaborationPage family={familyPage} />
        </App>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ hidden: false });
  vi.mocked(api.list).mockResolvedValue([family, book]);
  vi.mocked(api.invitations).mockResolvedValue([]);
  vi.mocked(api.report).mockResolvedValue(fixture);
});
describe('账本与家庭中心', () => {
  it('展示账本卡片、多账本报表和带家庭归属的新建弹窗', async () => {
    mount();
    expect(await screen.findByText('日常生活')).toBeInTheDocument();
    expect(screen.getByText('多账本报表')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新建账本' }));
    expect(
      await screen.findByText('所属家庭（创建后固定）'),
    ).toBeInTheDocument();
  });
  it('家庭预算展示净支出并可切换到成员档案', async () => {
    mount(true, 'f');
    expect(await screen.findByText('净支出 120.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '家庭预算' }));
    expect(
      await screen.findByText('实际净支出 120.00 / 预算 500.00'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '成员及档案' }));
    expect(await screen.findByText('家庭管理员')).toBeInTheDocument();
  });
  it('只读成员没有邀请和结算写入入口', async () => {
    vi.mocked(api.list).mockResolvedValue([{ ...family, role: 'Viewer' }]);
    mount(true, 'f');
    await screen.findByText('净支出 120.00');
    fireEvent.click(screen.getByRole('tab', { name: '邀请管理' }));
    expect(await screen.findByText('仅所有者可管理邀请')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '费用结算' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: '登记已支付结算' }),
      ).not.toBeInTheDocument(),
    );
  });
});
