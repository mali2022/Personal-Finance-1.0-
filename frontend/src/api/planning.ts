import { apiClient } from './client';
import type {
  ApiResponse,
  PagedResult,
  SaveTransactionRequest,
} from '../types';
import type {
  RecurringInput,
  RecurringRule,
  Occurrence,
  Execution,
  SubscriptionInput,
  Subscription,
  AutomationInput,
  AutomationRule,
  AutomationPreview,
  AutomationExecution,
  CalendarEvent,
  PlanningSummary,
} from '../features/planning/types';
const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;
const headers = (key: string, version?: string) => ({
  'Idempotency-Key': key,
  ...(version ? { 'If-Match': version } : {}),
});
export const planningApi = {
  suggest: (transaction: SaveTransactionRequest) =>
    apiClient
      .post<
        ApiResponse<{
          after: SaveTransactionRequest;
          promotionSuggestions?: {
            id: string;
            name: string;
            platform: string;
            expiresAt: string;
          }[];
          hitRules: string[];
          conflicts: string[];
          protectedFields: string[];
        }>
      >('/automation-rules/suggest', { transaction })
      .then(unwrap),
  capabilities: () =>
    apiClient
      .get<
        ApiResponse<{
          recurring: boolean;
          subscriptions: boolean;
          calendar: boolean;
          automation: boolean;
        }>
      >('/planning/capabilities')
      .then(unwrap),
  rules: (page = 1) =>
    apiClient
      .get<ApiResponse<PagedResult<RecurringRule>>>('/recurring-rules', {
        params: { page, pageSize: 20 },
      })
      .then(unwrap),
  saveRule: (body: RecurringInput, key: string, existing?: RecurringRule) =>
    (existing
      ? apiClient.put<ApiResponse<RecurringRule>>(
          '/recurring-rules/' + existing.id,
          body,
          { headers: headers(key, existing.version) },
        )
      : apiClient.post<ApiResponse<RecurringRule>>('/recurring-rules', body, {
          headers: headers(key),
        })
    ).then(unwrap),
  ruleAction: (rule: RecurringRule, action: string, key: string) =>
    apiClient.post(
      '/recurring-rules/' + rule.id + '/actions',
      { action },
      { headers: headers(key, rule.version) },
    ),
  occurrences: (page = 1, state?: string, ruleId?: string) =>
    apiClient
      .get<ApiResponse<PagedResult<Occurrence>>>('/recurring-occurrences', {
        params: { page, pageSize: 20, state, ruleId },
      })
      .then(unwrap),
  generate: () => apiClient.post('/recurring-occurrences/generate', {}),
  occurrenceAction: (
    item: Occurrence,
    action: string,
    key: string,
    transactionVersion?: string,
  ) =>
    apiClient
      .post<ApiResponse<Occurrence>>(
        '/recurring-occurrences/' + item.id + '/actions',
        { action, transactionVersion },
        { headers: headers(key, item.version) },
      )
      .then(unwrap),
  history: (id: string, page = 1) =>
    apiClient
      .get<ApiResponse<PagedResult<Execution>>>(
        '/recurring-rules/' + id + '/history',
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  subscriptions: (page = 1) =>
    apiClient
      .get<ApiResponse<PagedResult<Subscription>>>('/subscriptions', {
        params: { page, pageSize: 20 },
      })
      .then(unwrap),
  saveSubscription: (
    body: SubscriptionInput,
    key: string,
    existing?: Subscription,
  ) =>
    (existing
      ? apiClient.put<ApiResponse<Subscription>>(
          '/subscriptions/' + existing.id,
          body,
          { headers: headers(key, existing.version) },
        )
      : apiClient.post<ApiResponse<Subscription>>('/subscriptions', body, {
          headers: headers(key),
        })
    ).then(unwrap),
  automations: (page = 1) =>
    apiClient
      .get<ApiResponse<PagedResult<AutomationRule>>>('/automation-rules', {
        params: { page, pageSize: 20 },
      })
      .then(unwrap),
  saveAutomation: (
    body: AutomationInput,
    key: string,
    existing?: AutomationRule,
  ) =>
    (existing
      ? apiClient.put<ApiResponse<AutomationRule>>(
          '/automation-rules/' + existing.id,
          body,
          { headers: headers(key, existing.version) },
        )
      : apiClient.post<ApiResponse<AutomationRule>>('/automation-rules', body, {
          headers: headers(key),
        })
    ).then(unwrap),
  previewAutomation: (occurrenceIds: string[]) =>
    apiClient
      .post<ApiResponse<AutomationPreview>>('/automation-rules/preview', {
        occurrenceIds,
      })
      .then(unwrap),
  applyAutomation: (
    occurrenceIds: string[],
    previewToken: string,
    key: string,
  ) =>
    apiClient
      .post<ApiResponse<{ changed: number }>>(
        '/automation-rules/apply',
        { occurrenceIds, previewToken },
        { headers: headers(key) },
      )
      .then(unwrap),
  automationHistory: (page = 1) =>
    apiClient
      .get<ApiResponse<PagedResult<AutomationExecution>>>(
        '/automation-executions',
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  calendar: (params: {
    start: string;
    end: string;
    page: number;
    accountId?: string;
    type?: string;
    state?: string;
  }) =>
    apiClient
      .get<ApiResponse<PagedResult<CalendarEvent>>>('/calendar-events', {
        params: { ...params, pageSize: 100 },
      })
      .then(unwrap),
  summary: () =>
    apiClient
      .get<ApiResponse<PlanningSummary>>('/planning/summary')
      .then(unwrap),
};
