import { apiClient } from './client';
import type { ApiResponse, Currency, PagedResult } from '../types';
export interface InvestmentAsset {
  id: string;
  name: string;
  type: string;
  code: string;
  market: string;
  currency: Currency;
  accountId: string;
  unit: string;
  state: string;
  note: string;
  version: string;
}
export interface Position {
  asset: InvestmentAsset;
  quantity: string;
  cost: string;
  averageCost: string | null;
  marketValue: string | null;
  price: string | null;
  valuationDate: string | null;
  valuationSource: string | null;
  realized: string;
  income: string;
  fees: string;
  unrealized: string | null;
  returnPercent: string | null;
}
export interface InvestmentTrade {
  id: string;
  assetId: string;
  type: string;
  date: string;
  settlementDate: string;
  quantity: string;
  price: string;
  amount: string;
  commission: string;
  tax: string;
  otherFee: string;
  transactionId: string | null;
  state: string;
  version: string;
}
export interface Valuation {
  id: string;
  assetId: string;
  date: string;
  price: string;
  source: string;
  version: string;
}
const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;
export interface InvestmentOverview {
  currency: Currency;
  summary: {
    marketValueCovered: string;
    remainingCost: string;
    realizedInPeriod: string;
    incomeInPeriod: string;
    unrealizedCovered: string;
    heldAssets: number;
    missingValuations: number;
    distribution: {
      type: string;
      marketValue: string;
      percent: string | null;
    }[];
  };
}
export interface InvestmentHistoryRow {
  id: string;
  kind: string;
  resourceId: string;
  reason: string;
  createdAt: string;
  version: string;
}
export const investmentApi = {
  history: (id: string, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<InvestmentHistoryRow>>>(
        `/investments/assets/${id}/history`,
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  overview: (currency: Currency, start: string, end: string) =>
    apiClient
      .get<ApiResponse<InvestmentOverview>>('/investments/performance', {
        params: { currency, start, end },
      })
      .then(unwrap),
  positions: (page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<Position> & { scope: string }>>(
        '/investments/positions',
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  trades: (assetId: string, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<InvestmentTrade>>>('/investments/trades', {
        params: { assetId, page, pageSize: 20 },
      })
      .then(unwrap),
  valuations: (assetId: string, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<Valuation>>>('/investments/valuations', {
        params: { assetId, page, pageSize: 20 },
      })
      .then(unwrap),
  save: (
    path: string,
    body: unknown,
    version?: string,
    method: 'post' | 'put' = 'post',
  ) =>
    apiClient[method](path, body, {
      headers: {
        'Idempotency-Key': crypto.randomUUID(),
        ...(version ? { 'If-Match': version } : {}),
      },
    }),
  preview: (path: string, body: unknown, version?: string) =>
    apiClient
      .post<ApiResponse<unknown>>(path, body, {
        headers: version ? { 'If-Match': version } : {},
      })
      .then(unwrap),
};
