import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Form, Input, InputNumber, Select, message } from 'antd';
import { apiClient } from '../api/client';

interface Settings { style: string; currency: string; emergencyReserve: number | null; preferences: string }
export default function SpendingApprovalSettingsPanel() {
  const [busy, setBusy] = useState(false);
  const query = useQuery({ queryKey: ['spendingApprovalSettings'], queryFn: async () => (await apiClient.get('/spending-approvals/settings')).data.data as { version: string; settings: Settings } });
  if (query.isError) return <Alert type="error" message="设置加载失败" />;
  if (!query.data) return <p>加载设置…</p>;
  return <Form key={query.data.version} layout="vertical" initialValues={query.data.settings} onFinish={async (values: Settings) => {
    setBusy(true);
    try { await apiClient.put('/spending-approvals/settings', values, { headers: { 'If-Match': query.data.version, 'Idempotency-Key': crypto.randomUUID() } }); await query.refetch(); void message.success('设置已保存'); }
    catch { void message.error('保存失败，请刷新核实设置版本'); } finally { setBusy(false); }
  }}>
    <Form.Item name="style" label="审批风格" rules={[{ required: true }]}><Select options={[{ value: 'Balanced', label: '平衡' }, { value: 'Strict', label: '严格' }, { value: 'Supportive', label: '支持' }]} /></Form.Item>
    <Form.Item name="currency" label="应急储备币种" rules={[{ required: true }]}><Input maxLength={3} /></Form.Item>
    <Form.Item name="emergencyReserve" label="需要保留的应急现金（未知请留空）"><InputNumber min={0} max={1000000000000} precision={2} /></Form.Item>
    <Form.Item name="preferences" label="个人偏好"><Input.TextArea maxLength={4000} /></Form.Item>
    <Button type="primary" htmlType="submit" loading={busy}>保存审批设置</Button>
  </Form>;
}
