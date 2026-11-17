import { DatePicker } from '../../components/ResponsiveDatePicker';
import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { Alert, Button, Card, Space, Table } from 'antd';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { apiClient } from '../../api/client';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import type { ApiResponse, Currency } from '../../types';
import { saveBlob } from '../../utils/download';

interface Comparison { amount: string; previous: string; difference: string; changeRate: string | null }
interface Review {
  income: Comparison; expense: Comparison; surplus: Comparison; savingsRate: string | null;
  categories: { categoryId: string; name: string; amount: string; previous: string; difference: string; reason: string }[];
  coverage: { explanation: string }; formula: string;
}
export function FinancialReview({ start, end, currency }: { start: string; end: string; currency: Currency }) {
  useLocale();
  const [mode, setMode] = useState('previous');
  const [customComparison, setCustomComparison] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs(start).subtract(1, 'month'), dayjs(end).subtract(1, 'month')]);
  const hidden = useUI(s => s.hidden);
  const navigate = useNavigate();
  const duration = dayjs(end).add(1, 'day').diff(dayjs(start), 'day');
  const comparisonStart = mode === 'custom' ? customComparison[0] : mode === 'year' ? dayjs(start).subtract(1, 'year') : dayjs(start).subtract(duration, 'day');
  const comparisonEnd = mode === 'custom' ? customComparison[1].add(1, 'day') : mode === 'year' ? dayjs(end).add(1, 'day').subtract(1, 'year') : dayjs(start);
  const params = { start, end, currency, comparisonStart: comparisonStart.format('YYYY-MM-DD'), comparisonEndExclusive: comparisonEnd.format('YYYY-MM-DD') };
  const q = useQuery({ queryKey: ['financial-review', params], queryFn: () => apiClient.get<ApiResponse<Review>>('/reports/comparison', { params }).then(r => r.data.data) });
  const exportSummary = () => {
    if (!q.data || hidden) return;
    const rows = [['指标', '本期', '对比期', '差额'], ['范围', `${start} 至 ${end}`, `${params.comparisonStart} 至 ${params.comparisonEndExclusive}（不含）`, currency], ...(['income', 'expense', 'surplus'] as const).map(key => [key, q.data[key].amount, q.data[key].previous, q.data[key].difference]), ['口径', q.data.formula], ...q.data.categories.map(c => [c.name, c.amount, c.previous, c.difference])];
    const csv = '\uFEFF' + rows.map(row => row.map(v => `"${String(v).replaceAll('"', '""').replace(/^[=+@-]/, "'$&")}"`).join(',')).join('\r\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `财务复盘-${start}-${end}-${currency}.csv`);
  };
  return <Card title={tr("财务复盘与对比")} className="mb16" loading={q.isPending}>
    <Space wrap className="mb16"><Select aria-label={tr("复盘比较方式")} value={mode} onChange={setMode} options={[{ value: 'previous', label: tr("前一个等长期间") }, { value: 'year', label: tr("去年同期") }, { value: 'custom', label: tr("自定义对比期间") }]} />{mode === 'custom' && <DatePicker.RangePicker aria-label={tr("自定义对比期间")} allowClear={false} value={customComparison} onChange={v => { if (v?.[0] && v[1]) setCustomComparison([v[0], v[1]]); }} />}<span>{tr("对比")}{comparisonStart.format('YYYY-MM-DD')} {tr("至")}{comparisonEnd.subtract(1, 'day').format('YYYY-MM-DD')}</span><Button disabled={!q.data || hidden} onClick={exportSummary}>{tr("导出当前复盘 CSV")}</Button></Space>
    {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
    {q.data && <>
      <Alert type="info" showIcon message={q.data.coverage.explanation} className="mb16" />
      <Table pagination={false} rowKey="name" scroll={{ x: 650 }} dataSource={[
        { name: '统计收入', ...q.data.income }, { name: '统计支出', ...q.data.expense }, { name: '结余', ...q.data.surplus },
      ]} columns={[
        { title: tr("指标"), dataIndex: 'name' },
        { title: tr("本期"), dataIndex: 'amount', render: (v: string) => <Money value={v} currency={currency} /> },
        { title: tr("对比期"), dataIndex: 'previous', render: (v: string) => <Money value={v} currency={currency} /> },
        { title: tr("差额"), dataIndex: 'difference', render: (v: string) => <Money value={v} currency={currency} /> },
        { title: tr("变化率"), dataIndex: 'changeRate', render: (v: string | null) => hidden ? '••••' : v === null ? '不适用（对比期为零）' : `${v}%` },
      ]} />
      <p>{tr("储蓄率：")}{hidden ? '••••' : q.data.savingsRate === null ? tr("不适用") : `${q.data.savingsRate}%`}</p>
      <Table rowKey="categoryId" scroll={{ x: 700 }} dataSource={q.data.categories} columns={[
        { title: tr("消费分类"), dataIndex: 'name' },
        { title: tr("本期净费用"), dataIndex: 'amount', render: (v: string) => <Money value={v} currency={currency} /> },
        { title: tr("对比期"), dataIndex: 'previous', render: (v: string) => <Money value={v} currency={currency} /> },
        { title: tr("变化"), dataIndex: 'difference', render: (v: string) => <Money value={v} currency={currency} /> },
        { title: tr("解释"), dataIndex: 'reason' },
        { title: tr("明细"), render: (_, r) => r.categoryId === 'unclassified' ? null : <Button type="link" onClick={() => navigate(`/transactions?${new URLSearchParams({ categoryId: r.categoryId, currency, start: dayjs(start).startOf('day').toISOString(), end: dayjs(end).endOf('day').toISOString() })}`)}>{tr("查看")}</Button> },
      ]} />
      <p className="muted">{q.data.formula}</p>
    </>}
  </Card>;
}
