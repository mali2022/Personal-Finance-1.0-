import type { ReactNode } from 'react';

/** Consistent semantic title; page controls and financial content remain owned by the page. */
export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <div className="page-title">
      <h1>{children}</h1>
    </div>
  );
}
