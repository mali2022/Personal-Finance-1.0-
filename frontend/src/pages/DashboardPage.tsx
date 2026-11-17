import { useState } from 'react';
import { DownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PageTitle } from '../components/PageTitle';
import { DatePicker } from '../components/ResponsiveDatePicker';
import { ErrorState } from '../components/Feedback';
import { AppleSegmented } from '../components/apple';
import { t as tr, useLocale } from '../i18n';
import { useUI } from '../stores/ui';
import { usePreferredCurrency } from '../hooks/useCurrency';
import { useMobile } from '../hooks/useMobile';
import { RANGES, useDashboardSummary } from '../features/overview';
import {
  APPLE_MODULE_LABELS,
  useAppleDashboardLayout,
  type AppleDashboardModule,
} from '../features/dashboard/apple/useAppleDashboardLayout';
import { DashboardLayoutControls } from '../features/dashboard/apple/DashboardLayoutControls';
import {
  NetWorthModule,
  IncomeExpenseTrendModule,
  SavingsModule,
  type NetWorthRange,
} from '../features/dashboard/apple/FlowModules';
import {
  BudgetModule,
  CategoriesModule,
  StructureModule,
} from '../features/dashboard/apple/StructureModules';
import {
  AiInsightsModule,
  AnomaliesModule,
  CashflowModule,
  GoalsModule,
} from '../features/dashboard/apple/PlanningModules';
import { TransactionCalendar } from '../features/dashboard/TransactionCalendar';
import { RecentTransactions } from '../features/dashboard/RecentTransactions';
import { AccountBalanceCards } from '../features/dashboard/AccountBalanceCards';
import { OnThisDayCard } from '../features/dashboard/OnThisDayCard';
import { QuickActions } from '../features/dashboard/QuickActions';
import { PlanningOverview } from '../features/planning/PlanningOverview';
import PlanningFinancialSummary from '../features/planning/FinancialSummary';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
import '../design/dashboard.css';
// Legacy dashboard widgets (calendar, recent transactions, accounts, planning)
// keep their own stylesheet; without it their rows collapse into inline text.
import '../features/dashboard/widgets.css';
import '../design/apple-dashboard.css';

/**
 * Professional financial analysis workbench (/dashboard).
 *
 * Every analysis surface owns its query state so one failing endpoint can never
 * blank the page. The month filter is the single source of truth for every
 * month-scoped module; "current" modules are explicitly labelled. Retained
 * legacy capabilities live in a separate, always-visible tools section.
 */
