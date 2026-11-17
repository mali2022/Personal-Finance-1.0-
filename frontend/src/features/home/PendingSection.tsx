import { Link } from 'react-router-dom';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  FileSearchOutlined,
  ImportOutlined,
  InboxOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { AppleCard, AppleEmpty, SkeletonCard } from '../../components/apple';
import { ErrorState } from '../../components/Feedback';
import { t, useLocale } from '../../i18n';
import {
  formatPercent,
  usePendingSummary,
  useReconciliationOverview,
} from '../overview';
import { transactionLinks } from '../overview/links';

function countTone(count: number) {
  return count === 0 ? 'is-clear' : 'is-warn';
}

/**
 * Pending finance work: review / anomaly / uncategorized counts from the
 * transactions summary plus smart-reconciliation coverage. The basis string is
 * shown exactly as the API returns it; when the reconciliation denominator is
 * zero we render an honest empty state instead of a fake 0 %.
 */
export function PendingSection() {
  useLocale();
  const pending = usePendingSummary();
  const reconciliation = useReconciliationOverview();
  const coverage = reconciliation.data?.coverage;
  const coverageValue =
    coverage === null || coverage === undefined ? null : Number(coverage);
  const denominator = reconciliation.data?.denominator;
  const numerator = reconciliation.data?.numerator;
  const nothingPending =
    (pending.data?.pending || 0) +
      (pending.data?.anomalies || 0) +
      (pending.data?.uncategorized || 0) ===
    0;

  return (
    <div className="pf-col-4 home-module home-pending" data-testid="home-pending">
      <AppleCard
        title={
          <>
            <InboxOutlined aria-hidden="true" />
            {t('待处理财务事项')}
          </>
        }
        action={
          <Link className="pf-link" to={transactionLinks.reviewCenter}>
            {t('去整理')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
        }
      >
        {pending.isPending ? (
          <SkeletonCard rows={3} />
        ) : pending.isError ? (
          <ErrorState error={pending.error} retry={() => pending.refetch()} />
        ) : (
          <>
            {nothingPending ? (
              <span className="pf-pill is-positive home-clear-pill">
                <CheckCircleOutlined aria-hidden="true" />
                {t('账本暂无待处理事项')}
              </span>
            ) : null}
            <div className="home-pending-stats">
              <Link
                className="home-pending-stat"
                to={transactionLinks.pendingReview}
              >
                <span>{t('待确认')}</span>
                <strong className={countTone(pending.data?.pending || 0)}>
                  {pending.data?.pending ?? '—'}
                </strong>
              </Link>
              <Link
                className="home-pending-stat"
                to={transactionLinks.anomalies}
              >
                <span>{t('异常')}</span>
                <strong className={countTone(pending.data?.anomalies || 0)}>
                  {pending.data?.anomalies ?? '—'}
                </strong>
              </Link>
              <Link
                className="home-pending-stat"
                to={transactionLinks.uncategorized}
              >
                <span>{t('未分类')}</span>
                <strong className={countTone(pending.data?.uncategorized || 0)}>
                  {pending.data?.uncategorized ?? '—'}
                </strong>
              </Link>
            </div>
          </>
        )}

        <div className="pf-divider" />

        <div className="home-recon">
          <div className="home-recon-head">
            <span className="home-recon-title">
              <FileSearchOutlined aria-hidden="true" />
              {t('智能对账覆盖')}
            </span>
            <Link className="pf-link" to="/reconciliation">
              {t('打开对账')}
              <ArrowRightOutlined aria-hidden="true" />
            </Link>
          </div>
          {reconciliation.isPending ? (
            <SkeletonCard rows={2} />
          ) : reconciliation.isError ? (
            <ErrorState
              error={reconciliation.error}
              retry={() => reconciliation.refetch()}
            />
          ) : denominator === 0 ? (
            <AppleEmpty title={t('暂无可对账数据')} />
          ) : (
            <>
              <div className="home-recon-values">
                <strong className="home-recon-value">
                  {coverageValue !== null && Number.isFinite(coverageValue)
                    ? formatPercent(coverageValue)
                    : '—'}
                </strong>
                <span className="home-recon-sub">
                  {numerator ?? 0} / {denominator ?? 0}
                </span>
              </div>
              <div
                className="home-coverage-bar"
                role="img"
                aria-label={t('对账覆盖率 {0}', formatPercent(coverageValue))}
              >
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        coverageValue !== null && Number.isFinite(coverageValue)
                          ? coverageValue
                          : 0,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <div className="home-recon-foot">
                <span className="pf-pill is-warning">
                  <WarningOutlined aria-hidden="true" />
                  {t('冲突')} {reconciliation.data?.conflictCount ?? 0}
                </span>
                <Link className="pf-link" to="/import">
                  <ImportOutlined aria-hidden="true" />
                  {t('导入账单')}
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="home-pending-links">
          <Link className="pf-link" to={transactionLinks.reviewCenter}>
            {t('待整理中心')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
          <Link className="pf-link" to="/import">
            <ImportOutlined aria-hidden="true" />
            {t('导入账单')}
          </Link>
        </div>
      </AppleCard>
    </div>
  );
}
