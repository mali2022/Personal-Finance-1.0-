import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Persistent layout for the professional dashboard. Only the ten analysis
 * modules are orderable / hideable — the retained legacy surfaces (calendar,
 * recent transactions, planning ...) live in a separate, always reachable
 * "more tools" section so no business capability can be hidden by accident.
 *
 * Storage is defensive: malformed JSON, unknown module ids, duplicates and
 * missing modules all fall back to a valid layout instead of throwing.
 */
export const APPLE_DASHBOARD_LAYOUT_KEY = 'pf-apple-dashboard-v1';

export const APPLE_DASHBOARD_MODULES = [
  'networth',
  'trend',
  'savings',
  'categories',
  'budget',
  'structure',
  'cashflow',
  'goals',
  'anomalies',
  'ai',
] as const;

export type AppleDashboardModule = (typeof APPLE_DASHBOARD_MODULES)[number];

export type ModuleSpan = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export const APPLE_MODULE_SPANS: Record<AppleDashboardModule, ModuleSpan> = {
  networth: 12,
  trend: 8,
  savings: 4,
  categories: 4,
  budget: 4,
  structure: 4,
  cashflow: 8,
  goals: 4,
  anomalies: 4,
  ai: 8,
};

export const APPLE_MODULE_LABELS: Record<AppleDashboardModule, string> = {
  networth: '净资产变化',
  trend: '收支趋势',
  savings: '储蓄率与结余',
  categories: '消费分类',
  budget: '预算执行',
  structure: '资产与负债结构',
  cashflow: '现金流分析',
  goals: '财务目标',
  anomalies: '异常与对账',
  ai: 'AI 财务分析',
};

export interface AppleDashboardLayoutState {
  order: AppleDashboardModule[];
  hidden: AppleDashboardModule[];
}

export const DEFAULT_APPLE_DASHBOARD_LAYOUT: AppleDashboardLayoutState = {
  order: [...APPLE_DASHBOARD_MODULES],
  hidden: [],
};

function isModule(value: unknown): value is AppleDashboardModule {
  return (
    typeof value === 'string' &&
    (APPLE_DASHBOARD_MODULES as readonly string[]).includes(value)
  );
}

/** Coerce any stored/unknown value into a complete, duplicate-free layout. */
export function normalizeAppleDashboardLayout(
  raw: unknown,
): AppleDashboardLayoutState {
  const record =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { order?: unknown; hidden?: unknown })
      : {};
  const order: AppleDashboardModule[] = [];
  if (Array.isArray(record.order)) {
    for (const entry of record.order) {
      if (isModule(entry) && !order.includes(entry)) order.push(entry);
    }
  }
  for (const module of APPLE_DASHBOARD_MODULES) {
    if (!order.includes(module)) order.push(module);
  }
  const hidden: AppleDashboardModule[] = [];
  if (Array.isArray(record.hidden)) {
    for (const entry of record.hidden) {
      if (isModule(entry) && !hidden.includes(entry)) hidden.push(entry);
    }
  }
  // Never persist a layout that hides every module: the dashboard would look
  // broken and there would be no obvious way back.
  const visible = order.filter((module) => !hidden.includes(module));
  return visible.length ? { order, hidden } : { order, hidden: [] };
}

export function readAppleDashboardLayout(): AppleDashboardLayoutState {
  if (typeof localStorage === 'undefined') return DEFAULT_APPLE_DASHBOARD_LAYOUT;
  try {
    const text = localStorage.getItem(APPLE_DASHBOARD_LAYOUT_KEY);
    if (!text) return DEFAULT_APPLE_DASHBOARD_LAYOUT;
    return normalizeAppleDashboardLayout(JSON.parse(text));
  } catch {
    return DEFAULT_APPLE_DASHBOARD_LAYOUT;
  }
}

function writeAppleDashboardLayout(state: AppleDashboardLayoutState) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(APPLE_DASHBOARD_LAYOUT_KEY, JSON.stringify(state));
  } catch {
    /* Private browsing / quota: the in-memory layout keeps working. */
  }
}

export interface AppleDashboardLayout {
  order: AppleDashboardModule[];
  hidden: AppleDashboardModule[];
  visibleOrder: AppleDashboardModule[];
  isVisible: (module: AppleDashboardModule) => boolean;
  toggle: (module: AppleDashboardModule) => void;
  move: (module: AppleDashboardModule, delta: -1 | 1) => void;
  reset: () => void;
}

export function useAppleDashboardLayout(): AppleDashboardLayout {
  const [state, setState] = useState<AppleDashboardLayoutState>(
    readAppleDashboardLayout,
  );

  useEffect(() => {
    writeAppleDashboardLayout(state);
  }, [state]);

  const toggle = useCallback((module: AppleDashboardModule) => {
    setState((previous) => {
      const hidden = previous.hidden.includes(module)
        ? previous.hidden.filter((entry) => entry !== module)
        : [...previous.hidden, module];
      return normalizeAppleDashboardLayout({ ...previous, hidden });
    });
  }, []);

  const move = useCallback((module: AppleDashboardModule, delta: -1 | 1) => {
    setState((previous) => {
      const index = previous.order.indexOf(module);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= previous.order.length)
        return previous;
      const order = [...previous.order];
      const [entry] = order.splice(index, 1);
      order.splice(target, 0, entry);
      return normalizeAppleDashboardLayout({ ...previous, order });
    });
  }, []);

  const reset = useCallback(() => {
    setState({ order: [...APPLE_DASHBOARD_MODULES], hidden: [] });
  }, []);

  return useMemo(
    () => ({
      order: state.order,
      hidden: state.hidden,
      visibleOrder: state.order.filter(
        (module) => !state.hidden.includes(module),
      ),
      isVisible: (module: AppleDashboardModule) =>
        !state.hidden.includes(module),
      toggle,
      move,
      reset,
    }),
    [state, toggle, move, reset],
  );
}
