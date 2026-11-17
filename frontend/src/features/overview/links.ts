/**
 * Canonical drill-down links for the Home/Dashboard pending cards.
 *
 * Each URL must select exactly the ledger set counted by the API:
 * - pending:  `/transactions/summary` counts `status == NeedsReview` only, so the
 *   strict `statusFlag=NeedsReview` filter is used (not the wider review queue).
 * - anomalies: `summary.anomalies` is the union of all anomaly rules, i.e.
 *   `anomaly=Any`.
 * - uncategorized: `summary.uncategorized` is the Category anomaly rule, so
 *   `anomaly=Category` (missing/invalid category entries), not a review state.
 */
export const transactionLinks = {
  reviewCenter: '/transactions/review',
  pendingReview: '/transactions?statusFlag=NeedsReview',
  anomalies: '/transactions?anomaly=Any',
  uncategorized: '/transactions?anomaly=Category',
  allTransactions: '/transactions',
} as const;
