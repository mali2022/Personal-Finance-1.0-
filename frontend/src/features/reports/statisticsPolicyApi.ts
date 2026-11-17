import { apiClient } from '../../api/client';
import type { ApiResponse, StatisticsRules } from '../../types';
const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;
export interface PolicyOptions {
  mode: 'Everyday' | 'Assets' | 'Comprehensive' | 'Custom';
  baseCurrency: string;
  monthStartDay: number;
  yearStartMonth: number;
  weekStartsOn: number;
  refundDisplay: 'Net' | 'Separate';
  includeCashRewards: boolean;
  includeDepositInterest: boolean;
  includeInvestmentCashIncome: boolean;
  includeOneTimeIncomeInSavings: boolean;
  payrollBasis: 'Net' | 'Gross';
  payrollTimeBasis: 'Paid' | 'Earned';
  showAccountFlows: boolean;
  showDebtAnalysis: boolean;
  showInvestmentAnalysis: boolean;
  showWealthAnalysis: boolean;
  highlightLargeTransactions: boolean;
  largeTransactionThreshold: string;
}
export type LedgerPolicy = Omit<StatisticsRules, 'version'>;
export interface ManagedPolicy {
  options: PolicyOptions;
  ledgerRules: LedgerPolicy;
  ledgerVersion: string;
  version: string;
}
export interface PolicyHistory {
  id: string;
  resourceType: string;
  createdAt: string;
  changes: { field: string; before: unknown; after: unknown }[];
}
export interface PolicyAnalysis {
  currency: string;
  start: string;
  endExclusive: string;
  plannedEndExclusive: string;
  generatedAt: string;
  isPeriodClosed: boolean;
  transactionCount: number;
  daily: Record<string, string | null>;
  accounts: null | {
    inflow: string;
    outflow: string;
    surplus: string;
    surplusRate: string | null;
    items: {
      id: string;
      name: string;
      type: string;
      status: string;
      inflow: string;
      outflow: string;
      change: string;
    }[];
    note: string;
  };
  debt: null | Record<string, unknown>;
  investment: null | { summary: Record<string, unknown>; scope: string };
  wealth: null | {
    openingNetWorth: string;
    closingNetWorth: string;
    change: string;
    nonSurplusChange: string;
    note: string;
    consolidatedValuation: {
      complete: boolean;
      uncovered: number;
      groups: {
        currency: string;
        assets: string;
        liabilities: string;
        netWorth: string;
      }[];
    };
  };
  payroll: Record<string, string | number>;
  quality: {
    unclassifiedExpense: string;
    unclassifiedCount: number;
    futureExcluded: number;
    unsettledExcluded: number;
    largeTransactions: { id: string; amount: string; occurredAt: string }[];
  };
  notes: string[];
  comparison: null | {
    start: string;
    endExclusive: string;
    samePeriod: boolean;
    daily: Record<string, string | null>;
  };
}
const root = '/settings/statistics/management';
export const policyApi = {
  get: () => apiClient.get<ApiResponse<ManagedPolicy>>(root).then(unwrap),
  save: (value: ManagedPolicy) =>
    apiClient.put(root, value, { headers: { 'If-Match': value.version } }),
  preview: (
    value: ManagedPolicy,
    anchor: string,
    period: string,
    currency?: string,
  ) =>
    apiClient
      .post<ApiResponse<PolicyAnalysis>>(
        root + '/preview',
        {
          options: value.options,
          ledgerRules: value.ledgerRules,
          anchor,
          period,
          currency,
        },
        { timeout: 60000 },
      )
      .then(unwrap),
  history: () =>
    apiClient.get<ApiResponse<PolicyHistory[]>>(root + '/history').then(unwrap),
};
export function policyPreset(
  mode: PolicyOptions['mode'],
  current: PolicyOptions,
): PolicyOptions {
  if (mode === 'Custom') return { ...current, mode };
  return {
    ...current,
    mode,
    refundDisplay: 'Net',
    includeCashRewards: true,
    includeDepositInterest: true,
    includeInvestmentCashIncome: true,
    includeOneTimeIncomeInSavings: true,
    payrollBasis: 'Net',
    payrollTimeBasis: 'Paid',
    showAccountFlows: true,
    showDebtAnalysis: mode !== 'Assets',
    showInvestmentAnalysis: mode !== 'Everyday',
    showWealthAnalysis: mode !== 'Everyday',
    highlightLargeTransactions: true,
  };
}
