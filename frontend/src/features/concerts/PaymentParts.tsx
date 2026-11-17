import { Button, Input, Space } from 'antd';
import { Select } from '../../components/TouchSelect';
import { t as tr } from '../../i18n';
export interface PaymentPart {
  transactionId: string;
  amount: string;
  fee: string;
}
export function PaymentParts({
  value = [],
  onChange,
  options,
  onSearch,
  disabled,
}: {
  value?: PaymentPart[] | null;
  onChange?: (parts: PaymentPart[]) => void;
  options: { value: string; label: string }[];
  onSearch?: (value: string) => void;
  disabled?: boolean;
}) {
  const parts = value || [];
  const set = (index: number, change: Partial<PaymentPart>) =>
    onChange?.(parts.map((p, i) => (i === index ? { ...p, ...change } : p)));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {parts.map((part, index) => (
        <div
          key={index}
          style={{
            border: '1px solid var(--border-color, #d9d9d9)',
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Select
            style={{ width: '100%', marginBottom: 8 }}
            aria-label={`${tr('付款来源')} ${index + 1}`}
            value={part.transactionId || undefined}
            options={options}
            showSearch
            filterOption={false}
            onSearch={onSearch}
            disabled={disabled}
            onChange={(id) => set(index, { transactionId: id })}
          />
          <Input
            aria-label={`${tr('该来源归属金额')} ${index + 1}`}
            placeholder={tr('该来源归属金额')}
            value={part.amount}
            inputMode="decimal"
            disabled={disabled}
            onChange={(e) => set(index, { amount: e.target.value })}
            style={{ marginBottom: 8 }}
          />
          <Input
            aria-label={`${tr('该来源内含手续费')} ${index + 1}`}
            placeholder={tr('该来源内含手续费')}
            value={part.fee}
            inputMode="decimal"
            disabled={disabled}
            onChange={(e) => set(index, { fee: e.target.value })}
          />
          <Button
            type="link"
            disabled={disabled}
            onClick={() => onChange?.(parts.filter((_, i) => i !== index))}
          >
            {tr('移除此付款来源')}
          </Button>
        </div>
      ))}
      <Button
        disabled={disabled || parts.length >= 10}
        onClick={() =>
          onChange?.([
            ...parts,
            { transactionId: '', amount: '0.00', fee: '0.00' },
          ])
        }
      >
        {tr('添加组合付款来源')}
      </Button>
    </Space>
  );
}
