import { apiClient } from './client';
import type {
  AccountAnalysisDto,
  AdvancedReportDto,
  ApiResponse,
  Attachment,
  ExportJob,
  ImportJob,
  ImportMapping,
  ImportRow,
  ImportRowPatch,
  ImportSource,
  ImportAttempt,
  ImportOutcome,
  PagedResult,
  ReconciliationRecord,
  ReconciliationSnapshot,
  ReportFilters,
  StatisticsRules,
  TransactionFilters,
} from '../types';
const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;
const version = (value: string) => ({ 'If-Match': value });
type ExportJobResponse = Omit<ExportJob, 'count' | 'format'> & {
  format?: ExportJob['format'];
} & ({ total: number; count?: number } | { total?: number; count: number });
export const importApi = {
  reviewDuplicate: (
    id: string,
    rowId: string,
    decision: 'Keep' | 'Skip' | 'Clear',
    v: string,
  ) =>
    apiClient
      .post<ApiResponse<ImportJob>>(
        `/imports/${id}/rows/${rowId}/duplicate-review`,
        { decision },
        { headers: version(v) },
      )
      .then(unwrap),
  recheck: (id: string, v: string) =>
    apiClient
      .post<ApiResponse<ImportJob>>(
        `/imports/${id}/recheck`,
        {},
        { headers: version(v) },
      )
      .then(unwrap),
  attempts: (id: string, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<ImportAttempt>>>(`/imports/${id}/attempts`, {
        params: { page, pageSize: 10 },
      })
      .then(unwrap),
  attemptRows: (id: string, attemptId: string, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<ImportOutcome>>>(
        `/imports/${id}/attempts/${attemptId}/rows`,
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  upload: (file: File, source: ImportSource) => {
    const form = new FormData();
    form.append('file', file);
    form.append('source', source);
    return apiClient
      .post<ApiResponse<ImportJob>>('/imports', form, {
        headers: { 'Content-Type': undefined },
        timeout: 60000,
      })
      .then(unwrap);
  },
  get: (id: string) =>
    apiClient.get<ApiResponse<ImportJob>>(`/imports/${id}`).then(unwrap),
  map: (id: string, mapping: ImportMapping, accountId: string, v: string, purpose?:'Reconciliation') =>
    apiClient
      .put<ApiResponse<ImportJob>>(
        `/imports/${id}/mapping`,
        { mapping, accountId, ...(purpose?{purpose}:{}) },
        { headers: version(v) },
      )
      .then(unwrap),
  rows: (id: string, page: number, status?: string) =>
    apiClient
      .get<ApiResponse<PagedResult<ImportRow>>>(`/imports/${id}/rows`, {
        params: { page, pageSize: 20, status },
      })
      .then(unwrap),
  patch: (id: string, rowId: string, patch: ImportRowPatch, v: string) =>
    apiClient
      .patch<ApiResponse<ImportJob>>(`/imports/${id}/rows/${rowId}`, patch, {
        headers: version(v),
      })
      .then(unwrap),
  categorize: (id: string, categoryId: string, v: string) =>
    apiClient
      .post<ApiResponse<ImportJob>>(
        `/imports/${id}/categories`,
        { categoryId },
        { headers: version(v) },
      )
      .then(unwrap),
  commit: (id: string, v: string, key: string) =>
    apiClient
      .post<ApiResponse<ImportJob>>(
        `/imports/${id}/commit`,
        { skipDuplicates: true, skipInvalid: true },
        { headers: { ...version(v), 'Idempotency-Key': key } },
      )
      .then(unwrap),
};
export const reconciliationApi = {
  preview: (accountId: string, actualBalance: string) =>
    apiClient
      .post<ApiResponse<ReconciliationSnapshot>>('/reconciliations/preview', {
        accountId,
        actualBalance,
      })
      .then(unwrap),
  commit: (body: ReconciliationSnapshot & { reason: string }, key: string) =>
    apiClient
      .post<ApiResponse<ReconciliationRecord>>('/reconciliations', body, {
        headers: { ...version(body.version), 'Idempotency-Key': key },
      })
      .then(unwrap),
  list: (accountId: string, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<ReconciliationRecord>>>(
        `/accounts/${accountId}/reconciliations`,
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  analysis: (accountId: string) =>
    apiClient
      .get<ApiResponse<AccountAnalysisDto>>(`/accounts/${accountId}/analysis`)
      .then(unwrap),
};
export const attachmentApi = {
  list: (id: string) =>
    apiClient
      .get<ApiResponse<Attachment[]>>(`/transactions/${id}/attachments`)
      .then(unwrap),
  upload: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post(`/transactions/${id}/attachments`, form, {
      headers: { 'Content-Type': undefined },
      timeout: 60000,
    });
  },
  remove: (id: string, attachment: Attachment) =>
    apiClient.delete(`/transactions/${id}/attachments/${attachment.id}`, {
      headers: version(attachment.version || '1'),
    }),
  content: (id: string, attachmentId: string) =>
    apiClient
      .get<Blob>(`/transactions/${id}/attachments/${attachmentId}/content`, {
        responseType: 'blob',
      })
      .then((r) => r.data),
};
export const advancedApi = {
  report: (filters: ReportFilters) =>
    apiClient
      .get<ApiResponse<AdvancedReportDto>>('/reports/advanced', {
        params: filters,
      })
      .then(unwrap),
  rules: () =>
    apiClient
      .get<ApiResponse<StatisticsRules>>('/settings/statistics')
      .then(unwrap),
  rulesHistory: () =>
    apiClient
      .get<
        ApiResponse<
          {
            id: string;
            createdAt: string;
            source: string;
            changes: { field: string; before: unknown; after: unknown }[];
          }[]
        >
      >('/settings/statistics/history')
      .then(unwrap),
  previewRules: (month: string, currency: string, body: StatisticsRules) =>
    apiClient
      .post<ApiResponse<Record<string, string | number>>>(
        '/settings/statistics/preview',
        body,
        { params: { month, currency } },
      )
      .then(unwrap),
  saveRules: (body: StatisticsRules) =>
    apiClient.put('/settings/statistics', body, {
      headers: version(body.version),
    }),
  export: (
    format: 'CSV' | 'Excel',
    filters: Partial<TransactionFilters>,
    key: string,
  ) =>
    apiClient
      .post<ApiResponse<ExportJobResponse>>(
        '/exports',
        { format, filters },
        { headers: { 'Idempotency-Key': key }, timeout: 60000 },
      )
      .then(unwrap)
      .then((job): ExportJob => ({
        ...job,
        format,
        count: job.total ?? job.count!,
      })),
  download: (id: string) =>
    apiClient
      .get<Blob>(`/exports/${id}/file`, {
        responseType: 'blob',
        timeout: 60000,
      })
      .then((r) => r.data),
};
