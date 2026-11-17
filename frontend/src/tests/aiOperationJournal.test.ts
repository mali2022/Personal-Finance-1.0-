import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { aiApi } from '../api/ai';
import { apiClient, authApi, setAccessToken } from '../api/client';
import { pendingOperations } from '../stores/operationJournal';

const draftId = '11111111-1111-1111-1111-111111111111';
const response = (config: InternalAxiosRequestConfig, data: unknown) => ({
  config,
  data: { data },
  status: 200,
  statusText: 'OK',
  headers: {},
});
const originalAdapter = apiClient.defaults.adapter;
beforeEach(() => {
  vi.stubEnv('VITE_ENABLE_MOCK', 'false');
  vi.stubGlobal('crypto', webcrypto);
  sessionStorage.clear();
  setAccessToken('authenticated');
});
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  setAccessToken();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('生产模式 AI 草稿操作日志', () => {
  it.each(['delete', 'confirm'] as const)(
    '已登录用户的 %s 请求能到达服务端并清理日志',
    async (action) => {
      const writes: InternalAxiosRequestConfig[] = [];
      apiClient.defaults.adapter = (async (config) => {
        if (config.url === '/auth/me') return response(config, { id: 'owner' });
        writes.push(config);
        expect(pendingOperations('owner')).toHaveLength(1);
        expect(config.headers['X-Operation-Fingerprint']).toMatch(
          /^[a-f0-9]{64}$/,
        );
        return response(config, {
          confirmed: 1,
          transactionIds: ['transaction'],
        });
      }) satisfies AxiosAdapter;
      await authApi.me();
      if (action === 'delete')
        await aiApi.deleteDraft(draftId, '3', 'draft-delete');
      else await aiApi.confirmDrafts([], 'draft-confirm');
      expect(writes).toHaveLength(1);
      expect(writes[0].url).toBe(
        action === 'delete'
          ? `/ai/drafts/${draftId}`
          : '/ai/drafts/confirm-batch',
      );
      expect(pendingOperations('owner')).toEqual([]);
    },
  );

  it('刷新后可复用 AI 批量确认的已保存结果，不重复发送写请求', async () => {
    let writes = 0;
    apiClient.defaults.adapter = async (config) => {
      if (config.url === '/auth/me') return response(config, { id: 'owner' });
      if (config.url?.startsWith('/operations/'))
        return response(config, {
          state: 'Completed',
          key: 'original',
          method: 'POST',
          path: '/api/ai/drafts/confirm-batch',
          result: { confirmed: 1, transactionIds: ['saved'] },
        });
      writes++;
      throw new Error('response lost');
    };
    await authApi.me();
    await expect(aiApi.confirmDrafts([], 'original')).rejects.toBeDefined();
    expect(pendingOperations('owner')).toHaveLength(1);
    const result = await aiApi.confirmDrafts([], 'new-random-key');
    expect(result.transactionIds).toEqual(['saved']);
    expect(writes).toBe(1);
    expect(pendingOperations('owner')).toEqual([]);
  });
});
