import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
export interface Statement {
  id: string;
  accountId: string;
  importJobId: string;
  importRowId: string;
  reference: string;
  amount: string;
  currency: string;
  occurredAt: string;
  postedAt?: string;
  counterpartyHint?: string;
  paymentSource?: string;
  merchant: string;
  note: string;
  type: string;
  state: string;
  resolution: string;
  version: string;
}
export interface Candidate {
  transactionId: string;
  version: string;
  type: string;
  merchant: string;
  amount: string;
  score: number;
  confidence: string;
  difference: string;
  dateDeviation: number;
  postedDateDeviation?: number;
  reasons: string[];
}
export interface Rule {
  effect?: {
    confirmations: number;
    active: number;
    revoked: number;
    conflicts: number;
  } | null;
  id: string;
  accountId: string;
  name: string;
  merchant: string;
  type: string;
  currency: string;
  keyword: string;
  dateTolerance: number;
  priority: number;
  amountTolerance: string;
  expectedAmount?: string | null;
  requireReference: boolean;
  enabled: boolean;
  autoConfirm: boolean;
  version: string;
}
export interface Balance {
  evidence: {
    systemOpening: string;
    systemClosing: string;
    bankOnly: string;
    ledgerOnly: string;
    conflictCount: number;
    bankOutstandingCount?: number;
    ledgerOutstandingCount?: number;
    bankOutstanding?: {
      statementId: string;
      version: string;
      occurredAt: string;
      remaining: string;
    }[];
    ledgerOutstanding?: { transactionId: string; remaining: string }[];
  };
  previewToken: string;
  adjustedDifference: string;
  canComplete: boolean;
  requiresOutstandingReview?: boolean;
  withinReviewLimit?: boolean;
  periodClosed?: boolean;
  saved: boolean;
}
export interface Task {
  id: string;
  state: string;
  startsAt: string;
  endsAt: string;
  processed: number;
  total?: number;
  failed: number;
  version: string;
}
export interface BatchItem {
  id: string;
  version: string;
  transactionId?: string;
  transactionVersion?: string;
}
const base = '/smart-reconciliation';
const get = <T>(url: string, params?: object) =>
  apiClient
    .get<ApiResponse<T>>(base + url, { params })
    .then((r) => r.data.data);
// A caller retains this key until a definitive response, including after a timeout.
const post = <T>(url: string, body: unknown, key: string) =>
  apiClient
    .post<ApiResponse<T>>(base + url, body, {
      headers: url.endsWith('preview') ? {} : { 'Idempotency-Key': key },
    })
    .then((r) => r.data.data);
