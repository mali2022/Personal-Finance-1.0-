import type { ReactNode } from 'react';
import { Button } from 'antd';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  CompassOutlined,
  SaveOutlined,
  SwapOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { AppleCard, DeltaBadge } from '../../components/apple';
import { Sensitive } from '../../components/Sensitive';
import { Money } from '../../components/Money';
import { DatePicker } from '../../components/ResponsiveDatePicker';
import { t, useLocale } from '../../i18n';
import {
  changeBetween,
  formatPercent,
  useCashForecast,
  useDashboardSummary,
  usePlanningSummary,
} from '../overview';
import { formatMonthLabel, isCurrentMonth } from './format';

function OverviewMetric({
  to,
  label,
  icon,
  value,
  caption,
  loading = false,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  loading?: boolean;
}) {
  return (
    <Link className="home-metric" to={to}>
      <span className="home-metric-label">
        {icon}
        {label}
        <ArrowRightOutlined className="home-metric-arrow" aria-hidden="true" />
      </span>
      <span className="home-metric-value" aria-busy={loading}>
        {loading ? <span className="home-metric-loading" aria-hidden="true" /> : value}
      </span>
      {loading || caption ? (
        <span className="home-metric-caption">
          {loading ? t('正在加载…') : caption}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Month-scoped control strip. Income / expense / surplus come from the
 * dashboard aggregate, budget and savings rate from the planning summary and
 * the cash figure from the rolling 30-day forecast. Each metric keeps its own
 * loading / error state so one failing endpoint never blanks the whole card.
 */
export function FinancialOverview({
  month,
  currency,
  onMonthChange,
}: {
  month: string;
  currency: string;
  onMonthChange: (month: string) => void;
}) {
  const language = useLocale();
  const summary = useDashboardSummary(month);
  const planning = usePlanningSummary();
  const cash = useCashForecast(currency, 30);
  const current = isCurrentMonth(month);
  const monthLabel = formatMonthLabel(month, language);
  const monthFormat = language === 'en' ? 'MMM YYYY' : 'YYYY年M月';
  const code = summary.data?.currency || currency;
  const budget = summary.data?.budget;
  const incomeChange =
    summary.data && summary.data.previousIncome
      ? changeBetween(summary.data.previousIncome, summary.data.income)
      : null;
  const expenseChange =
    summary.data && summary.data.previousExpense
      ? changeBetween(summary.data.previousExpense, summary.data.expense)
      : null;
  const savingsRate = planning.data?.savingsRate;
  const anyError = summary.isError || planning.isError || cash.isError;

  return (
    <div className="pf-col-12 home-module" data-testid="home-overview">
      <AppleCard
        title={
          <>
            <CalendarOutlined aria-hidden="true" />
            {t('财务概览')}
          </>
        }
        action={
          <div className="home-month">
            <DatePicker
              className="overview-date-picker"
              aria-label={t('选择账期')}
              picker="month"
              format={monthFormat}
              value={dayjs(`${month}-01`)}
              allowClear={false}
              inputReadOnly
              maxDate={dayjs().endOf('month')}
              onChange={(value) => {
                if (value) onMonthChange(value.format('YYYY-MM'));
              }}
            />
            <span className="overview-month-label">
              {current ? t('本月') : t('历史月份')}
            </span>
          </div>
        }
        footer={
          anyError ? (
            <span className="home-inline-error" role="status">
              <WarningOutlined aria-hidden="true" />
              {t('部分指标暂时不可用')}
              <Button
                type="link"
                size="small"
                onClick={() => {
                  void summary.refetch();
                  void planning.refetch();
                  void cash.refetch();
                }}
              >
                {t('重试')}
              </Button>
            </span>
          ) : (
            <span>
              {t('统计期间')} · {monthLabel}
              {current ? '' : ` (${t('规划汇总为当前口径')})`}
            </span>
          )
        }
      >
        <div className="home-metrics">
          <OverviewMetric
            to={`/transactions?month=${month}&type=Income`}
            label={t('本月收入')}
            icon={<ArrowDownOutlined aria-hidden="true" />}
            loading={summary.isPending}
            value={
              summary.data ? (
                <Money value={summary.data.income} currency={code} />
              ) : (
                '—'
              )
            }
            caption={
              summary.isError ? (
                t('暂时不可用')
              ) : incomeChange ? (
                <DeltaBadge
                  amount={incomeChange.amount}
                  percent={incomeChange.percent}
                  currency={code}
                  label={t('较上月')}
                />
              ) : undefined
            }
          />
          <OverviewMetric
            to={`/transactions?month=${month}&type=Expense`}
            label={t('本月支出')}
            icon={<ArrowUpOutlined aria-hidden="true" />}
            loading={summary.isPending}
            value={
              summary.data ? (
                <Money value={summary.data.expense} currency={code} />
              ) : (
                '—'
              )
            }
            caption={
              summary.isError ? (
                t('暂时不可用')
              ) : expenseChange ? (
                <DeltaBadge
                  amount={expenseChange.amount}
                  percent={expenseChange.percent}
                  currency={code}
                  invert
                  label={t('较上月')}
                />
              ) : undefined
            }
          />
          <OverviewMetric
            to={`/transactions?month=${month}`}
            label={t('本月结余')}
            icon={<WalletOutlined aria-hidden="true" />}
            loading={summary.isPending}
            value={
              summary.data ? (
                <Money value={summary.data.surplus} currency={code} />
              ) : (
                '—'
              )
            }
            caption={summary.isError ? t('暂时不可用') : undefined}
          />
          <OverviewMetric
            to="/budgets"
            label={t('可用预算')}
            icon={<SaveOutlined aria-hidden="true" />}
            loading={planning.isPending}
            value={
              planning.data?.budgetRemaining != null ? (
                <Money value={planning.data.budgetRemaining} currency={code} />
              ) : (
                '—'
              )
            }
            caption={
              planning.isError
                ? t('暂时不可用')
                : budget
                  ? (
                    <>
                      {t('预算总额')}{' '}
                      <Money value={budget.total} currency={code} />
                    </>
                  )
                  : undefined
            }
          />
          <OverviewMetric
            to="/planning/indicators"
            label={t('储蓄率')}
            icon={<CompassOutlined aria-hidden="true" />}
            loading={planning.isPending}
            value={
              savingsRate != null && savingsRate !== '' ? (
                <Sensitive>{formatPercent(Number(savingsRate))}</Sensitive>
              ) : (
                '—'
              )
            }
            caption={planning.isError ? t('暂时不可用') : undefined}
          />
          <OverviewMetric
            to="/cashflow"
            label={t('近期现金流')}
            icon={<SwapOutlined aria-hidden="true" />}
            loading={cash.isPending}
            value={
              cash.data ? (
                <Money value={cash.data.freelyAvailable} currency={code} />
              ) : (
                '—'
              )
            }
            caption={
              cash.isError ? (
                t('暂时不可用')
              ) : cash.data ? (
                <>
                  {t('未来 30 天最低余额')}{' '}
                  <Money value={cash.data.minimum} currency={code} />
                </>
              ) : undefined
            }
          />
        </div>
      </AppleCard>
    </div>
  );
}
