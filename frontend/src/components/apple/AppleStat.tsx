import type { ReactNode } from 'react';
import { Money } from '../Money';
import { DeltaBadge } from './DeltaBadge';
import type { Currency } from '../../types';

/**
 * Standard Apple-style metric block: quiet label, tabular figure, optional
 * signed delta and explanatory caption. Used by Home and Dashboard so both
 * pages share exactly one number hierarchy.
 */
export function AppleStat({
  label,
  value,
  currency = 'CNY',
  delta,
  deltaPercent,
  deltaInvert = false,
  caption,
  icon,
  footer,
}: {
  label: ReactNode;
  value?: string;
  currency?: Currency;
  delta?: string;
  deltaPercent?: number | null;
  deltaInvert?: boolean;
  caption?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="pf-stat">
      <span className="pf-stat-label">
        {icon ? (
          <span className="pf-inline" style={{ gap: 6 }}>
            {icon}
            {label}
          </span>
        ) : (
          label
        )}
      </span>
      {value !== undefined ? (
        <span className="pf-stat-value">
          <Money value={value} currency={currency} />
        </span>
      ) : null}
      {delta !== undefined || deltaPercent !== undefined ? (
        <span className="pf-inline">
          <DeltaBadge
            amount={delta}
            percent={deltaPercent}
            currency={currency}
            invert={deltaInvert}
          />
          {caption ? <span className="pf-stat-caption">{caption}</span> : null}
        </span>
      ) : caption ? (
        <span className="pf-stat-caption">{caption}</span>
      ) : null}
      {footer}
    </div>
  );
}
