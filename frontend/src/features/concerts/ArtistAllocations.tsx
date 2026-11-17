import { Alert, Button, InputNumber, Select, Space } from 'antd';
import type { ArtistAllocation } from './api';
export function ArtistAllocations({ value, onChange, options, disabled }: {
  value?: ArtistAllocation | null; onChange?: (value: ArtistAllocation) => void;
  options: { value: string; label: string }[]; disabled?: boolean;
}) {
  const plan = value ?? { mode: 'Primary', shares: [] };
  const replace = (index: number, patch: Partial<ArtistAllocation['shares'][number]>) => onChange?.({ mode: 'Split', shares: plan.shares.map((s, i) => i === index ? { ...s, ...patch } : s) });
  const remaining = 100 - plan.shares.reduce((sum, s) => sum + s.ratio, 0);
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Select aria-label="艺人费用归属模式" value={plan.mode} disabled={disabled} style={{ width: '100%' }} options={[{ value: 'Primary', label: '沿用主艺人 / 历史名称口径' }, { value: 'Split', label: '联合演出：明确比例' }]} onChange={mode => onChange?.({ mode, shares: [] })} />
    {plan.mode === 'Split' && <>
      <Alert type={remaining < 0 ? 'error' : 'info'} message={`未分配比例 ${remaining.toFixed(2)}%。逐笔费用按分分配；退款按原分币金额冲减。商品沿用自身分配，不继承这些比例。`} />
      {plan.shares.map((share, index) => <Space key={index} wrap style={{ width: '100%' }}>
        <Select aria-label={`联合艺人 ${index + 1}`} style={{ minWidth: 200 }} showSearch optionFilterProp="label" options={options} disabled={disabled} value={share.artistId || undefined} onChange={artistId => replace(index, { artistId })} />
        <InputNumber aria-label={`艺人归属比例 ${index + 1}`} min={0} max={100} precision={2} suffix="%" disabled={disabled} value={share.ratio} onChange={ratio => replace(index, { ratio: ratio ?? 0 })} />
        <Button disabled={disabled} onClick={() => onChange?.({ mode: 'Split', shares: plan.shares.filter((_, i) => i !== index) })}>移除艺人归属</Button>
      </Space>)}
      <Button disabled={disabled || plan.shares.length >= 50} onClick={() => onChange?.({ mode: 'Split', shares: [...plan.shares, { artistId: '', ratio: 0 }] })}>添加联合艺人</Button>
    </>}
  </Space>;
}
