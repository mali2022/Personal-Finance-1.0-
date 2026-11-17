import dayjs from 'dayjs';
import { apiClient } from '../../api/client';
import { dashboardApi, reportApi } from '../../api/finance';
import {
  cashflowApi,
  goalApi,
  indicatorApi,
  type CashForecast,
  type GoalView,
} from '../../api/financialPlanning';
import { assetApi, type Allocation } from '../../api/assetManagement';
import { smartApi } from '../reconciliation/api';
import { workspaceApi, type TransactionSummary } from '../transactions/workspaceApi';
import { changeBetween, rangeWindow, type NetWorthSeries, type RangeKey } from './overview';
import type { ApiResponse, Currency, DashboardDto, ReportDto } from '../../types';

const unwrap = <T>(response: { data: ApiResponse<T> }) => response.data.data;

async function fetchReport(
  start: string,
  end: string,
  granularity: 'day' | 'week' | 'month' | 'year',
  currency: Currency,
): Promise<ReportDto> {
  return reportApi.get({ start, end, granularity, currency });
}

/**
 * Net-worth history for one look-back window plus its exact opening value.
 * Both calls hit `/reports/summary`; no figures are invented client-side.
 */
export async function fetchNetWorthSeries(
  currency: Currency,
  range: RangeKey,
): Promise<NetWorthSeries> {
  const window = rangeWindow(range);
  const [report, openingReport] = await Promise.all([
    fetchReport(window.start, window.end, window.granularity, currency),
    fetchReport(window.openingDate, window.openingDate, 'day', currency),
  ]);
  const opening = openingReport.netWorth;
  const change = changeBetween(opening, report.netWorth);
  return {
    currency,
    range,
    start: window.start,
    end: window.end,
    granularity: window.granularity,
    points: report.points,
    income: report.income,
    expense: report.expense,
    assets: report.assets,
    liabilities: report.liabilities,
    netWorth: report.netWorth,
    opening,
    change: change.amount,
    changePercent: change.percent,
    excludedCurrencies: report.excludedCurrencies,
  };
}

export interface PendingSummary {
  total: number;
  pending: number;
  anomalies: number;
  uncategorized: number;
  basis: string;
}

/** Review / anomaly counts and the statistical basis for the whole workspace. */
export async function fetchPendingSummary(): Promise<PendingSummary> {
  const summary: TransactionSummary = await workspaceApi.summary({});
  return {
    total: summary.total,
    pending: summary.pending,
    anomalies: summary.anomalies,
    uncategorized: summary.uncategorized,
    basis: summary.basis,
  };
}

export interface ReconciliationOverview {
  denominator: number;
  numerator: number;
  coverage: string | null;
  conflictCount: number;
  manualReviewCount?: number;
  knownDifferenceCount?: number;
  suspectedDuplicateCount?: number;
}

/** Smart-reconciliation coverage; separate from ledger statistics on purpose. */
export async function fetchReconciliationOverview(): Promise<ReconciliationOverview> {
  return smartApi.overview();
}

export interface PlanningSummary {
  budgetRemaining: string | null;
  savingsRate: string | null;
  emergencyScope: string;
  goals: GoalView[];
  upcoming: {
    id: string;
    name: string;
    expectedDate: string;
    amount: string;
    currency: string;
  }[];
}

export async function fetchPlanningSummary(): Promise<PlanningSummary> {
  return indicatorApi.summary();
}

export interface GoalBoard {
  items: GoalView[];
  total: number;
  active: number;
  completed: number;
  target: string;
  reserved: string;
}

export async function fetchGoalBoard(currency: Currency): Promise<GoalBoard> {
  const board = await goalApi.list(currency, 1);
  return {
    items: board.items,
    total: board.total,
    active: board.active,
    completed: board.completed,
    target: board.target,
    reserved: board.reserved,
  };
}

/** Rolling cash-flow forecast starting today. */
export async function fetchCashForecast(
  currency: Currency,
  days = 30,
): Promise<CashForecast> {
  const start = dayjs().format('YYYY-MM-DD');
  const end = dayjs().add(days, 'day').format('YYYY-MM-DD');
  return cashflowApi.forecast({
    currency,
    start,
    end,
    page: 1,
    pageSize: 20,
  });
}

export async function fetchAllocation(currency: Currency): Promise<Allocation> {
  return assetApi.allocation(dayjs().format('YYYY-MM-DD'), currency);
}

/** Asset valuation snapshot used for the "missing FX / uncovered" warning. */
export async function fetchValuationQuality(currency: Currency): Promise<{
  allocation: Allocation;
}> {
  return { allocation: await fetchAllocation(currency) };
}

export async function fetchOnThisDay(currency: Currency) {
  return apiClient
    .get<ApiResponse<{ total: number; summaries: { year: number; currency: Currency; income: string; expense: string; count: number }[] }>>(
      '/reports/on-this-day',
      { params: { currency, pageSize: 1 } },
    )
    .then(unwrap);
}

/** Rolling N-month monthly flow (income / expense / net worth per month). */
export async function fetchMonthlyFlow(
  currency: Currency,
  months = 12,
): Promise<ReportDto> {
  const end = dayjs().endOf('month').format('YYYY-MM-DD');
  const start = dayjs()
    .subtract(months - 1, 'month')
    .startOf('month')
    .format('YYYY-MM-DD');
  return fetchReport(start, end, 'month', currency);
}

/** Month-scoped dashboard aggregate shared by Home and Dashboard. */
export async function fetchDashboardSummary(
  month: string,
): Promise<DashboardDto> {
  return dashboardApi.get(month);
}
