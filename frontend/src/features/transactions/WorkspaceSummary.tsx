import { Alert, Button, Skeleton } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { workspaceApi } from './workspaceApi';
import { t as tr, useLocale } from '../../i18n';
import { formatMoney } from '../../utils/finance';
import { useUI } from '../../stores/ui';
import type { TransactionFilters } from '../../types';
import { useMobile } from '../../hooks/useMobile';

export function WorkspaceSummary({
  filters,
  user,
}: {
  filters: TransactionFilters;
  user?: string;
}) {
  useLocale();
  const mobile = useMobile();
  const hidden = useUI((s) => s.hidden);
  const scope: Partial<TransactionFilters> = { ...filters };
  delete scope.page;
  delete scope.pageSize;
  delete scope.sort;
  const q = useQuery({
    queryKey: ['transactions', 'workspace-summary', user, scope],
    queryFn: ({ signal }) => workspaceApi.summary(scope, signal),
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: false,
  });
  if (q.isPending) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (q.isError)
    return (
      <Alert
        className="mb16"
        showIcon
        type="warning"
        message={tr('筛选统计加载失败')}
        action={
          <Button loading={q.isFetching} onClick={() => q.refetch()}>
            {tr('重试')}
          </Button>
        }
      />
    );
  return (
    <section
      className="transaction-summary"
      aria-label={tr('当前筛选结果统计')}
      aria-busy={q.isFetching}
    >
      <div className="transaction-counts">
        {[
          [tr('总笔数'), q.data.total],
          [tr('待确认交易'), q.data.pending],
          [tr('异常交易'), q.data.anomalies],
          [tr('未分类交易'), q.data.uncategorized],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{hidden ? '••••' : value}</strong>
          </div>
        ))}
      </div>
      {q.data.currencies.map((c) => (
        <div key={c.currency} className="transaction-currency-summary">
          <b>{c.currency}</b>
          <div className="transaction-metrics">
            {(
              [
                ['总收入', c.income],
                ['总支出', c.expense],
                ['净现金流', c.netCashFlow],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <span>{tr(label)}</span>
                <strong>{formatMoney(value, c.currency, hidden)}</strong>
              </div>
            ))}
          </div>
          <details className="workspace-secondary-metrics" open={!mobile}>
            <summary>{tr('更多指标')}</summary>
            <div className="transaction-metrics">
              {(
                [
                  ['转入', c.transferIn],
                  ['转出', c.transferOut],
                  ['退款金额', c.refunds],
                  ['平均支出', c.averageExpense],
                  ['最大支出', c.maxExpense],
                  ['退款后净支出', c.netExpense],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <span>{tr(label)}</span>
                  <strong>{formatMoney(value, c.currency, hidden)}</strong>
                </div>
              ))}
            </div>
          </details>
        </div>
      ))}
    </section>
  );
}
