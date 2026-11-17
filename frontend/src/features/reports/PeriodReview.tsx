import { DatePicker } from '../../components/ResponsiveDatePicker';
import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { Alert, Button, Card, Space, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { apiClient } from '../../api/client';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import type { ApiResponse, Currency } from '../../types';
import { useUI } from '../../stores/ui';
import { TransactionDrawer } from '../transactions/TransactionDrawer';
import { planningLabel } from '../../utils/planningLabels';
import { saveBlob } from '../../utils/download';
interface Summary { fixedExpense: string; variableExpense: string; unclassifiedExpense: string; savingsRate: string | null; openingNetWorth: string; closingNetWorth: string; netWorthChange: string; points: { period: string; income: string; expense: string }[]; importantEvents: { id: string; type: string; occurredAt: string }[]; isPeriodClosed: boolean; coverageExplanation: string; recordedMonths: number; elapsedCalendarMonths: number; averageIncomePerElapsedCalendarMonth: string; averageExpensePerElapsedCalendarMonth: string; highestIncomeMonth: string; highestExpenseMonth: string; review: { income: { amount: string }; expense: { amount: string }; surplus: { amount: string } }; merchants: { name: string; amount: string }[]; frequentMerchants: { name: string; count: number }[]; incomeSources: { name: string; amount: string }[]; budget: { total: string; used: string } | null; upcoming: { id: string; name: string; expectedDate: string; type: string }[] }
export function PeriodReview({ currency }: { currency: Currency }) {
  useLocale();
  const [transactionId, setTransactionId] = useState<string>();
  const [annual, setAnnual] = useState(false); const [date, setDate] = useState(dayjs());
  const hidden = useUI(s => s.hidden);
  const params = annual ? { currency, year: date.year() } : { currency, month: date.format('YYYY-MM') };
  const q = useQuery({ queryKey: ['period-review', params], queryFn: () => apiClient.get<ApiResponse<Summary>>(annual ? '/reports/annual-review' : '/reports/monthly-review', { params }).then(r => r.data.data) });
  const exportReview = () => { if (!q.data || hidden) return; const rows = [['报告期间', annual ? String(date.year()) : date.format('YYYY-MM'), currency], ['数据覆盖', q.data.coverageExplanation], ['收入', q.data.review.income.amount], ['支出', q.data.review.expense.amount], ['结余', q.data.review.surplus.amount], ['储蓄率', q.data.savingsRate ?? '不适用'], ['固定支出', q.data.fixedExpense], ['变动支出', q.data.variableExpense], ['未归类及其他统计费用', q.data.unclassifiedExpense], ['推算期初净资产', q.data.openingNetWorth], ['推算期末净资产', q.data.closingNetWorth], ...q.data.merchants.map(x => [x.name, x.amount])]; const csv = '\uFEFF' + rows.map(row => row.map(v => '"' + String(v).replaceAll('"', '""').replace(/^[=+@-]/, "'$&") + '"').join(',')).join('\r\n'); saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `复盘-${annual ? date.year() : date.format('YYYY-MM')}-${currency}.csv`); };
  return <Card title={tr("月度与年度复盘")} className="mb16">
    <Space wrap className="mb16"><Select aria-label={tr("复盘周期")} value={annual ? 'year' : 'month'} onChange={v => setAnnual(v === 'year')} options={[{ value: 'month', label: tr("月度复盘") }, { value: 'year', label: tr("年度复盘") }]} /><DatePicker aria-label={tr("复盘日期")} picker={annual ? 'year' : 'month'} allowClear={false} value={date} onChange={v => { if (v) setDate(v); }} /></Space>
    {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
    <Button disabled={hidden || !q.data} onClick={exportReview}>{tr("导出当前月报或年报 CSV")}</Button>
    <TransactionDrawer id={transactionId} onClose={() => setTransactionId(undefined)} />
    {hidden ? <div className="chart-hidden">{tr("金额及排名已隐藏")}</div> : q.data && <>
      <Alert type="info" message={tr("{0}；有记录月份 {1}/{2}。{3}", q.data.isPeriodClosed ? '已结束期间' : '尚未结束，仅统计已发生部分', q.data.recordedMonths, q.data.elapsedCalendarMonths, q.data.coverageExplanation)} className="mb16" />
      <Table rowKey="name" pagination={false} dataSource={[
        { name: '收入', amount: q.data.review.income.amount }, { name: '支出', amount: q.data.review.expense.amount }, { name: '结余', amount: q.data.review.surplus.amount },
        { name: '固定支出', amount: q.data.fixedExpense }, { name: '变动支出', amount: q.data.variableExpense }, { name: '未归类及其他统计费用', amount: q.data.unclassifiedExpense },
        { name: '已覆盖自然月月均收入', amount: q.data.averageIncomePerElapsedCalendarMonth }, { name: '已覆盖自然月月均支出', amount: q.data.averageExpensePerElapsedCalendarMonth },
        ...(q.data.budget ? [{ name: '预算额度', amount: q.data.budget.total }, { name: '预算使用（预算原时间口径）', amount: q.data.budget.used }] : []),
      ]} columns={[{ title: tr("指标"), dataIndex: 'name' }, { title: currency, dataIndex: 'amount', render: (v: string) => <Money value={v} currency={currency} /> }]} />
      <p>{tr("收入最高月份：")}{q.data.highestIncomeMonth}{tr("；支出最高月份：")}{q.data.highestExpenseMonth}</p>
      {[{ title: tr("商户净消费排行"), data: q.data.merchants }, { title: tr("收入来源"), data: q.data.incomeSources }].map(x => <Card key={x.title} title={x.title} className="mt20"><Table rowKey="name" dataSource={x.data} columns={[{ title: tr("来源"), dataIndex: 'name' }, { title: tr("净金额"), dataIndex: 'amount', render: (v: string) => <Money value={v} currency={currency} /> }]} /></Card>)}
      <Card title={tr("高频消费商户")} className="mt20"><Table rowKey="name" dataSource={q.data.frequentMerchants} columns={[{ title: tr("商户"), dataIndex: 'name' }, { title: tr("消费次数"), dataIndex: 'count' }]} /></Card>
      <Card title={tr("当前待执行事项（非历史事件）")} className="mt20"><Table rowKey="id" dataSource={q.data.upcoming} columns={[{ title: tr("名称"), dataIndex: 'name' }, { title: tr("计划日期"), dataIndex: 'expectedDate' }]} /></Card>
      <p>{tr("储蓄率：")}{q.data.savingsRate === null ? tr("不适用") : q.data.savingsRate + '%'}</p>
      <Table rowKey="name" pagination={false} dataSource={[{ name: '推算期初净资产', amount: q.data.openingNetWorth }, { name: '推算期末净资产', amount: q.data.closingNetWorth }, { name: '推算净资产变化', amount: q.data.netWorthChange }]} columns={[{ title: tr("指标"), dataIndex: 'name' }, { title: tr("金额"), dataIndex: 'amount', render: (value: string) => <Money value={value} currency={currency} /> }]} />
      <Card title={tr("期间月度趋势")} className="mt20"><Table rowKey="period" dataSource={q.data.points} pagination={false} scroll={{ x: 500 }} columns={[{ title: tr("月份"), dataIndex: 'period' }, { title: tr("收入"), dataIndex: 'income', render: (value: string) => <Money value={value} currency={currency} /> }, { title: tr("支出"), dataIndex: 'expense', render: (value: string) => <Money value={value} currency={currency} /> }]} /></Card>
      <Card title={tr("已发生的重要业务事件（最近20条）")} className="mt20"><Table rowKey="id" dataSource={q.data.importantEvents} columns={[{ title: tr("日期"), dataIndex: 'occurredAt' }, { title: tr("业务"), dataIndex: 'type', render: planningLabel }, { title: tr("明细"), render: (_, row) => <Button onClick={() => setTransactionId(row.id)}>{tr("查看原交易")}</Button> }]} /></Card>
    </>}
  </Card>;
}


