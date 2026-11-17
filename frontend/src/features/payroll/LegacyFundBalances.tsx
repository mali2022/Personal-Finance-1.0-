import { Card, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { payrollApi, type Row } from './api';
import { usePayText, usePayLabel } from './text';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
export function LegacyFundBalances() {
  const t = usePayText();
  const label = usePayLabel();
  const q = useQuery({
    queryKey: ['payroll-center', 'legacy-fund-balances'],
    queryFn: () => payrollApi.get<Row[]>('/legacy-fund-balances'),
  });
  if (q.isError) return <ErrorState error={q.error} />;
  if (!q.data?.length) return null;
  return (
    <Card
      title={t(
        '历史未绑定账户的余额记录',
        'Historical balances without an account link',
      )}
    >
      <Table
        rowKey="id"
        dataSource={q.data}
        scroll={{ x: 600 }}
        columns={[
          { title: t('日期', 'Date'), dataIndex: 'paidDate' },
          { title: t('地区', 'Region'), dataIndex: 'region' },
          { title: t('币种', 'Currency'), dataIndex: 'currency' },
          {
            title: t('余额', 'Balance'),
            dataIndex: 'reportedBalance',
            render: (v: string) => <Sensitive>{v}</Sensitive>,
          },
          {
            title: t('来源', 'Source'),
            dataIndex: 'balanceSource',
            render: label,
          },
        ]}
      />
    </Card>
  );
}
