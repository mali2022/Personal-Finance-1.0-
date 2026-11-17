import { CURRENCY_CODES } from '../../constants/currencies';
import { DatePicker } from '../../components/ResponsiveDatePicker';
import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { apiClient } from '../../api/client';
import { AccountSelector } from '../../components/Selectors';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import type { ApiResponse, Currency } from '../../types';
import { TransactionDrawer } from '../transactions/TransactionDrawer';
import DebtReconciliationPanel from './DebtReconciliationPanel';
interface Plan { id: string; kind: string; accountId: string; businessId: string | null; originalTransactionId: string | null; name: string; currency: Currency; principal: string; periods: number; firstDate: string; repaymentMode: string; feeMode: string; parameter: string; state: string; note: string; version: string; statementAmount: string | null; minimumPayment: string | null; minimumDueDate: string | null }
interface Detail { reconciledPeriods: number; unreconciledPeriods: number; actualPrincipal: string; actualFee: string; remainingPlannedPrincipal: string; plan: Plan; needsReview: boolean; totalPlannedFee: string; sourceCurrentOutstanding: string; explanation: string; schedule: { sequence: number; date: string; openingPrincipal: string; principal: string; fee: string; total: string; remainingPrincipal: string; actualPrincipal: string; actualFee: string; difference: string }[]; actualPayments: { items: { id: string; type: string; occurredAt: string }[]; total: number } }
interface FormData extends Omit<Plan, 'firstDate' | 'minimumDueDate'> { firstDate: dayjs.Dayjs; minimumDueDate?: dayjs.Dayjs; customText?: string }
const repayOptions = [{ value: 'EqualPrincipal', get label(){return tr("固定本金 / 无息分次");} }, { value: 'EqualPayment', get label(){return tr("固定总还款额");} }, { value: 'Bullet', get label(){return tr("到期一次偿还本金");} }, { value: 'Custom', get label(){return tr("逐期自定义");} }];
const feeOptions = [{ value: 'None', get label(){return tr("无费用");} }, { value: 'FixedPerPeriod', get label(){return tr("固定每期费用金额");} }, { value: 'OriginalPrincipalRate', get label(){return tr("每期按原始本金费率");} }, { value: 'RemainingPrincipalRate', get label(){return tr("每期按剩余本金利率");} }, { value: 'Custom', get label(){return tr("逐期费用");} }];
export function DebtPlanningPanel({ kind, accountId, businessId, currency: fixedCurrency }: { kind: 'CreditInstallment' | 'LoanRepayment'; accountId?: string; businessId?: string; currency?: Currency }) {
  useLocale();
  const [currency, setCurrency] = useState<Currency>(fixedCurrency || 'CNY'); const [page, setPage] = useState(1); const [selected, setSelected] = useState<string>();
  const [transactionId, setTransactionId] = useState<string>();
  const [actualPage, setActualPage] = useState(1);
  const [editing, setEditing] = useState<{ version: string; key: string; id?: string }>(); const [busy, setBusy] = useState(false); const [form] = Form.useForm<FormData>();
  const [remaining, setRemaining] = useState(''); const [fee, setFee] = useState(''); const [explanation, setExplanation] = useState(''); const [payoff, setPayoff] = useState<{ total: string; warning: string }>();
  const { message } = App.useApp(); const cache = useQueryClient(); const hidden = useUI(s => s.hidden);
  const capabilities = useQuery({ queryKey: ['metric-definitions'], queryFn: () => apiClient.get<ApiResponse<unknown[]>>('/reports/metric-definitions').then(r => r.data.data), retry: false });
  const params = { currency: fixedCurrency || currency, accountId, businessId, page, pageSize: 20 };
  const q = useQuery({ queryKey: ['debt-plans', params, kind], enabled: capabilities.isSuccess, queryFn: () => apiClient.get<ApiResponse<{ items: Plan[]; total: number }>>(kind === 'CreditInstallment' ? '/credit-installments' : '/debt-plans', { params }).then(r => ({ ...r.data.data, items: r.data.data.items.filter(p => p.kind === kind) })) });
  const detail = useQuery({ queryKey: ['debt-plan', selected, actualPage], enabled: !!selected, queryFn: () => apiClient.get<ApiResponse<Detail>>(`/debt-plans/${selected}`, { params: { page: actualPage, pageSize: 20 } }).then(r => r.data.data) });
  const edit = async (p?: Plan) => { if (hidden) return; form.resetFields(); let customText: string | undefined;
    if (p?.repaymentMode === 'Custom') { try { const d = await apiClient.get<ApiResponse<Detail>>(`/debt-plans/${p.id}`); customText = JSON.stringify(d.data.data.schedule.map(x => ({ date: x.date, principal: x.principal, fee: x.fee })), null, 2); } catch { message.error(tr("自定义期表读取失败")); return; } }
    form.setFieldsValue(p ? { ...p, customText, firstDate: dayjs(p.firstDate), minimumDueDate: p.minimumDueDate ? dayjs(p.minimumDueDate) : undefined } : { kind, accountId, businessId: businessId || null, originalTransactionId: null, name: '', principal: '', periods: 12, firstDate: dayjs(), repaymentMode: 'EqualPrincipal', feeMode: 'None', parameter: '0', state: 'Active', note: '' }); setEditing({ version: p?.version || '0', key: crypto.randomUUID(), id: p?.id }); };
  const save = async () => {
    if (!editing || busy) return; setBusy(true);
    try { const v = await form.validateFields(); const body = { ...v, kind, accountId: v.accountId || accountId, businessId: v.businessId || businessId || null, originalTransactionId: v.originalTransactionId || null, firstDate: v.firstDate.format('YYYY-MM-DD'), minimumDueDate: v.minimumDueDate?.format('YYYY-MM-DD') || null, statementAmount: v.statementAmount || null, minimumPayment: v.minimumPayment || null, customSchedule: v.customText ? JSON.parse(v.customText) : null }; await apiClient.request({ method: editing.id ? 'put' : 'post', url: `/debt-plans${editing.id ? '/' + editing.id : ''}`, data: body, headers: { 'If-Match': editing.version, 'Idempotency-Key': editing.key } }); setEditing(undefined); await cache.invalidateQueries({ queryKey: ['debt-plans'] }); await cache.invalidateQueries({ queryKey: ['debt-plan'] }); message.success(tr("计划已保存，真实资金不变")); }
    catch (e) { message.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : tr("保存失败")); } finally { setBusy(false); }
  };
  const preview = async () => { if (!selected) return; try { const r = await apiClient.post<ApiResponse<{ total: string; warning: string }>>(`/debt-plans/${selected}/payoff-preview`, { remainingPrincipal: remaining, confirmedFee: fee, explanation }); setPayoff(r.data.data); } catch (e) { message.error(e && typeof e === 'object' && 'message' in e ? String(e.message) : tr("预览失败")); } };
  if (capabilities.isError) return <Alert type="info" message={tr("当前服务尚未启用阶段 E 偿还计划接口。")} />;
  return <Card title={kind === 'CreditInstallment' ? tr("信用卡分期计划") : tr("借贷偿还与利息计划")} className="mt20">
    <Space wrap className="mb16">{!fixedCurrency && <Select aria-label={tr("债务计划币种")} value={currency} onChange={v => { setCurrency(v); setPage(1); }} options={CURRENCY_CODES.map(value => ({ value, label: value }))} />}<Button disabled={hidden} onClick={() => edit()}>{tr("新建偿还计划")}</Button></Space>
    {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
    <Table rowKey="id" scroll={{ x: 650 }} loading={q.isPending} dataSource={q.data?.items} pagination={{ current: page, total: q.data?.total, pageSize: 20, onChange: setPage }} columns={[{ title: tr("名称"), dataIndex: 'name' }, { title: tr("计划本金"), render: (_, p) => <Money value={p.principal} currency={p.currency} /> }, { title: tr("期数"), dataIndex: 'periods' }, { title: tr("状态"), render: (_, p) => p.state === 'Active' ? '有效计划（非实际已还状态）' : '归档' }, { title: tr("操作"), render: (_, p) => <Space><Button type="link" onClick={() => { setSelected(p.id); setActualPage(1); setPayoff(undefined); }}>{tr("期表")}</Button><Button type="link" disabled={hidden} onClick={() => edit(p)}>{tr("编辑")}</Button></Space> }]} />
    <Drawer title={tr("偿还计划参数")} width={Math.min(600, window.innerWidth)} open={!!editing && !hidden} onClose={() => setEditing(undefined)} extra={<Button type="primary" loading={busy} onClick={save}>{tr("保存计划")}</Button>}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={tr("计划名称")} rules={[{ required: true }]}><Input maxLength={150} /></Form.Item>
        <Form.Item name="accountId" label={tr("原资金账户 / 信用卡")} rules={[{ required: true }]}><AccountSelector creditOnly={kind === 'CreditInstallment'} /></Form.Item>
        {kind === 'LoanRepayment' ? <Form.Item name="businessId" label={tr("已有借贷业务 ID")} rules={[{ required: true }]}><Input /></Form.Item> : <Form.Item name="originalTransactionId" label={tr("原消费 ID（留空为现有信用卡债务计划）")}><Input /></Form.Item>}
        <Form.Item name="principal" label={tr("本次计划本金")} rules={[{ required: true }]}><Input inputMode="decimal" /></Form.Item>
        <Form.Item name="periods" label={tr("期数")} rules={[{ required: true }]}><InputNumber min={1} max={600} precision={0} /></Form.Item>
        <Form.Item name="firstDate" label={tr("首期计划日期")} rules={[{ required: true }]}><DatePicker /></Form.Item>
        <Form.Item name="repaymentMode" label={tr("本金偿还方式")} rules={[{ required: true }]}><Select options={repayOptions} /></Form.Item>
        <Form.Item name="feeMode" label={tr("每期费用方式")} rules={[{ required: true }]}><Select options={feeOptions} /></Form.Item>
        <Form.Item name="parameter" label={tr("固定费用金额 / 每期百分比（无费用及自定义填0）")} rules={[{ required: true }]}><Input inputMode="decimal" /></Form.Item>
        <Form.Item name="customText" label={tr("自定义期表 JSON：date、principal、fee（金额为字符串）")}><Input.TextArea rows={5} placeholder={'[{"date":"2026-11-01","principal":"100.00","fee":"0.00"}]'} /></Form.Item>
        {kind === 'CreditInstallment' && <><Form.Item name="statementAmount" label={tr("真实账单应还金额（选填）")}><Input inputMode="decimal" /></Form.Item><Form.Item name="minimumPayment" label={tr("真实最低还款金额（选填）")}><Input inputMode="decimal" /></Form.Item><Form.Item name="minimumDueDate" label={tr("最低还款截止日期")}><DatePicker /></Form.Item></>}
        <Form.Item name="state" label={tr("计划状态")}><Select options={[{ value: 'Active', label: tr("有效计划") }, { value: 'Archived', label: tr("归档，保留历史") }]} /></Form.Item>
        <Form.Item name="note" label={tr("合同规则 / 假设说明")}><Input.TextArea maxLength={2000} /></Form.Item>
      </Form>
    </Drawer>
    <Drawer title={tr("计划与实际核对")} width={Math.min(900, window.innerWidth)} open={!!selected} onClose={() => setSelected(undefined)}>
      {detail.isError && <ErrorState error={detail.error} retry={() => detail.refetch()} />}
      {detail.data && <><Alert type="info" message={detail.data.explanation} className="mb16" />{detail.data.needsReview && <Alert type="warning" className="mb16" message={tr("原消费退款、撤销或借贷剩余本金已变化，请按合同核对计划；系统不会自动冲销计划本金和费用。")} />}<p>{tr("计划总费用：")}<Money value={detail.data.totalPlannedFee} currency={detail.data.plan.currency} />{tr("；来源当前欠款/剩余本金：")}<Money value={detail.data.sourceCurrentOutstanding} currency={detail.data.plan.currency} /></p>
        <p>{tr("已核对")}{detail.data.reconciledPeriods} {tr("期，未完全核对")}{detail.data.unreconciledPeriods} {tr("期；剩余计划本金：")}<Money value={detail.data.remainingPlannedPrincipal} currency={detail.data.plan.currency} />{tr("。核对期数不等于银行合同已结清期数。")}</p>        <Table rowKey="sequence" scroll={{ x: 800 }} dataSource={detail.data.schedule} columns={[{ title: tr("期数"), dataIndex: 'sequence' }, { title: tr("计划日期"), dataIndex: 'date' }, ...(['openingPrincipal', 'principal', 'fee', 'total', 'remainingPrincipal', 'actualPrincipal', 'actualFee', 'difference'] as const).map((key, i) => ({ title: ['期初本金', '计划本金', '计划费用', '计划合计', '剩余计划本金', '已核对本金', '已核对费用', '实际减计划'][i], dataIndex: key, render: (v: string) => <Money value={v} currency={detail.data!.plan.currency} /> }))]} />
        <Table rowKey="id" pagination={{ current: actualPage, total: detail.data.actualPayments.total, pageSize: 20, onChange: setActualPage }} dataSource={detail.data.actualPayments.items} columns={[{ title: tr("实际还款候选记录（未分配到期）"), dataIndex: 'id' }, { title: tr("日期"), dataIndex: 'occurredAt' }, { title: tr("核对"), render: (_, r) => <Button type="link" onClick={() => setTransactionId(r.id)}>{tr("实际交易明细")}</Button> }]} /><p>{tr("共")}{detail.data.actualPayments.total} {tr("条；实际付款通过原业务页面核对。")}</p>
        <DebtReconciliationPanel id={detail.data.plan.id} version={detail.data.plan.version} currency={detail.data.plan.currency} periods={detail.data.plan.periods} />
        <Card title={tr("提前结清假设预览")}>{hidden ? <div>{tr("金额已隐藏")}</div> : <Space direction="vertical" style={{ width: '100%' }}><Input aria-label={tr("确认剩余本金")} placeholder={tr("手动确认剩余本金")} value={remaining} onChange={e => { setRemaining(e.target.value); setPayoff(undefined); }} /><Input aria-label={tr("确认结清费用")} placeholder={tr("手动确认合同结清费用")} value={fee} onChange={e => { setFee(e.target.value); setPayoff(undefined); }} /><Input aria-label={tr("结清确认说明")} placeholder={tr("合同及确认说明")} value={explanation} onChange={e => { setExplanation(e.target.value); setPayoff(undefined); }} /><Button onClick={preview}>{tr("计算预览")}</Button>{payoff && <><Money value={payoff.total} currency={detail.data.plan.currency} /><Alert message={payoff.warning} type="warning" /></>}</Space>}</Card>
      </>}
    </Drawer>
    <TransactionDrawer id={transactionId} onClose={() => setTransactionId(undefined)} />
  </Card>;
}

