import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
export interface Topic {
  id: string;
  version: string;
  input: { name: string; kind: string; note: string; artistProfile?: ArtistProfile | null };
}
export interface ArtistProfile {
  type: 'Solo' | 'Band'; aliases: string[];
  members: { artistId: string; role: string; joinedOn: string | null; leftOn: string | null }[];
}
export interface TopicHistory { id: string; createdAt: string; before: Topic['input'] | null; after: Topic['input'] }
export interface Item {
  related: boolean;
  id: string;
  name: string;
  brandId: string | null;
  category: string;
  specification: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  shipping: string;
  tax: string;
  paid: string;
  purpose: string;
  state: string;
  artists: { artistId: string; amount: string }[];
  note: string;
}
export interface Purchase {
  purchasedOn: string;
  currency: string;
  channel: string;
  merchant: string;
  orderNumber: string;
  transactionId: string | null;
  sceneId: string | null;
  type: string;
  state: string;
  items: Item[];
  refunds: { transactionId: string; itemId: string; amount: string }[];
  tags: string[];
  note: string;
}
export interface PurchaseRecord {
  id: string;
  version: string;
  input: Purchase;
}
export interface Totals {
  gross: string;
  discount: string;
  paid: string;
  refund: string;
  net: string;
}
export interface Report {
  years: { year: number; totals: Totals }[];
  types: { name: string; totals: Totals }[];
  totals: Totals;
  daily: Totals;
  concert: Totals;
  rows: {
    purchaseId: string;
    itemId: string;
    name: string;
    transactionId: string;
    date: string;
    type: string;
    merchant: string;
    paid: string;
    refund: string;
    net: string;
  }[];
  brands: { id: string | null; totals: Totals }[];
  categories: { name: string; totals: Totals }[];
  months: { month: number; totals: Totals }[];
  warnings: string[];
  rule: string;
  budgets: {
    input: { name: string };
    actual: string;
    remaining: string;
    warning: boolean;
  }[];
}
const data = <T>(r: { data: ApiResponse<T> }) => r.data.data;
const base = '/concerts/interests';
export const interestApi = {
  topicHistory: (id: string) => apiClient.get<ApiResponse<TopicHistory[]>>(`${base}/topics/${id}/history`).then(data),
  approval: (r: PurchaseRecord) =>
    apiClient.post(
      base + '/purchases/' + r.id + '/approval',
      {},
      {
        headers: {
          'If-Match': r.version,
          'Idempotency-Key': crypto.randomUUID(),
        },
      },
    ),
  catalog: () =>
    apiClient
      .get<
        ApiResponse<{
          topics: Topic[];
          links: {
            id: string;
            version: string;
            input: {
              artistId: string;
              brandId: string;
              startsOn: string | null;
              endsOn: string | null;
              note: string;
            };
          }[];
          budgets: unknown[];
        }>
      >(base + '/catalog')
      .then(data),
  purchases: (page: number) =>
    apiClient
      .get<ApiResponse<{ total: number; items: PurchaseRecord[] }>>(
        base + '/purchases',
        { params: { page, size: 20 } },
      )
      .then(data),
  report: (params: Record<string, string | number | undefined>) =>
    apiClient.get<ApiResponse<Report>>(base + '/report', { params }).then(data),
  save: (
    kind: string,
    input: unknown,
    record?: { id: string; version: string },
    key = crypto.randomUUID(),
  ) =>
    apiClient.request({
      method: record ? 'put' : 'post',
      url: base + '/' + kind + (record ? '/' + record.id : ''),
      data: input,
      headers: { 'If-Match': record?.version || '0', 'Idempotency-Key': key },
    }),
};
