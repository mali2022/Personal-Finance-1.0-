import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import DashboardPage from '../pages/DashboardPage';
import { useUI } from '../stores/ui';
import { APPLE_DASHBOARD_LAYOUT_KEY } from '../features/dashboard/apple/useAppleDashboardLayout';
import type { Allocation } from '../api/assetManagement';
import type { CashForecast, GoalView } from '../api/financialPlanning';
import type { DashboardDto, ReportDto } from '../types';

const fetchDashboardSummary = vi.fn();
const fetchMonthlyFlow = vi.fn();
const fetchNetWorthSeries = vi.fn();
const fetchPendingSummary = vi.fn();
const fetchReconciliationOverview = vi.fn();
const fetchGoalBoard = vi.fn();
const fetchCashForecast = vi.fn();
const fetchAllocation = vi.fn();
const categoryList = vi.fn();

vi.mock('../features/overview/overviewApi', () => ({
  fetchDashboardSummary: (...args: unknown[]) => fetchDashboardSummary(...args),
  fetchMonthlyFlow: (...args: unknown[]) => fetchMonthlyFlow(...args),
  fetchNetWorthSeries: (...args: unknown[]) => fetchNetWorthSeries(...args),
  fetchPendingSummary: (...args: unknown[]) => fetchPendingSummary(...args),
  fetchReconciliationOverview: (...args: unknown[]) =>
    fetchReconciliationOverview(...args),
  fetchGoalBoard: (...args: unknown[]) => fetchGoalBoard(...args),
  fetchCashForecast: (...args: unknown[]) => fetchCashForecast(...args),
  fetchAllocation: (...args: unknown[]) => fetchAllocation(...args),
  fetchPlanningSummary: vi.fn(),
  fetchValuationQuality: vi.fn(),
  fetchOnThisDay: vi.fn(),
}));

vi.mock('../api/profile', () => ({
  profileApi: { get: vi.fn().mockResolvedValue({ preferredCurrency: 'CNY' }) },
}));

vi.mock('../api/finance', () => ({
  categoryApi: { list: (...args: unknown[]) => categoryList(...args) },
  accountApi: { list: vi.fn().mockResolvedValue([]) },
  dashboardApi: { get: vi.fn() },
  reportApi: { get: vi.fn() },
  transactionApi: { list: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
}));

vi.mock('../features/dashboard/FinancialInsights', () => ({
  FinancialInsights: ({ month }: { month: string }) => (
    <div data-testid="ai-insights">AI 财务洞察 · {month}</div>
  ),
}));

vi.mock('../features/dashboard/TransactionCalendar', () => ({
  TransactionCalendar: () => <div>交易日历</div>,
}));
vi.mock('../features/dashboard/RecentTransactions', () => ({
  RecentTransactions: () => <div>最近交易</div>,
}));
vi.mock('../features/dashboard/AccountBalanceCards', () => ({
  AccountBalanceCards: () => <div>账户资产</div>,
}));
vi.mock('../features/dashboard/OnThisDayCard', () => ({
  OnThisDayCard: () => <div>历史上的今天</div>,
}));
vi.mock('../features/dashboard/QuickActions', () => ({
  QuickActions: () => <div>快捷操作</div>,
}));
vi.mock('../features/planning/PlanningOverview', () => ({
  PlanningOverview: () => <div>待确认与到期提醒</div>,
}));
vi.mock('../features/planning/FinancialSummary', () => ({
  default: () => <div>预算与财务规划</div>,
}));
vi.mock('../features/transactions/TransactionDrawer', () => ({
  TransactionDrawer: () => null,
}));
vi.mock('../components/apple/AppleChart', () => ({
  AppleChart: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div data-testid="apple-chart" aria-label={ariaLabel} />
  ),
}));
// A lightweight picker keeps the month-propagation test deterministic: the
// assertion is about the page forwarding the chosen month to every query.
vi.mock('../components/ResponsiveDatePicker', () => ({
  DatePicker: ({
    value,
    onChange,
    className,
    'aria-label': ariaLabel,
  }: {
    value?: { format: (format: string) => string };
    onChange?: (value: { format: (format: string) => string } | null) => void;
    className?: string;
    'aria-label'?: string;
  }) => (
    <input
      className={className}
      aria-label={ariaLabel}
      value={value?.format('YYYY-MM') ?? ''}
      onChange={(event) => {
        const month = dayjs(`${event.target.value}-01`);
        if (month.isValid()) {
          onChange?.({
            format: (format: string) => month.format(format),
          });
        }
      }}
    />
  ),
  DateInput: () => null,
}));

