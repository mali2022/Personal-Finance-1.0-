import { apiClient } from './client';
import type { ApiResponse } from '../types';
import type { Budget, SaveBudgetRequest } from '../types';
export interface AnnualAllocation {
  month: number;
  categoryId: string | null;
  amount: string;
  used?: string | null;
  remaining?: string | null;
  executionPercent?: string | null;
  breakdown?: { categoryId: string; used: string }[];
}
export interface AnnualPlan {
  id?: string;
  year: number;
  currency: string;
  total: string;
  used: string;
  remaining: string;
  state: string;
  version: string;
  executionPercent?: string | null;
  allocations: AnnualAllocation[];
  months: {
    month: number;
    allocated: string;
    used: string;
    monthlyBudget: string;
    monthlyVersion: string;
  }[];
  scope: string;
}
export interface AnnualInput {
  total: string;
  currency: string;
  state: string;
  allocations: AnnualAllocation[];
  reason: string;
}
const unwrap = <T>(r: { data: ApiResponse<T> }) => r.data.data;
export const annualApi = {
  suggestion: (year: number, total: string) =>
    apiClient
      .get<ApiResponse<{ allocations: AnnualAllocation[]; scope: string }>>(
        `/annual-budgets/${year}/suggestion`,
        { params: { total } },
      )
      .then(unwrap),
  monthlyPreview: (
    year: number,
    body: {
      month: number;
      annualVersion: string;
      monthlyVersion: string;
      reason: string;
    },
  ) =>
    apiClient
      .post<ApiResponse<{ before: Budget; draft: SaveBudgetRequest }>>(
        `/annual-budgets/${year}/monthly-preview`,
        body,
      )
      .then(unwrap),
  monthlyApply: (
    year: number,
    body: {
      month: number;
      annualVersion: string;
      monthlyVersion: string;
      reason: string;
    },
    key: string,
  ) =>
    apiClient.post(`/annual-budgets/${year}/monthly-apply`, body, {
      headers: { 'If-Match': body.annualVersion, 'Idempotency-Key': key },
    }),
  get: (year: number) =>
    apiClient
      .get<ApiResponse<AnnualPlan>>(`/annual-budgets/${year}`)
      .then(unwrap),
  save: (year: number, body: AnnualInput, version: string, key: string) =>
    apiClient.put(`/annual-budgets/${year}`, body, {
      headers: { 'If-Match': version, 'Idempotency-Key': key },
    }),
  history: (year: number, page: number) =>
    apiClient
      .get<
        ApiResponse<{
          items: {
            id: string;
            reason: string;
            createdAt: string;
            beforeVersion: number;
            afterVersion: number;
            beforeJson: string;
            afterJson: string;
          }[];
          total: number;
        }>
      >(`/annual-budgets/${year}/history`, { params: { page, pageSize: 10 } })
      .then(unwrap),
};
export interface GoalInput {
  name: string;
  type: string;
  target: string;
  currency: string;
  startDate: string;
  targetDate: string;
  monthlySaving: string;
  priority: number;
  state: string;
  note: string;
}
export interface GoalView extends GoalInput {
  id: string;
  version: string;
  allocated: string;
  remaining: string;
  progress: string;
  recommendedMonthly: string;
  estimatedCompletion?: string;
  overdue: boolean;
}
export interface ReserveAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
  version: string;
  status: string;
  balance: string;
  reserved: string;
  available: string;
  shortage: string;
  eligible: boolean;
}
export interface AllocationInput {
  accountId: string;
  accountVersion: string;
  amount: string;
  reason: string;
  fingerprint?: string;
}
export interface AllocationPreview {
  goalVersion: string;
  accountVersion: string;
  balance: string;
  reserved: string;
  available: string;
  shortage: string;
  allowed: boolean;
  fingerprint: string;
  scope: string;
}
const writeHeaders = (version: string, key: string) => ({
  'If-Match': version,
  'Idempotency-Key': key,
});
export interface CarryInput {
  sourceMonth: string;
  targetMonth: string;
  categoryId?: string | null;
  rule: string;
  parameter: string;
  cap?: string | null;
  carryOverspend: boolean;
  fingerprint?: string;
  targetVersion: string;
  reason: string;
}
export interface CarryPreview {
  remaining: string;
  amount: string;
  fingerprint: string;
  target: Budget;
  scope: string;
}
export interface Template {
  id: string;
  name: string;
  state: string;
  budget: SaveBudgetRequest;
  version: string;
}
export const budgetPlanningApi = {
  changes: (id: string, page: number) =>
    apiClient
      .get<
        ApiResponse<{
          items: {
            id: string;
            beforeJson: string;
            afterJson: string;
            reason: string;
            beforeVersion: number;
            afterVersion: number;
            createdAt: string;
          }[];
          total: number;
        }>
      >(`/budget-planning-history/${id}`, { params: { page, pageSize: 10 } })
      .then(unwrap),
  preview: (body: CarryInput) =>
    apiClient
      .post<ApiResponse<CarryPreview>>('/budgets/carryover-preview', body)
      .then(unwrap),
  apply: (body: CarryInput, key: string) =>
    apiClient.post('/budgets/carryover-apply', body, {
      headers: writeHeaders(body.targetVersion, key),
    }),
  correct: (id: string, version: string, body: CarryInput, key: string) =>
    apiClient.post(`/budgets/carryovers/${id}/correct`, body, {
      headers: writeHeaders(version, key),
    }),
  history: (page: number) =>
    apiClient
      .get<
        ApiResponse<{
          items: {
            id: string;
            sourceMonth: string;
            targetMonth: string;
            categoryId?: string;
            amount: string;
            state: string;
            version: string;
            reason: string;
            rule: string;
            parameter: string;
            cap?: string | null;
            carryOverspend: boolean;
          }[];
          total: number;
        }>
      >('/budgets/carryovers', { params: { page, pageSize: 10 } })
      .then(unwrap),
  cancel: (id: string, version: string, reason: string, key: string) =>
    apiClient.post(
      `/budgets/carryovers/${id}/actions`,
      { action: 'Cancel', reason },
      { headers: writeHeaders(version, key) },
    ),
  templates: (page: number) =>
    apiClient
      .get<ApiResponse<{ items: Template[]; total: number }>>(
        '/budget-templates',
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  saveTemplate: (name: string, budget: SaveBudgetRequest, key: string) =>
    apiClient.post(
      '/budget-templates',
      {
        name,
        budget: { total: budget.total, items: budget.items },
        state: 'Active',
      },
      { headers: writeHeaders('0', key) },
    ),
  templatePreview: (
    id: string,
    body: {
      month: string;
      templateVersion: string;
      monthlyVersion: string;
      reason: string;
    },
  ) =>
    apiClient
      .post<ApiResponse<{ before: Budget; draft: SaveBudgetRequest }>>(
        `/budget-templates/${id}/preview`,
        body,
      )
      .then(unwrap),
  templateApply: (
    id: string,
    body: {
      month: string;
      templateVersion: string;
      monthlyVersion: string;
      reason: string;
    },
    key: string,
  ) =>
    apiClient.post(`/budget-templates/${id}/apply`, body, {
      headers: writeHeaders(body.templateVersion, key),
    }),
  copyPreview: (body: {
    sourceMonth: string;
    sourceVersion: string;
    targetMonth: string;
    targetVersion: string;
    reason: string;
  }) =>
    apiClient
      .post<ApiResponse<{ before: Budget; draft: SaveBudgetRequest }>>(
        '/budgets/copy-preview',
        body,
      )
      .then(unwrap),
  copyApply: (
    body: {
      sourceMonth: string;
      sourceVersion: string;
      targetMonth: string;
      targetVersion: string;
      reason: string;
    },
    key: string,
  ) =>
    apiClient.post('/budgets/copy-apply', body, {
      headers: writeHeaders(body.targetVersion, key),
    }),
  settings: () =>
    apiClient
      .get<
        ApiResponse<{
          thresholds: number[];
          enabled: boolean;
          silent: boolean;
          version: string;
        }>
      >('/budget-alerts/settings')
      .then(unwrap),
  saveSettings: (
    body: { thresholds: number[]; enabled: boolean; silent: boolean },
    version: string,
    key: string,
  ) =>
    apiClient.put('/budget-alerts/settings', body, {
      headers: writeHeaders(version, key),
    }),
  evaluate: (month: string, key: string) =>
    apiClient.post(
      '/budget-alerts/evaluate',
      { month },
      { headers: writeHeaders('0', key) },
    ),
  alerts: (page: number) =>
    apiClient
      .get<
        ApiResponse<{
          items: {
            id: string;
            month: string;
            threshold: number;
            silent: boolean;
            dismissed: boolean;
            version: string;
          }[];
          total: number;
        }>
      >('/budget-alerts', { params: { page, pageSize: 10 } })
      .then(unwrap),
  dismiss: (id: string, version: string, key: string) =>
    apiClient.post(
      `/budget-alerts/${id}/dismiss`,
      {},
      { headers: writeHeaders(version, key) },
    ),
};
export const goalApi = {
  list: (currency: string, page: number) =>
    apiClient
      .get<
        ApiResponse<{
          items: GoalView[];
          total: number;
          active: number;
          completed: number;
          target: string;
          reserved: string;
          accounts: ReserveAccount[];
        }>
      >('/savings-goals', { params: { currency, page, pageSize: 12 } })
      .then(unwrap),
  save: (body: GoalInput, version: string, key: string, id?: string) =>
    id
      ? apiClient.put(`/savings-goals/${id}`, body, {
          headers: writeHeaders(version, key),
        })
      : apiClient.post('/savings-goals', body, {
          headers: writeHeaders(version, key),
        }),
  detail: (id: string, page: number) =>
    apiClient
      .get<
        ApiResponse<{
          goal: GoalView;
          accounts: ReserveAccount[];
          allocations: {
            id: string;
            accountId: string;
            amount: string;
            version: string;
          }[];
          history: {
            items: {
              id: string;
              accountId: string;
              action: string;
              before: string;
              after: string;
              reason: string;
              createdAt: string;
            }[];
            total: number;
          };
          changes: {
            items: {
              id: string;
              action: string;
              changesJson: string;
              createdAt: string;
            }[];
            total: number;
          };
        }>
      >(`/savings-goals/${id}`, { params: { page, pageSize: 10 } })
      .then(unwrap),
  preview: (id: string, body: AllocationInput) =>
    apiClient
      .post<ApiResponse<AllocationPreview>>(
        `/savings-goals/${id}/allocation-preview`,
        body,
      )
      .then(unwrap),
  allocate: (
    id: string,
    body: AllocationInput,
    version: string,
    key: string,
    action: 'allocate' | 'release',
  ) =>
    apiClient.post(`/savings-goals/${id}/${action}`, body, {
      headers: writeHeaders(version, key),
    }),
  transfer: (
    id: string,
    body: {
      accountId: string;
      accountVersion: string;
      toGoalId: string;
      toGoalVersion: string;
      amount: string;
      reason: string;
    },
    version: string,
    key: string,
  ) =>
    apiClient.post(`/savings-goals/${id}/transfer`, body, {
      headers: writeHeaders(version, key),
    }),
};
export interface EssentialPolicy {
  id?: string;
  categoryId?: string | null;
  transactionId?: string | null;
  necessity: string;
  essentialRate: string;
  excluded: boolean;
  note: string;
  version?: string;
}
export interface EmergencyResult {
  necessaryExpense: string;
  averageMonthly: string;
  reserved: string;
  availableReserve: string;
  shortage: string;
  coverageMonths: string | null;
  excludedExpense: string;
  unspecifiedExpense: string;
  months: number;
  assumptions: string;
  details: {
    items: {
      transactionId: string;
      categoryId: string;
      amount: string;
      necessary: string;
      excluded: boolean;
    }[];
    total: number;
  };
}
export interface SavingsResult {
  income: string;
  expense: string;
  surplus: string;
  savingsRate: string | null;
  formula: string;
  includeFees: boolean;
  includeAssetLoss: boolean;
  includeDecreasingAdjustments: boolean;
  details: {
    items: { id: string; type: string; occurredAt: string }[];
    total: number;
  };
}
export const indicatorApi = {
  policies: (page: number) =>
    apiClient
      .get<ApiResponse<{ items: EssentialPolicy[]; total: number }>>(
        '/essential-expense-policies',
        { params: { page, pageSize: 20 } },
      )
      .then(unwrap),
  savePolicy: (body: EssentialPolicy, version: string, key: string) =>
    apiClient.put(
      '/essential-expense-policies',
      {
        id: body.id || null,
        categoryId: body.categoryId || null,
        transactionId: body.transactionId || null,
        necessity: body.necessity,
        essentialRate: body.essentialRate,
        excluded: body.excluded,
        note: body.note || '',
      },
      { headers: writeHeaders(version, key) },
    ),
  emergency: (params: {
    currency: string;
    months?: number;
    start?: string;
    end?: string;
    goalIds: string;
    page: number;
    pageSize: number;
  }) =>
    apiClient
      .get<ApiResponse<EmergencyResult>>('/reports/emergency-fund', { params })
      .then(unwrap),
  savings: (params: {
    currency: string;
    months?: number;
    start?: string;
    end?: string;
    page: number;
    pageSize: number;
  }) =>
    apiClient
      .get<ApiResponse<SavingsResult>>('/reports/savings-rate', { params })
      .then(unwrap),
  summary: () =>
    apiClient
      .get<
        ApiResponse<{
          budgetRemaining: string | null;
          savingsRate: string | null;
          emergencyScope: string;
          goals: GoalView[];
          upcoming: {
            id: string;
            name: string;
            expectedDate: string;
            amount: string;
            currency: string;
          }[];
        }>
      >('/financial-planning/summary')
      .then(unwrap),
};
export interface FutureInput {
  name: string;
  expectedDate: string;
  type: string;
  accountId: string;
  toAccountId?: string | null;
  amount: string;
  currency: string;
  receivedAmount?: string | null;
  certainty: string;
  state: string;
  transactionId?: string | null;
  scenarioId?: string | null;
  note: string;
}
export interface FutureItem extends FutureInput {
  id: string;
  version: string;
}
export interface CashForecast {
  sampled?: boolean;
  samplingRule?: string;
  opening: string;
  inflow: string;
  outflow: string;
  closing: string;
  minimum: string;
  minimumDate: string;
  reserved: string;
  availableCash: string;
  nearTermCommitments: string;
  freelyAvailable: string;
  assumptions: string;
  days: { date: string; inflow: string; outflow: string; balance: string }[];
  accounts: {
    id: string;
    name: string;
    type: string;
    opening: string;
    closing: string;
    minimum: string;
    minimumDate: string;
    gap: string;
  }[];
  gaps: {
    accountId: string;
    name: string;
    date: string;
    amount: string;
    kind: string;
  }[];
  events: {
    items: {
      id: string;
      date: string;
      name: string;
      type: string;
      accountId: string;
      toAccountId?: string;
      amount: string;
      currency: string;
      source: string;
      certainty: string;
    }[];
    total: number;
  };
  unresolved: { sourceId: string; name?: string; reason: string }[];
}
export const cashflowApi = {
  changeSources: (id: string, changes: { sourceId: string; amount: string }[], explanation: string, version: string, key: string) => apiClient.put(`/cashflow/scenarios/${id}/changes`, { changes, explanation }, { headers: writeHeaders(version, key) }),
  freeze: (id: string, input: { currency: string; start: string; end: string; accountId?: string; creditFundingAccountId?: string; includeLoanPlans?: boolean }, version: string, key: string) => apiClient.post(`/cashflow/scenarios/${id}/calculate`, input, { headers: writeHeaders(version, key) }),
  archiveScenario: (id: string, name: string, note: string, version: string, key: string) => apiClient.put(`/cashflow/scenarios/${id}`, { name, note, state: 'Archived' }, { headers: writeHeaders(version, key) }),
  calculations: (id: string, page: number) => apiClient.get<ApiResponse<{ items: { id: string; createdAt: string; needsRecalculation: boolean; input: { currency: string }; result: { simulation: CashForecast } }[]; total: number }>>(`/cashflow/scenarios/${id}/calculations`, { params: { page, pageSize: 10 } }).then(unwrap),
  comparison: (params: Record<string, string | number | undefined>) =>
    apiClient.get<ApiResponse<{ baseline: CashForecast; simulation: CashForecast; differences: Record<string, string>; ruleVersion: string; explanation: string }>>('/cashflow/scenario-comparison', { params }).then(unwrap),
  forecast: (params: {
    currency: string;
    start: string;
    end: string;
    accountId?: string;
    creditFundingAccountId?: string;
    scenarioId?: string;
    page: number;
    pageSize: number;
  }) =>
    apiClient
      .get<ApiResponse<CashForecast>>('/cashflow/forecast', { params })
      .then(unwrap),
  events: (currency: string, page: number) =>
    apiClient
      .get<ApiResponse<{ items: FutureItem[]; total: number }>>(
        '/cashflow/events',
        { params: { currency, page, pageSize: 20 } },
      )
      .then(unwrap),
  save: (body: FutureInput, version: string, key: string, id?: string) =>
    id
      ? apiClient.put(`/cashflow/events/${id}`, body, {
          headers: writeHeaders(version, key),
        })
      : apiClient.post('/cashflow/events', body, {
          headers: writeHeaders(version, key),
        }),
  cancel: (id: string, version: string, key: string) =>
    apiClient.post(
      `/cashflow/events/${id}/actions`,
      { action: 'Cancel', reason: '人工取消未来计划' },
      { headers: writeHeaders(version, key) },
    ),
  scenarios: (page: number) =>
    apiClient
      .get<
        ApiResponse<{
          items: {
            id: string;
            name: string;
            state: string;
            note: string;
              changes: { sourceId: string; amount: string }[];
            version: string;
          }[];
          total: number;
        }>
      >('/cashflow/scenarios', { params: { page, pageSize: 20 } })
      .then(unwrap),
  saveScenario: (name: string, key: string) =>
    apiClient.post(
      '/cashflow/scenarios',
      { name, state: 'Active', note: '' },
      { headers: writeHeaders('0', key) },
    ),
};

