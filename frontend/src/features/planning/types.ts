import { localizedLabels } from '../../i18n';
import type { Currency, SaveTransactionRequest } from '../../types';
export type Frequency =
  'Day' | 'Week' | 'Month' | 'Quarter' | 'HalfYear' | 'Year' | 'Custom';
export interface RecurringInput {
  name: string;
  currency: Currency;
  transaction: SaveTransactionRequest;
  startLocal: string;
  endLocal?: string;
  frequency: Frequency;
  interval: number;
  timeZone: string;
  monthEndPolicy: 'Clamp' | 'Skip';
  reminderDays: number;
  state: 'Draft' | 'Active' | 'Paused';
  detailedNote?: string;
}
export interface RecurringRule extends Omit<RecurringInput, 'state'> {
  source: 'Recurring' | 'Subscription';
  id: string;
  state: string;
  nextAt?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  requiresConfirmation: boolean;
}
export interface Occurrence {
  id: string;
  ruleId: string;
  state: string;
  sequence: number;
  scheduledAt: string;
  currency: Currency;
  amount: string;
  transactionId?: string;
  ruleVersion: number;
  transaction: SaveTransactionRequest;
  version: string;
}
export interface Execution {
  id: string;
  action: string;
  source: string;
  occurrenceId?: string;
  transactionId?: string;
  message: string;
  createdAt: string;
}
export const frequencyLabels: Record<Frequency, string> = localizedLabels({
  Day: '每日',
  Week: '每周',
  Month: '每月',
  Quarter: '每季度',
  HalfYear: '每半年',
  Year: '每年',
  Custom: '自定义天数',
});
export const planningLabels: Record<string, string> = localizedLabels({
  Draft: '草稿',
  Active: '启用',
  Paused: '暂停',
  Ended: '已结束',
  Cancelled: '已取消',
  Pending: '待确认',
  Failed: '执行失败 · 可重试',
  Posted: '已过账',
  Skipped: '已跳过',
  Revoked: '已撤销',
  Create: '创建',
  Update: '修改',
  Generate: '生成待确认实例',
  Confirm: '确认过账',
  Revoke: '撤销',
  Restore: '恢复',
  Skip: '跳过',
  Cancel: '取消',
  Pause: '暂停',
  Resume: '恢复执行',
  CancelInstance: '取消实例',
  User: '用户',
  System: '系统',
});
export interface SubscriptionInput {
  name: string;
  provider: string;
  rule: RecurringInput;
  autoRenew: boolean;
  state: string;
  serviceEndsAt?: string;
  priceEffectiveAt?: string;
  note: string;
}
export interface Subscription extends Omit<SubscriptionInput, 'rule'> {
  id: string;
  version: string;
  rule: RecurringRule;
  prices: {
    id: string;
    amount: string;
    currency: Currency;
    effectiveAt: string;
  }[];
}
export interface AutomationConditions {
  merchantExact?: string;
  merchantKeyword?: string;
  noteKeyword?: string;
  minimumAmount?: string;
  maximumAmount?: string;
  accountId?: string;
  type?: string;
  currency?: string;
  source?: string;
  start?: string;
  end?: string;
}
export interface AutomationActions {
  categoryId?: string;
  merchant?: string;
  tagIds?: string[];
  projectId?: string;
  note?: string;
  templateId?: string;
}
export interface AutomationInput {
  name: string;
  conditions: AutomationConditions;
  actions: AutomationActions;
  priority: number;
  state: string;
  previewOnly: boolean;
}
export interface AutomationRule extends AutomationInput {
  id: string;
  version: string;
  hitCount: number;
}
export interface AutomationPreview {
  previewToken: string;
  policy: string;
  items: {
    id: string;
    version: string;
    before: SaveTransactionRequest;
    after: SaveTransactionRequest;
    applicable: SaveTransactionRequest;
    hitRules: string[];
    conflicts: string[];
    protectedFields: string[];
    changedFields: string[];
    templateIds: string[];
  }[];
}
export interface AutomationExecution {
  id: string;
  ruleId: string;
  occurrenceId: string;
  state: string;
  changedFieldsJson: string;
  createdAt: string;
}
export interface CalendarEvent {
  id: string;
  ruleId: string;
  occurrenceId?: string;
  name: string;
  source: string;
  type: 'Expense' | 'Income' | 'Transfer' | 'CreditCardPayment';
  accountId: string;
  currency: Currency;
  amount: string;
  at: string;
  state: string;
  transactionId?: string;
}
export interface PlanningSummary {
  pending: number;
  overdue: number;
  failed: number;
  reminders: {
    id: string;
    name: string;
    at: string;
    currency: Currency;
    amount: string;
  }[];
}
