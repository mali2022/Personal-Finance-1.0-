import { t as tr, useLocale } from '../../i18n';
import { lazy, Suspense } from 'react';
import { Card, Skeleton, Space } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reconciliationApi } from '../../api/operations';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
const Chart = lazy(() => import('../../components/Chart'));
export function AccountAnalysis({ id, liability = false }: { id: string; liability?: boolean }) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const q = useQuery({
    queryKey: ['reports', 'account-analysis', id],
    queryFn: () => reconciliationApi.analysis(id),
  });
  return (
    <Card
      className="mt20"
      title={liability ? tr("未偿负债与还款变化") : tr("账户资金变化")}
      extra={<Link to={`/reconciliation?accountId=${id}`}>{tr("核对实际余额")}</Link>}
    >
      {q.isPending ? (
        <Skeleton active />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        q.data && (
          <>
            <Space wrap>
              <span>
                {liability?tr("本月负债减少"):tr("本月流入")}{' '}
                <Money value={q.data.inflow} currency={q.data.currency} />
              </span>
              <span>
                {liability?tr("本月负债增加"):tr("本月流出")}{' '}
                <Money value={q.data.outflow} currency={q.data.currency} />
              </span>
            </Space>
            {hidden ? (
              <p>{tr("金额已隐藏，余额图暂停显示。")}</p>
            ) : (
              <Suspense fallback={<Skeleton active />}>
                <Chart
                  option={{
                    tooltip: { trigger: 'axis' },
                    xAxis: {
                      type: 'category',
                      data: q.data.points.map((p) => p.period),
                    },
                    yAxis: { type: 'value' },
                    series: [
                      {
                        type: 'line',
                        data: q.data.points.map((p) => liability ? Math.max(0, -Number(p.balance)) : Number(p.balance)),
                        areaStyle: { opacity: 0.08 },
                      },
                    ],
                  }}
                />
              </Suspense>
            )}
          </>
        )
      )}
    </Card>
  );
}
