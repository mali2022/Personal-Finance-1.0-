import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * 设计系统 v2 的展示型 primitives。
 * 只做排版与留白，不含业务逻辑、不读全局状态、不发请求；
 * 所有样式来自 `primitives.css` 的 [data-ds='v2'] 作用域。
 */

type Tone = 'pos' | 'neg';

export function DsPageHeader({
  title,
  subtitle,
  actions,
  backTo,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backTo?: { label: string; href: string };
}) {
  return (
    <header className="ds-page-header">
      <div>
        {backTo && (
          <Link className="ds-back" to={backTo.href}>
            {backTo.label}
          </Link>
        )}
        <div className="ds-page-header__title">{title}</div>
        {subtitle && <p className="ds-page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ds-page-header__actions">{actions}</div>}
    </header>
  );
}

export function DsSection({
  title,
  extra,
  dense,
  children,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  dense?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={dense ? 'ds-section ds-section--dense' : 'ds-section'}>
      {(title || extra) && (
        <div className="ds-section__head">
          <div className="ds-section__title">{title}</div>
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

export function DsCard({
  padding = 'md',
  interactive,
  tone,
  children,
}: {
  padding?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  tone?: 'flat' | 'sunk';
  children: ReactNode;
}) {
  const classes = ['ds-card'];
  if (padding !== 'md') classes.push(`ds-card--pad-${padding}`);
  if (tone) classes.push(`ds-card--${tone}`);
  if (interactive) classes.push('is-interactive');
  return <div className={classes.join(' ')}>{children}</div>;
}

export function DsStat({
  label,
  value,
  delta,
  hint,
  tone,
  compact,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  compact?: boolean;
}) {
  const classes = ['ds-stat'];
  if (tone) classes.push(`ds-stat--${tone}`);
  if (compact) classes.push('ds-stat--compact');
  return (
    <div className={classes.join(' ')}>
      <div className="ds-stat__label">{label}</div>
      <div className="ds-stat__value">{value}</div>
      {delta && <div className="ds-stat__delta">{delta}</div>}
      {hint && <div className="ds-stat__hint">{hint}</div>}
    </div>
  );
}

export function DsToolbar({
  left,
  right,
  nowrap,
}: {
  left?: ReactNode;
  right?: ReactNode;
  nowrap?: boolean;
}) {
  return (
    <div className={nowrap ? 'ds-toolbar ds-toolbar--nowrap' : 'ds-toolbar'}>
      <div className="ds-toolbar__left">{left}</div>
      {right && <div className="ds-toolbar__right">{right}</div>}
    </div>
  );
}

export function DsChip({
  active,
  count,
  onClick,
  children,
}: {
  active?: boolean;
  count?: number;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="ds-chip"
      aria-pressed={active ? true : false}
      onClick={onClick}
    >
      {children}
      {count !== undefined && <span className="ds-chip__count">{count}</span>}
    </button>
  );
}

export function DsSegment<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="ds-segment" role="group">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="ds-segment__item"
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function DsTableShell({
  title,
  toolbar,
  footer,
  children,
}: {
  title?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ds-table-shell">
      {(title || toolbar) && (
        <div className="ds-table-shell__head">
          <div className="ds-table-shell__title">{title}</div>
          {toolbar}
        </div>
      )}
      <div className="ds-table-shell__body">{children}</div>
      {footer && <div className="ds-table-shell__footer">{footer}</div>}
    </div>
  );
}

export function DsEmpty({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ds-empty">
      <div className="ds-empty__title">{title}</div>
      {hint && <div className="ds-empty__hint">{hint}</div>}
      {action}
    </div>
  );
}

export function DsState({
  state,
  title,
  onRetry,
}: {
  state: 'loading' | 'error' | 'empty';
  title?: ReactNode;
  onRetry?: () => void;
}) {
  if (state === 'loading')
    return (
      <div className="ds-skeleton-lines" aria-busy="true" aria-live="polite">
        <span />
        <span />
        <span />
      </div>
    );
  if (state === 'empty')
    return <DsEmpty title={title ?? '暂无数据'} />;
  return (
    <div className="ds-state ds-state--error" role="alert">
      <div className="ds-state__title">{title ?? '数据加载失败'}</div>
      {onRetry && (
        <button type="button" className="ds-btn" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function DsMoney({
  value,
  currency,
  signed,
  tone,
}: {
  value: string;
  currency?: string;
  signed?: boolean;
  tone?: Tone;
}) {
  const resolved = tone ?? (signed && value.trim().startsWith('-') ? 'neg' : undefined);
  const classes = resolved ? `ds-money ds-money--${resolved}` : 'ds-money';
  const text = signed && !value.trim().startsWith('-') && !value.trim().startsWith('+')
    ? `+${value}`
    : value;
  return (
    <span className={classes}>
      {currency ? `${currency} ${text}` : text}
    </span>
  );
}
