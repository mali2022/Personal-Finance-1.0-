import { apiClient } from './client';
import type { ApiResponse } from '../types';
import type { AiPrivacy, AiSource } from './ai';
import type { AiAnalysisReport } from '../components/ai/types';

export interface AgentConfiguration {
  mode: 'Suggest' | 'Confirm' | 'Auto';
  model: string;
  contextTokens: number;
  outputTokens: number;
  tokenBudget: number;
  toolBudget: number;
  modelCallBudget: number;
  timeoutSeconds: number;
  concurrentTasks: number;
  maxRetries: number;
  dailyCostBudget?: number | null;
  monthlyCostBudget?: number | null;
  accountIds?: string[] | null;
  memoryEnabled: boolean;
  transmitDescriptions: boolean;
  historyRetentionDays?: number | null;
  persona: string;
  style: string;
  detailLevel: 'Concise' | 'Standard' | 'Detailed';
  analysisDepth: string;
  classificationPreferences: string;
  statisticalPreferences: string;
  reminderRules: string;
  reportTemplate: string;
  analysisPeriod: string;
}
export interface AgentSettings {
  enabled: boolean;
  configured: boolean;
  priceCurrency: string;
  configuration: AgentConfiguration;
  version: string;
  emergencyStopped: boolean;
  privacy: AiPrivacy;
  models: {
    id: string;
    contextTokens: number;
    maxOutputTokens: number;
    supportsTools: boolean;
    reasoning: boolean;
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
  }[];
  limits: {
    maxTaskTokens: number;
    maxTaskTools: number;
    maxTaskModelCalls: number;
    maxTaskSeconds: number;
    maxConcurrentRequests: number;
  };
  tools: {
    name: string;
    description: string;
    write: boolean;
    permission: string;
  }[];
}
export interface AgentTask {
  analysis?: AiAnalysisReport;
  id: string;
  prompt: string;
  state: string;
  mode: string;
  answer?: string;
  errorCode?: string;
  toolCalls: number;
  modelCalls: number;
  tokensUsed: number;
  createdAt: string;
  updatedAt: string;
  version: string;
  configuration: AgentConfiguration;
  sources: AiSource[];
}
export type AgentTaskSummary = Pick<
  AgentTask,
  'id' | 'prompt' | 'state' | 'mode' | 'createdAt' | 'updatedAt' | 'version'
>;
export interface AgentStep {
  id: string;
  sequence: number;
  tool: string;
  state: string;
  highRisk: boolean;
  planHash: string;
  argumentsJson: string;
  previewJson: string;
  resultJson?: string;
  errorCode?: string;
}
export interface AgentDetail {
  task: AgentTask;
  steps: AgentStep[];
}
export interface AgentGrant {
  id: string;
  tool: string;
  accountIdsJson: string;
  maxAffectedRecords: number;
  highRisk: boolean;
  expiresAt?: string;
  revokedAt?: string;
  version: number;
}
export interface AgentMemory {
  id: string;
  title: string;
  content: string;
  accountIdsJson: string;
  enabled: boolean;
  expiresAt?: string;
  version: number;
}
export interface AgentWorkflow {
  id: string;
  name: string;
  prompt: string;
  accountIdsJson: string;
  enabled: boolean;
  intervalMinutes?: number;
  nextRunAt?: string;
  version: number;
}
export interface AgentReport {
  id: string;
  title: string;
  content: string;
  assumptions: string;
  sourcesJson: string;
  taskId?: string;
  createdAt: string;
}
export interface AgentLog {
  id: string;
  taskId?: string;
  kind: string;
  detail: string;
  createdAt: string;
}
async function get<T>(path: string, params?: object) {
  return (await apiClient.get<ApiResponse<T>>(`/ai/agent${path}`, { params }))
    .data.data;
}
const headers = () => ({ 'Idempotency-Key': crypto.randomUUID() });
export const agentApi = {
  settings: () => get<AgentSettings>('/settings'),
  saveSettings: (configuration: AgentConfiguration, version: string) =>
    apiClient.put('/ai/agent/settings', { configuration, version }),
  stop: () => apiClient.post('/ai/agent/stop'),
  resume: (version: string) => apiClient.post('/ai/agent/resume', { version }),
  tasks: (page = 1) =>
    get<{ items: AgentTaskSummary[]; total: number }>('/tasks', { page }),
  create: async (
    prompt: string,
    conversationId?: string,
    accountIds?: string[],
  ) =>
    (
      await apiClient.post<ApiResponse<AgentTask>>(
        '/ai/agent/tasks',
        { prompt, conversationId, accountIds },
        { headers: headers() },
      )
    ).data.data,
  detail: (id: string) => get<AgentDetail>(`/tasks/${encodeURIComponent(id)}`),
  approve: (
    id: string,
    version: string,
    planHashes: string[],
    highRisk: boolean,
  ) =>
    apiClient.post(`/ai/agent/tasks/${encodeURIComponent(id)}/approve`, {
      version,
      planHashes,
      highRisk,
    }),
  stopTask: (id: string) =>
    apiClient.post(`/ai/agent/tasks/${encodeURIComponent(id)}/stop`),
  retry: (id: string, version: string) =>
    apiClient.post(`/ai/agent/tasks/${encodeURIComponent(id)}/retry`, {
      version,
    }),
  grants: () => get<AgentGrant[]>('/grants'),
  grant: (body: {
    tool: string;
    accountIds: string[];
    maxAffectedRecords: number;
    expiresAt?: string;
  }) => apiClient.post('/ai/agent/grants', body, { headers: headers() }),
  revoke: (id: string, version: number) =>
    apiClient.delete(`/ai/agent/grants/${encodeURIComponent(id)}`, {
      data: { version: String(version) },
    }),
  memories: () => get<AgentMemory[]>('/memories'),
  saveMemory: (
    id: string,
    body: {
      title: string;
      content: string;
      enabled: boolean;
      accountIds?: string[];
      expiresAt?: string;
      version?: string;
    },
  ) => apiClient.put(`/ai/agent/memories/${encodeURIComponent(id)}`, body),
  deleteMemory: (id: string, version: number) =>
    apiClient.delete(`/ai/agent/memories/${encodeURIComponent(id)}`, {
      data: { version: String(version) },
    }),
  workflows: () => get<AgentWorkflow[]>('/workflows'),
  saveWorkflow: (
    id: string,
    body: {
      name: string;
      prompt: string;
      enabled: boolean;
      intervalMinutes?: number;
      nextRunAt?: string;
      accountIds?: string[];
      version?: string;
    },
  ) => apiClient.put(`/ai/agent/workflows/${encodeURIComponent(id)}`, body),
  runWorkflow: (id: string) =>
    apiClient.post(
      `/ai/agent/workflows/${encodeURIComponent(id)}/run`,
      {},
      { headers: headers() },
    ),
  reports: (page = 1) =>
    get<{ items: AgentReport[]; total: number }>('/reports', { page }),
  logs: (page = 1) =>
    get<{ items: AgentLog[]; total: number }>('/logs', { page }),
};
