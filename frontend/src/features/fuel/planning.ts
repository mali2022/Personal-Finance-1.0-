import { apiClient } from '../../api/client';
export interface VehicleBudget {
  id: string;
  version: string;
  input: {
    vehicleId: string;
    period: string;
    category: string;
    currency: string;
    amount: string;
  };
  actual: number;
  remaining: number;
  usedPercent: number;
}
interface AssetValue {
  bookValue: number;
  value: number | null;
  source: string;
  method: string;
  state: string;
}
export interface VehiclePlanningReport {
  link: { id: string; version: string; assetId: string | null } | null;
  asset: {
    id: string;
    name: string;
    currency: string;
    cost: number;
    acquiredDate: string;
    state: string;
    version: string;
  } | null;
  choices: { id: string; name: string; currency: string }[];
  opening: AssetValue | null;
  closing: AssetValue | null;
  modelConsumption: number | null;
  economicEstimate: {
    currency: string;
    cashNet: number;
    modelConsumption: number;
    total: number;
    assumption: string;
  } | null;
  rules: {
    id: string;
    date: string;
    method: string;
    source: string;
    amount: number | null;
    lifeMonths: number;
    residual: number;
    annualRate: number;
  }[];
  valuations: { id: string; date: string; amount: number; source: string }[];
  budgets: VehicleBudget[];
}
const headers = (version?: string) => ({
  'Idempotency-Key': crypto.randomUUID(),
  ...(version ? { 'If-Match': version } : {}),
});
export const vehiclePlanningApi = {
  report: async (id: string, from: string, to: string) =>
    (
      await apiClient.get<{ data: VehiclePlanningReport }>(
        `/fuel/vehicles/${id}/planning`,
        { params: { from, to } },
      )
    ).data.data,
  asset: async (id: string, assetId: string | null, version?: string) =>
    apiClient.put(
      `/fuel/vehicles/${id}/asset`,
      { assetId },
      { headers: headers(version) },
    ),
  rule: async (
    id: string,
    assetVersion: string,
    rule: {
      date: string;
      method: string;
      source: string;
      lifeMonths: number;
      residual: number;
      annualRate: number;
      amount?: number | null;
    },
  ) =>
    apiClient.post(
      `/fuel/vehicles/${id}/asset-rule`,
      { assetVersion, rule },
      { headers: headers() },
    ),
  budget: async (
    input: VehicleBudget['input'],
    key: string,
    item?: VehicleBudget,
  ) =>
    apiClient.request({
      method: item ? 'put' : 'post',
      url: `/fuel/vehicle-budgets${item ? '/' + item.id : ''}`,
      data: input,
      headers: {
        'Idempotency-Key': key,
        ...(item ? { 'If-Match': item.version } : {}),
      },
    }),
  removeBudget: async (item: VehicleBudget) =>
    apiClient.post(
      `/fuel/vehicle-budgets/${item.id}/delete`,
      {},
      { headers: headers(item.version) },
    ),
};
