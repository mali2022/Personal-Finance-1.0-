import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { completeOperation, pendingOperations, prepareOperation } from '../stores/operationJournal';
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal('crypto', webcrypto); });
it.each(['/physical-categories', `/physical-categories/${id}`, `/physical-categories/${id}/remove`, ...['profile', 'rules', 'events', 'costs', `costs/${id}/reverse`].map(x => `/physical-assets/${id}/${x}`)])('recovers physical write %s using the original key', async path => {
  const input = { key: crypto.randomUUID(), method: path.endsWith('/profile') ? 'put' : 'post', path, body: { reason: '测试' }, version: '2' };
  const first = await prepareOperation('physical-test', input);
  const retry = await prepareOperation('physical-test', { ...input, key: crypto.randomUUID() });
  expect(retry.operation.key).toBe(first.operation.key); expect(pendingOperations('physical-test')).toHaveLength(1);
  completeOperation('physical-test', first.operation.key); expect(pendingOperations('physical-test')).toHaveLength(0);
});
