import { t as tr, useLocale } from '../../i18n';
import { Button, Card, Table, Tabs } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { advancedApi } from '../../api/operations';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import type { ReportFilters } from '../../types';
export function AdvancedReports({ filters }: { filters: ReportFilters }) {
  useLocale();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['reports', 'advanced', filters],
    queryFn: () => advancedApi.report(filters),
  });
  const drill = (extra: Record<string, string>) =>
    navigate(
      `/transactions?${new URLSearchParams({ start: dayjs(filters.start).startOf('day').toISOString(), end: dayjs(filters.end).endOf('day').toISOString(), currency: filters.currency, ...extra })}`,
    );
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const merchants = (frequent = false) => (
    <Table
      rowKey="name"
      loading={q.isPending}
      dataSource={frequent ? q.data?.frequentMerchants : q.data?.merchants}
      pagination={false}
      scroll={{ x: 550 }}
      columns={[
        { title: tr("商户"), dataIndex: 'name' },
        { title: tr("消费次数"), dataIndex: 'count' },
        {
          title: tr("期间净消费"),
          render: (_, r) => (
            <Money value={r.expense} currency={filters.currency} />
          ),
        },
        {
          title: tr("操作"),
          render: (_, r) => (
            <Button
              type="link"
              onClick={() =>
                drill(
                  r.name === '未填写商户'
                    ? { type: 'Expense' }
                    : { keyword: r.name },
                )
              }
            >
              {tr("交易明细")}</Button>
          ),
        },
      ]}
    />
  );
  return (
    <Card className="mt20" title={tr("更多分析")}>
      <Tabs
        items={[
          { key: 'merchants', label: tr("消费最多商户"), children: merchants() },
          {
            key: 'frequency',
            label: tr("消费次数最多"),
            children: merchants(true),
          },
          {
            key: 'accounts',
            label: tr("账户资金流动"),
            children: (
              <Table
                rowKey="id"
                loading={q.isPending}
                dataSource={q.data?.accounts}
                pagination={false}
                scroll={{ x: 650 }}
                columns={[
                  { title: tr("账户"), dataIndex: 'name' },
                  {
                    title: tr("流入"),
                    render: (_, r) => (
                      <Money value={r.inflow} currency={filters.currency} />
                    ),
                  },
                  {
                    title: tr("流出"),
                    render: (_, r) => (
                      <Money value={r.outflow} currency={filters.currency} />
                    ),
                  },
                  {
                    title: tr("期末余额"),
                    render: (_, r) => (
                      <Money value={r.balance} currency={filters.currency} />
                    ),
                  },
                  {
                    title: tr("操作"),
                    render: (_, r) => (
                      <Button
                        type="link"
                        onClick={() => drill({ accountId: r.id })}
                      >
                        {tr("交易明细")}</Button>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'projects',
            label: tr("项目预算与支出"),
            children: (
              <Table
                rowKey="id"
                loading={q.isPending}
                dataSource={q.data?.projects}
                pagination={false}
                scroll={{ x: 550 }}
                columns={[
                  { title: tr("项目"), dataIndex: 'name' },
                  {
                    title: tr("总预算"),
                    render: (_, r) => (
                      <Money value={r.budget} currency={filters.currency} />
                    ),
                  },
                  {
                    title: tr("期间净消费"),
                    render: (_, r) => (
                      <Money value={r.expense} currency={filters.currency} />
                    ),
                  },
                  {
                    title: tr("操作"),
                    render: (_, r) => (
                      <Button
                        type="link"
                        onClick={() => drill({ projectId: r.id })}
                      >
                        {tr("交易明细")}</Button>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
