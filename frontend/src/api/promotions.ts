import { apiClient } from './client';
import type { ApiResponse, Currency } from '../types';
export interface Benefit {
  discountRate?: string;
  maximumDiscount?: string;
  claimedAt?: string;
  paymentMethod?: string;
  id: string;
  name: string;
  platform: string;
  merchant: string;
  type: string;
  mode: string;
  currency: Currency;
  faceValue: string;
  minimumAmount: string;
  remainingValue: string;
  quantity: number;
  accountId?: string;
  startsAt: string;
  expiresAt: string;
  state: string;
  rules: string;
  note: string;
  version: string;
}
export interface Cashback {
  recoveredAmount: string;
  remainingAmount: string;
  id: string;
  transactionId: string;
  settlementTransactionId?: string;
  amount: string;
  currency: Currency;
  source: string;
  treatment: string;
  state: string;
  version: string;
}
export interface PromotionReport {
  originalReference: string;
  actualPayment: string;
  couponUsageCount: number;
  expiredUnusedCount: number;
  unusedEntitlementValue: string;
  giftCreditUsed: string;
  trend: {
    month: string;
    directSavings: string;
    feeSavings: string;
    pointValue: string;
  }[];
  recoveredCashback: string;
  netCashback: string;
  currency: Currency;
  directSavings: string;
  feeSavings: string;
  pointValue: string;
  settledCashback: string;
  pendingCashback: string;
  details: {
    transactionId: string;
    merchant?: string;
    month: string;
    type: string;
    source: string;
    amount: string;
  }[];
}
export interface TransferDraft {
  id: string;
  currency: Currency;
  paidAmount: string;
  receivedAmount: string;
  subsidyAmount: string;
  source: string;
  evidence: string;
  state: string;
  version: string;
  transferTransactionId?: string;
  subsidyTransactionId?: string;
}
const unwrap = <T>(response: { data: ApiResponse<T> }) => response.data.data;
const headers = (version?: string) => ({
  'Idempotency-Key': crypto.randomUUID(),
  ...(version ? { 'If-Match': version } : {}),
});
export const promotionsApi = {
  transaction: (id: string) =>
    apiClient
      .get<
        ApiResponse<{
          cashbacks: Cashback[];
          usages: {
            id: string;
            benefitId: string;
            refundTransactionId?: string;
            state: string;
            amount: string;
          }[];
        }>
      >(`/transactions/${id}/promotions`)
      .then(unwrap),
  recoveries: (id: string) =>
    apiClient
      .get<
        ApiResponse<
          {
            id: string;
            transactionId: string;
            amount: string;
            reason: string;
            state: string;
            version: string;
          }[]
        >
      >(`/cashbacks/${id}/recoveries`)
      .then(unwrap),
  revokeRecovery: (id: string, version: string) =>
    apiClient.post(
      `/cashback-recoveries/${id}/revoke`,
      {},
      { headers: headers(version) },
    ),
  revokeDraft: (draft: TransferDraft) =>
    apiClient.post(
      `/promotions/transfer-drafts/${draft.id}/revoke`,
      {},
      { headers: headers(draft.version) },
    ),
  list: () => apiClient.get<ApiResponse<Benefit[]>>('/promotions').then(unwrap),
  save: (body: unknown, benefit?: Benefit) =>
    benefit
      ? apiClient.put(`/promotions/${benefit.id}`, body, {
          headers: headers(benefit.version),
        })
      : apiClient.post('/promotions', body, { headers: headers() }),
  history: (id: string) =>
    apiClient
      .get<
        ApiResponse<
          {
            id: string;
            transactionId: string;
            amount: string;
            state: string;
            createdAt: string;
            version: string;
          }[]
        >
      >(`/promotions/${id}/history`)
      .then(unwrap),
  returnBenefit: (id: string, version: string, refundTransactionId: string) =>
    apiClient.post(
      `/promotion-usages/${id}/return`,
      { refundTransactionId },
      { headers: headers(version) },
    ),
  transferDraft: (body: unknown) =>
    apiClient.post('/promotions/transfer-drafts', body, { headers: headers() }),
  drafts: () =>
    apiClient
      .get<ApiResponse<TransferDraft[]>>('/promotions/transfer-drafts')
      .then(unwrap),
  confirmDraft: (draft: TransferDraft, categoryId: string) =>
    apiClient.post(
      `/promotions/transfer-drafts/${draft.id}/confirm`,
      { categoryId, nature: 'RewardIncome' },
      { headers: headers(draft.version) },
    ),
  cashbacks: () =>
    apiClient.get<ApiResponse<Cashback[]>>('/cashbacks').then(unwrap),
  createCashback: (body: unknown) =>
    apiClient.post('/cashbacks', body, { headers: headers() }),
  recover: (b: Cashback, body: unknown) =>
    apiClient.post(`/cashbacks/${b.id}/recover`, body, {
      headers: headers(b.version),
    }),
  settle: (b: Cashback, body: unknown) =>
    apiClient.post(`/cashbacks/${b.id}/settle`, body, {
      headers: headers(b.version),
    }),
  revoke: (b: Cashback) =>
    apiClient.post(
      `/cashbacks/${b.id}/revoke`,
      {},
      { headers: headers(b.version) },
    ),
  report: (params: { start: string; end: string; currency: string }) =>
    apiClient
      .get<ApiResponse<PromotionReport>>('/reports/promotions', { params })
      .then(unwrap),
};
