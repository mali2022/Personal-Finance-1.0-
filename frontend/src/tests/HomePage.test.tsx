import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../pages/HomePage';
import { useUI } from '../stores/ui';
import { rangeWindow } from '../features/overview';
import type { AiSettings } from '../api/ai';
import type { CashForecast } from '../api/financialPlanning';
import type {
  DashboardDto,
  ReportDto,
  ReportFilters,
  TransactionListDto,
} from '../types';

vi.mock('../api/finance', () => ({
  reportApi: { get: vi.fn() },
  dashboardApi: { get: vi.fn() },
  accountApi: { list: vi.fn() },
  categoryApi: { list: vi.fn() },
}));
vi.mock('../api/financialPlanning', () => ({
  indicatorApi: { summary: vi.fn() },
  cashflowApi: { forecast: vi.fn() },
  goalApi: { list: vi.fn() },
}));
vi.mock('../features/reconciliation/api', () => ({
  smartApi: { overview: vi.fn() },
}));
vi.mock('../features/transactions/workspaceApi', () => ({
  workspaceApi: { summary: vi.fn() },
}));
vi.mock('../api/ai', () => ({
  aiApi: { settings: vi.fn(), chat: vi.fn() },
}));
vi.mock('../hooks/useCurrency', () => ({
  usePreferredCurrency: () => 'CNY',
  useCurrencyState: () => ['CNY', () => {}] as const,
}));
vi.mock('../components/apple/AppleChart', () => ({
  AppleChart: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div data-testid="apple-chart" role="img" aria-label={ariaLabel} />
  ),
}));
vi.mock('../features/dashboard/FinancialInsights', () => ({
  FinancialInsights: () => <div data-testid="ai-insights-content">AI 洞察</div>,
}));

const { reportApi, dashboardApi, accountApi, categoryApi } =
  await import('../api/finance');
const { indicatorApi, cashflowApi } = await import('../api/financialPlanning');
const { smartApi } = await import('../features/reconciliation/api');
const { workspaceApi } = await import('../features/transactions/workspaceApi');
const { aiApi } = await import('../api/ai');

const MONTH = dayjs().format('YYYY-MM');
const CURRENT = dayjs().format('YYYY-MM-DD');

function transaction(
  id: string,
  type: TransactionListDto['type'],
): TransactionListDto {
  return {
    id,
    type,
    amount: type === 'Income' ? '18000.00' : '32.00',
    currency: 'CNY',
    accountId: 'bank',
    categoryId: type === 'Income' ? 'wage' : 'lunch',
    merchant: type === 'Income' ? '公司薪资' : '麦当劳',
    occurredAt: `${CURRENT}T12:30:00.000+08:00`,
    note: '',
    tagIds: [],
    status: 'Confirmed',
    refundedAmount: '0.00',
    fee: '0.00',
    splits: [],
    version: '1',
    createdAt: `${CURRENT}T12:30:00.000+08:00`,
    updatedAt: `${CURRENT}T12:30:00.000+08:00`,
  };
}

const summary: DashboardDto = {
  month: MONTH,
  currency: 'CNY',
  income: '18000.00',
  expense: '5200.00',
  surplus: '12800.00',
  assets: '90000.00',
  liabilities: '5500.00',
  netWorth: '84500.00',
  previousIncome: '17000.00',
  previousExpense: '5000.00',
  accounts: [],
  budget: {
    id: MONTH,
    version: '1',
    month: MONTH,
    total: '8000.00',
    used: '5200.00',
    items: [],
  },
  categories: [],
  trend: [],
  recentTransactions: [transaction('t1', 'Expense'), transaction('t0', 'Income')],
};

const planning = {
  budgetRemaining: '2800.00',
  savingsRate: '35.00',
  emergencyScope: '按近 12 个月必要支出估算。',
  goals: [],
  upcoming: [],
};

const reconciliation = {
  denominator: 12,
  numerator: 9,
  coverage: '75.00',
  conflictCount: 1,
  accounts: [],
  trend: [],
};

