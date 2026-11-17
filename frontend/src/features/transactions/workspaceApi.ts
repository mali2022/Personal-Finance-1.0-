import { apiClient } from '../../api/client';
import type { TransactionFilters } from '../../types';
export interface TransactionSummary {
  total: number;
  pending: number;
  anomalies: number;
  uncategorized: number;
  basis: string;
  currencies: {
    currency: string;
    income: string;
    expense: string;
    netExpense: string;
    netCashFlow: string;
    transferIn: string;
    transferOut: string;
    refunds: string;
    averageExpense: string;
    maxExpense: string;
  }[];
}
export interface StatementMatch {
  id: string;
  accountId: string;
  statementReference: string;
  amount: string;
  ledgerAmount: string;
  difference: string;
  currency: string;
  state: string;
  note: string;
  createdAt: string;
  version: string;
}
export const workspaceApi = {
  summary: (params: Partial<TransactionFilters>, signal?: AbortSignal) =>
    apiClient
      .get<{ data: TransactionSummary }>('/transactions/summary', { params, signal })
      .then((r) => r.data.data),
  issues: (id: string) =>
    apiClient
      .get<{ data: { rules: string[]; threshold: string } }>(
        `/transactions/${id}/issues`,
      )
      .then((r) => r.data.data),
  matches: (id: string) =>
    apiClient
      .get<{ data: StatementMatch[] }>(`/transactions/${id}/statement-matches`)
      .then((r) => r.data.data),
  match: (
    id: string,
    body: {
      accountId: string;
      statementReference: string;
      amount: string;
      note: string;
      version: string;
    },
    key: string,
  ) =>
    apiClient.post(`/transactions/${id}/statement-matches`, body, {
      headers: { 'Idempotency-Key': key },
    }),
  revoke: (id: string, match: StatementMatch, key: string) =>
    apiClient.post(
      `/transactions/${id}/statement-matches/${match.id}/revoke`,
      {},
      { headers: { 'Idempotency-Key': key, 'If-Match': match.version } },
    ),
  ai: (
    params: TransactionFilters,
    body: {
      mode: string;
      question: string;
      confirmTransmission: boolean;
      transactionIds?: string[];
    },
  ) =>
    apiClient
      .post<{ data: { answer: string; query?: Record<string, string> } }>(
        '/transactions/ai',
        body,
        { params, timeout: 180000 },
      )
      .then((r) => r.data.data),
};
