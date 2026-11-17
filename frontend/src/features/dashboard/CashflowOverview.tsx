import { Alert, Card, Skeleton, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { cashflowApi } from '../../api/financialPlanning';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
export function CashflowOverview({ currency }: { currency: string }) {
  const start = dayjs().format('YYYY-MM-DD');
  const end = dayjs().add(30, 'day').format('YYYY-MM-DD');
  const query = useQuery({
    queryKey: ['dashboard-cashflow', currency, start, end],
    queryFn: () =>
      cashflowApi.forecast({ currency, start, end, page: 1, pageSize: 20 }),
    staleTime: 60000,
    retry: false,
  });
  return (
    <Card
      title="未来 30 天现金流"
      extra={<Link to="/cashflow">查看依据与情景</Link>}
    >
      <Typography.Paragraph type="secondary">
        {start} — {end} · {currency}
      </Typography.Paragraph>
      {query.isPending ? (
        <Skeleton active />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <Space size="large" wrap>
            {[
              ['期初流动现金', query.data.opening],
              ['预计流入', query.data.inflow],
              ['预计流出', query.data.outflow],
              ['预计期末现金', query.data.closing],
              ['扣除预留及承诺后可用', query.data.freelyAvailable],
            ].map(([label, value]) => (
              <div key={label}>
                <Typography.Text type="secondary">{label}</Typography.Text>
                <div>
                  <Money value={value} currency={currency} />
                </div>
              </div>
            ))}
          </Space>
          <Alert
            style={{ marginTop: 16 }}
            type={query.data.unresolved.length ? 'warning' : 'info'}
            message={
              query.data.unresolved.length
                ? `存在 ${query.data.unresolved.length} 项未解决数据，预测不完整`
                : '预测仅基于已记录计划，不代表确定结果'
            }
            description={query.data.assumptions}
          />
          {query.data.unresolved.map((item) => (
            <p key={item.sourceId}>
              {item.name || item.sourceId}：{item.reason}
            </p>
          ))}
          {!query.data.events.total && (
            <p>暂无已记录的未来事件；未记录收入与支出不会自动推算。</p>
          )}
          {query.data.sampled && (
            <p>{query.data.samplingRule || '结果包含采样，请查看预测详情。'}</p>
          )}
        </>
      )}
    </Card>
  );
}
