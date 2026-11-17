import { apiClient } from './client';
export interface BatchChanges {
  accountId?: string;
  status?: string;
  categoryId?: string;
  setMerchant?: boolean;
  merchant?: string;
  setProject?: boolean;
  projectId?: string | null;
  setNote?: boolean;
  note?: string;
  addTagIds?: string[];
  removeTagIds?: string[];
}
export interface BatchRequest {
  items: { id: string; version: string }[];
  changes: BatchChanges;
}
export interface BatchPreview {
  selected: number;
  allowed: number;
  rejected: number;
  items: {
    id: string;
    version?: string;
    requestedVersion: string;
    nextVersion?: string;
    allowed: boolean;
    reason?: string;
    before: BatchChanges & { tagIds: string[] };
    after?: BatchChanges & { tagIds: string[] };
  }[];
  affected: {
    months: string[];
    accountIds: string[];
    categoryIds: string[];
    projectIds: string[];
    reports: string[];
  };
}
export interface BatchResult {
  batchId: string;
  state: string;
  count: number;
  preview: BatchPreview;
}
export interface ReviewDetail {
  transactionId: string;
  reasons: string[];
  state: string;
  version: string;
  note?: string;
  deferredUntil?: string;
  history: {
    createdAt: string;
    changes: { field: string; before?: string; after?: string }[];
  }[];
}
export const batchApi = {
  preview: (body: BatchRequest) =>
    apiClient
      .post<{ data: BatchPreview }>('/transactions/batch-preview', body)
      .then((r) => r.data.data),
  apply: (body: BatchRequest, key: string) =>
    apiClient
      .post<{ data: BatchResult }>('/transactions/batch-apply', body, {
        headers: { 'Idempotency-Key': key },
      })
      .then((r) => r.data.data),
  result: (id: string) =>
    apiClient
      .get<{ data: BatchResult }>(`/transaction-batches/${id}`)
      .then((r) => r.data.data),
  review: (id: string) =>
    apiClient
      .get<{ data: ReviewDetail }>(`/transactions/${id}/review`)
      .then((r) => r.data.data),
  reviewUpdate: (
    id: string,
    version: string,
    body: { state: string; note: string; deferredUntil?: string },
    key: string,
  ) =>
    apiClient.post(`/transactions/${id}/review`, body, {
      headers: { 'If-Match': version, 'Idempotency-Key': key },
    }),
};
