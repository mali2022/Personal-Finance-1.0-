import { t as tr, useLocale } from '../../i18n';
import { Sensitive } from '../../components/Sensitive';
import { Card, Skeleton, Space, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { planningApi } from '../../api/planning';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { formatDate } from '../../utils/finance';
export function PlanningOverview() {
  useLocale();
  const capabilities = useQuery({
    queryKey: ['planningCapabilities'],
    queryFn: planningApi.capabilities,
    retry: false,
    staleTime: 300000,
  });
  const q = useQuery({
    queryKey: ['planningSummary'],
    queryFn: planningApi.summary,
    enabled: !!capabilities.data?.recurring,
    refetchInterval: 60000,
  });
  if (!capabilities.data?.recurring) return null;
  return (
    <Card
      className="mb16"
      title={tr("待确认与到期提醒")}
      extra={<Link to="/calendar">{tr("财务日历")}</Link>}
    >
      {q.isPending ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <Space wrap>
            <Link to="/recurring">
              <Tag>{tr("待确认")}{q.data.pending}</Tag>
              <Tag>{tr("逾期待确认")}{q.data.overdue}</Tag>
              <Tag>{tr("执行失败")}{q.data.failed}</Tag>
            </Link>
          </Space>
          {q.data.reminders.map((r) => (
            <p key={r.id}>
              <Sensitive>{r.name}</Sensitive> · {formatDate(r.at, true, true)} ·{' '}
              <Money value={r.amount} currency={r.currency} />
            </p>
          ))}
          {!q.data.pending && !q.data.failed && !q.data.reminders.length && (
            <p>{tr("暂无到期事项，可以创建周期交易或订阅。")}</p>
          )}
        </>
      )}
    </Card>
  );
}
