import type { ReactNode } from 'react';
import { EyeInvisibleOutlined } from '@ant-design/icons';
import { Money } from '../../../components/Money';
import { t as tr } from '../../../i18n';
import type { Currency } from '../../../types';
import type { ModuleSpan } from './useAppleDashboardLayout';

/** Grid item wrapper: carries the `pf-col-*` span and the stable test id. */
export function DashboardModule({
  id,
  span,
  children,
  className = '',
}: {
  id: string;
  span: ModuleSpan;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`dash-module pf-col-${span} ${className}`.trim()}
      data-testid={`module-${id}`}
    >
      {children}
    </div>
  );
}

/** Shown instead of amounts/charts while the privacy mode is on. */export function PrivacyState({ label }: { label?: string }) {
  return (
    <div className="pf-state dash-privacy" role="status">
      <EyeInvisibleOutlined aria-hidden="true" />
      <strong>{tr('隐私模式已隐藏金额与图表')}</strong>
      <span>
        {tr('关闭隐私模式后可查看{0}。', label || tr('财务数据'))}
      </span>
    </div>
  );
}

export function ScopePill({ children }: { children: ReactNode }) {
  return <span className="pf-pill is-tint">{children}</span>;
}

/** Compact metric used in the card header rows. */
export function Metric({
  label,
  value,
  text,
  currency = 'CNY',
  tone,
  caption,
}: {
  label: ReactNode;
  value?: string;
  text?: string;
  currency?: Currency;
  tone?: 'positive' | 'negative';
  caption?: ReactNode;
}) {
  return (
    <div className="dash-metric">
      <span className="dash-metric-label">{label}</span>
      {value !== undefined ? (
        <span
          className={`dash-metric-value${tone ? ` is-${tone}` : ''}`}
        >
          <Money value={value} currency={currency} />
        </span>
      ) : text !== undefined ? (
        <span
          className={`dash-metric-value is-text${tone ? ` is-${tone}` : ''}`}
        >
          {text}
        </span>
      ) : (
        <span className="dash-metric-value">—</span>
      )}
      {caption ? <span className="dash-metric-caption">{caption}</span> : null}
    </div>
  );
}

export function ModuleNote({ children }: { children: ReactNode }) {
  return <p className="dash-note">{children}</p>;
}

export function Bar({
  percent,
  tone = 'tint',
}: {
  percent: number | null;
  tone?: 'tint' | 'positive' | 'negative' | 'warning';
}) {
  const width =
    percent === null || !Number.isFinite(percent)
      ? 0
      : Math.min(100, Math.max(0, percent));
  return (
    <span
      className={`dash-bar is-${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
    >
      <i style={{ width: `${width}%` }} />
    </span>
  );
}
