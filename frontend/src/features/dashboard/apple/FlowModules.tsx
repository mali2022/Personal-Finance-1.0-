import { useState } from 'react';
import {
  AppleCard,
  AppleChart,
  AppleEmpty,
  AppleSegmented,
  DeltaBadge,
} from '../../../components/apple';
import { ErrorState } from '../../../components/Feedback';
import { Money } from '../../../components/Money';
import { t as tr } from '../../../i18n';
import type { Currency } from '../../../types';
import { decimal, minor } from '../../../utils/finance';
import {
  formatPercent,
  trendSavingsRate,
  useMonthlyFlow,
  useNetWorthSeries,
} from '../../overview';
import {
  incomeExpenseTrendOption,
  monthShort,
  netWorthOption,
  savingsOption,
} from './charts';
import {
  DashboardModule,
  Metric,
  PrivacyState,
} from './moduleFrame';

export type NetWorthRange = '30d' | '90d' | '1y';

const RANGE_OPTIONS = [
  { value: '30d', label: '30 天' },
  { value: '90d', label: '90 天' },
  { value: '1y', label: '1 年' },
] as const;

/** Module 1 — income / expense bars with the exact monthly ledger totals. */
export function IncomeExpenseTrendModule({
  currency,
  privacy,
}: {
  currency: Currency;
  privacy: boolean;
}) {
  const [monthsKey, setMonthsKey] = useState<'6' | '12'>('6');
  const months = Number(monthsKey) as 6 | 12;
  const flow = useMonthlyFlow(currency, months);
  const points = flow.data?.points ?? [];
  const income = flow.data?.income;
  const expense = flow.data?.expense;
  const surplus =
    income !== undefined && expense !== undefined
      ? decimal(minor(income) - minor(expense))
      : undefined;
  return (
    <DashboardModule id="trend" span={8}>
      <AppleCard
        title={tr('收入与支出趋势')}
        action={
          <AppleSegmented
            size="sm"
            ariaLabel={tr('趋势月数')}
            value={monthsKey}
            options={[
              { value: '6', label: tr('6 个月') },
              { value: '12', label: tr('12 个月') },
            ]}
            onChange={setMonthsKey}
          />
        }
        loading={!privacy && flow.isPending}
      >
        {privacy ? (
          <PrivacyState label={tr('收支趋势')} />
        ) : flow.isError ? (
          <ErrorState error={flow.error} retry={() => flow.refetch()} />
        ) : points.length === 0 ? (
          <AppleEmpty
            title={tr('所选区间暂无收支记录')}
            description={tr('记录第一笔收支后，这里会显示月度收入、支出与结余。')}
          />
        ) : (
          <>
            <div className="dash-metric-row">
              <Metric
                label={tr('收入合计')}
                value={income}
                currency={currency}
                tone="positive"
              />
              <Metric
                label={tr('支出合计')}
                value={expense}
                currency={currency}
                tone="negative"
              />
              <Metric label={tr('结余')} value={surplus} currency={currency} />
            </div>
            <AppleChart
              option={incomeExpenseTrendOption(
                points.map((point) => ({
                  month: point.period,
                  income: point.income,
                  expense: point.expense,
                })),
                currency,
              )}
              height={232}
              ariaLabel={tr('近{0}个月收入与支出趋势图，悬停可读取精确金额', months)}
            />
          </>
        )}
      </AppleCard>
    </DashboardModule>
  );
}

