import { apiClient } from './client';
import type {
  Account,
  ApiResponse,
  Category,
  DashboardDto,
  PagedResult,
  SaveTransactionRequest,
  TransactionDetailDto,
  TransactionFilters,
  TransactionListDto,
  RefundSourceDto,
  RefundSourceChoice,
  SaveBudgetRequest,
  Budget,
  ReportFilters,
  ReportDto,
  CreditCardStatementDto,
} from '../types';
const unwrap = <T>(response: { data: ApiResponse<T> }) => response.data.data;
export const transactionApi = {
  refundSources: (keyword: string, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<RefundSourceChoice>>>('/refund-sources', {
        params: { keyword, page, pageSize: 20 },
      })
      .then(unwrap),
  refundSource: (id: string, excludeRefundId?: string) =>
    apiClient
      .get<ApiResponse<RefundSourceDto>>(`/refund-sources/${id}`, {
        params: { excludeRefundId },
      })
      .then(unwrap),
  list: (params: TransactionFilters, signal?: AbortSignal) =>
    apiClient
      .get<ApiResponse<PagedResult<TransactionListDto>>>('/transactions', {
        params,
        signal,
      })
      .then(unwrap),
  detail: (id: string) =>
    apiClient
      .get<ApiResponse<TransactionDetailDto>>(`/transactions/${id}`)
      .then(unwrap),
  save: (
    body: SaveTransactionRequest,
    id?: string,
    idempotencyKey: string = crypto.randomUUID(),
  ) =>
    id
      ? apiClient.put(`/transactions/${id}/${body.type.toLowerCase()}`, body, {
          headers: {
            'If-Match': body.version,
            'Idempotency-Key': idempotencyKey,
          },
        })
      : apiClient.post(`/transactions/${body.type.toLowerCase()}`, body, {
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
  remove: (id: string, version: string) =>
    apiClient.delete(`/transactions/${id}`, {
      headers: { 'If-Match': version },
    }),
  restore: (id: string, version: string) =>
    apiClient.post(
      `/transactions/${id}/restore`,
      {},
      { headers: { 'If-Match': version } },
    ),
};
export const accountApi = {
  statement: (id: string, month?: string) =>
    apiClient
      .get<ApiResponse<CreditCardStatementDto>>(
        `/accounts/${id}/credit-card-statement`,
        { params: { month } },
      )
      .then(unwrap),
  list: () => apiClient.get<ApiResponse<Account[]>>('/accounts').then(unwrap),
  save: (body: Omit<Account, 'balance'>, id?: string, key = crypto.randomUUID()) =>
    id
      ? apiClient.put(`/accounts/${id}`, body, {
          headers: { 'If-Match': body.version || '1', 'Idempotency-Key':key },
        })
      : apiClient.post('/accounts', body, {headers:{'Idempotency-Key':key}}),
};
export const budgetApi = {
  get: (month: string) =>
    apiClient.get<ApiResponse<Budget>>(`/budgets/${month}`).then(unwrap),
  save: (month: string, body: SaveBudgetRequest) =>
    apiClient.put(`/budgets/${month}`, body, {
      headers: { 'If-Match': body.version || '0' },
    }),
};
export const reportApi = {
  get: (filters: ReportFilters) =>
    apiClient
      .get<ApiResponse<ReportDto>>('/reports/summary', { params: filters })
      .then(unwrap),
};
export interface CategoryImportRowInput {
  row: number;
  name: string;
  parentPath: string;
  status: string;
}
export interface CategoryImportPreviewItem extends CategoryImportRowInput {
  state: 'Ready' | 'Duplicate' | 'Error';
  reason?: string | null;
}
export interface CategoryImportPreview {
  total: number;
  ready: number;
  duplicates: number;
  errors: number;
  items: CategoryImportPreviewItem[];
}
export interface CategoryImportResult {
  imported: number;
  skipped: { row: number; name: string; reason: string }[];
}
export interface CategoryBatchDeletionItem {
  id: string;
  version: string;
  name: string;
  path: string;
  depth: number;
  allowed: boolean;
  reason?: string | null;
}
export interface CategoryBatchDeletionPreview {
  total: number;
  allowed: number;
  blocked: number;
  items: CategoryBatchDeletionItem[];
}
export interface CategoryBatchDeleteResult {
  deleted: number;
  skipped: CategoryBatchDeletionItem[];
}
export const categoryApi = {
  importPreview: (body: {
    kind: Category['kind'];
    rows: CategoryImportRowInput[];
  }) =>
    apiClient
      .post<ApiResponse<CategoryImportPreview>>(
        '/categories/import-preview',
        body,
      )
      .then(unwrap),
  importCategories: (
    body: { kind: Category['kind']; rows: CategoryImportRowInput[] },
    idempotencyKey: string,
  ) =>
    apiClient
      .post<ApiResponse<CategoryImportResult>>('/categories/import', body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      .then(unwrap),
  batchDeletionPreview: (kind: Category['kind']) =>
    apiClient
      .post<ApiResponse<CategoryBatchDeletionPreview>>(
        '/categories/deletion-preview',
        { kind },
      )
      .then(unwrap),
  batchDelete: (
    body: {
      kind: Category['kind'];
      items: { id: string; version: string }[];
    },
    idempotencyKey: string,
  ) =>
    apiClient
      .post<ApiResponse<CategoryBatchDeleteResult>>(
        '/categories/batch-delete',
        body,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      )
      .then(unwrap),
  reorder: (items: { id: string; version: string }[]) =>
    apiClient.post('/categories/reorder', { items }),
  deletionPreview: (id: string) =>
    apiClient
      .get<
        ApiResponse<{
          id: string;
          name: string;
          version: string;
          canDelete: boolean;
          references: { kind: string; label: string; count: number }[];
        }>
      >(`/categories/${id}/deletion-preview`)
      .then(unwrap),
  remove: (id: string, version: string) =>
    apiClient.delete(`/categories/${id}`, { headers: { 'If-Match': version } }),
  list: () =>
    apiClient.get<ApiResponse<Category[]>>('/categories').then(unwrap),
  save: (body: Category, id?: string) =>
    id
      ? apiClient.put(`/categories/${id}`, body, {
          headers: { 'If-Match': body.version },
        })
      : apiClient.post('/categories', body),
};
export const dashboardApi = {
  get: (month: string) =>
    apiClient
      .get<ApiResponse<DashboardDto>>('/dashboard', { params: { month } })
      .then(unwrap),
};