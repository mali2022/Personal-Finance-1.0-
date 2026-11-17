import { Select } from '../../components/TouchSelect';
import { localizedLabels } from '../../i18n';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { Alert, App, Button, Card, Drawer, Form, Input, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { categoryApi } from '../../api/finance';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import type { ApiResponse, Currency } from '../../types';
interface Attribute { id?: string; categoryId: string | null; transactionId: string | null; behavior: string; note: string; version?: string }
interface Structure { recurringSuggestions: { id: string; name: string; source: string; reason: string }[]; items: { behavior: string; amount: string; share: string | null }[]; fixedExpenseIncomeRatio: string | null; fixedIncomeRatio: string | null; averageMonthlyIncome: string | null; incomeVolatilityRange: string | null; incomeSourceConcentration: string | null; incomeSourceBasis: string; suggestions: { merchant: string; count: number; reason: string }[]; explanation: string; sampleWarning: string; trend: { period: string; items: { behavior: string; amount: string }[] }[] }
const labels: Record<string, string> = localizedLabels({ Unknown: '未归类', FixedExpense: '固定支出', VariableExpense: '变动支出', FixedIncome: '固定收入', VariableIncome: '浮动收入', OneTimeIncome: '一次性收入', OtherIncome: '其他收入', OtherStatisticalExpense: '其他统计费用' });
export function ExpenseStructure({ start, end, currency }: { start: string; end: string; currency: Currency }) {
  useLocale();
  const [income, setIncome] = useState(false); const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ version: string; key: string }>(); const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<Attribute>(); const cache = useQueryClient(); const { message } = App.useApp(); const hidden = useUI(s => s.hidden);
  const params = { start, end, currency };
  const q = useQuery({ queryKey: ['expense-structure', params, income], queryFn: () => apiClient.get<ApiResponse<Structure>>(income ? '/reports/income-stability' : '/reports/expense-structure', { params }).then(r => r.data.data) });
  const policies = useQuery({ queryKey: ['analysis-attributes', page], queryFn: () => apiClient.get<ApiResponse<{ items: Attribute[]; total: number }>>('/analysis-attributes', { params: { page, pageSize: 20 } }).then(r => r.data.data) });
  const cats = useQuery({ queryKey: ['categories'], queryFn: categoryApi.list });
  const edit = (a?: Attribute) => { form.resetFields(); form.setFieldsValue(a || { categoryId: null, transactionId: null, behavior: 'Unknown', note: '' }); setEditing({ version: a?.version || '0', key: crypto.randomUUID() }); };
  const save = async () => {
    if (!editing || busy) return; setBusy(true);
    try { const values = await form.validateFields(); await apiClient.put('/analysis-attributes', { ...values, categoryId: values.categoryId || null, transactionId: values.transactionId || null }, { headers: { 'If-Match': editing.version, 'Idempotency-Key': editing.key } }); setEditing(undefined); await Promise.all(['analysis-attributes', 'expense-structure'].map(key => cache.invalidateQueries({ queryKey: [key] }))); message.success(tr("分析属性已保存，真实资金不变")); }
    catch (e) { message.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : tr("保存失败")); } finally { setBusy(false); }
  };
  return <Card title={tr("收支结构与分析属性")} className="mb16">
    <Space wrap className="mb16"><Select aria-label={tr("结构类型")} value={income ? 'income' : 'expense'} onChange={v => setIncome(v === 'income')} options={[{ value: 'expense', label: tr("支出结构") }, { value: 'income', label: tr("收入结构") }]} /><Button disabled={hidden} onClick={() => edit()}>{tr("配置分析属性")}</Button></Space>
    {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data && <>
      <Alert type="info" message={q.data.sampleWarning} className="mb16" />
      {!income && <p>{tr("固定支出占收入：")}{hidden ? '••••' : q.data.fixedExpenseIncomeRatio === null ? tr("不适用") : `${q.data.fixedExpenseIncomeRatio}%`}</p>}
      {income && <><p>{tr("固定收入占比：")}{hidden ? '••••' : q.data.fixedIncomeRatio === null ? tr("不适用") : `${q.data.fixedIncomeRatio}%`}{tr("；收入来源集中度：")}{hidden ? '••••' : q.data.incomeSourceConcentration === null ? tr("不适用") : `${q.data.incomeSourceConcentration}%`}</p><p>{tr("月均收入：")}<Money value={q.data.averageMonthlyIncome || '0.00'} currency={currency} />{tr("；月度收入波动范围：")}<Money value={q.data.incomeVolatilityRange || '0.00'} currency={currency} /></p><p className="muted">{q.data.incomeSourceBasis}</p></>}
      <Table rowKey="behavior" pagination={false} dataSource={q.data.items} columns={[{ title: tr("属性"), dataIndex: 'behavior', render: (v: string) => labels[v] || v }, { title: tr("净金额"), dataIndex: 'amount', render: (v: string) => <Money value={v} currency={currency} /> }, { title: tr("占比"), dataIndex: 'share', render: (v: string | null) => hidden ? '••••' : v === null ? '不适用' : `${v}%` }]} />
      <Table rowKey="key" scroll={{ x: 500 }} dataSource={q.data.trend.flatMap(p => p.items.map((x, i) => ({ ...x, period: p.period, key: `${p.period}-${i}` })))} columns={[{ title: tr("月份"), dataIndex: 'period' }, { title: tr("属性"), dataIndex: 'behavior', render: (v: string) => labels[v] || v }, { title: tr("净金额"), dataIndex: 'amount', render: (v: string) => <Money value={v} currency={currency} /> }]} />
      <p className="muted">{q.data.explanation}</p>
      {!hidden && !income && <Table rowKey="merchant" dataSource={q.data.suggestions} columns={[{ title: tr("待确认商户"), dataIndex: 'merchant' }, { title: tr("次数"), dataIndex: 'count' }, { title: tr("建议说明"), dataIndex: 'reason' }]} />}
      {!hidden && <Table rowKey="id" dataSource={q.data.recurringSuggestions} columns={[{ title: tr("周期来源建议（最多100项）"), dataIndex: 'name' }, { title: tr("来源"), dataIndex: 'source', render: (v: string) => v === 'Subscription' ? '订阅' : '周期交易' }, { title: tr("人工核对说明"), dataIndex: 'reason' }]} />}
    </>}
    {policies.isError && <ErrorState error={policies.error} retry={() => policies.refetch()} />}
    <Table rowKey={r => r.id!} loading={policies.isPending} dataSource={policies.data?.items} pagination={{ current: page, total: policies.data?.total, pageSize: 20, onChange: setPage }} columns={[
      { title: tr("范围"), render: (_, r) => r.categoryId ? cats.data?.find(c => c.id === r.categoryId)?.name || r.categoryId : `交易 ${r.transactionId}` },
      { title: tr("属性"), dataIndex: 'behavior', render: (v: string) => labels[v] || v }, { title: tr("操作"), render: (_, r) => <Button type="link" onClick={() => edit(r)}>{tr("编辑")}</Button> },
    ]} />
    <Drawer title={tr("分析属性（仅分析归类）")} width={Math.min(520, window.innerWidth)} open={!!editing && !hidden} onClose={() => setEditing(undefined)} extra={<Button type="primary" loading={busy} onClick={save}>{tr("保存")}</Button>}>
      <Form form={form} layout="vertical"><Form.Item name="id" hidden><Input /></Form.Item>
        <Form.Item label={tr("分类")} name="categoryId"><Select allowClear showSearch optionFilterProp="label" options={cats.data?.map(c => ({ value: c.id, label: `${c.name} · ${c.kind === 'Income' ? '收入' : '支出'}` }))} /></Form.Item>
        <Form.Item label={tr("交易ID（交易覆盖时填写）")} name="transactionId"><Input /></Form.Item>
        <Form.Item label={tr("分析属性")} name="behavior" rules={[{ required: true }]}><Select options={Object.entries(labels).filter(([v]) => v !== 'OtherStatisticalExpense').map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item label={tr("备注")} name="note"><Input.TextArea maxLength={2000} /></Form.Item>
      </Form>
    </Drawer>
  </Card>;
}