export default function DashboardPage() {
  useLocale();
  const privacy = useUI((state) => state.hidden);
  const currency = usePreferredCurrency();
  const layout = useAppleDashboardLayout();
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));
  const [range, setRange] = useState<NetWorthRange>('90d');
  const [transactionId, setTransactionId] = useState<string>();
  const mobile = useMobile();
  // Mobile defaults to collapsed tools so analysis modules stay first; desktop
  // defaults to expanded. An explicit toggle overrides the responsive default.
  const [toolsOverride, setToolsOverride] = useState<boolean | null>(null);
  const toolsOpen = toolsOverride ?? !mobile;
  const summary = useDashboardSummary(month);
  const currentMonth = dayjs().format('YYYY-MM');

  const rangeOptions = RANGES.filter((entry) => entry.key !== '7d').map(
    (entry) => ({
      value: entry.key as NetWorthRange,
      label: tr(entry.shortLabel),
      title: tr(entry.label),
    }),
  );

  const renderModule = (module: AppleDashboardModule) => {
    switch (module) {
      case 'networth':
        return (
          <NetWorthModule
            key={module}
            currency={currency}
            privacy={privacy}
            range={range}
            onRangeChange={setRange}
          />
        );
      case 'trend':
        return (
          <IncomeExpenseTrendModule
            key={module}
            currency={currency}
            privacy={privacy}
          />
        );
      case 'savings':
        return (
          <SavingsModule key={module} currency={currency} privacy={privacy} />
        );
      case 'categories':
        return (
          <CategoriesModule
            key={module}
            month={month}
            currency={currency}
            privacy={privacy}
          />
        );
      case 'budget':
        return (
          <BudgetModule
            key={module}
            month={month}
            currency={currency}
            privacy={privacy}
          />
        );
      case 'structure':
        return (
          <StructureModule
            key={module}
            month={month}
            currency={currency}
            privacy={privacy}
          />
        );
      case 'cashflow':
        return (
          <CashflowModule key={module} currency={currency} privacy={privacy} />
        );
      case 'goals':
        return (
          <GoalsModule key={module} currency={currency} privacy={privacy} />
        );
      case 'anomalies':
        return <AnomaliesModule key={module} privacy={privacy} />;
      case 'ai':
        return <AiInsightsModule key={module} month={month} />;
      default:
        return null;
    }
  };

  return (
    <div className="pf-page dash-page">
      <header className="pf-page-head">
        <div className="pf-hello">
          <PageTitle>{tr('仪表盘')}</PageTitle>
        </div>
        <div className="pf-head-actions">
          <QuickActions />
        </div>
      </header>

      <div className="dash-filter" data-testid="dashboard-filter">
        <div className="dash-filter-main">
          <span className="dash-filter-label">{tr('账期')}</span>
          <DatePicker
            className="overview-date-picker"
            aria-label={tr('选择账期')}
            picker="month"
            format={tr('YYYY年M月')}
            value={dayjs(month)}
            allowClear={false}
            inputReadOnly
            maxDate={dayjs().endOf('month')}
            onChange={(value) => {
              if (value) setMonth(value.format('YYYY-MM'));
            }}
          />
          <span
            className={`pf-pill${month === currentMonth ? ' is-positive' : ' is-info'}`}
          >
            {month === currentMonth ? tr('本月') : tr('历史账期')}
          </span>
          <span className="dash-filter-sep" aria-hidden="true" />
          <span className="dash-filter-label">{tr('区间')}</span>
          <AppleSegmented
            size="sm"
            ariaLabel={tr('净资产区间')}
            value={range}
            options={rangeOptions}
            onChange={setRange}
          />
        </div>
        <DashboardLayoutControls layout={layout} />
      </div>

      <div className="pf-bento dash-bento" data-testid="dashboard-bento">
        {layout.visibleOrder.length > 0 ? (
          layout.visibleOrder.map((module) => renderModule(module))
        ) : (
          <div className="pf-card dash-empty-layout">
            <div className="pf-state">
              <strong>{tr('所有分析模块已隐藏')}</strong>
              <span>{tr('使用「模块布局」恢复默认显示或打开需要的模块。')}</span>
              <button
                type="button"
                className="pf-link"
                onClick={() => layout.reset()}
              >
                {tr('恢复默认布局')}
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="dash-tools" aria-label={tr('更多工具与明细')}>
        <div className="pf-section-head dash-tools-head">
          <h2 className="pf-section-title">{tr('更多工具与明细')}</h2>
          <button
            type="button"
            className="pf-link dash-tools-toggle"
            aria-expanded={toolsOpen}
            aria-controls="dash-tools-body"
            onClick={() => setToolsOverride(!toolsOpen)}
          >
            {toolsOpen ? tr('收起工具') : tr('展开工具')}
            <DownOutlined
              aria-hidden="true"
              className={toolsOpen ? 'is-open' : undefined}
            />
          </button>
        </div>
        {toolsOpen ? (
          <div id="dash-tools-body" className="dash-tools-body">
            <QuickActions secondary />
            {summary.isError ? (
              <ErrorState
                error={summary.error}
                retry={() => summary.refetch()}
              />
            ) : null}
            <div className="pf-bento dash-bento dash-tools-grid">
              <div className="dash-module pf-col-12">
                <TransactionCalendar
                  month={month}
                  onDetail={(transaction) => setTransactionId(transaction.id)}
                />
              </div>
              <div className="dash-module pf-col-12">
                <RecentTransactions
                  items={summary.data?.recentTransactions ?? []}
                  onDetail={(transaction) =>
                    setTransactionId(transaction.id)
                  }
                />
              </div>
              <div className="dash-module pf-col-12">
                <AccountBalanceCards accounts={summary.data?.accounts ?? []} />
              </div>
              <div className="dash-module pf-col-12">
                <PlanningOverview />
              </div>
              <div className="dash-module pf-col-12">
                <PlanningFinancialSummary />
              </div>
              <div className="dash-module pf-col-12">
                <OnThisDayCard />
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="dash-footer">
        <span className="workspace-dot" aria-hidden="true" />
        <span className="pf-faint">
          {tr('模块 {0} 个 · 已显示 {1} 个', Object.keys(APPLE_MODULE_LABELS).length, layout.visibleOrder.length)}
        </span>
      </footer>

      <TransactionDrawer
        id={transactionId}
        onClose={() => setTransactionId(undefined)}
      />
    </div>
  );
}
