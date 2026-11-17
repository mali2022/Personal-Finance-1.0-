import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
export type Row = { id: string; version: string } & Record<string, unknown>;
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface PayItem {
  name: string;
  code: string;
  kind: string;
  category: string;
  amount: string;
  taxTreatment: string;
  insuranceBasis: boolean;
  housingBasis: boolean;
  quantity: string;
  unitRate: string;
  sortOrder: number;
  status: string;
}
export interface Slip extends Row {
  month: string;
  payDate: string;
  employer: string;
  employmentId?: string;
  planId?: string;
  accountId?: string;
  currency: string;
  state: string;
  note: string;
  gross: string;
  net: string;
  deduction: string;
  tax: string;
  taxable: string;
  actual: string;
  difference: string;
  personalSocial: string;
  personalHousing: string;
  otherDeductions: string;
  taxUnspecified: boolean;
  items: PayItem[];
  payments: Row[];
  attachments: Row[];
  reconciliationState: string;
}
export interface Totals {
  count: number;
  gross: string;
  deductions: string;
  net: string;
  actual: string;
  difference: string;
  annualBonus: string;
  basePay: string;
  performance: string;
  tax: string;
  personalSocial: string;
  personalHousing: string;
  baseShare: string | null;
  performanceShare: string | null;
  deductionShare: string | null;
}
export interface Stats {
  year: number;
  currency: string;
  basis: string;
  totals: Totals;
  months: {
    month: string;
    totals: Totals;
    mom: string | null;
    yoy: string | null;
  }[];
  employers: { employmentId: string; employer: string; totals: Totals }[];
  structure: { kind: string; category: string; amount: string }[];
  benefits: Record<string, string | Row[]>;
  pendingCount: number;
  notes: string;
}
export interface ImportJob extends Row {
  fileName: string;
  documentId: string;
  state: string;
  imported: number;
  headers: string[];
  rows: string[][];
  mapping: Record<string, unknown>;
  preview: {
    index: number;
    slip: Record<string, unknown>;
    fingerprint: string;
    issues: string[];
  }[];
}
const root = '/payroll-center';
export const payrollApi = {
  get: <T>(path: string, params?: object) =>
    apiClient
      .get<ApiResponse<T>>(root + path, { params })
      .then((r) => r.data.data),
  write: <T = Row>(
    path: string,
    body: unknown,
    version?: string,
    method: 'post' | 'put' | 'delete' = 'post',
    key = crypto.randomUUID(),
  ) =>
    apiClient
      .request<ApiResponse<T>>({
        url: root + path,
        method,
        data: body,
        headers: {
          'Idempotency-Key': key,
          ...(version ? { 'If-Match': version } : {}),
        },
      })
      .then((r) => r.data.data),
  upload: (path: string, file: File) => {
    const data = new FormData();
    data.append('file', file);
    return apiClient
      .post<ApiResponse<Row>>(root + path, data, {
        headers: { 'Content-Type': undefined },
      })
      .then((r) => r.data.data);
  },
  document: (id: string) =>
    apiClient
      .get(root + '/documents/' + encodeURIComponent(id), {
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),
};
export const value = (row: Record<string, unknown>, key: string) =>
  row[key] == null ? '' : String(row[key]);
