import { t as tr, useLocale } from '../../i18n';
import { Alert, App, Button, Card, Checkbox, Input, Space, Table } from 'antd';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import type { ApiResponse, Currency } from '../../types';
interface Pressure { plannedRemainingPrincipal: string; plannedUnconfirmedFees: string; estimatedPayoffDate: string | null; source: string; limitation: string; months: { month: string; principal: string; fee: string; total: string }[] }
export function DebtPressure({ currency }: { currency: Currency }) {
  useLocale();
  const hidden = useUI(s => s.hidden);
  const [budget, setBudget] = useState(''); const [ids, setIds] = useState(''); const [confirmed, setConfirmed] = useState(false); const [result, setResult] = useState<{ highestRate: { interest: string; months: number }; smallestBalance: { interest: string; months: number }; explanation: string }>(); const { message } = App.useApp();
  const q = useQuery({ queryKey: ['debt-plans', 'pressure', currency], queryFn: () => apiClient.get<ApiResponse<Pressure>>('/reports/debt-pressure', { params: { currency } }).then(r => r.data.data) });
  return <Card title={tr("债务计划与月度偿还压力")} loading={q.isPending}>
    {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
    {q.data && <><p>{q.data.source}</p><p>{tr("剩余计划本金：")}<Money value={q.data.plannedRemainingPrincipal} currency={currency} />{tr("；未来未确认费用：")}<Money value={q.data.plannedUnconfirmedFees} currency={currency} /></p>
      <Table rowKey="month" dataSource={q.data.months} scroll={{ x: 550 }} pagination={{ pageSize: 12 }} columns={[{ title: tr("月份"), dataIndex: 'month' }, ...(['principal', 'fee', 'total'] as const).map((key, i) => ({ title: ['本金', '计划费用', '计划合计'][i], dataIndex: key, render: (value: string) => <Money value={value} currency={currency} /> }))]} />
      <Alert type="info" message={q.data.limitation} />
      {!hidden && <Card title={tr("假设月度还款顺序比较")} className="mt20"><Space direction="vertical" style={{ width: '100%' }}>
        <Input aria-label={tr("比较计划ID")} placeholder={tr("计划 ID，以逗号分隔")} value={ids} onChange={e => { setIds(e.target.value); setResult(undefined); }} />
        <Input aria-label={tr("月度偿债预算")} placeholder={tr("每月可用于偿债的金额")} value={budget} onChange={e => { setBudget(e.target.value); setResult(undefined); }} />
        <Checkbox checked={confirmed} onChange={e => setConfirmed(e.target.checked)}>{tr("确认仅作数学假设：登记每期利率按月率使用，月末先付息，无最低付款约束、无提前还款费，本金可自由提前偿还。")}</Checkbox>
        <Button disabled={!confirmed || !ids || !budget} onClick={async () => { try { const response = await apiClient.post<ApiResponse<NonNullable<typeof result>>>('/debt-plans/order-preview', { monthlyBudget: budget, horizonMonths: 600, planIds: ids.split(',').map(s => s.trim()), confirmMonthlyAssumptions: confirmed }); setResult(response.data.data); } catch (error) { message.error(error instanceof Error ? error.message : tr("比较失败")); } }}>{tr("比较假设顺序")}</Button>
        {result && <><p>{tr("利率优先：模拟利息")}<Money value={result.highestRate.interest} currency={currency} />，{result.highestRate.months} {tr("个月；小额优先：模拟利息")}<Money value={result.smallestBalance.interest} currency={currency} />，{result.smallestBalance.months} {tr("个月。")}</p><Alert message={result.explanation} /></>}
      </Space></Card>}
    </>}
  </Card>;
}
