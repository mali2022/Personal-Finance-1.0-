import { apiClient } from '../../api/client';
import type { ApiResponse, ImportJob, PagedResult } from '../../types';
export interface CleaningEvent {
  id: string;
  rowId?: string;
  rowIndex: number;
  jobVersion: number;
  action: string;
  source: string;
  ruleVersion: string;
  reason: string;
  createdAt: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}
export interface RecognitionSuggestion {
  id: string;
  rowId: string;
  index: number;
  merchant?: string;
  category?: string;
  confidence: number;
  reason: string;
  requestId: string;
  stale: boolean;
}
export interface MerchantMaster {
  id: string;
  name: string;
  status: string;
  categoryId?: string;
  version: string;
  aliases: { id: string; name: string; source: string; version: string }[];
}
export interface MergePreview {
  source: string;
  target: string;
  transactions: number;
  aliases: number;
  previewToken: string;
  note: string;
}
const get = <T>(url: string, params?: object) =>
  apiClient.get<ApiResponse<T>>(url, { params }).then((r) => r.data.data);
const write = <T>(url: string, body: unknown, version?: string) =>
  apiClient
    .post<ApiResponse<T>>(url, body, {
      headers: {
        'Idempotency-Key': crypto.randomUUID(),
        ...(version ? { 'If-Match': version } : {}),
      },
    })
    .then((r) => r.data.data);
export const importCleaningApi = {
  jobs: (page: number) =>
    get<
      PagedResult<{
        id: string;
        fileName: string;
        source: string;
        state: string;
        imported: number;
        createdAt?: string;
        sameFileCount: number;
      }>
    >('/imports', { page, pageSize: 10 }),
  source: (id: string) =>
    apiClient
      .get<Blob>(`/imports/${id}/source-file`, { responseType: 'blob' })
      .then((r) => r.data),
  history: (id: string, page: number, rowIndex?: number) =>
    get<
      PagedResult<CleaningEvent> & {
        sourceHash: string;
        sourceEncoding: string;
        headerRow: number;
      }
    >(`/imports/${id}/cleaning`, { page, pageSize: 10, rowIndex }),
  export: (id: string) => get<unknown>(`/imports/${id}/cleaning-export`),
  undo: (id: string, eventId: string, version: string) =>
    write<ImportJob>(`/imports/${id}/cleaning/${eventId}/undo`, {}, version),
  normalize: (id: string, version: string) =>
    write<ImportJob>(`/imports/${id}/normalize-merchants`, {}, version),
  suggestions: (id: string) =>
    get<{ items: RecognitionSuggestion[] }>(`/imports/${id}/suggestions`),
  recognize: (id: string, version: string, rowIds: string[]) =>
    apiClient
      .post<ApiResponse<ImportJob>>(
        '/ai/import-recognition',
        { importJobId: id, version, rowIds, reviewedText: true },
        { timeout: 180000 },
      )
      .then((r) => r.data.data),
  decide: (
    id: string,
    suggestionId: string,
    accept: boolean,
    version: string,
  ) =>
    write<ImportJob>(
      `/imports/${id}/suggestions/${suggestionId}/decision`,
      { accept },
      version,
    ),
};
export const merchantMasterApi = {
  list: (page = 1, keyword = '', pageSize = 20) =>
    get<PagedResult<MerchantMaster>>('/merchant-master', {
      page,
      pageSize,
      keyword,
    }),
  alias: (id: string, name: string, version: string) =>
    write(`/merchant-master/${id}/aliases`, { name }, version),
  removeAlias: (id: string, version: string) =>
    write(`/merchant-master/aliases/${id}/remove`, {}, version),
  preview: (
    id: string,
    targetId: string,
    sourceVersion: string,
    targetVersion: string,
  ) =>
    apiClient
      .post<ApiResponse<MergePreview>>(`/merchant-master/${id}/merge-preview`, {
        targetId,
        sourceVersion,
        targetVersion,
      })
      .then((r) => r.data.data),
  merge: (
    id: string,
    targetId: string,
    sourceVersion: string,
    targetVersion: string,
    previewToken: string,
  ) =>
    write(`/merchant-master/${id}/merge`, {
      targetId,
      sourceVersion,
      targetVersion,
      previewToken,
    }),
};
