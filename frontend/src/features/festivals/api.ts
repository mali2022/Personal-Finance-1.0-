import { apiClient } from '../../api/client';
export type Purchase = {
  id: string;
  name: string;
  recipient: string;
  amount: string;
  state: string;
  category: string;
  url?: string;
  deadline?: string;
  note: string;
};
export type FestivalInput = {
  name: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  budget: string;
  state: string;
  note: string;
  purchases: Purchase[];
  kind: string;
  definition: string;
  prepareOn?: string;
  categories: { category: string; amount: string }[];
  reminderDays: number[];
  hidden: boolean;
  recurrence: string;
  region: string;
  savingTarget: number;
  reserved: number;
};
export type Festival = { id: string; version: string; input: FestivalInput };
export type Allocation = {
  transactionId: string;
  amount: string;
  category: string;
  entryId?: string;
  purchaseId?: string;
  rate: number;
  rateDate?: string;
  rateSource: string;
  note: string;
};
export type Report = {
  scope: string;
  currency: string;
  budget: string;
  gross: string;
  refunds: string;
  net: string;
  commitment: string;
  intention: string;
  available: string;
  forecast: string;
  variance: string;
  complete: boolean;
  warnings: string[];
  countdown: number;
  purchased: number;
  totalPurchases: number;
  categories: { category: string; net: string }[];
  allocations: {
    id: string;
    input: Allocation;
    type: string;
    originalCurrency: string;
    converted: string;
    occurredAt: string;
  }[];
  saving: {
    target: string;
    plannedReserved: string;
    gap: string;
    monthly: string;
    note: string;
  };
};
export type Detail = { document: Festival; report: Report };
export type AiOption = {
  name: string;
  total: number;
  reserve: number;
  items: {
    name: string;
    category: string;
    amount: number;
    recipient: string;
  }[];
  activities: string[];
  risks: string[];
  advantages: string;
  tradeoffs: string;
  monthlyImpact: string;
  cashflowImpact: string;
  reason: string;
};
export type AiResult = {
  plans: AiOption[];
  missing: string[];
  assumptions: string[];
  review: string;
};
export type AiRecord = {
  id: string;
  content: { result: AiResult; eventVersion: string };
};
export type Transaction = {
  id: string;
  type: string;
  amount: string;
  currency: string;
  note: string;
  occurredAt: string;
  entries: { id: string; amount: string; categoryId: string }[];
};
export const states: Record<string, string> = {
  Planning: '规划中',
  Preparing: '准备中',
  Active: '进行中',
  Review: '待复盘',
  Completed: '已完成',
  Cancelled: '已取消',
};
export const purchaseStates: Record<string, string> = {
  Idea: '想法',
  Comparing: '待比较',
  PendingApproval: '待审批',
  Approved: '已批准',
  Purchased: '已购买',
  Delivered: '已送出',
  Cancelled: '已取消',
  Returned: '已退货',
};
export async function read<T>(path: string): Promise<T> {
  return (await apiClient.get('/festivals' + path)).data.data;
}
export async function write<T>(
  path: string,
  body: unknown,
  version: string,
  method: 'post' | 'put' = 'post',
): Promise<T> {
  return (
    await apiClient.request({
      method,
      url: '/festivals' + path,
      data: body,
      timeout: path.endsWith('/ai-plans') ? 180000 : 15000,
      headers: { 'If-Match': version, 'Idempotency-Key': crypto.randomUUID() },
    })
  ).data.data;
}
export const blank = (): FestivalInput => ({
  name: '',
  startsOn: '',
  endsOn: '',
  currency: 'CNY',
  budget: '0',
  state: 'Planning',
  note: '',
  purchases: [],
  kind: 'Personal',
  definition: 'custom',
  categories: [],
  reminderDays: [30, 7, 0],
  hidden: false,
  recurrence: 'Once',
  region: 'CN',
  savingTarget: 0,
  reserved: 0,
});
export const errorText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e
    ? String(e.message)
    : '操作失败，请重试';