const cash: CashForecast = {
  opening: '50000.00',
  inflow: '0.00',
  outflow: '0.00',
  closing: '50000.00',
  minimum: '48000.00',
  minimumDate: `${CURRENT}`,
  reserved: '0.00',
  availableCash: '50000.00',
  nearTermCommitments: '2000.00',
  freelyAvailable: '48000.00',
  assumptions: '仅根据已记录的周期交易推算。',
  days: [],
  accounts: [],
  gaps: [],
  events: { items: [], total: 0 },
  unresolved: [],
};

const settings = {
  provider: 'DeepSeek',
  enabled: false,
  configured: false,
  model: '—',
  reasoningModel: '—',
  transmission: '演示账本未配置 AI 服务。',
  legacyModels: '',
  dailyCallLimit: 0,
  capabilities: {},
  documentation: '',
  privacy: {
    enabled: false,
    allowSummary: false,
    allowDetails: false,
    allowPayroll: false,
    allowFamily: false,
    allowRecognitionText: false,
  },
} as AiSettings;

function reportFixture(filters: ReportFilters): ReportDto {
  const opening = filters.start === filters.end;
  const assets = opening ? '60000.00' : '90000.00';
  const liabilities = opening ? '5000.00' : '5500.00';
  const netWorth = opening ? '55000.00' : '84500.00';
  return {
    income: opening ? '0.00' : '18000.00',
    expense: opening ? '0.00' : '5200.00',
    assets,
    liabilities,
    netWorth,
    currency: filters.currency,
    categories: [],
    points: [
      {
        period: filters.end,
        income: opening ? '0.00' : '18000.00',
        expense: opening ? '0.00' : '5200.00',
        assets,
        liabilities,
        netWorth,
      },
    ],
    excludedCurrencies: ['USD'],
  };
}

function windowCalled(start: string, end: string) {
  return vi
    .mocked(reportApi.get)
    .mock.calls.some(
      ([filters]) => filters.start === start && filters.end === end,
    );
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useUI.setState({ hidden: false, language: 'zh-CN', entryType: null });
  vi.mocked(reportApi.get).mockImplementation(async (filters) =>
    reportFixture(filters),
  );
  vi.mocked(dashboardApi.get).mockResolvedValue(summary);
  vi.mocked(accountApi.list).mockResolvedValue([
    {
      id: 'bank',
      name: '招商银行',
      type: 'Bank',
      currency: 'CNY',
      balance: '90000.00',
      status: 'Active',
    },
  ]);
  vi.mocked(categoryApi.list).mockResolvedValue([
    {
      id: 'lunch',
      name: '午餐',
      kind: 'Expense',
      status: 'Active',
      sortOrder: 0,
      version: '1',
    },
    {
      id: 'wage',
      name: '工资薪酬',
      kind: 'Income',
      status: 'Active',
      sortOrder: 1,
      version: '1',
    },
  ]);
  vi.mocked(indicatorApi.summary).mockResolvedValue(planning);
  vi.mocked(cashflowApi.forecast).mockResolvedValue(cash);
  vi.mocked(smartApi.overview).mockResolvedValue(reconciliation);
  vi.mocked(workspaceApi.summary).mockResolvedValue({
    total: 36,
    pending: 2,
    anomalies: 3,
    uncategorized: 1,
    basis: '转账、信用卡还款与借贷本金不计入收支；退款冲减费用。',
    currencies: [],
  });
  vi.mocked(aiApi.settings).mockResolvedValue(settings);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  useUI.setState({ hidden: false, entryType: null });
});

