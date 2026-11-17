import { Button, Card, Checkbox, Input, Select, Space } from 'antd';
import type { Ticket } from './api';
import { TicketTransferFields } from './TicketTransferFields';

const states = [
  { value: 'Pending', label: '待领取' },
  { value: 'Received', label: '已领取' },
  { value: 'Used', label: '已使用' },
  { value: 'Cancelled', label: '已取消' },
];
export function ticketGiftError(tickets?: Ticket[] | null) {
  for (const [index, ticket] of (tickets ?? []).entries()) {
    const gift = ticket.gift;
    if (gift && (!gift.from.trim() || !gift.recipient.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(gift.giftedOn))) return `门票 ${index + 1}：请填写赠送人、接收人和赠送日期`;
    if (gift && gift.from.trim().toLowerCase() === gift.recipient.trim().toLowerCase()) return `门票 ${index + 1}：赠送人和接收人不能相同`;
    if (gift?.state === 'Given' && !gift.platformAllowed) return `门票 ${index + 1}：请确认赠送符合票务平台规则`;
    const sale = ticket.transfer;
    if (sale) {
      const money = (value: string) => /^\d{1,18}(\.\d{1,2})?$/.test(value) && /[1-9]/.test(value);
      if (!sale.seller.trim() || !sale.buyer.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(sale.transferredOn) || !money(sale.agreedAmount)) return `门票 ${index + 1}：请填写转让人、买家、日期及有效约定票款`;
      if (sale.seller.trim().toLowerCase() === sale.buyer.trim().toLowerCase()) return `门票 ${index + 1}：转让人和买家不能相同`;
      if (sale.state === 'Recorded' && !sale.platformAllowed) return `门票 ${index + 1}：请确认转让符合票务平台规则`;
      if ([...sale.receipts, ...sale.returns].some(p => !p.transactionId || !money(p.amount))) return `门票 ${index + 1}：请选择真实资金流水并填写有效归属金额`;
    }
  }
}

