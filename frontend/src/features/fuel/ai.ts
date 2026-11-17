import { apiClient } from '../../api/client';
export interface FuelAiRequest {
  vehicleId?: string;
  from: string;
  to: string;
  currency: string;
  task: 'Fuel' | 'Costs' | 'Strategy' | 'Health' | 'Monthly';
  confirmTransmission: boolean;
  language: 'zh-CN' | 'en';
}
export interface FuelAiEvidence {
  from: string;
  to: string;
  currency: string;
  task: string;
  ruleVersion: string;
  fuel: {
    count: number;
    litres: number;
    amount: number;
    currency: string;
    otherCurrencyCount: number;
    completedIntervals: number;
    distance: number;
    consumedLitres: number;
    litresPer100Km: number | null;
  };
  monthly: { month: string; litres: number; amount: number }[];
  intervalStates: { status: string; count: number }[];
  quality: { code: string; count: number }[];
  cashCosts: {
    currency: string;
    paid: number;
    refunds: number;
    reimbursements: number;
    net: number;
  }[];
  limitations: string;
}
export const fuelAiApi = {
  evidence: async (b: FuelAiRequest) =>
    (await apiClient.post<{ data: FuelAiEvidence }>('/fuel/ai/evidence', b))
      .data.data,
  analyze: async (b: FuelAiRequest, key: string) =>
    (
      await apiClient.post<{
        data: {
          advice: { id?: string; text: string; fingerprint: string };
          evidence: FuelAiEvidence;
          verified: boolean;
        };
      }>('/fuel/ai/analyze', b, {
        headers: { 'Idempotency-Key': key },
        timeout: 180000,
      })
    ).data.data,
  remove: async (row: { id: string; version: string }) =>
    apiClient.post(
      `/fuel/ai/history/${row.id}/delete`,
      {},
      {
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
          'If-Match': row.version,
        },
      },
    ),
  history: async (vehicleId?: string) =>
    (
      await apiClient.get<{
        data: {
          id: string;
          version: string;
          createdAt: string;
          text: string;
        }[];
      }>('/fuel/ai/history', { params: { vehicleId } })
    ).data.data,
};
