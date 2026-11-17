import { useState } from 'react';
import { Alert, Button, Checkbox, Input, Select, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { concertApi } from './api';
import type { TicketTransfer, TransferPayment } from './api';
import { useUI } from '../../stores/ui';
export function TicketTransferFields({ value, onChange, currency, disabled }: { value: TicketTransfer; onChange: (value: TicketTransfer) => void; currency: string; disabled?: boolean }) {
  const [keyword, setKeyword] = useState('');
  const openEntry = useUI(s => s.openEntry);
  const incomes = useQuery({ queryKey: ['concert', 'transfer-choices', currency, 'Income', keyword], queryFn: () => concertApi.transferTransactions(currency, 'Income', keyword) });
  const expenses = useQuery({ queryKey: ['concert', 'transfer-choices', currency, 'Expense', keyword], queryFn: () => concertApi.transferTransactions(currency, 'Expense', keyword) });
  const change = (patch: Partial<TicketTransfer>) => onChange({ ...value, ...patch });
  const payments = (key: 'receipts' | 'returns', title: string) => <Space direction="vertical" style={{ width: '100%' }}>
    <strong>{title}</strong>
    {value[key].map((payment, index) => {
      const update = (patch: Partial<TransferPayment>) => change({ [key]: value[key].map((p, i) => i === index ? { ...p, ...patch } : p) });
      return <Space key={index} wrap>
        <Select aria-label={`${title}流水 ${index + 1}`} style={{ minWidth: 220 }} disabled={disabled} showSearch filterOption={false} onSearch={setKeyword} value={payment.transactionId || undefined} options={(key === 'receipts' ? incomes : expenses).data?.map(t => ({ value: t.id, label: `${t.amount} ${t.currency} · ${t.note || t.merchant || t.id}` }))} onChange={transactionId => update({ transactionId })} />
        <Input aria-label={`${title}归属金额 ${index + 1}`} placeholder="本票归属金额" inputMode="decimal" value={payment.amount} disabled={disabled} onChange={e => update({ amount: e.target.value })} />
        <Button disabled={disabled} onClick={() => change({ [key]: value[key].filter((_, i) => i !== index) })}>移除{title}关联</Button>
      </Space>;
    })}
    <Button disabled={disabled || value[key].length >= 20} onClick={() => change({ [key]: [...value[key], { transactionId: '', amount: '' }] })}>关联{title}</Button>
  </Space>;
  return <Space direction="vertical" style={{ width: '100%' }}>
    {(incomes.isError || expenses.isError) && <Alert type="error" message="资金候选加载失败" action={<Button onClick={() => { void incomes.refetch(); void expenses.refetch(); }}>重试</Button>} />}
    <Input aria-label="转让人" placeholder="转让人（姓名或昵称）" value={value.seller} maxLength={100} disabled={disabled} onChange={e => change({ seller: e.target.value })} />
    <Input aria-label="转让买家" placeholder="买家（姓名或昵称）" value={value.buyer} maxLength={100} disabled={disabled} onChange={e => change({ buyer: e.target.value })} />
    <label>转让日期（演出当地日期）<Input aria-label="转让日期" type="date" value={value.transferredOn} disabled={disabled} onChange={e => change({ transferredOn: e.target.value })} /></label>
    <Input aria-label="约定票款" placeholder={`约定票款 ${currency}（非已收收入）`} inputMode="decimal" value={value.agreedAmount} disabled={disabled} onChange={e => change({ agreedAmount: e.target.value })} />
    <Select aria-label="转让记录状态" style={{ width: '100%' }} value={value.state} disabled={disabled} options={[{ value: 'Recorded', label: '已登记转让' }, { value: 'Revoked', label: '转让记录已撤销（票款须抵平）' }]} onChange={state => change({ state })} />
    <Checkbox checked={value.platformAllowed} disabled={disabled} onChange={e => change({ platformAllowed: e.target.checked })}>我已确认转让符合票务平台规则</Checkbox>
    <Space wrap><Button disabled={disabled} onClick={() => openEntry('Income')}>登记真实回款收入</Button><Button disabled={disabled} onClick={() => openEntry('Expense')}>登记真实返款支出</Button></Space>
    {payments('receipts', '已收票款')}{payments('returns', '实际返款')}
    <Input.TextArea aria-label="转让备注" placeholder="转让备注" value={value.note} maxLength={1000} disabled={disabled} onChange={e => change({ note: e.target.value })} />
  </Space>;
}
