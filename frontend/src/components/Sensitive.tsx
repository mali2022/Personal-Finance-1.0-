import type { ReactNode } from 'react';
import { useUI } from '../stores/ui';
export function Sensitive({ children }: { children: ReactNode }) {
  const hidden = useUI((s) => s.hidden);
  return <span>{hidden ? '••••' : children}</span>;
}
