import type { ApiResponse, Currency, PagedResult } from '../types';
import { apiClient } from './client';
export interface ManagedAsset {
  id: string;
  name: string;
  type: string;
  currency: Currency;
  cost: string;
  acquiredDate: string;
  maturityDate: string | null;
  annualRate: string;
  dayCount: string;
  institution: string;
  accountId: string | null;
  liabilityAccountId: string | null;
  fundingTransactionId: string | null;
  maturityAction: string;
  state: string;
  note: string;
  expectedInterest: string | null;
  actualInterest: string | null;
  currentValue: string | null;
  valuationDate: string | null;
  valuationSource: string | null;
  netValue: string | null;
  liability: string | null;
  due: boolean;
  version: string;
}
export interface Allocation {
  date: string;
  complete: boolean;
  uncovered: number;
  scope: string;
  items: {
    id: string;
    name: string;
    type: string;
    currency: Currency;
    reportCurrency: Currency;
    originalAmount: string | null;
    amount: string | null;
    missing: string | null;
    valuationDate: string | null;
    source: string | null;
    rate: string | null;
    rateDate: string | null;
    rateSource: string | null;
    stale: boolean;
  }[];
  groups: {
    currency: Currency;
    assets: string;
    liabilities: string;
    netWorth: string;
    allocation: { type: string; amount: string; percent: string | null }[];
  }[];
  policies: {
    accountId: string;
    mode: string;
    reason: string;
    version: string;
  }[];
}
export interface CustomDefinition {
  name: string;
  start: string;
  end: string;
  currency: Currency;
  groupBy: string;
  theme?: string;
  metrics?: string[];
  sort?: string;
  chartType?: string;
  transactionType?: string;
  accountId?: string;
  categoryId?: string;
  projectId?: string;
  merchant?: string;
  tagId?: string;
}
export interface CustomSaved {
  id: string;
  name: string;
  definition: CustomDefinition;
  version: string;
}
export interface CustomResult {
  start: string;
  end: string;
  currency: Currency;
  groupBy: string;
  theme?: string;
  metrics?: string[];
  sort?: string;
  chartType?: string;
  transactionType?: string;
  income: string;
  expense: string;
  surplus: string;
  scope: string;
  inflow?: string;
  outflow?: string;
  valuation?: Allocation;
  rows: {
    key: string;
    label: string;
    income: string;
    expense: string;
    count: number;
    average?: string;
    amount?: string | null;
    marketValue?: string | null;
    realized?: string;
    unrealized?: string | null;
    xirrPercent?: string | null;
    totalProfit?: string | null;
    missing?: string;
    surplus?: string;
    budget?: string;
    used?: string;
    executionPercent?: string | null;
  }[];
}
export interface PhysicalValuation {
  id: string;
  date: string;
  amount: string;
  source: string;
}
export interface FxRate {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  date: string;
  source: string;
}
const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;
export const assetApi = {
  list: (deposits: boolean, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<ManagedAsset>>>(
        deposits ? '/term-deposits' : '/physical-assets',
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  valuations: (id: string, page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<PhysicalValuation>>>(
        `/physical-assets/${id}/valuations`,
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  allocation: (date: string, currency: string) =>
    apiClient
      .get<ApiResponse<Allocation>>('/assets/allocation', {
        params: { date, currency },
      })
      .then(unwrap),
  fx: (page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<FxRate>>>('/fx-valuation-rates', {
        params: { page, pageSize: 20 },
      })
      .then(unwrap),
  reports: (page: number) =>
    apiClient
      .get<ApiResponse<PagedResult<CustomSaved>>>('/reports/custom', {
        params: { page, pageSize: 20 },
      })
      .then(unwrap),
  preview: (b: CustomDefinition) =>
    apiClient
      .post<ApiResponse<CustomResult>>('/reports/custom/preview', b)
      .then(unwrap),
};
