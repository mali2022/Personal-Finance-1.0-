import { useQuery } from '@tanstack/react-query';
import type { Currency } from '../../types';
import type { RangeKey } from './overview';
import {
  fetchAllocation,
  fetchCashForecast,
  fetchDashboardSummary,
  fetchGoalBoard,
  fetchMonthlyFlow,
  fetchNetWorthSeries,
  fetchPendingSummary,
  fetchPlanningSummary,
  fetchReconciliationOverview,
} from './overviewApi';

/**
 * React Query hooks for the overview surfaces. Keys are explicit so a ledger
 * mutation broadcast (`finance:planning-changed`) or a manual refresh only
 * refetches what is visible. All hooks share the 60s stale window already used
 * across the app to avoid duplicate requests between Home and Dashboard.
 */
export function useNetWorthSeries(currency: string, range: RangeKey) {
  return useQuery({
    queryKey: ['overview-net-worth', currency, range],
    queryFn: () => fetchNetWorthSeries(currency as Currency, range),
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePendingSummary(enabled = true) {
  return useQuery({
    queryKey: ['overview-pending-summary'],
    queryFn: fetchPendingSummary,
    staleTime: 60_000,
    retry: 1,
    enabled,
  });
}

export function useReconciliationOverview(enabled = true) {
  return useQuery({
    queryKey: ['smart-reconciliation', 'overview'],
    queryFn: fetchReconciliationOverview,
    staleTime: 60_000,
    retry: 1,
    enabled,
  });
}

export function usePlanningSummary(enabled = true) {
  return useQuery({
    queryKey: ['overview-planning-summary'],
    queryFn: fetchPlanningSummary,
    staleTime: 60_000,
    retry: 1,
    enabled,
  });
}

export function useGoalBoard(currency: string, enabled = true) {
  return useQuery({
    queryKey: ['overview-goals', currency],
    queryFn: () => fetchGoalBoard(currency as Currency),
    staleTime: 60_000,
    retry: 1,
    enabled,
  });
}

export function useCashForecast(currency: string, days = 30, enabled = true) {
  return useQuery({
    queryKey: ['overview-cash-forecast', currency, days],
    queryFn: () => fetchCashForecast(currency as Currency, days),
    staleTime: 60_000,
    retry: 1,
    enabled,
  });
}

export function useAllocation(currency: string, enabled = true) {
  return useQuery({
    queryKey: ['overview-allocation', currency],
    queryFn: () => fetchAllocation(currency as Currency),
    staleTime: 120_000,
    retry: 1,
    enabled,
  });
}

/** Month-scoped dashboard aggregate (same query key as the legacy Home). */
export function useDashboardSummary(month: string) {
  return useQuery({
    queryKey: ['dashboard', month],
    queryFn: () => fetchDashboardSummary(month),
    staleTime: 60_000,
    retry: 1,
  });
}

/** N-month income / expense / net-worth series for trend modules. */
export function useMonthlyFlow(currency: string, months = 12) {
  return useQuery({
    queryKey: ['overview-monthly-flow', currency, months],
    queryFn: () => fetchMonthlyFlow(currency as Currency, months),
    staleTime: 60_000,
    retry: 1,
  });
}
