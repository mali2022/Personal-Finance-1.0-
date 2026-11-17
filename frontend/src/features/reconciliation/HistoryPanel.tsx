import { useState } from 'react';
import { Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '../../i18n';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { smartApi } from './api';
export function HistoryPanel({
  accountId,
  currency,
}: {
  accountId: string;
  currency: string;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [page, setPage] = useState(1);
  const [balancePage, setBalancePage] = useState(1);
  const audit = useQuery({
    queryKey: ['smart-reconciliation', 'audit', accountId, page],
    queryFn: () => smartApi.audit(accountId, page),
  });
  const balances = useQuery({
    queryKey: [
      'smart-reconciliation',
      'balance-history',
      accountId,
      balancePage,
    ],
    queryFn: () => smartApi.balanceHistory(accountId, balancePage),
  });
  return (
    <>
      <Typography.Title level={5}>
        {t('操作审计', 'Operation audit')}
      </Typography.Title>
      {audit.isError ? (
        <ErrorState error={audit.error} retry={() => void audit.refetch()} />
      ) : (
        <Table
          rowKey="id"
          loading={audit.isPending}
          dataSource={audit.data?.items}
          scroll={{ x: 650 }}
          pagination={{
            current: page,
            total: audit.data?.total,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            { title: t('时间', 'Time'), dataIndex: 'createdAt' },
            { title: t('对象', 'Resource'), dataIndex: 'resourceType' },
            { title: t('操作', 'Action'), dataIndex: 'action' },
            { title: t('操作用户', 'Actor'), dataIndex: 'userId' },
          ]}
        />
      )}
      <Typography.Title level={5}>
        {t('余额调节快照', 'Balance reconciliation snapshots')}
      </Typography.Title>
      {balances.isError ? (
        <ErrorState
          error={balances.error}
          retry={() => void balances.refetch()}
        />
      ) : (
        <Table
          rowKey="id"
          loading={balances.isPending}
          dataSource={balances.data?.items}
          scroll={{ x: 700 }}
          pagination={{
            current: balancePage,
            total: balances.data?.total,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setBalancePage,
          }}
          columns={[
            { title: t('保存时间', 'Saved at'), dataIndex: 'createdAt' },
            {
              title: t('期间', 'Period'),
              render: (_, r) => `${r.startsAt} – ${r.endsAt}`,
            },
            {
              title: t('系统期末', 'System closing'),
              render: (_, r) => (
                <Money value={r.systemClosingBalance} currency={currency} />
              ),
            },
            {
              title: t('银行期末', 'Bank closing'),
              render: (_, r) => (
                <Money value={r.bankClosingBalance} currency={currency} />
              ),
            },
            {
              title: t('调节差额', 'Adjusted difference'),
              render: (_, r) => (
                <Money value={r.adjustedDifference} currency={currency} />
              ),
            },
          ]}
        />
      )}
    </>
  );
}
