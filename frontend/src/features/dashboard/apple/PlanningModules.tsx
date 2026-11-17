import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightOutlined, RobotOutlined } from '@ant-design/icons';
import {
  AppleCard,
  AppleChart,
  AppleEmpty,
  AppleSegmented,
  SkeletonCard,
} from '../../../components/apple';
import { ErrorState } from '../../../components/Feedback';
import { Money } from '../../../components/Money';
import { t as tr } from '../../../i18n';
import type { Currency } from '../../../types';
import { formatDate, minor } from '../../../utils/finance';
import {
  useCashForecast,
  useGoalBoard,
  usePendingSummary,
  useReconciliationOverview,
} from '../../overview';
import { transactionLinks } from '../../overview/links';
import { FinancialInsights } from '../FinancialInsights';
import { cashBalanceOption } from './charts';
import {
  Bar,
  DashboardModule,
  Metric,
  ModuleNote,
  PrivacyState,
} from './moduleFrame';

/** Module 6 — rolling cash forecast with an honest "no events" disclosure. */
export function CashflowModule({
  currency,
  privacy,
}: {
  currency: Currency;
  privacy: boolean;
}) {
  const [daysKey, setDaysKey] = useState<'30' | '60' | '90'>('30');
  const days = Number(daysKey) as 30 | 60 | 90;
  const forecast = useCashForecast(currency, days);
  const data = forecast.data;
  const series = data?.days ?? [];
  const unresolved = data?.unresolved ?? [];
  const hasFutureEvents =
    !!data &&
    ((data.events?.total ?? 0) > 0 ||
      minor(data.inflow) > 0n ||
      minor(data.outflow) > 0n);
  return (
    <DashboardModule id="cashflow" span={8}>
      <AppleCard
        title={tr('现金流分析')}
        action={
          <AppleSegmented
            size="sm"
            ariaLabel={tr('现金流预测区间')}
            value={daysKey}
            options={[
              { value: '30', label: tr('30 天') },
              { value: '60', label: tr('60 天') },
              { value: '90', label: tr('90 天') },
            ]}
            onChange={setDaysKey}
          />
        }
        loading={!privacy && forecast.isPending}
        footer={
          <div className="dash-foot-stack">
            {data?.assumptions ? (
              <ModuleNote>{data.assumptions}</ModuleNote>
            ) : null}
            {unresolved.length > 0 ? (
              <ModuleNote>
                {tr('未解析来源 {0} 项：', unresolved.length)}
                {unresolved
                  .slice(0, 3)
                  .map((item) => item.name || item.reason)
                  .join('、')}
                {unresolved.length > 3 ? tr(' 等') : ''}
              </ModuleNote>
            ) : null}
          </div>
        }
      >
        {privacy ? (
          <PrivacyState label={tr('现金流预测')} />
        ) : forecast.isError ? (
          <ErrorState
            error={forecast.error}
            retry={() => forecast.refetch()}
          />
        ) : !data || series.length === 0 ? (
          <AppleEmpty
            title={tr('暂无现金流预测')}
            description={tr('添加流动性账户后，这里会按当前余额推演未来现金流。')}
          />
        ) : (
          <>
            <div className="dash-metric-row is-five">
              <Metric
                label={tr('期初余额')}
                value={data.opening}
                currency={currency}
              />
              <Metric
                label={tr('预计流入')}
                value={data.inflow}
                currency={currency}
                tone="positive"
              />
              <Metric
                label={tr('预计流出')}
                value={data.outflow}
                currency={currency}
                tone="negative"
              />
              <Metric
                label={tr('期末余额')}
                value={data.closing}
                currency={currency}
              />
              <Metric
                label={tr('自由可用')}
                value={data.freelyAvailable}
                currency={currency}
              />
            </div>
            <AppleChart
              option={cashBalanceOption(series, currency)}
              height={216}
              ariaLabel={tr('未来{0}天日余额面积图，悬停可读取精确金额', days)}
            />
            {!hasFutureEvents ? (
              <p className="dash-note">
                {tr(
                  '未来期间暂无已记录的周期交易、订阅或计划事件，曲线按当前账户余额推演，不代表预测收入或支出。',
                )}
              </p>
            ) : null}
            {data.gaps.length > 0 ? (
              <p className="dash-warning">
                {tr('存在 {0} 个账户在预测期内低于安全余额。', data.gaps.length)}
              </p>
            ) : null}
          </>
        )}
      </AppleCard>
    </DashboardModule>
  );
}

