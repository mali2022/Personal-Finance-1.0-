import { apiClient } from './client';
import type { ApiResponse } from '../types';
export interface LifeEvent {
  id: string;
  name: string;
  type: string;
  date: string;
  amount: number;
  end?: string | null;
  everyMonths: number;
  growth: number;
  currency: string;
  fxRate: number;
  basis: number;
  loanId?: string | null;
  note: string;
}
export interface LifeLoan {
  id: string;
  principal: number;
  annualRate: number;
  months: number;
  firstPayment: string;
  mode: string;
  prepaymentMode?: 'ShortenTerm' | 'LowerPayment';
}
export interface LifeInput {
  name: string;
  start: string;
  months: number;
  currency: string;
  cash: number;
  investments: number;
  otherAssets: number;
  restrictedAssets: number;
  monthlyIncome: number;
  monthlyExpense: number;
  incomeGrowth: number;
  expenseGrowth: number;
  inflation: number;
  investmentReturn: number;
  cashReturn: number;
  otherReturn: number;
  reserveFloor: number;
  loans: LifeLoan[];
  events: LifeEvent[];
  goals: { name: string; target: number; due: string }[];
  assumptionSource: string;
  snapshotId?: string;
  unscheduledDebt: number;
  investmentDrawdownFrom?: string | null;
  drawdownFeeRate?: number;
}
export interface LifeMonth {
  date: string;
  openingCash: number;
  income: number;
  expense: number;
  investmentContribution: number;
  borrowing: number;
  principal: number;
  interest: number;
  assetPurchase: number;
  assetProceeds: number;
  valuationChange: number;
  closingCash: number;
  investments: number;
  otherAssets: number;
  restrictedAssets: number;
  debt: number;
  netWorth: number;
  realNetWorth: number;
  minimumCash: number;
}
export interface LifeResult {
  modelVersion: string;
  fingerprint: string;
  priceBase: string;
  currency: string;
  months: LifeMonth[];
  firstShortfall: string | null;
  minimumCash: number;
  finalNetWorth: number;
  totalIncome: number;
  totalExpense: number;
  totalInterest: number;
  goals: {
    name: string;
    target: number;
    due: string;
    reached: string | null;
    basis: string;
  }[];
  warnings: string[];
}
export interface LifeSnapshot {
  capturedAt: string;
  scope: string;
  allocation: { complete: boolean; uncovered: number };
  suggested: LifeInput;
  missing: string[];
}
export interface LifeArchive {
  input: LifeInput;
  result: LifeResult;
  snapshot: LifeSnapshot;
  calculatedAt: string;
}
export interface LifeList {
  items: { id: string; name: string; version: string; createdAt: string }[];
  total: number;
  page: number;
  pageSize: number;
}
const read = <T>(r: { data: ApiResponse<T> }) => r.data.data;
const headers = (version = '0') => ({
  'If-Match': version,
  'Idempotency-Key': crypto.randomUUID(),
});
export const lifeApi = {
  snapshot: (currency: string) =>
    apiClient
      .post<ApiResponse<{ id: string; snapshot: LifeSnapshot }>>(
        '/life-simulator/snapshots',
        { currency },
        { headers: headers() },
      )
      .then(read),
  list: (runs: boolean, page = 1) =>
    apiClient
      .get<ApiResponse<LifeList>>(
        `/life-simulator/${runs ? 'runs' : 'scenarios'}`,
        { params: { page, pageSize: 10 } },
      )
      .then(read),
  scenario: (id: string) =>
    apiClient
      .get<
        ApiResponse<{
          id: string;
          version: string;
          content: LifeInput;
          snapshot: LifeSnapshot;
        }>
      >(`/life-simulator/scenarios/${id}`)
      .then(read),
  run: (id: string) =>
    apiClient
      .get<ApiResponse<{ id: string; content: LifeArchive }>>(
        `/life-simulator/runs/${id}`,
      )
      .then(read),
  save: (b: LifeInput, id?: string, version = '0') =>
    (id
      ? apiClient.put<ApiResponse<{ id: string; version: string }>>(
          `/life-simulator/scenarios/${id}`,
          b,
          { headers: headers(version) },
        )
      : apiClient.post<ApiResponse<{ id: string; version: string }>>(
          '/life-simulator/scenarios',
          b,
          { headers: headers() },
        )
    ).then(read),
  remove: (id: string, version: string) =>
    apiClient.post(
      `/life-simulator/scenarios/${id}/delete`,
      {},
      { headers: headers(version) },
    ),
  calculate: (b: LifeInput, signal: AbortSignal) =>
    apiClient
      .post<
        ApiResponse<{ id: string; result: LifeResult; calculatedAt: string }>
      >('/life-simulator/runs', b, {
        headers: headers(),
        signal,
        timeout: 60000,
      })
      .then(read),
  compare: (ids: string[]) =>
    apiClient
      .post<
        ApiResponse<
          {
            id: string;
            name: string;
            result: LifeResult;
            deltaNetWorth: number;
            percent: number | null;
          }[]
        >
      >('/life-simulator/compare', { ids })
      .then(read),
};
