import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  Select,
  Space,
  Spin,
  Table,
} from 'antd';
import dayjs from 'dayjs';
import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
import { collaborationApi, type FinanceSpace } from './api';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
interface ComparisonRow {
  bookId?: string;
  name?: string;
  currency: string;
  income: string;
  expense: string;
  balance: string;
}
export function BookComparison({ books }: { books: FinanceSpace[] }) {
  const { modal, message } = App.useApp();
  const [ids, setIds] = useState<string[]>([]);
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [analysis, setAnalysis] = useState('');
  const [analysisScope, setAnalysisScope] = useState('');
  const ai = useMutation({
    mutationFn: (scope: { ids: string[]; month: string }) =>
      collaborationApi.write(`/book-comparison/analysis?month=${scope.month}`, {
        confirmTransmission: true,
        bookIds: scope.ids,
      }),
    onSuccess: (r, scope) => {
      setAnalysisScope(`${scope.ids.join(',')}|${scope.month}`);
      setAnalysis(r.data.data.explanation);
    },
    onError: (e: { message: string }) => message.error(e.message),
  });
  const report = useQuery({
    queryKey: ['space-report', 'comparison', ids, month],
    enabled: ids.length > 0,
    queryFn: async () =>
      (
        await apiClient.get<
          ApiResponse<{ items: ComparisonRow[]; totals: ComparisonRow[] }>
        >('/book-comparison', { params: { ids: ids.join(','), month } })
      ).data.data,
  });
  const columns = [
    { title: '币种', dataIndex: 'currency' },
    {
      title: '收入',
      dataIndex: 'income',
      render: (v: string) => <Sensitive>{v}</Sensitive>,
    },
    {
      title: '净支出',
      dataIndex: 'expense',
      render: (v: string) => <Sensitive>{v}</Sensitive>,
    },
    {
      title: '结余',
      dataIndex: 'balance',
      render: (v: string) => <Sensitive>{v}</Sensitive>,
    },
  ];
  return (
    <Card title="多账本报表" style={{ marginTop: 24 }}>
      <Space wrap style={{ width: '100%', marginBottom: 16 }}>
        <Select
          mode="multiple"
          aria-label="比较账本"
          style={{ minWidth: 220, maxWidth: '80vw' }}
          placeholder="选择要汇总及比较的账本"
          options={books.map((b) => ({ value: b.id, label: b.name }))}
          value={ids}
          onChange={(value) => {
            setIds(value);
            setAnalysis('');
          }}
          maxCount={50}
        />
        <Input
          type="month"
          aria-label="多账本报表月份"
          value={month}
          onChange={(e) => {
            if (e.target.value) {
              setMonth(e.target.value);
              setAnalysis('');
            }
          }}
        />
      </Space>
      {ids.length === 0 ? null : report.isPending ? (
        <Spin />
      ) : report.isError ? (
        <ErrorState error={report.error} retry={() => report.refetch()} />
      ) : (
        <>
          <Table
            rowKey="currency"
            pagination={false}
            dataSource={report.data?.totals}
            columns={columns}
            scroll={{ x: 450 }}
          />
          <Table
            rowKey={(r) => `${r.bookId}-${r.currency}`}
            dataSource={report.data?.items}
            columns={[{ title: '账本', dataIndex: 'name' }, ...columns]}
            scroll={{ x: 650 }}
          />
          <Button
            loading={ai.isPending}
            disabled={
              !ids.every(
                (id) => books.find((b) => b.id === id)?.role === 'Owner',
              )
            }
            onClick={() =>
              modal.confirm({
                title: '将所选账本的合并收支汇总发送给 AI？',
                content:
                  '仅发送月份和按币种合并的收支，不发送账本名称、成员、商户、账户或备注。需已授权 AI 汇总数据，且拥有所选全部账本。',
                onOk: () => ai.mutateAsync({ ids, month }),
              })
            }
          >
            AI 分析所选账本
          </Button>
          {analysis && analysisScope === `${ids.join(',')}|${month}` && (
            <Alert
              style={{ marginTop: 16 }}
              message="AI 分析（建议供参考）"
              description={<Sensitive>{analysis}</Sensitive>}
            />
          )}
        </>
      )}
    </Card>
  );
}