/** Module 8 — savings goals with progress, remaining amount and target date. */
export function GoalsModule({
  currency,
  privacy,
}: {
  currency: Currency;
  privacy: boolean;
}) {
  const goals = useGoalBoard(currency);
  const board = goals.data;
  const items = board?.items ?? [];
  return (
    <DashboardModule id="goals" span={4}>
      <AppleCard
        title={tr('财务目标进度')}
        action={
          <Link className="pf-link" to="/goals">
            {tr('管理目标')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
        }
        loading={!privacy && goals.isPending}
      >
        {privacy ? (
          <PrivacyState label={tr('财务目标')} />
        ) : goals.isError ? (
          <ErrorState error={goals.error} retry={() => goals.refetch()} />
        ) : items.length === 0 ? (
          <AppleEmpty
            title={tr('暂无财务目标')}
            description={tr('创建储蓄目标后，这里会显示进度、剩余金额与目标日期。')}
            action={
              <Link className="pf-link" to="/goals">
                {tr('创建目标')}
              </Link>
            }
          />
        ) : (
          <>
            <div className="dash-metric-row is-compact">
              <Metric
                label={tr('目标总额')}
                value={board?.target}
                currency={currency}
              />
              <Metric
                label={tr('已预留')}
                value={board?.reserved}
                currency={currency}
                tone="positive"
              />
              <Metric
                label={tr('进行中')}
                text={tr('{0} / {1}', board?.active ?? 0, board?.total ?? items.length)}
                currency={currency}
              />
            </div>
            <div className="dash-goals">
              {items.slice(0, 5).map((goal) => (
                <div className="dash-goal" key={goal.id}>
                  <div className="dash-goal-head">
                    <span className="dash-goal-name">{goal.name}</span>
                    <span className="dash-goal-date">
                      {formatDate(goal.targetDate)}
                    </span>
                  </div>
                  <Bar
                    percent={Number(goal.progress)}
                    tone={goal.overdue ? 'warning' : 'positive'}
                  />
                  <div className="dash-goal-meta">
                    <span>
                      {tr('剩余')} <Money value={goal.remaining} currency={currency} />
                    </span>
                    <span className="pf-faint">
                      {tr('目标')} <Money value={goal.target} currency={currency} />
                    </span>
                    {goal.overdue ? (
                      <span className="pf-pill is-warning">{tr('已逾期')}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </AppleCard>
    </DashboardModule>
  );
}

/** Module 9 — review / anomaly counts plus smart-reconciliation coverage. */
export function AnomaliesModule({ privacy }: { privacy: boolean }) {
  const pending = usePendingSummary();
  const reconciliation = useReconciliationOverview();
  const summary = pending.data;
  const recon = reconciliation.data;
  return (
    <DashboardModule id="anomalies" span={4}>
      <AppleCard
        title={tr('异常交易与待对账事项')}
        action={
          <Link className="pf-link" to="/reconciliation">
            {tr('智能对账')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
        }
        loading={!privacy && pending.isPending && !summary}
        footer={
          summary?.basis ? <ModuleNote>{summary.basis}</ModuleNote> : undefined
        }
      >
        {privacy ? (
          <PrivacyState label={tr('异常与对账')} />
        ) : pending.isError ? (
          <ErrorState error={pending.error} retry={() => pending.refetch()} />
        ) : summary ? (
          <>
            <div className="dash-issue-grid">
              <Link
                className="dash-issue"
                to={transactionLinks.pendingReview}
              >
                <strong>{summary.pending}</strong>
                <span>{tr('待复核')}</span>
              </Link>
              <Link className="dash-issue" to={transactionLinks.anomalies}>
                <strong>{summary.anomalies}</strong>
                <span>{tr('异常交易')}</span>
              </Link>
              <Link
                className="dash-issue"
                to={transactionLinks.uncategorized}
              >
                <strong>{summary.uncategorized}</strong>
                <span>{tr('未分类')}</span>
              </Link>
              <Link
                className="dash-issue"
                to={transactionLinks.allTransactions}
              >
                <strong>{summary.total}</strong>
                <span>{tr('交易总数')}</span>
              </Link>
            </div>
            <div className="dash-recon">
              <div className="dash-recon-head">
                <span>{tr('对账覆盖率')}</span>
                <Link className="pf-link" to="/reconciliation">
                  {tr('查看对账')}
                </Link>
              </div>
              {reconciliation.isPending ? (
                <SkeletonCard rows={2} />
              ) : reconciliation.isError ? (
                <ErrorState
                  error={reconciliation.error}
                  retry={() => reconciliation.refetch()}
                />
              ) : !recon || recon.denominator === 0 ? (
                <p className="dash-note">
                  {tr('尚无已导入的银行账单，覆盖率不可计算，不显示推测数值。')}
                </p>
              ) : (
                <div className="dash-metric-row is-compact">
                  <Metric
                    label={tr('覆盖率')}
                    text={recon.coverage ?? tr('不可计算')}
                  />
                  <Metric
                    label={tr('冲突')}
                    text={tr('{0} 笔', recon.conflictCount)}
                  />
                  <Metric
                    label={tr('待人工复核')}
                    text={tr('{0} 笔', recon.manualReviewCount ?? 0)}
                  />
                </div>
              )}
            </div>
          </>
        ) : null}
      </AppleCard>
    </DashboardModule>
  );
}

/** Module 10 — real DeepSeek analysis (reuses the existing insights surface). */
export function AiInsightsModule({ month }: { month: string }) {
  return (
    <DashboardModule id="ai" span={8}>
      <AppleCard
        title={
          <>
            <RobotOutlined aria-hidden="true" />
            {tr('AI 财务分析')}
          </>
        }
      >
        <div className="dash-ai-host">
          <FinancialInsights month={month} />
        </div>
      </AppleCard>
    </DashboardModule>
  );
}
