import { apiClient } from '../../api/client';
export interface FuelStrategyInput {
  mode?: 'Detour' | 'Economy';
  monthlyDistance?: number;
  annualDistance?: number;
  targetConsumption?: number;
  years?: number;
  name: string;
  currency: string;
  litres: number;
  baselinePrice: number;
  alternativePrice: number;
  coupon: number;
  pointsValue: number;
  extraDistance: number;
  consumption: number;
}
export interface FuelStrategyResult {
  economy?: {
    annualBaselineCost: number;
    annualTargetCost: number;
    annualSaving: number;
    totalSaving: number;
    sensitivity: {
      priceFactor: number;
      fuelPrice: number;
      monthlySaving: number;
      annualSaving: number;
      totalSaving: number;
    }[];
  } | null;
  baselineCost: number;
  alternativeCost: number;
  detourLitres: number;
  detourCost: number;
  netSaving: number;
  ruleVersion: string;
}
export interface FuelStrategy {
  id: string;
  version: string;
  input: FuelStrategyInput;
  result: FuelStrategyResult;
}
const headers = (item?: FuelStrategy) => ({
  'Idempotency-Key': crypto.randomUUID(),
  ...(item ? { 'If-Match': item.version } : {}),
});
export const strategyApi = {
  list: async () =>
    (await apiClient.get<{ data: FuelStrategy[] }>('/fuel/strategies')).data
      .data,
  preview: async (input: FuelStrategyInput) =>
    (
      await apiClient.post<{ data: FuelStrategyResult }>(
        '/fuel/strategies/preview',
        input,
      )
    ).data.data,
  save: async (input: FuelStrategyInput, item?: FuelStrategy) =>
    apiClient.request({
      method: item ? 'put' : 'post',
      url: `/fuel/strategies${item ? '/' + item.id : ''}`,
      data: input,
      headers: headers(item),
    }),
  remove: async (item: FuelStrategy) =>
    apiClient.post(
      `/fuel/strategies/${item.id}/delete`,
      {},
      { headers: headers(item) },
    ),
};