export function TicketRecords({ value, onChange, disabled, currency = 'CNY' }: {
  value?: Ticket[] | null;
  onChange?: (value: Ticket[]) => void;
  disabled?: boolean;
  currency?: string;
}) {
  const tickets = value ?? [];
  const update = (id: string, patch: Partial<Ticket>) =>
    onChange?.(tickets.map(ticket => ticket.id === id ? { ...ticket, ...patch } : ticket));
  return <Space direction="vertical" style={{ width: '100%' }}>
    {tickets.map((ticket, index) => <Card key={ticket.id} size="small" title={`门票 ${index + 1}`}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Input aria-label={`门票 ${index + 1} 票区`} placeholder="票区" maxLength={200} value={ticket.tier} disabled={disabled} onChange={e => update(ticket.id, { tier: e.target.value })} />
        <Input aria-label={`门票 ${index + 1} 座位`} placeholder="座位" maxLength={200} value={ticket.seat} disabled={disabled} onChange={e => update(ticket.id, { seat: e.target.value })} />
        <Input aria-label={`门票 ${index + 1} 观演人`} placeholder="观演人（姓名或昵称）" maxLength={100} value={ticket.attendee} disabled={disabled} onChange={e => update(ticket.id, { attendee: e.target.value })} />
        <Input aria-label={`门票 ${index + 1} 实付分配`} placeholder={`本票实付分配 ${currency}（逐票退款/损失核算前填写，含本票手续费）`} inputMode="decimal" value={ticket.paidShare ?? ''} disabled={disabled} onChange={e => update(ticket.id, { paidShare: e.target.value })} />
        <Input aria-label={`门票 ${index+1} 本人承担分配`} placeholder="含代垫本金时填写本票本人承担额（不能包含他人应还本金）" inputMode="decimal" value={ticket.personalShare??''} disabled={disabled} onChange={e=>update(ticket.id,{personalShare:e.target.value})}/>
        <Select aria-label={`门票 ${index + 1} 未使用结果`} style={{width:'100%'}} disabled={disabled} value={ticket.outcome?.state ?? 'Open'} options={[{value:'Open',label:'未确认未使用损失'},{value:'Unused',label:'确认未使用（原成本分项，不重复记账）'}]} onChange={state=>update(ticket.id,{outcome:{state,note:ticket.outcome?.note??''}})}/>
        {ticket.outcome?.state==='Unused' && <Input aria-label={`门票 ${index+1} 未使用说明`} placeholder="未使用原因" disabled={disabled} value={ticket.outcome.note} maxLength={1000} onChange={e=>update(ticket.id,{outcome:{state:'Unused',note:e.target.value}})}/>}
        <Select aria-label={`门票 ${index + 1} 类型`} value={ticket.format} disabled={disabled} style={{ width: '100%' }} options={[{ value: 'Electronic', label: '电子票' }, { value: 'Paper', label: '纸质票' }]} onChange={format => update(ticket.id, { format })} />
        <Select aria-label={`门票 ${index + 1} 状态`} value={ticket.state} disabled={disabled} style={{ width: '100%' }} options={states} onChange={state => update(ticket.id, { state })} />
        {ticket.gift ? <Card size="small" title="赠送记录">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input aria-label={`门票 ${index + 1} 赠送人`} placeholder="赠送人（姓名或昵称）" value={ticket.gift.from} maxLength={100} disabled={disabled} onChange={e => update(ticket.id, { gift: { ...ticket.gift!, from: e.target.value } })} />
            <Input aria-label={`门票 ${index + 1} 接收人`} placeholder="接收人（姓名或昵称）" value={ticket.gift.recipient} maxLength={100} disabled={disabled} onChange={e => update(ticket.id, { gift: { ...ticket.gift!, recipient: e.target.value } })} />
            <label>赠送日期（演出当地日期）<Input aria-label={`门票 ${index + 1} 赠送日期`} type="date" value={ticket.gift.giftedOn} disabled={disabled} onChange={e => update(ticket.id, { gift: { ...ticket.gift!, giftedOn: e.target.value } })} /></label>
            <Select aria-label={`门票 ${index + 1} 赠送记录状态`} value={ticket.gift.state} disabled={disabled} style={{ width: '100%' }} options={[{ value: 'Given', label: '已登记赠送' }, { value: 'Revoked', label: '赠送记录已撤销' }]} onChange={state => update(ticket.id, { gift: { ...ticket.gift!, state } })} />
            <Checkbox checked={ticket.gift.platformAllowed} disabled={disabled} onChange={e => update(ticket.id, { gift: { ...ticket.gift!, platformAllowed: e.target.checked } })}>我已确认该赠送符合票务平台规则</Checkbox>
            <Input.TextArea aria-label={`门票 ${index + 1} 赠送备注`} placeholder="赠送备注" value={ticket.gift.note} maxLength={1000} disabled={disabled} onChange={e => update(ticket.id, { gift: { ...ticket.gift!, note: e.target.value } })} />
          </Space>
        </Card> : <Button disabled={disabled || ticket.state === 'Pending' || ticket.state === 'Cancelled' || ticket.transfer?.state === 'Recorded'} onClick={() => update(ticket.id, { gift: { from: '本人', recipient: '', giftedOn: '', state: 'Given', note: '', platformAllowed: false } })}>登记赠送</Button>}
        {ticket.transfer ? <Card size="small" title="有偿转让与回款"><TicketTransferFields value={ticket.transfer} currency={currency} disabled={disabled} onChange={transfer => update(ticket.id, { transfer })} /></Card> : <Button disabled={disabled || ticket.state === 'Pending' || ticket.state === 'Cancelled' || ticket.gift?.state === 'Given'} onClick={() => update(ticket.id, { transfer: { seller: '本人', buyer: '', transferredOn: '', agreedAmount: '', state: 'Recorded', receipts: [], returns: [], note: '', platformAllowed: false } })}>登记有偿转让</Button>}
      </Space>
    </Card>)}
    <Button disabled={disabled || tickets.length >= 500} onClick={() => onChange?.([...tickets, { id: crypto.randomUUID(), tier: '', seat: '', attendee: '', format: 'Electronic', state: 'Pending' }])}>添加逐张门票</Button>
  </Space>;
}