describe('首页 · Apple 财务控制中心', () => {
  it('renders the greeting h1, Shanghai date and a data-derived status line', async () => {
    renderHome();
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/早上好|下午好|晚上好/);
    await waitFor(() =>
      expect(screen.getByTestId('home-status')).toHaveTextContent(/本月结余/),
    );
    expect(screen.getByTestId('home-status')).toHaveTextContent(/待确认/);
    expect(screen.getByLabelText('选择账期')).toBeInTheDocument();
    expect(
      screen.getByText('本月', { selector: '.overview-month-label' }),
    ).toBeInTheDocument();
  });

  it('requests only the selected net-worth range and switches on demand', async () => {
    renderHome();
    await screen.findByTestId('home-networth');
    const thirty = rangeWindow('30d');
    await waitFor(() => expect(windowCalled(thirty.start, thirty.end)).toBe(true));
    const seven = rangeWindow('7d');
    const ninety = rangeWindow('90d');
    const year = rangeWindow('1y');
    expect(windowCalled(seven.start, seven.end)).toBe(false);
    expect(windowCalled(ninety.start, ninety.end)).toBe(false);
    expect(windowCalled(year.start, year.end)).toBe(false);

    fireEvent.click(screen.getByRole('tab', { name: '7 天' }));
    await waitFor(() => expect(windowCalled(seven.start, seven.end)).toBe(true));
    expect(windowCalled(ninety.start, ninety.end)).toBe(false);
    expect(windowCalled(year.start, year.end)).toBe(false);

    const hero = screen.getByTestId('home-networth');
    await waitFor(() =>
      expect(within(hero).getByText(/USD/)).toBeInTheDocument(),
    );
  });

  it('hides amounts and the trend chart while privacy mode is on', async () => {
    act(() => useUI.setState({ hidden: true }));
    renderHome();
    const hero = await screen.findByTestId('home-networth');
    await waitFor(() =>
      expect(within(hero).getAllByText(/••••/).length).toBeGreaterThan(0),
    );
    expect(within(hero).queryByTestId('apple-chart')).toBeNull();
    expect(hero.textContent).not.toContain('84,500');

    act(() => useUI.getState().toggleHidden());
    await waitFor(() =>
      expect(within(hero).getByTestId('apple-chart')).toBeInTheDocument(),
    );
    expect(hero.textContent).toContain('84,500');
  });

  it('opens the quick-entry drawer and navigates from real quick actions', async () => {
    renderHome();
    const quick = await screen.findByTestId('home-quick-actions');
    fireEvent.click(within(quick).getByRole('button', { name: /^支出/ }));
    expect(useUI.getState().entryType).toBe('Expense');
    fireEvent.click(within(quick).getByRole('button', { name: /^收入/ }));
    expect(useUI.getState().entryType).toBe('Income');
    fireEvent.click(within(quick).getByRole('button', { name: /^转账/ }));
    expect(useUI.getState().entryType).toBe('Transfer');

    fireEvent.click(within(quick).getByRole('button', { name: /^记一笔/ }));
    expect(useUI.getState().entryType).toBe('Expense');

    fireEvent.click(
      within(quick).getByRole('link', { name: /智能自动对账/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/reconciliation',
      ),
    );
  });

  it('shows truthful empty states when period and reconciliation have no data', async () => {
    vi.mocked(dashboardApi.get).mockResolvedValue({
      ...summary,
      income: '0.00',
      expense: '0.00',
      surplus: '0.00',
      previousIncome: '0.00',
      previousExpense: '0.00',
      recentTransactions: [],
    });
    vi.mocked(reportApi.get).mockImplementation(async (filters) => ({
      ...reportFixture(filters),
      netWorth: '0.00',
      points: [],
    }));
    vi.mocked(smartApi.overview).mockResolvedValue({
      denominator: 0,
      numerator: 0,
      coverage: null,
      conflictCount: 0,
      accounts: [],
      trend: [],
    });
    vi.mocked(workspaceApi.summary).mockResolvedValue({
      total: 0,
      pending: 0,
      anomalies: 0,
      uncategorized: 0,
      basis: '暂无交易。',
      currencies: [],
    });

    renderHome();
    const hero = await screen.findByTestId('home-networth');
    await waitFor(() =>
      expect(
        within(hero).getByText('所选区间还没有净值数据'),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId('home-pending')).toHaveTextContent(
        '暂无可对账数据',
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('home-recent')).toHaveTextContent(
        '还没有交易记录',
      ),
    );
  });

  it('links recent entries to the detail drawer route', async () => {
    renderHome();
    const recent = await screen.findByTestId('home-recent');
    await waitFor(() =>
      expect(within(recent).getAllByRole('link').length).toBeGreaterThan(2),
    );
    fireEvent.click(
      within(recent).getByRole('link', { name: /公司薪资/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/transactions/t0',
      ),
    );
  });
});