/** Module 2 — net-worth history (account ledger basis) with 30d/90d/1y. */
export function NetWorthModule({
  currency,
  privacy,
  range,
  onRangeChange,
}: {
  currency: Currency;
  privacy: boolean;
  range: NetWorthRange;
  onRangeChange: (range: NetWorthRange) => void;
}) {
  const netWorth = useNetWorthSeries(currency, range);
  const data = netWorth.data;
  const points = data?.points ?? [];
  return (
    <DashboardModule id="networth" span={12}>
      <AppleCard
        title={tr('净资产历史变化')}
        action={
          <AppleSegmented
            size="sm"
            ariaLabel={tr('净资产区间（模块）')}
            value={range}
            options={RANGE_OPTIONS.map((option) => ({
              value: option.value,
              label: tr(option.label),
            }))}
            onChange={onRangeChange}
          />
        }
        loading={!privacy && netWorth.isPending}
      >
        {privacy ? (
          <PrivacyState label={tr('净资产变化')} />
        ) : netWorth.isError ? (
          <ErrorState
            error={netWorth.error}
            retry={() => netWorth.refetch()}
          />
        ) : !data || points.length === 0 ? (
          <AppleEmpty
            title={tr('暂无净资产历史')}
            description={tr('当前区间没有可用的账户余额快照。')}
          />
        ) : (
          <>
            <div className="dash-hero-row">
              <div className="dash-hero-main">
                <span className="dash-hero-label">{tr('期末净资产')}</span>
                <span className="dash-hero-value">
                  <Money value={data.netWorth} currency={currency} />
                </span>
                <span className="dash-hero-change">
                  <DeltaBadge
                    amount={data.change}
                    percent={data.changePercent}
                    currency={currency}
                  />
                  <span className="pf-faint">{tr('区间净变化')}</span>
                </span>
              </div>
              <div className="dash-hero-side">
                <Metric
                  label={tr('期初净资产')}
                  value={data.opening}
                  currency={currency}
                />
                <Metric
                  label={tr('资产合计')}
                  value={data.assets}
                  currency={currency}
                />
                <Metric
                  label={tr('负债合计')}
                  value={data.liabilities}
                  currency={currency}
                />
              </div>
            </div>
            <AppleChart
              option={netWorthOption(points, currency)}
              height={216}
              ariaLabel={tr('净资产历史变化图，悬停可读取精确金额')}
            />
            {data.excludedCurrencies.length > 0 ? (
              <p className="dash-warning">
                {tr(
                  '未纳入人民币净资产的外币账户：{0}。汇率缺失时请以账户明细为准。',
                  data.excludedCurrencies.join('、'),
                )}
              </p>
            ) : null}
          </>
        )}
      </AppleCard>
    </DashboardModule>
  );
}

/** Module 7 — surplus + savings rate derived from the monthly flow API only. */
export function SavingsModule({
  currency,
  privacy,
}: {
  currency: Currency;
  privacy: boolean;
}) {
  const flow = useMonthlyFlow(currency, 6);
  const points = flow.data?.points ?? [];
  const rows = trendSavingsRate(
    points.map((point) => ({
      month: point.period,
      income: point.income,
      expense: point.expense,
    })),
  );
  const computable = rows.filter((row) => row.rate !== null);
  const latest = computable[computable.length - 1];
  const averageSurplus = rows.length
    ? decimal(rows.reduce((sum, row) => sum + minor(row.surplus), 0n) / BigInt(rows.length))
    : undefined;
  const uncomputable = rows.filter((row) => row.rate === null);
  return (
    <DashboardModule id="savings" span={4}>
      <AppleCard
        title={tr('储蓄率与结余趋势')}
        loading={!privacy && flow.isPending}
      >
        {privacy ? (
          <PrivacyState label={tr('储蓄率与结余')} />
        ) : flow.isError ? (
          <ErrorState error={flow.error} retry={() => flow.refetch()} />
        ) : rows.length === 0 ? (
          <AppleEmpty
            title={tr('暂无结余数据')}
            description={tr('所选月份没有收入与支出记录。')}
          />
        ) : (
          <>
            <div className="dash-metric-row is-compact">
              <Metric
                label={tr('最近储蓄率')}
                text={formatPercent(latest?.rate ?? null)}
                currency={currency}
              />
              <Metric
                label={tr('平均月结余')}
                value={averageSurplus}
                currency={currency}
              />
              <Metric
                label={tr('不可计算月份')}
                text={tr('{0} 个月', uncomputable.length)}
                currency={currency}
              />
            </div>
            <AppleChart
              option={savingsOption(rows, currency)}
              height={196}
              ariaLabel={tr('储蓄率与结余趋势图，悬停可读取数值')}
            />
            {uncomputable.length > 0 ? (
              <p className="dash-note">
                {tr('收入为 0，储蓄率不可计算：')}
                {uncomputable.map((row) => monthShort(row.month)).join('、')}
              </p>
            ) : null}
          </>
        )}
      </AppleCard>
    </DashboardModule>
  );
}
