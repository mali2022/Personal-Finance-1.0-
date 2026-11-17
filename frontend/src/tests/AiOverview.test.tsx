import { render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiOverviewPage from '../pages/AiOverviewPage';
import { dashboardApi } from '../api/finance';
import { cashflowApi } from '../api/financialPlanning';
import { planningApi } from '../api/planning';
import { aiApi } from '../api/ai';
import type { DashboardDto } from '../types';
import type { CashForecast } from '../api/financialPlanning';
import { useUI } from '../stores/ui';
vi.mock('../components/Chart', () => ({
  default: () => <div>forecast chart</div>,
}));
const ledger = {
  income: '800.00',
  expense: '250.00',
  surplus: '550.00',
  netWorth: '1000.00',
  previousExpense: '200.00',
  accounts: [{ id: 'owned' }],
  recentTransactions: [],
  budget: { total: '200.00', used: '250.00', items: [] },
} as unknown as DashboardDto;
const forecast = {
  days: [{ date: '2026-10-14', balance: '-5.00' }],
  minimum: '-5.00',
  opening: '10.00',
  inflow: '0.00',
  outflow: '15.00',
  closing: '-5.00',
  unresolved: [],
  assumptions: 'Only registered plans',
} as unknown as CashForecast;
function setup(data = ledger) {
  vi.spyOn(dashboardApi, 'get').mockResolvedValue(data);
  vi.spyOn(cashflowApi, 'forecast').mockResolvedValue(forecast);
  vi.spyOn(planningApi, 'automations').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  vi.spyOn(aiApi, 'settings').mockResolvedValue({
    privacy: { saveHistory: false },
  } as never);
  return render(
    <App>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <AiOverviewPage />
        </MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}
afterEach(() => {
  vi.restoreAllMocks();
  useUI.getState().setLanguage('zh-CN');
});
describe('AI overview uses ledger values without automatic model transmission', () => {
  it('shows computed budget risk and registered cash flow with no chat request', async () => {
    const chat = vi.spyOn(aiApi, 'chat');
    setup();
    await screen.findByText('125%');
    expect(
      screen.getAllByText('已登记计划显示未来现金流存在缺口').length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText('洞察为确定性账本计算；点击解释后才调用 AI。'),
    ).toBeInTheDocument();
    expect(chat).not.toHaveBeenCalled();
  });
  it('gives onboarding instead of insights when the ledger is empty', async () => {
    setup({ ...ledger, accounts: [], recentTransactions: [] });
    await screen.findByText('账本还没有数据，先完成第一笔记账');
    expect(
      screen.queryByRole('heading', { name: 'AI 财务洞察' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '创建账户' })).toHaveAttribute(
      'href',
      '/accounts',
    );
  });
  it('renders English overview and never fetches saved reports without consent', async () => {
    useUI.getState().setLanguage('en');
    const reports = vi.spyOn(aiApi, 'conversations');
    setup();
    await waitFor(() =>
      expect(
        screen.getByText('Financial summary and important reminders'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('Recent AI reports')).toBeInTheDocument();
    expect(reports).not.toHaveBeenCalled();
  });
});
