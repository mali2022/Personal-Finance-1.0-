import type { Page } from '@playwright/test';
export const agentConfiguration = {
  mode: 'Confirm',
  model: 'fixture-model',
  contextTokens: 60000,
  outputTokens: 4096,
  tokenBudget: 250000,
  toolBudget: 128,
  modelCallBudget: 64,
  timeoutSeconds: 1800,
  concurrentTasks: 2,
  maxRetries: 3,
  memoryEnabled: false,
  transmitDescriptions: false,
  accountIds: null,
  historyRetentionDays: null,
  persona: '',
  style: '',
  detailLevel: 'Detailed',
  analysisDepth: '',
  classificationPreferences: '',
  statisticalPreferences: '',
  reminderRules: '',
  reportTemplate: '',
  analysisPeriod: '',
};
export const agentSettings = {
  enabled: true,
  configured: true,
  configuration: agentConfiguration,
  version: '2',
  emergencyStopped: false,
  priceCurrency: 'USD',
  privacy: {
    enabled: true,
    saveHistory: true,
    allowSummary: true,
    allowDetails: true,
  },
  models: [
    {
      id: 'fixture-model',
      contextTokens: 65536,
      maxOutputTokens: 8192,
      supportsTools: true,
    },
  ],
  limits: {
    maxTaskTokens: 10000000,
    maxTaskTools: 10000,
    maxTaskModelCalls: 2000,
    maxTaskSeconds: 86400,
    maxConcurrentRequests: 4,
  },
  tools: [
    {
      name: 'BatchUpdateTransactions',
      write: true,
      permission: 'details',
      description: '批量整理',
    },
  ],
  readTools: [],
};
export function agentFixture(path: string) {
  if (path.endsWith('/settings')) return agentSettings;
  if (/\/(grants|memories|workflows)$/.test(path)) return [];
  return { items: [], total: 0 };
}
export async function prepareAgent(page: Page, highRisk = false) {
  const task = {
    id: '98f1a21a-b9d4-4394-b4e5-3ad80c17fc11',
    prompt: '跨账户分析并整理商户',
    state: 'AwaitingApproval',
    mode: 'Confirm',
    version: '3',
    modelCalls: 2,
    toolCalls: 3,
    tokensUsed: 9600,
    createdAt: '2026-10-07T12:00:00Z',
    configuration: agentConfiguration,
    sources: [],
  };
  const hash = 'a'.repeat(64);
  const step = {
    id: 'step',
    sequence: 1,
    tool: highRisk ? 'BatchDeleteTransactions' : 'BatchUpdateTransactions',
    state: 'Planned',
    highRisk,
    planHash: hash,
    argumentsJson: JSON.stringify({
      items: [{ id: 'transaction', version: '2' }],
      changes: { setMerchant: true, merchant: '统一商户' },
    }),
    previewJson: JSON.stringify({
      affectedRecords: 1,
      changes: [
        { before: { merchant: '旧商户' }, after: { merchant: '统一商户' } },
      ],
    }),
  };
  let approved: unknown;
  let settingsBody: unknown;
  let stopped = false;
  await page.context().route('**/api/ai/agent/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/approve')) {
      approved = route.request().postDataJSON();
      task.state = 'Completed';
      step.state = 'Completed';
      await route.fulfill({ json: { data: { completed: true } } });
      return;
    }
    if (
      url.pathname.endsWith('/settings') &&
      route.request().method() === 'PUT'
    ) {
      settingsBody = route.request().postDataJSON();
      await route.fulfill({ json: { data: { saved: true } } });
      return;
    }
    if (url.pathname.endsWith('/stop')) {
      stopped = true;
      await route.fulfill({ json: { data: { stopped: true } } });
      return;
    }
    const data = url.pathname.endsWith('/tasks')
      ? { items: [task], total: 1 }
      : url.pathname.endsWith(task.id)
        ? { task, steps: [step] }
        : agentFixture(url.pathname);
    await route.fulfill({ json: { data } });
  });
  return {
    task,
    step,
    hash,
    approved: () => approved,
    settingsBody: () => settingsBody,
    stopped: () => stopped,
  };
}