export const smartApi = {
  transactionLinks: (transactionId: string, page: number) =>
    get<{
      items: {
        id: string;
        statementId: string;
        accountId: string;
        currency: string;
        reference: string;
        allocatedAmount: string;
        sourceState: string;
        state: string;
        createdAt: string;
        engineVersion: string;
        confirmationMode: string;
        conflict: boolean;
      }[];
      total: number;
    }>('/transaction-links', { transactionId, page, pageSize: 20 }),
  trustInfo: (accountId: string, importJobId: string) =>
    get<{
      id: string;
      sourceHash: string;
      mappingHash: string;
      trusted: boolean;
      expiresAt?: string;
    }>('/source-trust', { accountId, importJobId }),
  autoPreview: (id: string, version: string) =>
    post<{
      previewToken: string;
      eligible: number;
      total: number;
      items: { statementId: string; eligible: boolean; reasons: string[] }[];
    }>(`/tasks/${id}/auto-preview`, { version }, ''),
  autoStep: (id: string, version: string, previewToken: string, key: string) =>
    post<Task>(
      `/tasks/${id}/step`,
      { version, autoConfirm: true, previewToken },
      key,
    ),
  overview: () =>
    get<{
      denominator: number;
      numerator: number;
      coverage: string | null;
      conflictCount: number;
      manualReviewCount?: number;
      knownDifferenceCount?: number;
      suspectedDuplicateCount?: number;
      snapshotTrend?: {
        id: string;
        accountId: string;
        name: string;
        createdAt: string;
        startsAt: string;
        endsAt: string;
        denominator: number | null;
        numerator: number | null;
        coverage: string | null;
        validEvidence: boolean;
      }[];
      accounts: {
        accountId: string;
        name: string;
        currency: string;
        total: number;
        pending: number;
        partial: number;
        ignored: number;
        matched: number;
        conflicts: number;
        grossAmount: string;
        pendingAmount: string;
        matchedAmount: string;
      }[];
      trend: {
        date: string;
        confirmedOperations: number;
        revokedOperations: number;
      }[];
    }>('/overview'),
  taskSteps: (id: string, page: number) =>
    get<{
      items: {
        id: string;
        sequence: number;
        processed: number;
        failed: number;
        createdAt: string;
        engineVersion: string;
        results: {
          statementId: string;
          candidateCount?: number;
          candidates?: Candidate[];
          error?: string;
        }[];
      }[];
      total: number;
    }>(`/tasks/${id}/steps`, { page, pageSize: 20 }),
  correct: (id: string, body: unknown, key: string) =>
    post<Statement>(`/${id}/correct`, body, key),
  audit: (accountId: string, page: number) =>
    get<{
      items: {
        id: string;
        resourceType: string;
        action: string;
        createdAt: string;
        userId: string;
      }[];
      total: number;
    }>('/history', { accountId, page, pageSize: 20 }),
  balanceHistory: (accountId: string, page: number) =>
    get<{
      items: {
        id: string;
        createdAt: string;
        startsAt: string;
        endsAt: string;
        systemClosingBalance: string;
        bankClosingBalance: string;
        adjustedDifference: string;
      }[];
      total: number;
    }>('/balance/history', { accountId, page, pageSize: 20 }),
  issues: (accountId: string, startsAt: string, endsAt: string, page: number) =>
    get<{
      issues: {
        type: string;
        statementId: string;
        transactionId?: string;
        amount: string;
        reason: string;
        state: string;
      }[];
      ledgerOnly: {
        transactionId: string;
        type: string;
        occurredAt: string;
        reason: string;
      }[];
      total: number;
    }>('/issues', { accountId, startsAt, endsAt, page, pageSize: 20 }),
  allocations: (body: unknown, execute: boolean, key: string) =>
    post<{
      executed: boolean;
      items: {
        statementId: string;
        transactionId: string;
        amount: string;
        statementRemainder: string;
      }[];
    }>(`/allocations/${execute ? 'confirm' : 'preview'}`, body, key),
  tasks: (accountId: string) => get<Task[]>('/tasks', { accountId }),
  createTask: (body: unknown, key: string) => post<Task>('/tasks', body, key),
  stepTask: (id: string, version: string, key: string) =>
    post<Task & { results: unknown[] }>(`/tasks/${id}/step`, { version }, key),
  batch: (body: unknown, execute: boolean, key: string) =>
    post<{
      executed: boolean;
      results: { id: string; success: boolean; error?: string }[];
    }>(`/batch/${execute ? 'execute' : 'preview'}`, body, key),
  list: (
    accountId: string,
    page: number,
    state: string,
    search: string,
    importJobId?: string,
  ) =>
    get<{
      items: Statement[];
      total: number;
      numerator: number;
      denominator: number;
      conflictCount?: number;
      summary: { state: string; count: number; grossAmount: string }[];
    }>('', { accountId, page, pageSize: 20, state, search, importJobId }),
  candidates: (id: string) =>
    get<{
      statement: Statement;
      candidates: Candidate[];
      truncated: boolean;
      competing: boolean;
      ruleMatches: {
        transactionId: string;
        rules: { id: string; name: string }[];
      }[];
    }>(`/${id}/candidates`),
  history: (id: string, page = 1) =>
    get<{
      total?: number;
      eventTotal?: number;
      page?: number;
      pageSize?: number;
      events?: {
        at: string;
        action?: string;
        before: unknown;
        after: unknown;
        reason: string;
        userId: string;
      }[];
      items: {
        id: string;
        transactionId: string;
        state: string;
        createdAt: string;
        reason: string;
        engineVersion: string;
        confirmationMode?: string;
        conflict: boolean;
      }[];
    }>(`/${id}/history`, { page, pageSize: 20 }),
  confirm: (id: string, body: unknown, key: string) =>
    post(`/${id}/confirm`, body, key),
  resolve: (id: string, body: unknown, key: string) =>
    post(`/${id}/resolve`, body, key),
  import: (body: unknown, key: string) =>
    post<{
      imported: number;
      duplicates: number;
      failures: { id: string; code: string }[];
      processed: number;
      nextIndex: number;
      hasMore: boolean;
    }>('/import', body, key),
  rules: (accountId: string) => get<Rule[]>('/rules', { accountId }),
  stepTaskCompact: (id: string, version: string, key: string) =>
    post<Task>(`/tasks/${id}/step`, { version, compactResults: true }, key),
  previewRule: (body: unknown) =>
    post<{
      totalPending: number;
      evaluated: number;
      results: {
        statementId: string;
        merchant: string;
        amount: string;
        matchingCount: number;
        competing: boolean;
        truncated: boolean;
      }[];
    }>('/rules/preview', body, ''),
  saveRule: (body: unknown, key: string, id?: string) =>
    post<Rule>(`/rules${id ? '/' + id : ''}`, body, key),
  balance: (body: unknown, save: boolean, key: string) =>
    post<Balance>(`/balance/${save ? 'complete' : 'preview'}`, body, key),
};
