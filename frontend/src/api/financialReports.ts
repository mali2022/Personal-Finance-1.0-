import { apiClient } from './client';
import type { ApiResponse } from '../types';
export interface ReportSelection {
  mode: 'monthly' | 'annual';
  period: string;
  currency: string;
}
export interface ReportPreferences {
  currency: string;
  autoAi: boolean;
  reducedMotion: boolean;
  redactSharing: boolean;
  version: string;
}
export interface FinancialReport {
  investmentReturns?: { status:string;start:string;end:string;currency:string;explanation:string;items:{id:string;xirr:{status:string;rate:number|null};amounts:{reportTotalProfit:string|null}}[] };
  schemaVersion: number;
  planning?: {
    nextYear: number;
    observedMonths: number;
    monthlyIncomeBaseline: string;
    monthlyExpenseBaseline: string;
    monthlySurplusBaseline: string;
    monthlyGoalCommitment: string;
    explanation: string;
  };
  selection: ReportSelection;
  generatedAt: string;
  start: string;
  endExclusive: string;
  plannedEndExclusive: string;
  isPeriodClosed: boolean;
  metrics: {
    income: string;
    expense: string;
    surplus: string;
    savingsRate: string | null;
    transactionCount: number;
    expenseCount: number;
    elapsedDays: number;
    dailyExpense: string;
    dailyFrequency: number;
    medianExpense: string;
  };
  comparisons: Record<
    'previous' | 'yearOverYear',
    {
      income: string;
      expense: string;
      incomeRate: string | null;
      expenseRate: string | null;
    }
  >;
  points: {
    period: string;
    income: string;
    expense: string;
    assets: string;
    liabilities: string;
    netWorth: string;
    cumulativeIncome: string;
    cumulativeExpense: string;
  }[];
  categories: {
    id: string;
    name: string;
    parentId: string | null;
    amount: string;
  }[];
  merchants: { name: string; amount: string }[];
  tags: { id: string; name: string; amount: string }[];
  accounts: {
    id: string;
    name: string;
    type: string;
    income: string;
    expense: string;
    opening: string;
    closing: string;
    change: string;
  }[];
  budget: {
    total: string;
    used: string;
    items?: { id: string; categoryId: string; limit: string; used: string }[];
    months?: {
      month: number;
      allocated: string;
      used: string | null;
      monthlyBudget: string;
    }[];
  } | null;
  netWorth: { opening: string; closing: string; change: string };
  goals: {
    id: string;
    name: string;
    target: string;
    allocated: string;
    targetDate: string;
    state: string;
    monthlySaving: string;
  }[];
  largeTransactions: {
    id: string;
    amount: string;
    occurredAt: string;
    merchant: string | null;
    categoryId: string | null;
    unusual: boolean;
  }[];
  anomalyThreshold: string;
  milestones: {
    first: { id: string; occurredAt: string; type: string } | null;
    last: { id: string; occurredAt: string; type: string } | null;
  };
  coverage: string;
}
export interface ReportArchive {
  id: string;
  name: string;
  createdAt: string;
  version: string;
}
const base = '/reports/center';
const data = <T>(p: Promise<{ data: ApiResponse<T> }>) =>
  p.then((r) => r.data.data);
const headers = (key: string, version?: string) => ({
  'Idempotency-Key': key,
  ...(version ? { 'If-Match': version } : {}),
});
export const financialReportsApi = {
  get: (selection: ReportSelection, signal?: AbortSignal) =>
    data(
      apiClient.get<ApiResponse<FinancialReport>>(base + '/data', {
        params: selection,
        signal,
        timeout: 90000,
      }),
    ),
  archives: (page = 1) =>
    data(
      apiClient.get<ApiResponse<{ items: ReportArchive[]; total: number }>>(
        base + '/archives',
        { params: { page } },
      ),
    ),
  archive: (selection: ReportSelection, key: string) =>
    data(
      apiClient.post<ApiResponse<ReportArchive>>(
        base + '/archives',
        selection,
        { headers: headers(key), timeout: 90000 },
      ),
    ),
  snapshot: (id: string) =>
    data(
      apiClient.get<ApiResponse<FinancialReport>>(
        base + '/archives/' + encodeURIComponent(id),
      ),
    ),
  remove: (item: ReportArchive, key: string) =>
    apiClient.post(
      base + '/archives/' + encodeURIComponent(item.id) + '/delete',
      {},
      { headers: headers(key, item.version) },
    ),
  preferences: () =>
    data(apiClient.get<ApiResponse<ReportPreferences>>(base + '/preferences')),
  savePreferences: (p: ReportPreferences, key: string) =>
    data(
      apiClient.put<ApiResponse<ReportPreferences>>(base + '/preferences', p, {
        headers: headers(key, p.version),
      }),
    ),
};
