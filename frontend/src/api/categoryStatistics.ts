import { apiClient } from './client';
export interface CategorySummary {
  gross: string;
  refunds: string;
  otherCredits: string;
  net: string;
  count: number;
  positiveCount: number;
  refundCount: number;
  average: string;
  maximum: string;
  discount: string;
  firstDate?: string;
  lastDate?: string;
}
export interface CategoryBudgetLine {
  id: string;
  name: string;
  limit: string;
  used: string;
  remaining: string;
  executionPercent: string | null;
}
export interface CategoryBudgetPeriod {
  limit: string | null;
  used: string;
  remaining: string | null;
  executionPercent: string | null;
  overlapping: boolean;
  allocatedLines: CategoryBudgetLine[];
  sharedLines: CategoryBudgetLine[];
}
export interface CategoryStatistics {
  category: {
    id: string;
    name: string;
    kind: 'Expense' | 'Income';
    status: string;
    effectiveActive?: boolean;
    parentId?: string;
    level: number;
    path: { id: string; name: string }[];
  };
  currency: string;
  month: string;
  year: number;
  cumulative: CategorySummary;
  currentMonth: CategorySummary;
  currentYear: CategorySummary;
  previousMonth: CategorySummary;
  lastYearSameMonth: CategorySummary;
  monthOverMonth: number | null;
  yearOverYear: number | null;
  monthlyTrend: { period: string; summary: CategorySummary }[];
  annualTrend: { period: string; summary: CategorySummary }[];
  merchants: { name: string; summary: CategorySummary }[];
  accounts: {
    id: string;
    name: string;
    summary: CategorySummary;
    share: string | null;
  }[];
  childContributions: {
    id: string;
    name: string;
    summary: CategorySummary;
    share: string | null;
  }[];
  refunds: { period: string; amount: string; count: number }[];
  discounts: { period: string; amount: string; count: number }[];
  budgets: {
    supported: boolean;
    reason?: string;
    currency?: string;
    monthly?: CategoryBudgetPeriod;
    annual?: CategoryBudgetPeriod;
    annualState?: string;
    scope?: string;
  };
  scope: string;
}
export const categoryStatisticsApi = {
  overview: (currency: string) =>
    apiClient
      .get<{
        data: {
          currency: string;
          items: { id: string; level: number; summary: CategorySummary }[];
        };
      }>('/categories/overview', { params: { currency }, timeout: 60000 })
      .then((r) => r.data.data),
  detail: (id: string, currency: string, month: string) =>
    apiClient
      .get<{ data: CategoryStatistics }>(`/categories/${id}/statistics`, {
        params: { currency, month },
        timeout: 60000,
      })
      .then((r) => r.data.data),
};
