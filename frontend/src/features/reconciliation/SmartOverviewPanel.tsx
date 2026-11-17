import { Card, Empty, Table, Space, Statistic } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { formatDate } from '../../utils/finance';
import { smartApi } from './api';
export function SmartOverviewPanel() {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const q = useQuery({
    queryKey: ['smart-reconciliation', 'overview'],
    queryFn: smartApi.overview,
  });
  return (
    <Card
      title={t('智能对账总览', 'Smart reconciliation overview')}
      className="mb16"
    >
      {q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : q.data?.denominator === 0 ? (
        <Empty
          description={t(
            '暂无外部流水，请先导入文件并在工作台接收流水',
            'No external statements. Import a file, then receive its statements in the workspace.',
          )}
        />
      ) : (
        <>
          <Space wrap className="mb16">
            <Statistic
              title={t('待人工复核', 'Awaiting manual review')}
              value={q.data?.manualReviewCount ?? '—'}
            />
            <Statistic
              title={t('已知关系差异', 'Known link discrepancies')}
              value={q.data?.knownDifferenceCount ?? '—'}
            />
            <Statistic
              title={t(
                '同日同额同商户疑重',
                'Same-day amount/merchant duplicates',
              )}
              value={q.data?.suspectedDuplicateCount ?? '—'}
            />
            <Statistic
              title={t(
                '无冲突完全匹配 / 全部流水',
                'Fully matched without conflicts / all statements',
              )}
              value={`${q.data?.numerator ?? '—'} / ${q.data?.denominator ?? '—'}`}
            />
            <Statistic
              title={t('当前匹配覆盖率', 'Current matching coverage')}
              value={q.data?.coverage ?? '—'}
              suffix={q.data?.coverage != null ? '%' : undefined}
            />
            <Statistic
              title={t('冲突流水', 'Statements with conflicts')}
              value={q.data?.conflictCount ?? '—'}
            />
          </Space>
          <Table
            rowKey="accountId"
            loading={q.isPending}
            dataSource={q.data?.accounts}
            scroll={{ x: 950 }}
            columns={[
              {
                title: t('账户', 'Account'),
                render: (_, r) => (
                  <Link to={`/reconciliation?accountId=${r.accountId}`}>
                    {r.name}
                  </Link>
                ),
              },
              {
                title: t('匹配 / 全部', 'Matched / all'),
                render: (_, r) => `${r.matched} / ${r.total}`,
              },
              {
                title: t('待复核 / 部分 / 忽略', 'Pending / partial / ignored'),
                render: (_, r) => `${r.pending} / ${r.partial} / ${r.ignored}`,
              },
              { title: t('冲突', 'Conflicts'), dataIndex: 'conflicts' },
              {
                title: t('待核对金额', 'Pending gross amount'),
                render: (_, r) => (
                  <Money value={r.pendingAmount} currency={r.currency} />
                ),
              },
              {
                title: t('已确认状态金额', 'Gross amount in matched state'),
                render: (_, r) => (
                  <Money value={r.matchedAmount} currency={r.currency} />
                ),
              },
            ]}
          />
          <Table
            rowKey="date"
            size="small"
            dataSource={q.data?.trend}
            columns={[
              { title: t('日期', 'Date'), dataIndex: 'date' },
              {
                title: t('确认关系数', 'Links confirmed'),
                dataIndex: 'confirmedOperations',
              },
              {
                title: t('撤销关系数', 'Links revoked'),
                dataIndex: 'revokedOperations',
              },
            ]}
          />
          <Table
            rowKey="id"
            size="small"
            dataSource={q.data?.snapshotTrend ?? []}
            scroll={{ x: 750 }}
            columns={[
              {
                title: t('快照时间', 'Snapshot time'),
                render: (_, r) => formatDate(r.createdAt),
              },
              { title: t('账户', 'Account'), dataIndex: 'name' },
              {
                title: t('期间', 'Period'),
                render: (_, r) =>
                  `${formatDate(r.startsAt)} – ${formatDate(r.endsAt)}`,
              },
              {
                title: t('已匹配 / 全部流水', 'Matched / all statements'),
                render: (_, r) =>
                  `${r.numerator ?? '—'} / ${r.denominator ?? '—'}`,
              },
              {
                title: t('快照覆盖率', 'Snapshot coverage'),
                render: (_, r) => (r.coverage == null ? '—' : `${r.coverage}%`),
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}
