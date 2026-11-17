import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Typography, message } from 'antd';
import { apiClient } from '../api/client';
import SpendingApprovalSettingsPanel from './SpendingApprovalSettingsPanel';
import SpendingApprovalExtrasPanel from './SpendingApprovalExtrasPanel';

interface Application { name: string; amount: number; currency: string; reason: string; categoryId?: string; accountId?: string; productUrl?: string; essential?: boolean; existingItemUsable?: boolean; weeklyUses?: number; years?: number }
interface Approval { id: string; version: string; content: { application: Application; state: string; coolingUntil?: string; review?: { satisfaction: number; actualUses: number; notes: string }; history: { at: string; action: string; reason: string }[] } }
const states: Record<string, string> = { DRAFT: '草稿', SUBMITTED: '已提交', NEEDS_INFORMATION: '待补充信息', EVALUATED: '已评估', COOLING_DOWN: '冷静期', DECIDED: '已决定购买', PURCHASED: '已关联购买', PURCHASED_UNRECORDED: '已购买，尚未记账', ABANDONED: '已放弃', CANCELLED: '已取消' };
export default function SpendingApprovalsPage() {
  const [modal, modalContext] = Modal.useModal();
  const [feedback, feedbackContext] = message.useMessage();
  const [parseError, setParseError] = useState<string>();
  const cache = useQueryClient(); const [form] = Form.useForm<Application>();
  const [page, setPage] = useState(1); const [selected, setSelected] = useState<Approval>();
  const [creating, setCreating] = useState(false); const [busy, setBusy] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false);
  const [transactionId, setTransactionId] = useState(''); const [allocatedAmount, setAllocatedAmount] = useState<number | null>(null); const [hours, setHours] = useState<number | null>(168);
  const [prompt, setPrompt] = useState('');
  const [editing, setEditing] = useState(false);
  const categories = useQuery({ queryKey: ['approvalCategories'], queryFn: async () => (await apiClient.get('/categories')).data.data as { id: string; name: string; kind: string }[] });
  const accounts = useQuery({ queryKey: ['approvalAccounts'], queryFn: async () => (await apiClient.get('/accounts')).data.data as { id: string; name: string; currency: string }[] });
  const candidates = useQuery({ queryKey: ['approvalCandidates', selected?.id], enabled: !!selected && ['DECIDED', 'PURCHASED', 'PURCHASED_UNRECORDED'].includes(selected.content.state), queryFn: async () => (await apiClient.get(`/spending-approvals/${selected!.id}/transaction-candidates`)).data.data as { items: { id: string; amount: number; note: string; occurredAt: string }[] } });
  const detail = useQuery({ queryKey: ['approvalDetail', selected?.id, selected?.version], enabled: !!selected, queryFn: async () => (await apiClient.get(`/spending-approvals/${selected!.id}`)).data.data as { purchaseVerified: boolean; linkedTransactionMissing: boolean; refunded?: number; netActualCost?: number | null; refundState?: string; allocationValid?: boolean; refundAllocationUnresolved?: boolean; netCostLower?: number; netCostUpper?: number; transaction?: { amount: number; occurredAt: string } } });
  async function parse() {
    setParseError(undefined);
    setBusy(true);
    try { const response = await apiClient.post('/spending-approvals/parse', { prompt, confirmTransmission: true }, { timeout: 180000 }); const draft = response.data.data.draft; setEditing(false); form.resetFields(); form.setFieldsValue({ name: draft.name ?? '', amount: draft.amount ?? undefined, currency: draft.currency ?? '', reason: draft.reason ?? '' }); setCreating(true); if (draft.questions.length) void feedback.info(draft.questions.join('；')); }
    catch (error) { const detail = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : 'AI 提取失败，请稍后重试或手动填写申请'; setParseError(detail); } finally { setBusy(false); }
  }
  const [satisfaction, setSatisfaction] = useState<number | null>(8); const [uses, setUses] = useState<number | null>(0); const [notes, setNotes] = useState('');
  const list = useQuery({ queryKey: ['spendingApprovals', page], queryFn: async () => (await apiClient.get('/spending-approvals', { params: { page, pageSize: 20 } })).data.data as { items: Approval[]; total: number } });
  const evaluations = useQuery({ queryKey: ['approvalEvaluations', selected?.id, selected?.version], enabled: !!selected, queryFn: async () => (await apiClient.get(`/spending-approvals/${selected!.id}/evaluations`)).data.data as { id: string; content: { evaluation: { verdict: string; summary: string; keyReasons: string[]; missingInformation: string[] }; evidence: unknown } }[] });
  async function write(path: string, body: unknown, version: string, method: 'post' | 'put' = 'post') {
    setBusy(true);
    try { const response = await apiClient[method](path, body, { headers: { 'If-Match': version, 'Idempotency-Key': crypto.randomUUID() }, timeout: 180000 }); setSelected(response.data.data.deleted ? undefined : response.data.data); setCreating(false); await cache.invalidateQueries({ queryKey: ['spendingApprovals'] }); }
    catch (error) { void feedback.error(error instanceof Error ? error.message : '操作失败，请刷新后核实'); }
    finally { setBusy(false); }
  }
  const action = (action: string, extra = {}) => selected && write(`/spending-approvals/${selected.id}/actions`, { action, reason: notes, ...extra }, selected.version);
  return <Space direction="vertical" size="large" style={{ width: '100%' }}>
    {modalContext}{feedbackContext}
    {parseError && <Alert type="error" showIcon message="AI 提取未完成" description={parseError} closable onClose={() => setParseError(undefined)} />}
    <div><Typography.Title level={2}>AI 消费审批中心</Typography.Title></div>
    <Button type="primary" onClick={() => { setEditing(false); form.resetFields(); setCreating(true); }}>发起消费申请</Button>
    <Button onClick={() => setSettingsOpen(true)}>审批官设置</Button>
    <Modal title="审批官设置" open={settingsOpen} footer={null} onCancel={() => setSettingsOpen(false)}><SpendingApprovalSettingsPanel /></Modal>
    <Card title="自然语言申请"><Input.TextArea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={4000} placeholder="我想买一个5000元的手机，旧手机还能用……" /><Button loading={busy} disabled={!prompt.trim()} onClick={() => modal.confirm({ title: '将这段需求发送给当前 AI 模型？', content: '提取后请核对所有字段，确认后再创建申请。', onOk: parse })}>AI 提取申请</Button></Card>
    {list.isError && <Alert type="error" message="申请加载失败" action={<Button onClick={() => void list.refetch()}>重试</Button>} />}
    <Table rowKey="id" loading={list.isLoading} dataSource={list.data?.items ?? []} pagination={{ current: page, pageSize: 20, total: list.data?.total, onChange: setPage }} columns={[
      { title: '商品', render: (_, row: Approval) => <Button type="link" onClick={() => { setSelected(row); setNotes(''); }}>{row.content.application.name}</Button> },
      { title: '预计金额', render: (_, row: Approval) => `${row.content.application.amount} ${row.content.application.currency}` },
      { title: '状态', render: (_, row: Approval) => states[row.content.state] ?? row.content.state },
    ]} />
    <Modal open={creating} title="消费申请" onCancel={() => setCreating(false)} onOk={() => form.submit()} confirmLoading={busy}>
      <Form form={form} layout="vertical" initialValues={{ currency: 'CNY' }} onFinish={(values) => void write(editing && selected ? `/spending-approvals/${selected.id}` : '/spending-approvals', values, editing && selected ? selected.version : '0', editing ? 'put' : 'post')}>
        <Form.Item name="name" label="商品或服务" rules={[{ required: true, max: 100 }]}><Input /></Form.Item>
        <Form.Item name="amount" label="预计价格" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} max={1000000000000} /></Form.Item>
        <Form.Item name="currency" label="币种" rules={[{ required: true }]}><Input maxLength={3} /></Form.Item>
        <Form.Item name="reason" label="购买理由" rules={[{ required: true, max: 4000 }]}><Input.TextArea rows={4} /></Form.Item>
        <Form.Item name="categoryId" label="支出分类"><Select allowClear options={categories.data?.filter(c => c.kind === 'Expense').map(c => ({ value: c.id, label: c.name }))} /></Form.Item>
        <Form.Item name="accountId" label="计划支付账户"><Select allowClear options={accounts.data?.map(a => ({ value: a.id, label: `${a.name} (${a.currency})` }))} /></Form.Item>
        <Form.Item name="productUrl" label="商品链接"><Input maxLength={2000} /></Form.Item>
        <Form.Item name="essential" label="是否必需"><Radio.Group options={[{ value: true, label: '是' }, { value: false, label: '否' }]} /></Form.Item>
        <Form.Item name="existingItemUsable" label="现有同类商品是否仍可用"><Radio.Group options={[{ value: true, label: '是' }, { value: false, label: '否' }]} /></Form.Item>
        <Form.Item name="weeklyUses" label="预计每周使用次数"><InputNumber min={1} max={1000} precision={0} /></Form.Item>
        <Form.Item name="years" label="预计使用年限"><InputNumber min={1} max={100} precision={0} /></Form.Item>
      </Form>
    </Modal>
    <Modal open={!!selected} width={900} footer={null} title={selected?.content.application.name} onCancel={() => setSelected(undefined)}>
      {selected && <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Paragraph>{selected.content.application.reason}</Typography.Paragraph>
        <Typography.Text>状态：{states[selected.content.state]}；版本：{selected.version}</Typography.Text>
        {detail.data?.transaction && <Typography.Paragraph>实际支出：{detail.data.transaction.amount} {selected.content.application.currency}；与计划差额：{(Number(detail.data.transaction.amount) - selected.content.application.amount).toFixed(2)}；购买日期：{new Date(detail.data.transaction.occurredAt).toLocaleString()}</Typography.Paragraph>}
        {selected.content.review && <Card title="已保存复盘">满意度：{selected.content.review.satisfaction}/10；实际使用：{selected.content.review.actualUses} 次；{selected.content.review.notes}</Card>}
        {['DRAFT', 'CANCELLED', 'ABANDONED'].includes(selected.content.state) && <Button danger disabled={busy} onClick={() => modal.confirm({ title: '删除这份申请及评估历史？', content: '不会删除或修改真实账本交易。审计记录将保留。', onOk: () => write(`/spending-approvals/${selected.id}/delete`, {}, selected.version) })}>删除申请</Button>}
        {detail.data?.refundAllocationUnresolved && <Alert type="warning" message={`整笔交易部分退款，商品退款归属尚未核实；净成本范围 ${detail.data.netCostLower}–${detail.data.netCostUpper}。`} />}{detail.data?.allocationValid === false && selected.content.state === 'PURCHASED' && <Alert type="warning" message="关联交易金额或状态已变化，当前分摊未核实，请重新关联。" />}{detail.data?.linkedTransactionMissing && <Alert type="warning" message="关联交易已失效，购买状态未核实。请解绑并重新关联。" />}
        {['DRAFT', 'SUBMITTED', 'NEEDS_INFORMATION', 'EVALUATED', 'COOLING_DOWN'].includes(selected.content.state) && <Button onClick={() => { setEditing(true); form.setFieldsValue(selected.content.application); setCreating(true); }}>编辑申请 / 补充回答</Button>}
        {selected.content.coolingUntil && <Typography.Text>冷静期至：{new Date(selected.content.coolingUntil).toLocaleString()}</Typography.Text>}
        <Input.TextArea value={notes} onChange={e => setNotes(e.target.value)} placeholder="决定理由或复盘说明" maxLength={2000} />
        <Space wrap>
          {selected.content.state === 'DRAFT' && <Button loading={busy} onClick={() => void action('SUBMIT')}>提交申请</Button>}
          {['SUBMITTED', 'EVALUATED', 'NEEDS_INFORMATION'].includes(selected.content.state) && <Button loading={busy} onClick={() => modal.confirm({ title: '发送申请与真实财务摘要给当前配置的 AI 模型？', content: '沿用现有 AI 授权。关键财务数据不足时，评估会要求补充信息。', onOk: () => write(`/spending-approvals/${selected.id}/evaluate`, { confirmTransmission: true }, selected.version) })}>AI 审批 / 重新评估</Button>}
          {['SUBMITTED', 'EVALUATED', 'NEEDS_INFORMATION', 'DECIDED'].includes(selected.content.state) && <><InputNumber aria-label="冷静期小时" value={hours} onChange={setHours} min={1} max={8760} /><Button disabled={busy} onClick={() => void action('COOLDOWN', { hours })}>暂缓（小时）</Button></>}
          {selected.content.state === 'DECIDED' && <Button disabled={busy} onClick={() => void action('MARK_PURCHASED')}>我已购买，尚未记账</Button>}
          {selected.content.state === 'COOLING_DOWN' && <Button disabled={busy} onClick={() => void action('END_COOLDOWN')}>结束冷静期</Button>}
          {['SUBMITTED', 'EVALUATED', 'NEEDS_INFORMATION', 'COOLING_DOWN'].includes(selected.content.state) && <Button disabled={busy} onClick={() => void action('BUY')}>决定购买</Button>}
          {['DRAFT', 'SUBMITTED', 'EVALUATED', 'NEEDS_INFORMATION', 'COOLING_DOWN', 'DECIDED'].includes(selected.content.state) && <Button disabled={busy} onClick={() => void action('ABANDON')}>放弃购买</Button>}
        </Space>
        {['DECIDED', 'PURCHASED', 'PURCHASED_UNRECORDED'].includes(selected.content.state) && <Space wrap><Select style={{ width: 300 }} value={transactionId || undefined} onChange={setTransactionId} placeholder="选择已有支出交易" loading={candidates.isLoading} options={candidates.data?.items.map(t => ({ value: t.id, label: `${t.amount} · ${t.note} · ${new Date(t.occurredAt).toLocaleDateString()}` }))} /><InputNumber aria-label="本商品分摊金额" placeholder="分摊金额，留空关联整笔" value={allocatedAmount} onChange={setAllocatedAmount} min={0.01} precision={2} /><Button disabled={busy || !transactionId} onClick={() => void action('LINK', { transactionId, ...(allocatedAmount === null ? {} : { allocatedAmount }) })}>关联真实交易</Button>{selected.content.state === 'PURCHASED' && <Button onClick={() => void action('UNLINK')}>解绑</Button>}</Space>}
        {selected.content.state === 'PURCHASED' && <Space wrap><InputNumber aria-label="满意度" min={0} max={10} value={satisfaction} onChange={setSatisfaction} /><InputNumber aria-label="实际使用次数" min={0} max={1000000} value={uses} onChange={setUses} /><Button disabled={busy} onClick={() => void action('REVIEW', { satisfaction, actualUses: uses })}>保存复盘</Button></Space>}
        {evaluations.isError && <Alert type="error" message="评估历史加载失败" />}
        {evaluations.data?.map(item => <Card key={item.id} title={item.content.evaluation.verdict}><p>{item.content.evaluation.summary}</p>{item.content.evaluation.keyReasons.map((reason, index) => <p key={index}>{reason}</p>)}<Typography.Text>待补充：{item.content.evaluation.missingInformation.join('；')}</Typography.Text><details><summary>原始财务依据</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(item.content.evidence, null, 2)}</pre></details></Card>)}
        <Typography.Paragraph>关联交易退款总额：{detail.data?.refunded ?? 0}；净实际支出：{detail.data?.netActualCost ?? '尚未核实'}；退款状态：{detail.data?.refundState ?? '尚未核实'}</Typography.Paragraph><Typography.Title level={5}>操作历史</Typography.Title>{selected.content.history.map((event, index) => <p key={index}>{new Date(event.at).toLocaleString()} · {event.action} · {event.reason}</p>)}
        {['DRAFT', 'SUBMITTED', 'NEEDS_INFORMATION', 'EVALUATED', 'COOLING_DOWN'].includes(selected.content.state) && <SpendingApprovalExtrasPanel id={selected.id} version={selected.version} write={write} />}
      </Space>}
    </Modal>
  </Space>;
}
