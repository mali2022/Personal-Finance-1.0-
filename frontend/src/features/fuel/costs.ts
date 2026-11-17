import { apiClient } from '../../api/client';
import type { SaveTransactionRequest } from '../../types';
export interface VehicleCostInput {
  vehicleId: string;
  transactionId: string;
  category: string;
  amount: string;
  kind: 'Expense' | 'Refund' | 'Reimbursement';
  originalCostId?: string;
  fuelRecordId?: string;
  note: string;
}
export interface VehicleCostRow {
  id: string;
  version: string;
  input: VehicleCostInput;
  currency: string;
  date: string;
  signedAmount: number;
  transactionVersion: string;
  merchant: string | null;
}
export interface VehicleCostReport {
  annualCategories?: {
    year: number;
    category: string;
    currency: string;
    amount: number;
  }[];
  maintenanceMonthly?: {
    month: string;
    category: string;
    currency: string;
    amount: number;
  }[];
  rows: VehicleCostRow[];
  originalExpenses: VehicleCostRow[];
  summary: {
    currency: string;
    paid: number;
    refunds: number;
    reimbursements: number;
    net: number;
  }[];
  monthly: { month: string; currency: string; amount: number }[];
  categories: { category: string; currency: string; amount: number }[];
  vehicles: { vehicleId: string; currency: string; amount: number }[];
  rule: string;
  annual?: { year: number; currency: string; amount: number }[];
  lifetimeSummary?: { currency: string; net: number }[];
  distanceCosts?: {
    vehicleId: string;
    currency: string;
    validDistance: number;
    linkedNet: number;
    linkedCashPerValidKm: number | null;
    fuelDistance: number;
    intervalFuelPaid: number;
    fuelCostPerKm: number | null;
    validIntervals: number;
    rule: string;
  }[];
}
export interface VehicleCostCandidate {
  id: string;
  type: string;
  amount: number;
  currency: string;
  occurredAt: string;
  merchant: string | null;
  accountId: string;
  version: string;
  allocated: number;
}
const headers = (version?: string) => ({
  'Idempotency-Key': crypto.randomUUID(),
  ...(version ? { 'If-Match': version } : {}),
});
export const costApi = {
  report: async (params: { vehicleId?: string; from: string; to: string }) =>
    (
      await apiClient.get<{ data: VehicleCostReport }>('/fuel/costs', {
        params,
      })
    ).data.data,
  candidates: async (params: {
    vehicleId: string;
    fuelRecordId?: string;
    keyword?: string;
  }) =>
    (
      await apiClient.get<{ data: VehicleCostCandidate[] }>(
        '/fuel/costs/candidates',
        { params },
      )
    ).data.data,
  link: async (input: VehicleCostInput, key: string) =>
    apiClient.post('/fuel/costs', input, {
      headers: { 'Idempotency-Key': key },
    }),
  create: async (
    cost: VehicleCostInput,
    transaction: SaveTransactionRequest,
    key: string,
  ) =>
    apiClient.post(
      '/fuel/costs/create-transaction',
      { cost, transaction, confirmNew: true },
      { headers: { 'Idempotency-Key': key } },
    ),
  unlink: async (row: VehicleCostRow) =>
    apiClient.post(
      `/fuel/costs/${row.id}/unlink`,
      {},
      { headers: headers(row.version) },
    ),
};
export const vehicleCostCategories = [
  ['Fuel', '燃油', 'Fuel'],
  ['Charging', '充电', 'Charging'],
  ['Insurance', '保险', 'Insurance'],
  ['Tax', '税费', 'Tax'],
  ['Maintenance', '保养', 'Maintenance'],
  ['Repair', '维修', 'Repair'],
  ['Tyres', '轮胎', 'Tyres'],
  ['Parking', '停车', 'Parking'],
  ['Tolls', '路桥', 'Tolls'],
  ['Cleaning', '洗车美容', 'Cleaning'],
  ['Fines', '违章', 'Fines'],
  ['LoanInterest', '贷款利息', 'Loan interest'],
  ['Other', '其他', 'Other'],
] as const;