const currency = 'CNY';
const month = dayjs().format('YYYY-MM');
const previousMonth = dayjs().subtract(1, 'month').format('YYYY-MM');

const dashboard: DashboardDto = {
  month,
  currency,
  income: '18000.00',
  expense: '9600.50',
  surplus: '8399.50',
  assets: '520000.00',
  liabilities: '120000.00',
  netWorth: '400000.00',
  previousIncome: '17000.00',
  previousExpense: '9000.00',
  accounts: [
    {
      id: 'a-bank',
      name: '工资卡',
      type: 'Bank',
      currency,
      balance: '420000.00',
      status: 'Active',
    },
    {
      id: 'a-card',
      name: '信用卡',
      type: 'CreditCard',
      currency,
      balance: '-120000.00',
      status: 'Active',
    },
  ],
  budget: {
    id: 'b1',
    version: '1',
    month,
    total: '12000.00',
    used: '9600.50',
    items: [
      { id: 'bi-1', categoryId: 'c-food', limit: '5000.00', used: '4200.00' },
      { id: 'bi-2', categoryId: 'c-shop', limit: '3000.00', used: '3400.00' },
    ],
  },
  categories: [
    { categoryId: 'c-food', name: '餐饮', amount: '4200.00', share: 43.75 },
    { categoryId: 'c-shop', name: '购物', amount: '3400.00', share: 35.42 },
  ],
  trend: [],
  recentTransactions: [],
};

const flow: ReportDto = {
  income: '108000.00',
  expense: '57600.00',
  assets: '520000.00',
  liabilities: '120000.00',
  netWorth: '400000.00',
  currency,
  categories: [],
  excludedCurrencies: [],
  points: Array.from({ length: 6 }, (_, index) => {
    const period = dayjs(month).subtract(5 - index, 'month').format('YYYY-MM');
    return {
      period,
      income: index === 1 ? '0.00' : '18000.00',
      expense: '9600.00',
      assets: '520000.00',
      liabilities: '120000.00',
      netWorth: '400000.00',
    };
  }),
};

const netWorthSeries = {
  currency,
  range: '90d' as const,
  start: dayjs().subtract(90, 'day').format('YYYY-MM-DD'),
  end: dayjs().format('YYYY-MM-DD'),
  granularity: 'week' as const,
  points: [
    {
      period: dayjs().subtract(90, 'day').format('YYYY-MM-DD'),
      income: '0.00',
      expense: '0.00',
      assets: '500000.00',
      liabilities: '120000.00',
      netWorth: '380000.00',
    },
    {
      period: dayjs().format('YYYY-MM-DD'),
      income: '0.00',
      expense: '0.00',
      assets: '520000.00',
      liabilities: '120000.00',
      netWorth: '400000.00',
    },
  ],
  income: '0.00',
  expense: '0.00',
  assets: '520000.00',
  liabilities: '120000.00',
  netWorth: '400000.00',
  opening: '380000.00',
  change: '20000.00',
  changePercent: 5.26,
  excludedCurrencies: [],
};

const allocation: Allocation = {
  date: dayjs().format('YYYY-MM-DD'),
  complete: true,
  uncovered: 0,
  scope: '演示账本',
  items: [],
  groups: [
    {
      currency,
      assets: '420000.00',
      liabilities: '120000.00',
      netWorth: '300000.00',
      allocation: [
        { type: 'Bank', amount: '420000.00', percent: '100.00' },
      ],
    },
  ],
  policies: [],
};

const goalView: GoalView = {
  id: 'goal-1',
  name: '年度旅行基金',
  type: 'Travel',
  target: '20000.00',
  currency,
  startDate: dayjs().subtract(8, 'month').format('YYYY-MM-DD'),
  targetDate: dayjs().add(4, 'month').format('YYYY-MM-DD'),
  monthlySaving: '1800.00',
  priority: 1,
  state: 'Active',
  note: '',
  version: '1',
  allocated: '14500.00',
  remaining: '5500.00',
  progress: '72.50',
  recommendedMonthly: '1800.00',
  overdue: false,
};

const cashForecast: CashForecast = {
  opening: '420000.00',
  inflow: '5000.00',
  outflow: '3200.00',
  closing: '421800.00',
  minimum: '418000.00',
  minimumDate: dayjs().add(4, 'day').format('YYYY-MM-DD'),
  reserved: '0.00',
  availableCash: '420000.00',
  nearTermCommitments: '3200.00',
  freelyAvailable: '416800.00',
  assumptions: '仅根据已记录的周期交易与未来计划推算。',
  days: [
    {
      date: dayjs().format('YYYY-MM-DD'),
      inflow: '0.00',
      outflow: '0.00',
      balance: '420000.00',
    },
    {
      date: dayjs().add(10, 'day').format('YYYY-MM-DD'),
      inflow: '5000.00',
      outflow: '3200.00',
      balance: '421800.00',
    },
  ],
  accounts: [],
  gaps: [],
  events: { items: [], total: 2 },
  unresolved: [],
};

