import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { Money } from '../Money';
import { decimal, minor } from '../../utils/finance';
import { useUI } from '../../stores/ui';
import { t as tr } from '../../i18n';
import type { Currency } from '../../types';

/**
 * Signed change indicator. `invert` is used for metrics where a rise is bad
 * (expenses, liabilities). Never renders a fake direction when the value is 0.
 */
export function DeltaBadge({
  amount,
  percent,
  currency = 'CNY',
  invert = false,
  hidden,
  label,
  hideAmount = false,
}: {
  amount?: string;
  percent?: number | null;
  currency?: Currency;
  invert?: boolean;
  hidden?: boolean;
  label?: string;
  hideAmount?: boolean;
}) {
  const privacy = useUI((state) => state.hidden);
  const masked = hidden ?? privacy;
  if (amount === undefined && (percent === undefined || percent === null))
    return null;
  const change = amount === undefined ? 0n : minor(amount);
  const direction =
    change > 0n ? 1 : change < 0n ? -1 : percent && percent !== 0 ? (percent > 0 ? 1 : -1) : 0;
  const positive = invert ? direction < 0 : direction > 0;
  const negative = invert ? direction > 0 : direction < 0;
  const tone = direction === 0 ? 'is-flat' : positive ? 'is-up' : negative ? 'is-down' : 'is-flat';
  const percentText =
    percent === undefined || percent === null
      ? null
      : `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
  if (masked)
    return (
      <span className={`pf-delta ${tone}`} aria-label={tr('金额已隐藏')}>
        {direction === 0 ? <MinusOutlined /> : direction > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
        <span>•••</span>
      </span>
    );
  return (
    <span className={`pf-delta ${tone}`}>
      {direction === 0 ? <MinusOutlined /> : direction > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
      {!hideAmount && amount !== undefined && change !== 0n ? (
        <span>
          {change > 0n ? '+' : '−'}
          <Money value={decimal(change < 0n ? -change : change)} currency={currency} />
        </span>
      ) : null}
      {percentText ? <span>{percentText}</span> : null}
      {label ? <span className="pf-faint">{label}</span> : null}
    </span>
  );
}
