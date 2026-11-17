
import { financialReportPages } from '../features/financialReports/sections';
import { reportAnalysisSections } from '../features/reports/sections';
import { navigationAliases } from '../design/navigation';
import { t as tr } from '../i18n';
import { lazy, Suspense, useEffect } from 'react';
import {
  Navigate,
  Outlet,
  createBrowserRouter,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Result, Skeleton } from 'antd';
import { authApi } from '../api/client';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import { shouldRefreshFinanceQuery } from '../features/overview/refresh';
const Festivals = lazy(() => import('../pages/FestivalsPage'));
const Collaboration = lazy(() => import("../pages/CollaborationPage"));
const FinancialReports = lazy(() => import('../pages/FinancialReportsPage'));
const TimeAssets = lazy(() => import('../pages/TimeAssetsPage'));
const Fuel = lazy(() => import('../pages/FuelPage'));
const TransactionDrawer = lazy(() =>
  import('../features/transactions/TransactionDrawer').then((module) => ({
    default: module.TransactionDrawer,
  })),
);
const Layout = lazy(() => import('../layouts/AppLayout'));
const Home = lazy(() => import('../pages/HomePage'));
const Dashboard = lazy(() => import('../pages/DashboardPage'));
const TransactionCreate = lazy(() => import('../pages/TransactionCreatePage'));
const Transactions = lazy(() => import('../pages/TransactionsPage'));
const ManagedAssets = lazy(() => import('../pages/ManagedAssetsPage'));
const AssetAllocation = lazy(() => import('../pages/AssetAllocationPage'));
const StageG = lazy(() => import('../pages/StageGPage'));
const PaymentInstrumentsHub = lazy(() =>
  import('../pages/StageGPage').then((m) => ({
    default: m.PaymentInstrumentsHub,
  })),
);
const AdvancesHub = lazy(() =>
  import('../pages/StageGPage').then((m) => ({ default: m.AdvancesHub })),
);
const PayrollCenter = lazy(() => import('../pages/PayrollCenterPage'));
const LivingCostHub = lazy(() =>
  import('../pages/StageGPage').then((m) => ({ default: m.LivingCostHub })),
);
const OnThisDay = lazy(() => import('../pages/OnThisDayPage'));
const StageGAnalysis = lazy(() => import('../pages/StageGAnalysisPage'));
const Currencies = lazy(() =>
  import('../pages/StageGAnalysisPage').then((m) => ({
    default: m.CurrenciesPage,
  })),
);
const CustomReports = lazy(() => import('../pages/CustomReportsPage'));
const InvestmentPerformance = lazy(
  () => import('../pages/InvestmentPerformancePage'),
);
const Investments = lazy(() => import('../pages/InvestmentsPage'));
const SpendingValuePage = lazy(() => import('../pages/SpendingLabPage'));
const SpendingApprovalsPage = lazy(() => import('../pages/SpendingApprovalsPage'));
const Accounts = lazy(() => import('../pages/AccountsPage'));
const Categories = lazy(() => import('../pages/CategoriesPage'));
const CategoryDetail = lazy(() => import('../pages/CategoryDetailPage'));
const Reports = lazy(() => import('../pages/ReportsPage'));
const ReportAnalysis = lazy(() => import('../pages/ReportAnalysisPage'));
const Benefits = lazy(() => import('../pages/BenefitsPage'));
const Budgets = lazy(() => import('../pages/BudgetsPage'));
const AnnualBudgets = lazy(() => import('../pages/AnnualBudgetsPage'));
const Goals = lazy(() => import('../pages/GoalsPage'));
const Indicators = lazy(() => import('../pages/FinancialIndicatorsPage'));
const CashFlow = lazy(() => import('../pages/CashFlowPage'));
const LifeSimulator = lazy(() => import('../pages/LifeSimulatorPage'));
const Help = lazy(() => import('../pages/HelpPage'));
const Admin = lazy(() => import('../pages/AdminPage'));
const Settings = lazy(() => import('../pages/SettingsPage'));
const StatisticsManagement = lazy(() => import('../pages/StatisticsManagementPage'));
const ReleaseNotes = lazy(() => import('../pages/ReleaseNotesPage'));
const Ai = lazy(() => import('../pages/AiPage'));
const AiSettings = lazy(() => import('../pages/AiSettingsPage'));
const AiAgent = lazy(() => import('../pages/AiAgentPage'));
const AiCenter = lazy(() => import('../pages/AiCenterLayout'));
const AiOverview = lazy(() => import('../pages/AiOverviewPage'));
const AiReports = lazy(() => import('../pages/AiReportsPage'));
const AiMemory = lazy(() => import('../pages/AiMemoryPage'));
const AiRisks = lazy(() => import('../pages/AiRiskPage'));
const Login = lazy(() => import('../pages/LoginPage'));
const Register = lazy(() => import('../pages/RegisterPage'));
const Profile = lazy(() => import('../pages/ProfilePage'));
const Business = lazy(() => import('../pages/BusinessPage'));
const LoanSchedules = lazy(() => import('../pages/LoanSchedulesPage'));
const Concerts = lazy(() => import('../pages/ConcertsPage'));
const Directory = lazy(() => import('../pages/DirectoryPage'));
const Import = lazy(() => import('../pages/ImportPage'));
const Reconciliation = lazy(() => import('../pages/ReconciliationPage'));
const Recurring = lazy(() => import('../pages/RecurringPage'));
const Subscriptions = lazy(() => import('../pages/SubscriptionsPage'));
const Calendar = lazy(() => import('../pages/CalendarPage'));
const Automation = lazy(() => import('../pages/AutomationPage'));
function Protected() {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ['session'],
    queryFn: authApi.me,
    retry: false,
  });
  useEffect(() => {
    const refreshPlanning = () => {
      void cache.invalidateQueries({
        predicate: shouldRefreshFinanceQuery,
      });
    };
    const logout = () => {
      void cache.cancelQueries();
      cache.clear();
      useUI.getState().closeEntry();
      navigate('/login', { replace: true });
    };
    window.addEventListener('finance:unauthorized', logout);
    window.addEventListener('finance:planning-changed', refreshPlanning);
    return () => {
      window.removeEventListener('finance:unauthorized', logout);
      window.removeEventListener('finance:planning-changed', refreshPlanning);
    };
  }, [navigate, cache]);
  if (q.isPending) return <Skeleton active />;
  if (q.isError)
    return (q.error as { code?: string }).code === 'UNAUTHORIZED' ? (
      <Navigate to="/login" replace />
    ) : (
      <ErrorState error={q.error} retry={() => q.refetch()} />
    );
  return <Outlet />;
}
function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <>
      <Transactions />
      <TransactionDrawer id={id} onClose={() => navigate('/transactions')} />
    </>
  );
}
function CanonicalRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={to + location.search + location.hash} replace />;
}
export const router = createBrowserRouter([
  {
    element: (
      <Suspense fallback={<Skeleton active />}>
        <Outlet />
      </Suspense>
    ),
    errorElement: (
      <Result
        status="error"
        title={tr('页面遇到问题')}
        subTitle={tr('请刷新重试。如果问题持续，请联系管理员。')}
      />
    ),
    children: [
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/updates', element: <ReleaseNotes standalone /> },
      {
        element: <Protected />,
        children: [
          {
            element: <Layout />,
            children: [
              { path: '/', element: <Home /> },
              { path: '/dashboard', element: <Dashboard /> },
              { path: '/time-assets/*', element: <TimeAssets /> },
              { path: '/analytics/fuel', element: <Fuel /> },
              { path: '/books', element: <Collaboration /> },
              { path: '/families', element: <Collaboration family /> },
              { path: '/bookkeeping/new', element: <TransactionCreate /> },
              { path: '/transactions', element: <Transactions /> },
              {
                path: '/transactions/review',
                element: <Transactions review />,
              },
              { path: '/transactions/:id', element: <Detail /> },
              { path: '/accounts', element: <Accounts /> },
              { path: '/investments', element: <Investments /> },
              {
                path: '/investments/performance',
                element: <InvestmentPerformance />,
              },
              {
                path: '/term-deposits',
                element: <ManagedAssets deposits key="deposits" />,
              },
              {
                path: '/physical-assets',
                element: <ManagedAssets key="physical" />,
              },
              { path: '/assets/allocation', element: <AssetAllocation /> },
              { path: '/settings/currencies', element: <Currencies /> },
              {
                path: '/settings/payment-instruments',
                element: <PaymentInstrumentsHub />,
              },
              {
                path: '/accounts/fund-status',
                element: <StageG module="holds" />,
              },
              {
                path: '/prepayments',
                element: <StageG module="prepayments" />,
              },
              { path: '/payroll/:section?', element: <PayrollCenter /> },
              { path: '/advances', element: <AdvancesHub /> },
              { path: '/analytics/living-cost', element: <LivingCostHub /> },
              {
                path: '/analytics/living-cost/index',
                element: <StageGAnalysis living />,
              },
              { path: '/memories/on-this-day', element: <OnThisDay /> },
              { path: '/reports/custom', element: <CustomReports /> },
              { path: '/accounts/:id', element: <Accounts /> },
              { path: '/categories', element: <Categories /> },
              { path: '/categories/:id', element: <CategoryDetail /> },
              ...financialReportPages.map(({ id, path }) => ({
                path,
                element: <FinancialReports key={id} page={id} />,
              })),
              { path: '/reports', element: <Reports /> },
              ...reportAnalysisSections.map(({ id, path }) => ({
                path,
                element: <ReportAnalysis key={id} section={id} />,
              })),
              {
                path: '/ai-center',
                element: <AiCenter />,
                children: [
                  { index: true, element: <AiOverview /> },
                  { path: 'copilot', element: <Ai /> },
                  { path: 'agent', element: <AiAgent /> },
                  { path: 'advanced', element: <AiAgent advanced /> },
                  { path: 'bookkeeping', element: <Ai initialMode="draft" /> },
                  { path: 'risks', element: <AiRisks /> },
                  { path: 'reports', element: <AiReports /> },
                  { path: 'memory', element: <AiMemory /> },
                ],
              },
              ...Object.entries(navigationAliases).map(([path, to]) => ({
                path,
                element: <CanonicalRedirect to={to} />,
              })),
              { path: '/settings/ai', element: <AiSettings /> },
              { path: '/settings/updates', element: <ReleaseNotes /> },
              { path: '/benefits', element: <Benefits /> },
              { path: '/budgets', element: <Budgets /> },
              { path: '/budgets/annual', element: <AnnualBudgets /> },
              { path: '/goals', element: <Goals /> },
              { path: '/planning/indicators', element: <Indicators /> },
              { path: '/cashflow', element: <CashFlow /> },
              { path: '/planning/life-simulator', element: <LifeSimulator /> },
              { path: '/planning/spending-value', element: <SpendingValuePage /> },
              { path: '/spending-approvals', element: <SpendingApprovalsPage /> },
              { path: '/help', element: <Help /> },
              { path: '/admin', element: <Admin /> },
              { path: '/settings/statistics', element: <StatisticsManagement /> },
              { path: '/settings', element: <Settings /> },
              { path: '/profile', element: <Profile /> },
              {
                path: '/reimbursements',
                element: <Business key="reimbursements" reimbursement />,
              },
              { path: '/loans', element: <Business key="loans" /> },
              { path: '/loan-schedules', element: <LoanSchedules /> },
              { path: '/concerts', element: <Concerts /> },
              { path: '/festivals', element: <Festivals /> },
              ...['projects', 'merchants', 'tags', 'templates'].map((path) => ({
                path: `/${path}`,
                element: <Directory key={path} />,
              })),
              { path: '/import', element: <Import /> },
              { path: '/reconciliation', element: <Reconciliation /> },
              { path: '/recurring', element: <Recurring /> },
              { path: '/subscriptions', element: <Subscriptions /> },
              { path: '/calendar', element: <Calendar /> },
              { path: '/automation', element: <Automation /> },
              {
                path: '*',
                element: <Result status="404" title={tr('找不到页面')} />,
              },
            ],
          },
        ],
      },
    ],
  },
]);


