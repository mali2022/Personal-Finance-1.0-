import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, InputNumber, message } from 'antd';
import { apiClient } from '../api/client';
export default function SpendingApprovalExtrasPanel({ id, version, write }: { id: string; version: string; write: (path: string, body: unknown, version: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['approvalNotes', id, version], queryFn: async () => (await apiClient.get(`/spending-approvals/${id}/notes`)).data.data as { records: { id: string; kind: string; data: unknown }[]; images: { id: string; size: number }[] } });
  return <Card title="补充信息与购买成本">
    <Form layout="vertical" onFinish={values => write(`/spending-approvals/${id}/answers`, values, version)}>
      <Form.Item name="question" label="需要澄清的问题" rules={[{ required: true, max: 1000 }]}><Input /></Form.Item>
      <Form.Item name="answer" label="你的回答" rules={[{ required: true, max: 4000 }]}><Input.TextArea /></Form.Item>
      <Button htmlType="submit">保存回答并重新审查</Button>
    </Form>
    <Form layout="vertical" onFinish={values => write(`/spending-approvals/${id}/installment`, values, version)}>
      <Form.Item name="downPayment" label="分期首付" rules={[{ required: true }]}><InputNumber min={0} precision={2} /></Form.Item>
      <Form.Item name="financedPrincipal" label="融资本金" rules={[{ required: true }]}><InputNumber min={0} precision={2} /></Form.Item>
      <Form.Item name="months" label="分期期数" rules={[{ required: true }]}><InputNumber min={1} max={600} precision={0} /></Form.Item>
      <Form.Item name="totalFees" label="全期手续费及利息总额（须明确，未知请勿填零）" rules={[{ required: true }]}><InputNumber min={0} precision={2} /></Form.Item>
      <Button htmlType="submit">保存分期并计算总成本</Button>
    </Form>
    <label>添加商品图片（PNG/JPEG，最大2MB）<input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.size > 2097152) { void message.error('图片不能超过2MB'); return; }
      setBusy(true); try { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); await write(`/spending-approvals/${id}/images`, { name: file.name, base64: btoa(binary) }, version); } finally { setBusy(false); e.target.value = ''; }
    }} /></label>
    {query.isError && <Alert type="error" message="补充信息加载失败" />}
    {query.data?.records?.map(r => <details key={r.id}><summary>{r.kind === 'ApprovalAnswer' ? '已保存问答' : '分期成本计算'}</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(r.data, null, 2)}</pre></details>)}
    {query.data?.images?.map(image => <Button key={image.id} onClick={async () => { try { const response = await apiClient.get(`/spending-approvals/${id}/images/${image.id}`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = '商品图片.png'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { void message.error('图片读取失败'); } }}>下载商品图片（{Math.ceil(image.size / 1024)}KB）</Button>)}
  </Card>;
}
