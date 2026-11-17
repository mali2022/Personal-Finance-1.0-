import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { App, Button, Card, Input, InputNumber, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import type { ApiResponse, Currency } from '../../types';
interface Allocation { id: string; transactionId: string; sequence: number; component: string; feeNature?: string; amount: string; state: string; invalid: boolean }
export default function DebtReconciliationPanel({ id, version, currency, periods }: { id: string; version: string; currency: Currency; periods: number }) {
  useLocale();
  const [transactionId, setTransactionId] = useState(''); const [sequence, setSequence] = useState(1); const [component, setComponent] = useState('Principal'); const [feeNature, setFeeNature] = useState('Unclassified'); const [amount, setAmount] = useState(''); const [explanation, setExplanation] = useState(''); const [busy, setBusy] = useState(false);
  const hidden = useUI(s => s.hidden); const { message } = App.useApp(); const cache = useQueryClient();
  const q = useQuery({ queryKey: ['debt-plan', 'allocations', id], queryFn: () => apiClient.get<ApiResponse<Allocation[]>>(`/debt-plans/${id}/allocations`).then(r => r.data.data) });
  const [historyPage, setHistoryPage] = useState(1);
  const history = useQuery({ queryKey: ['debt-plan', 'history', id, historyPage], queryFn: () => apiClient.get<ApiResponse<{ items: { id: string; createdAt: string; reason: string; snapshot: string }[]; total: number }>>(`/debt-plans/${id}/history`, { params: { page: historyPage, pageSize: 10 } }).then(r => r.data.data) });
  const save = async (revoke?: string) => { if (busy) return; setBusy(true); try { await apiClient.post(`/debt-plans/${id}/allocations${revoke ? '/' + revoke + '/revoke' : ''}`, revoke ? {} : { transactionId, sequence, component, amount, explanation, feeNature: component === 'Fee' ? feeNature : 'Unclassified' }, { headers: { 'If-Match': version, 'Idempotency-Key': crypto.randomUUID() } }); await cache.invalidateQueries({ queryKey: ['accounts'] }); await cache.invalidateQueries({ queryKey: ['debt-plan'] }); await cache.invalidateQueries({ queryKey: ['debt-plans'] }); message.success(tr("核对关联已保存，真实交易不变")); } catch (e) { message.error(e instanceof Error ? e.message : tr("核对失败")); } finally { setBusy(false); } };
  return <Card title={tr("逐期实际本金与费用核对")}>
    {!hidden && <Space direction="vertical" style={{ width: '100%' }}>
      <Input aria-label={tr("实际核对交易 ID")} placeholder={tr("实际交易 ID")} value={transactionId} onChange={e => setTransactionId(e.target.value)} />
      <InputNumber aria-label={tr("实际核对期数")} min={1} max={periods} value={sequence} onChange={v => setSequence(v || 1)} />
      <Select aria-label={tr("实际核对性质")} value={component} onChange={setComponent} options={[{ value: 'Principal', label: tr("本金") }, { value: 'Fee', label: tr("已发生利息/费用") }]} />
      <>{component === 'Fee' && <Select aria-label={tr("实际费用分类")} value={feeNature} onChange={setFeeNature} options={[{value:'Unclassified',label:tr("未分类利息/费用")},{value:'Interest',label:tr("实际利息")},{value:'ServiceFee',label:tr("实际手续费")}]}/>}</><Input aria-label={tr("实际核对金额")} placeholder={tr("本次分配金额")} value={amount} onChange={e => setAmount(e.target.value)} />
      <Input aria-label={tr("实际核对说明")} placeholder={tr("合同及核对说明")} value={explanation} onChange={e => setExplanation(e.target.value)} maxLength={2000} />
      <Button disabled={busy || !transactionId || !explanation || !amount} onClick={() => void save()}>{tr("关联实际记录")}</Button>
    </Space>}
    {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : <Table rowKey="id" scroll={{ x: 600 }} dataSource={q.data} pagination={{ pageSize: 10 }} columns={[{ title: tr("期数"), dataIndex: 'sequence' }, { title: tr("性质"), render: (_, r) => r.component === 'Principal' ? '本金' : r.feeNature==='Interest'?'实际利息':r.feeNature==='ServiceFee'?'实际手续费':'未分类利息/费用' }, { title: tr("金额"), render: (_, r) => <Money value={r.amount} currency={currency} /> }, { title: tr("状态"), render: (_, r) => r.invalid ? '原交易已撤销' : r.state === 'Active' ? '已核对' : '关联已撤销' }, { title: tr("操作"), render: (_, r) => <Button disabled={hidden || busy || r.state !== 'Active'} onClick={() => void save(r.id)}>{tr("撤销关联")}</Button> }]} />}
    <p>{tr("历史计划修改记录（本金、利率或延期编辑前快照）")}</p>
    {history.isError ? <ErrorState error={history.error} retry={() => history.refetch()} /> : <Table rowKey="id" dataSource={history.data?.items} pagination={{ current: historyPage, pageSize: 10, total: history.data?.total, onChange: setHistoryPage }} columns={[{ title: tr("时间"), dataIndex: 'createdAt' }, { title: tr("记录"), dataIndex: 'reason' }, { title: tr("原参数"), render: (_, row) => { const snapshot = JSON.parse(row.snapshot) as { plan: { principal: string; periods: number; parameter: string } }; return hidden ? '••••' : <span><Money value={snapshot.plan.principal} currency={currency} />；{snapshot.plan.periods}{tr("期；计费参数")}{snapshot.plan.parameter}</span>; } }]} />}
  </Card>;
}
