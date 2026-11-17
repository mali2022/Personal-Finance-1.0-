import { apiClient } from './client';
import type { ApiResponse } from '../types';
import { t } from '../i18n';
import { useUI } from '../stores/ui';
import type { AiAnalysisReport } from '../components/ai/types';

export interface AiPrivacy {
  fullFinancialAccess?: boolean;
  personalReadAccess?: boolean;
  enabled: boolean;
  allowSummary: boolean;
  allowDetails: boolean;
  allowPayroll: boolean;
  allowFamily: boolean;
  allowRecognitionText: boolean;
  saveHistory?: boolean;
}
export interface AiSettings {
  provider: string;
  enabled: boolean;
  configured: boolean;
  model: string;
  reasoningModel: string;
  privacy: AiPrivacy;
  transmission: string;
  legacyModels: string;
  dailyCallLimit: number;
  capabilities: Record<string, string>;
  documentation: string;
  foundationVersion?: number;
  historyRetentionDays?: number;
}
export interface AiSource {
  tool: string;
  start: string;
  end: string;
  currency: string;
  scope: string;
  source: string;
  detailLink: string;
  queriedAt: string;
  data: unknown;
  truncated: boolean;
}
export interface AiAnswer {
  analysis?: AiAnalysisReport;
  conversationId: string;
  answer: string;
  sources: AiSource[];
  model: string;
  financialDataVerified: boolean;
  requestId?: string;
  accountIds?: string[];
  messageId?: string;
}
export interface AiConversation {
  kind?: 'Chat' | 'Report';
  updatedAt?: string;
  id: string;
  title: string;
  archived: boolean;
  version: string;
  accountScopeJson?: string;
}
export interface AiConversationDetail {
  conversation: AiConversation & { accountIds: string[] | null };
  items: { id: string; question: string; result: AiAnswer; feedback: number }[];
  total: number;
  page: number;
  pageSize: number;
}
export interface AiDraft {
  parsed: {
    intent: string;
    amount: string | null;
    currency: string;
    date: string | null;
    accountHint: string | null;
    categoryHint: string | null;
    merchant: string | null;
    amountAmbiguous: boolean;
    unconfirmedFields: string[];
    confidence: number | null;
    note?: string;
    tagHints?: string[];
    categoryPath?: string[];
  };
  accountId: string | null;
  categoryId: string | null;
  requiresSpecialWorkflow: boolean;
  warnings: string[];
  canOpenEntry: boolean;
  source: string;
  recognitionConfidence: number | null;
  draftId?: string;
  version?: string;
  tagIds?: string[];
  classificationSource?: string;
}
export interface AiUsage {
  items: {
    id: string;
    model: string;
    requestedAt: string;
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
    estimatedCost: number | null;
    priceCurrency: string;
    errorCode: string | null;
    attempt: number;
    feature: string;
  }[];
  costNote: string;
}
export const aiApi = {
  settings: () =>
    apiClient
      .get<ApiResponse<AiSettings>>('/ai/settings')
      .then((r) => r.data.data),
  privacy: (body: AiPrivacy) => apiClient.put('/ai/privacy', body),
  usage: () =>
    apiClient.get<ApiResponse<AiUsage>>('/ai/usage').then((r) => r.data.data),
  test: () => apiClient.post('/ai/test-connection', {}, { timeout: 180000 }),
  clear: (id: string) =>
    apiClient.delete(`/ai/conversations/${encodeURIComponent(id)}`),
  conversations: (
    search = '',
    archived = false,
    page = 1,
    kind?: 'Chat' | 'Report',
  ) =>
    apiClient
      .get<ApiResponse<{ items: AiConversation[]; total: number }>>(
        '/ai/conversations',
        { params: { search, archived, page, kind } },
      )
      .then((r) => r.data.data),
  conversation: (id: string, page = 1) =>
    apiClient
      .get<ApiResponse<AiConversationDetail>>(
        `/ai/conversations/${encodeURIComponent(id)}`,
        { params: { page } },
      )
      .then((r) => r.data.data),
  changeConversation: (
    id: string,
    version: string,
    title?: string,
    archived?: boolean,
  ) =>
    apiClient.patch(`/ai/conversations/${encodeURIComponent(id)}`, {
      version,
      title,
      archived,
    }),
  feedback: (id: string, rating: number) =>
    apiClient.put(`/ai/messages/${encodeURIComponent(id)}/feedback`, {
      rating,
    }),
  draft: (
    text: string,
    signal: AbortSignal,
    source = 'typed',
    corrected = false,
    recognitionConfidence?: number,
  ) =>
    apiClient
      .post<ApiResponse<AiDraft>>(
        '/ai/drafts',
        { text, source, corrected, recognitionConfidence },
        { timeout: 180000, signal },
      )
      .then((r) => r.data.data),
  drafts: (page = 1) =>
    apiClient
      .get<ApiResponse<{ items: AiDraft[]; total: number }>>('/ai/drafts', {
        params: { page },
      })
      .then((r) => r.data.data),
  draftBatch: (texts: string[], signal: AbortSignal) =>
    apiClient
      .post<
        ApiResponse<{
          items: {
            index: number;
            draft: AiDraft | null;
            error: string | null;
          }[];
          unprocessed: number;
        }>
      >(
        '/ai/drafts/batch',
        { items: texts.map((text) => ({ text })) },
        { timeout: 180000, signal },
      )
      .then((r) => r.data.data),
  deleteDraft: (id: string, version: string, key: string) =>
    apiClient.delete(`/ai/drafts/${encodeURIComponent(id)}`, {
      data: { version },
      headers: { 'Idempotency-Key': key },
    }),
  confirmDrafts: (
    items: {
      id: string;
      version: string;
      transaction: {
        type: string;
        amount: string;
        accountId: string;
        occurredAt: string;
        categoryId: string;
        merchant?: string | null;
        note?: string;
        tagIds?: string[];
        aiDuplicateAcknowledged: boolean;
      };
    }[],
    key: string,
  ) =>
    apiClient
      .post<ApiResponse<{ confirmed: number; transactionIds: string[] }>>(
        '/ai/drafts/confirm-batch',
        { items },
        { headers: { 'Idempotency-Key': key } },
      )
      .then((r) => r.data.data),
  chat: async (
    message: string,
    conversationId: string | undefined,
    signal: AbortSignal,
    onDelta: (text: string) => void,
    accountIds?: string[],
    onProgress?: (progress: {
      stage: string;
      tool?: string;
      callId?: string;
    }) => void,
    report = false,
  ): Promise<AiAnswer> => {
    // Reuse the authenticated client and its session epoch checks. No model key in browser storage.
    const response = await apiClient.post<ReadableStream<Uint8Array>>(
      '/ai/chat/stream',
      {
        message,
        conversationId,
        accountIds,
        language: useUI.getState().language,
        report,
      },
      { adapter: 'fetch', responseType: 'stream', timeout: 180000, signal },
    );
    const reader = response.data.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let result: AiAnswer | undefined;
    try {
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        if (pending.length > 2000000) throw new Error(t('AI 回复超出长度限制'));
        let boundary: number;
        while ((boundary = pending.indexOf('\n\n')) >= 0) {
          const event = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          const type = event
            .split('\n')
            .find((line) => line.startsWith('event:'))
            ?.slice(6)
            .trim();
          const data = event
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (!data) continue;
          const body = JSON.parse(data);
          if (type === 'delta') onDelta(body.text);
          if (type === 'progress') onProgress?.(body);
          if (type === 'error')
            throw new Error(body.message || t('AI 服务不可用'));
          if (type === 'completed') result = body as AiAnswer;
        }
        if (done) break;
      }
      if (!result) throw new Error(t('回复中断，未完成的内容不可作为财务结论'));
      return result;
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  },
};
