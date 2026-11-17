import { apiClient } from './client';
import type {
  ApiResponse,
  BusinessRecord,
  CreateBusinessRequest,
  DirectoryRecord,
  PagedResult,
  SettleBusinessRequest,
} from '../types';
const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;
export const businessApi = {
  remove: (id: string, version: string) => apiClient.delete(`/business/${id}`, { headers: { 'If-Match': version } }),
  detail: (id: string) =>
    apiClient.get<ApiResponse<BusinessRecord>>(`/business/${id}`).then(unwrap),
  transaction: (
    id: string,
    transactionId: string,
    action: 'delete' | 'restore',
    version: string,
  ) =>
    apiClient.post(
      `/business/${id}/transactions/${transactionId}/${action}`,
      {},
      { headers: { 'If-Match': version } },
    ),
  list: (kind: BusinessRecord['kind'], page = 1) =>
    apiClient
      .get<ApiResponse<PagedResult<BusinessRecord>>>('/business', {
        params: { kind, page, pageSize: 20 },
      })
      .then(unwrap),
  create: (body: CreateBusinessRequest, key: string) =>
    apiClient.post('/business', body, { headers: { 'Idempotency-Key': key } }),
  settle: (id: string, body: SettleBusinessRequest, key: string) =>
    apiClient.post(`/business/${id}/settlements`, body, {
      headers: { 'If-Match': body.version, 'Idempotency-Key': key },
    }),
  status: (id: string, status: 'Submitted' | 'Abandoned', version: string) =>
    apiClient.post(
      `/business/${id}/status`,
      { status },
      { headers: { 'If-Match': version } },
    ),
};
export const directoryApi = {
  list: (kind: DirectoryRecord['kind'], keyword = '', page = 1, group?: string) =>
    apiClient
      .get<ApiResponse<PagedResult<DirectoryRecord> & { defaultLibrary?: { count: number; groups: string[] } }>>(`/directory/${kind}`, {
        params: { keyword, page, pageSize: 100, ...(group ? { group } : {}) },
      })
      .then(unwrap),
  importDefaultTags: (key: string) => apiClient.post<ApiResponse<{ imported: number; skipped: number }>>('/directory/tags/defaults', {}, { headers: { 'Idempotency-Key': key } }).then(unwrap),
  save: (body: DirectoryRecord, id?: string) =>
    id
      ? apiClient.put(`/directory/${body.kind}/${id}`, body, {
          headers: { 'If-Match': body.version },
        })
      : apiClient.post(`/directory/${body.kind}`, body),
  remove: (kind: DirectoryRecord['kind'], id: string, version: string) =>
    apiClient.delete(`/directory/${kind}/${id}`, {
      headers: { 'If-Match': version },
    }),
};
