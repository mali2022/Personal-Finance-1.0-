import { apiClient } from './client';
import type { ApiResponse, Account } from '../types';
export interface OrdinaryTotals {
  income: string;
  incomeCount: number;
  expense: string;
  expenseCount: number;
  originalExpense: string;
  effectiveRefund: string;
  refundCount: number;
}
export interface AccountStatistics {
  currency: string;
  selected: OrdinaryTotals;
  allTime: OrdinaryTotals;
  thisMonth: OrdinaryTotals;
  monthly: { period: string; income: string; expense: string }[];
  majorExpenseCategories: { id: string; name: string; amount: string }[];
  firstTransactionAt?: string;
  lastTransactionAt?: string;
  historicalTransactionCount: number;
  actualActivityCount: number;
  explanation: string;
}
export interface Dependency {
  name: string;
  count: number;
}
export interface DeletePreview {
  allowed: boolean;
  balance: string;
  historicalTransactionCount: number;
  ledgerEntryCount: number;
  dependencies: Dependency[];
  reasons: string[];
  alternatives: string[];
  version: string;
}
export interface AccountGroup {
  id: string;
  name: string;
  sortOrder: number;
  version: string;
}
export interface RelatedResources {
  dependencies: Dependency[];
  businesses: {
    id: string;
    kind: string;
    counterparty: string;
    contractAccountId: string;
    accountId: string;
  }[];
  assets: { id: string; name: string; type: string; maturityDate?: string }[];
  investments: { id: string; name: string }[];
  instruments: {
    id: string;
    name: string;
    type: string;
    state: string;
    endsOn?: string;
  }[];
  recurring: { id: string; name: string; state: string; nextAt?: string }[];
  reconciliations: { id: string; createdAt: string }[];
}
export interface ActivitySummary {
  credit?: {
    repaymentAmount: string;
    repaymentCount: number;
    lastRepaymentAt?: string;
    paidInterest: string;
    paidServiceFee: string;
    unclassifiedCharges: string;
  };
  currency: string;
  items: { type: string; count: number; inflow: string; outflow: string }[];
  loan: {
    contracts: {
      id: string;
      principal: string;
      occurredAt: string;
      kind: string;
    }[];
    principalDisbursed: string;
    principalRepaid: string;
    remainingPrincipal: string;
    paidInterest: string;
    paidServiceFee: string;
    unclassifiedCharges: string;
    nextPlannedDate?: string;
    maturityDate?: string;
    repaymentCount: number;
    lastRepaymentAt?: string;
    plans: {
      id: string;
      name: string;
      firstDate: string;
      periods: number;
      repaymentMode: string;
      feeMode: string;
      scheduleJson: string;
    }[];
  };
  explanation: string;
}
const get = <T>(url: string, params?: Record<string, string>) =>
  apiClient.get<ApiResponse<T>>(url, { params }).then((r) => r.data.data);
const headers = (version?: string, key: string = crypto.randomUUID()) => ({
  'If-Match': version,
  'Idempotency-Key': key,
});
export const accounts2Api = {
  statistics: (id: string, params?: Record<string, string>) =>
    get<AccountStatistics>(`/accounts/${id}/statistics`, params),
  activity: (id: string, params?: Record<string, string>) =>
    get<ActivitySummary>(`/accounts/${id}/activity-summary`, params),
  preview: (id: string) => get<DeletePreview>(`/accounts/${id}/delete-preview`),
  remove: (a: Account, key = crypto.randomUUID()) =>
    apiClient.delete(`/accounts/${a.id}`, { headers: headers(a.version, key) }),
  archive: (a: Account, restore = false) =>
    apiClient.post(
      `/accounts/${a.id}/${restore ? 'unarchive' : 'archive'}`,
      {},
      { headers: headers(a.version) },
    ),
  reorder: (items: Account[], reset = false) =>
    apiClient.post(
      '/accounts/reorder',
      { items: items.map((a) => ({ id: a.id, version: a.version })), reset },
      { headers: headers() },
    ),
  card: (
    id: string,
    version: string | undefined,
    body: {
      cardNumber: string;
      bankName: string;
      cardHolderName: string;
      cardBrand: string;
      cardAlias: string;
    },
  ) =>
    apiClient.put(`/accounts/${id}/card`, body, { headers: headers(version) }),
  importAccounts: (items: Partial<Account>[], key: string) =>
    apiClient.post('/accounts/import', items, {
      headers: headers(undefined, key),
    }),
  deleteAll: (items: Account[]) =>
    apiClient.post(
      '/accounts/delete-all',
      { items: items.map((a) => ({ id: a.id, version: a.version })) },
      { headers: headers() },
    ),
  removeGroup: (g: AccountGroup) =>
    apiClient.delete(`/account-groups/${g.id}`, {
      headers: headers(g.version),
    }),
  groups: () => get<AccountGroup[]>('/account-groups'),
  addGroup: (name: string) =>
    apiClient.post('/account-groups', { name }, { headers: headers() }),
  related: (id: string) =>
    get<RelatedResources>(`/accounts/${id}/related-resources`),
  health: (id: string) =>
    get<{ alerts: { code: string; message: string }[]; checkedAt: string }>(
      `/accounts/${id}/health`,
    ),
  history: (id: string, page = 1) =>
    get<{
      items: {
        id: string;
        action: string;
        createdAt: string;
        changesJson: string;
      }[];
      total: number;
    }>(`/accounts/${id}/audit-history`, { page: String(page), pageSize: '20' }),
};