function mockHappyPath() {
  fetchDashboardSummary.mockResolvedValue(dashboard);
  fetchMonthlyFlow.mockResolvedValue(flow);
  fetchNetWorthSeries.mockResolvedValue(netWorthSeries);
  fetchPendingSummary.mockResolvedValue({
    total: 42,
    pending: 3,
    anomalies: 1,
    uncategorized: 2,
    basis: '转账、信用卡还款与借贷本金不计入收支。',
  });
  fetchReconciliationOverview.mockResolvedValue({
    denominator: 10,
    numerator: 8,
    coverage: '80.00%',
    conflictCount: 1,
    manualReviewCount: 1,
  });
  fetchGoalBoard.mockResolvedValue({
    items: [goalView],
    total: 1,
    active: 1,
    completed: 0,
    target: '20000.00',
    reserved: '14500.00',
  });
  fetchCashForecast.mockResolvedValue(cashForecast);
  fetchAllocation.mockResolvedValue(allocation);
  categoryList.mockResolvedValue([
    {
      id: 'c-food',
      name: '餐饮',
      kind: 'Expense',
      status: 'Active',
      sortOrder: 1,
      version: '1',
    },
    {
      id: 'c-shop',
      name: '购物',
      kind: 'Expense',
      status: 'Active',
      sortOrder: 2,
      version: '1',
    },
  ]);
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const MODULE_TEST_IDS = [
  'module-networth',
  'module-trend',
  'module-savings',
  'module-categories',
  'module-budget',
  'module-structure',
  'module-cashflow',
  'module-goals',
  'module-anomalies',
  'module-ai',
];

beforeEach(() => {
  useUI.setState({ hidden: false, language: 'zh-CN' });
  localStorage.clear();
  mockHappyPath();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useUI.setState({ hidden: false });
  localStorage.clear();
});

describe('Apple dashboard workbench', () => {
  it('renders the ten analysis modules, the unified filter and the retained legacy tools', async () => {
    show();
    await screen.findByText('AI 财务洞察 · ' + month);
    for (const testId of MODULE_TEST_IDS) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { level: 1, name: '仪表盘' })).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-bento')).toBeInTheDocument();
    const picker = screen.getByLabelText('选择账期');
    expect(picker).toHaveClass('overview-date-picker');
    expect(screen.getByTestId('dashboard-layout-controls')).toBeInTheDocument();
    // Retained capabilities are always reachable, even in the default layout.
    expect(screen.getByText('交易日历')).toBeInTheDocument();
    expect(screen.getByText('最近交易')).toBeInTheDocument();
    expect(screen.getByText('账户资产')).toBeInTheDocument();
    expect(screen.getByText('待确认与到期提醒')).toBeInTheDocument();
    expect(screen.getByText('预算与财务规划')).toBeInTheDocument();
    expect(screen.getByText('历史上的今天')).toBeInTheDocument();
    expect(screen.getAllByText('快捷操作').length).toBeGreaterThan(0);
    expect((await screen.findAllByText('餐饮')).length).toBeGreaterThan(0);
  });

  it('persists module visibility, ordering and reset in localStorage', async () => {
    const { unmount } = show();
    await screen.findByText('AI 财务洞察 · ' + month);

    fireEvent.click(screen.getByRole('button', { name: '模块布局' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: '财务目标' }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('module-goals')).not.toBeInTheDocument(),
    );
    expect(
      JSON.parse(localStorage.getItem(APPLE_DASHBOARD_LAYOUT_KEY) || '{}')
        .hidden,
    ).toContain('goals');

    fireEvent.click(
      screen.getByRole('button', { name: '上移 现金流分析' }),
    );
    const stored = JSON.parse(
      localStorage.getItem(APPLE_DASHBOARD_LAYOUT_KEY) || '{}',
    );
    expect(stored.order.indexOf('cashflow')).toBeLessThan(
      stored.order.indexOf('structure'),
    );

    const renderedOrder = [...document.querySelectorAll('[data-testid^="module-"]')]
      .map((element) => element.getAttribute('data-testid'))
      .filter((id): id is string => id !== null && MODULE_TEST_IDS.includes(id));
    expect(renderedOrder.indexOf('module-cashflow')).toBeLessThan(
      renderedOrder.indexOf('module-structure'),
    );

    unmount();
    show();
    await screen.findByText('AI 财务洞察 · ' + month);
    expect(screen.queryByTestId('module-goals')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '模块布局' }));
    fireEvent.click(screen.getByRole('button', { name: '恢复默认布局' }));
    await screen.findByTestId('module-goals');
    const restored = JSON.parse(
      localStorage.getItem(APPLE_DASHBOARD_LAYOUT_KEY) || '{}',
    );
    expect(restored.hidden).toEqual([]);
    expect(restored.order[0]).toBe('networth');
    expect(restored.order[1]).toBe('trend');
  });

  it('hides amounts and never renders a chart in privacy mode', async () => {
    useUI.setState({ hidden: true });
    const { container } = show();
    await screen.findByText('AI 财务洞察 · ' + month);
    expect(
      screen.getAllByText('隐私模式已隐藏金额与图表').length,
    ).toBeGreaterThanOrEqual(7);
    expect(screen.queryByTestId('apple-chart')).not.toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.textContent).not.toContain('400,000.00');
    expect(container.textContent).not.toContain('¥');
  });

  it('shows an isolated error for the failing module while the rest still render', async () => {
    fetchDashboardSummary.mockRejectedValue(new Error('仪表盘接口不可用'));
    show();
    await screen.findByText('AI 财务洞察 · ' + month);
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText('仪表盘接口不可用')).length,
    ).toBeGreaterThan(0);
    // The trend module uses a different endpoint and must survive.
    expect(screen.getByTestId('module-trend')).toBeInTheDocument();
    expect(screen.getAllByTestId('apple-chart').length).toBeGreaterThan(0);
  });

  it('renders honest empty states when the ledger has no data', async () => {
    fetchDashboardSummary.mockResolvedValue({
      ...dashboard,
      accounts: [],
      categories: [],
      budget: {
        id: 'b0',
        version: '0',
        month,
        total: '0.00',
        used: '0.00',
        items: [],
      },
      recentTransactions: [],
    });
    fetchMonthlyFlow.mockResolvedValue({
      ...flow,
      points: [],
      income: '0.00',
      expense: '0.00',
    });
    fetchNetWorthSeries.mockResolvedValue({
      ...netWorthSeries,
      points: [],
      netWorth: '0.00',
      opening: '0.00',
      change: '0.00',
      changePercent: null,
    });
    fetchAllocation.mockResolvedValue({
      ...allocation,
      complete: false,
      groups: [],
    });
    fetchGoalBoard.mockResolvedValue({
      items: [],
      total: 0,
      active: 0,
      completed: 0,
      target: '0.00',
      reserved: '0.00',
    });
    fetchPendingSummary.mockResolvedValue({
      total: 0,
      pending: 0,
      anomalies: 0,
      uncategorized: 0,
      basis: '统计口径来自交易工作台。',
    });
    fetchReconciliationOverview.mockResolvedValue({
      denominator: 0,
      numerator: 0,
      coverage: null,
      conflictCount: 0,
      manualReviewCount: 0,
    });
    fetchCashForecast.mockResolvedValue({
      ...cashForecast,
      days: [],
      events: { items: [], total: 0 },
      inflow: '0.00',
      outflow: '0.00',
    });
    show();
    expect(await screen.findByText('所选区间暂无收支记录')).toBeInTheDocument();
    expect(await screen.findByText('本月尚未设置预算')).toBeInTheDocument();
    expect(await screen.findByText('本月暂无分类支出')).toBeInTheDocument();
    expect(await screen.findByText('暂无财务目标')).toBeInTheDocument();
    expect(await screen.findByText('暂无净资产历史')).toBeInTheDocument();
    expect(
      await screen.findByText('尚无已导入的银行账单，覆盖率不可计算，不显示推测数值。'),
    ).toBeInTheDocument();
  });

  it('forwards the selected month to every month-scoped module', async () => {
    show();
    await screen.findByText('AI 财务洞察 · ' + month);
    expect(fetchDashboardSummary).toHaveBeenCalledWith(month);
    expect(screen.getByTestId('ai-insights')).toHaveTextContent(month);

    fireEvent.change(screen.getByLabelText('选择账期'), {
      target: { value: previousMonth },
    });
    await waitFor(() =>
      expect(fetchDashboardSummary).toHaveBeenCalledWith(previousMonth),
    );
    expect(screen.getByTestId('ai-insights')).toHaveTextContent(previousMonth);
    expect(fetchMonthlyFlow).toHaveBeenCalledWith(currency, 6);
  });
});
