import { apiClient } from './client';
import type { ApiResponse } from '../types';
export const methods = {
  Manual: '手动估值',
  StraightLine: '直线折旧',
  DecliningBalance: '余额递减',
  Fixed: '固定估值',
  Market: '市场估值',
  QuantityPrice: '数量 × 单价',
};
export const states = {
  New: '新增待启用',
  Active: '启用',
  Idle: '闲置',
  Lent: '借出',
  Repair: '维修',
  Rented: '出租',
  Transferred: '转让',
  Sold: '出售',
  Scrapped: '报废',
  Lost: '丢失',
  Archived: '归档',
};
export const eventNames = {
  ...states,
  Inventory: '完成盘点',
  Maintenance: '完成维护',
  Reverse: '冲销 / 撤销',
};
export const costNames = {
  Repair: '维修',
  Maintenance: '保养',
  Insurance: '保险',
  Energy: '能源',
  Upkeep: '维护',
  Other: '其他',
};
export interface PhysicalCategory {
  id: string;
  name: string;
  parentId: string | null;
  sort: number;
  enabled: boolean;
  tags: string;
  defaultMethod: string;
  defaultLifeMonths: number;
  version: string;
}
export interface PhysicalProfile {
  categoryId: string | null;
  code: string;
  brand: string;
  model: string;
  serialNumber: string;
  merchant: string;
  paymentAccountId: string | null;
  photoUrl: string;
  receiptUrl: string;
  location: string;
  holder: string;
  tags: string;
  inServiceDate: string | null;
  warrantyUntil: string | null;
  quantity: number;
  initialState: string;
  maintenanceDays: number;
  inventoryDays: number;
  staleDays: number;
  idleDays: number;
}
export interface PhysicalRule {
  id: string;
  date: string;
  method: string;
  source: string;
  amount: number | null;
  marketValue: number | null;
  netRealizableValue: number | null;
  replacementCost: number | null;
  lifeMonths: number;
  residual: number;
  annualRate: number;
}
export interface PhysicalEvent {
  id: string;
  date: string;
  kind: string;
  reason: string;
  quantity: number;
  reversesId: string | null;
}
export interface PhysicalRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  acquiredDate: string;
  note: string;
  version: string;
  categoryName: string;
  profile: PhysicalProfile | null;
  value: {
    quantity: number;
    state: string;
    originalCost: number;
    remainingCost: number;
    bookValue: number;
    marketValue: number | null;
    netRealizableValue: number | null;
    value: number | null;
    replacementCost: number | null;
    valuationDate: string | null;
    source: string;
    method: string;
  };
  usageCost: number;
  ownershipCost: number;
  depreciation: number;
  retentionPercent: number | null;
  anomalies: string[];
  costs: {
    id: string;
    transactionId: string;
    kind: string;
    reason: string;
    reversed: boolean;
    valid: boolean;
    date: string;
    amount: number;
  }[];
  events: PhysicalEvent[];
  rules: PhysicalRule[];
  valuations: { id: string; date: string; amount: number; source: string }[];
}
export interface PhysicalGroup {
  currency: string;
  totalValue: number;
  originalCost: number;
  remainingCost: number;
  bookValue: number;
  depreciation: number;
  quantity: number;
  missing: number;
  retentionPercent: number | null;
  usageCost: number;
  ownershipCost: number;
  idlePercent: number | null;
  concentrationPercent: number | null;
  replacementCost: number;
  replacementMissing: number;
  valueChange: number | null;
  distribution: {
    name: string;
    value: number;
    missing: number;
    quantity: number;
  }[];
  trend: { date: string; value: number; missing: number }[];
}
export interface PhysicalReport {
  date: string;
  scope: string;
  items: PhysicalRow[];
  groups: PhysicalGroup[];
  reminders: {
    assetId: string;
    name: string;
    kind: string;
    due: string;
    overdue: boolean;
  }[];
}
export const physicalApi = {
  report: (params: Record<string, string>) =>
    apiClient
      .get<ApiResponse<PhysicalReport>>('/physical-center', { params })
      .then((r) => r.data.data),
  categories: () =>
    apiClient
      .get<ApiResponse<PhysicalCategory[]>>('/physical-categories')
      .then((r) => r.data.data),
  analysis: (body: unknown, params: Record<string, string>) =>
    apiClient
      .post<ApiResponse<{ explanation: string }>>(
        '/physical-center/analysis',
        body,
        { params },
      )
      .then((r) => r.data.data),
};
