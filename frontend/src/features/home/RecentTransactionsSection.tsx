import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  HistoryOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { AppleCard, AppleEmpty, SkeletonCard } from '../../components/apple';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { Sensitive } from '../../components/Sensitive';
import { accountApi, categoryApi } from '../../api/finance';
import { transactionDisplayLabel } from '../../constants/mappings';
import { formatDate } from '../../utils/finance';
import { useDashboardSummary } from '../overview';
import { t, useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';

function toneOf(type: string): 'income' | 'expense' | 'transfer' {
  if (type === 'Income' || type === 'Refund') return 'income';
  if (type === 'Expense' || type === 'RewardReversal' || type === 'AssetLoss')
    return 'expense';
  return 'transfer';
}

/**
 * Recent ledger entries for the selected month. The list reuses the shared
 * `['dashboard', month]` aggregate (no extra transaction request), while the
 * account and category names come from the app-wide caches used by the
 * dashboard list. Tapping a row opens the existing detail drawer route.
 */
export function RecentTransactionsSection({ month }: { month: string }) {
  useLocale();
  const openEntry = useUI((state) => state.openEntry);
  const summary = useDashboardSummary(month);
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
    staleTime: 60_000,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
    staleTime: 60_000,
  });
  const items = summary.data?.recentTransactions || [];
  const visible = items.slice(0, 5);

  return (
    <div className="pf-col-5 home-module home-recent" data-testid="home-recent">
      <AppleCard
        flush
        title={
          <>
            <HistoryOutlined aria-hidden="true" />
            {t('最近交易')}
          </>
        }
        footer={
          <span className="pf-section-head home-recent-foot">
            <span>
              {t('显示最近 {0} 笔', visible.length)}
            </span>
            <Link className="pf-link" to="/transactions">
              {t('查看全部')}
              <ArrowRightOutlined aria-hidden="true" />
            </Link>
          </span>
        }
      >
        {summary.isPending ? (
          <div className="home-recent-loading">
            <SkeletonCard rows={5} />
          </div>
        ) : summary.isError ? (
          <div className="home-recent-loading">
            <ErrorState error={summary.error} retry={() => summary.refetch()} />
          </div>
        ) : visible.length === 0 ? (
          <div className="home-recent-empty">
            <AppleEmpty
              title={t('还没有交易记录')}
              description={t('记下生活的第一笔，财务概览会自动更新')}
              action={
                <button
                  type="button"
                  className="pf-link"
                  onClick={() => openEntry('Expense')}
                >
                  {t('记下第一笔')}
                </button>
              }
            />
          </div>
        ) : (
          <ul className="pf-list home-recent-list">
            {visible.map((transaction) => {
              const tone = toneOf(transaction.type);
              const category = transaction.splits.length
                ? t('多分类拆分')
                : categories.data?.find(
                    (item) => item.id === transaction.categoryId,
                  )?.name || t('未分类');
              const account = accounts.data?.find(
                (item) => item.id === transaction.accountId,
              )?.name;
              const name =
                transaction.merchant ||
                transaction.note ||
                transactionDisplayLabel(transaction);
              const occurred = formatDate(transaction.occurredAt, true);
              return (
                <li key={transaction.id}>
                  <Link
                    className="pf-row home-recent-row"
                    to={`/transactions/${transaction.id}`}
                  >
                    <span className={`pf-row-icon is-${tone}`}>
                      {tone === 'income' ? (
                        <ArrowDownOutlined aria-hidden="true" />
                      ) : tone === 'expense' ? (
                        <ArrowUpOutlined aria-hidden="true" />
                      ) : (
                        <SwapOutlined aria-hidden="true" />
                      )}
                    </span>
                    <span className="pf-row-main">
                      <span className="pf-row-title">
                        <Sensitive>{name}</Sensitive>
                        {transaction.status === 'NeedsReview' ? (
                          <span
                            className="home-review-dot"
                            title={t('待确认')}
                            aria-label={t('待确认')}
                          />
                        ) : null}
                      </span>
                      <span className="pf-row-meta">
                        <span>{transactionDisplayLabel(transaction)}</span>
                        <i aria-hidden="true">·</i>
                        <span>{category}</span>
                        <i aria-hidden="true">·</i>
                        <Sensitive>{account || t('账户')}</Sensitive>
                        <i aria-hidden="true">·</i>
                        <time dateTime={transaction.occurredAt}>
                          {occurred.slice(5)}
                        </time>
                      </span>
                    </span>
                    <span className="pf-row-amount">
                      <Money
                        value={transaction.amount}
                        currency={transaction.currency}
                        type={transaction.type}
                        adjustmentDirection={transaction.adjustmentDirection}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </AppleCard>
    </div>
  );
}
