import { apiClient } from './client';
export interface DeleteItem {
  id: string;
  version: string;
}
export interface DirectoryDeletionRequest {
  items: DeleteItem[];
  all?: boolean;
}
export interface DirectoryDeletionRow extends DeleteItem {
  name: string;
  allowed: boolean;
  reason?: string;
}
export interface DirectoryDeletionPreview {
  total: number;
  allowed: number;
  blocked: number;
  items: DirectoryDeletionRow[];
}
export const deletionApi = {
  directoryPreview: (kind: string, body: DirectoryDeletionRequest) =>
    apiClient
      .post<{ data: DirectoryDeletionPreview }>(
        `/directory/${kind}/deletion-preview`,
        body,
      )
      .then((r) => r.data.data),
  directories: (kind: string, items: DeleteItem[], key: string) =>
    apiClient
      .post<{ data: { deleted: number; skipped: DirectoryDeletionRow[] } }>(
        `/directory/${kind}/batch-delete`,
        { items },
        { headers: { 'Idempotency-Key': key }, timeout: 120000 },
      )
      .then((r) => r.data.data),
  transactions: (items: DeleteItem[], key: string) =>
    apiClient
      .post<{ data: { deleted: number } }>(
        '/transactions/batch-delete',
        { items },
        { headers: { 'Idempotency-Key': key }, timeout: 120000 },
      )
      .then((r) => r.data.data),
};
