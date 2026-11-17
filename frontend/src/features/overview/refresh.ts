/**
 * One refresh contract for financial mutations.
 *
 * `api/client.ts` dispatches `finance:planning-changed` after every successful
 * non-auth POST/PUT/DELETE. The predicate below decides which cached queries are
 * invalidated. It intentionally covers:
 * - legacy planning/report keys already listed before the Apple redesign;
 * - every new Home/Dashboard overview query (`overview-*` prefix);
 * - the shared dashboard aggregate, account balances and reconciliation
 *   coverage, so Home and Dashboard update without a manual reload.
 */
export const FINANCE_REFRESH_QUERY_ROOTS: readonly string[] = [
  'concert', 'concerts', 'concert-annual', 'music-purchases', 'music-report', 'concert-transactions',
  'annualBudgets',
  'annualHistory',
  'savingsGoals',
  'goalDetail',
  'financialIndicators',
  'financialSummary',
  'cashflow',
  'cashflowPlans',
  'carryovers',
  'budgetPlanningHistory',
  'budgetAlerts',
  'budgetAlertSettings',
  'budgetTemplates',
  'essentialPolicies',
  'cashflowScenarios',
  'financial-review',
  'period-review',
  'net-worth-attribution',
  'expense-structure',
  'analysis-attributes',
  'debt-plans',
  'debt-plan',
  'financial-health',
  'metric-details',
  'investments',
  'investment-trades',
  'investment-valuations',
  // Apple Home / Dashboard aggregates
  'dashboard',
  'accounts',
  'smart-reconciliation',
  // Open transaction list / dashboard calendar / report windows follow the same
  // mutation event so daily counts never stay stale after an edit.
  'transactions',
  'reports',
];

export function shouldRefreshFinanceQuery(query: {
  queryKey: readonly unknown[];
}): boolean {
  const root = String(query.queryKey[0] ?? '');
  // New overview hooks all share the `overview-` namespace.
  return (
    root.startsWith('overview-') || FINANCE_REFRESH_QUERY_ROOTS.includes(root)
  );
}
