import type { ReactNode } from 'react';
import { useId } from 'react';
import { t as tr } from '../../i18n';

/**
 * Apple-style grouped surface. Deliberately a plain <section> instead of an
 * Ant Card so the new design system does not fight the legacy `.ant-card`
 * overrides used by the rest of the application.
 */
export function AppleCard({
  title,
  action,
  children,
  className = '',
  span,
  id,
  ariaLabel,
  flush = false,
  quiet = false,
  interactive = false,
  footer,
  loading = false,
  loadingRows = 3,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  id?: string;
  ariaLabel?: string;
  flush?: boolean;
  quiet?: boolean;
  interactive?: boolean;
  footer?: ReactNode;
  loading?: boolean;
  loadingRows?: number;
}) {
  const headingId = useId();
  const classes = [
    'pf-card',
    flush ? 'pf-card--flush' : '',
    quiet ? 'pf-card--quiet' : '',
    interactive ? 'pf-card--interactive' : '',
    span ? `pf-col-${span}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section
      className={classes}
      id={id}
      aria-label={!title ? ariaLabel : undefined}
      aria-labelledby={title ? headingId : undefined}
    >
      {(title || action) && (
        <header className="pf-card-head">
          <div className="pf-card-heading">
            {title ? (
              <h2 className="pf-card-title" id={headingId}>
                {title}
              </h2>
            ) : null}
          </div>
          {action ? <div className="pf-card-action">{action}</div> : null}
        </header>
      )}
      <div className={`pf-card-body${flush ? ' pf-card-body--flush' : ''}`}>
        {loading ? <SkeletonCard rows={loadingRows} /> : children}
      </div>
      {footer ? <div className="pf-card-foot">{footer}</div> : null}
    </section>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="pf-skeleton" role="status" aria-live="polite" aria-busy="true">
      {Array.from({ length: Math.max(2, rows) }, (_, index) => (
        <i key={index} />
      ))}
      <span className="sr-only">{tr('正在加载')}</span>
    </div>
  );
}

/** Compact, encouraging empty state used inside Apple cards. */
export function AppleEmpty({
  title,
  description,
  action,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="pf-state">
      <span aria-hidden="true">—</span>
      {title ? <strong>{title}</strong> : null}
      {description ? <span>{description}</span> : null}
      {action}
    </div>
  );
}
