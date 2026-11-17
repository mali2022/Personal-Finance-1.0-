import { describe, it, expect } from 'vitest';
import {
  prepareOperation,
  setJournalOwner,
  pendingOperations,
} from '../stores/operationJournal';
import { blank } from '../features/festivals/api';
describe('festival integration safety', () => {
  it('journals festival writes with ownership and optimistic version', async () => {
    sessionStorage.clear();
    setJournalOwner('festival-test');
    const operation = await prepareOperation('festival-test', {
      key: 'festival-write',
      method: 'post',
      path: '/festivals',
      body: blank(),
      version: '0',
    });
    expect(operation.operation.key).toBe('festival-write');
    expect(pendingOperations('festival-test')[0].version).toBe('0');
    expect(pendingOperations('festival-test')).toHaveLength(1);
    sessionStorage.clear();
    setJournalOwner();
  });
  it('rejects unsupported festival operation paths', async () => {
    await expect(
      prepareOperation('festival-test', {
        key: 'unsafe',
        method: 'post',
        path: '/festivals/delete-all',
        body: {},
        version: '0',
      }),
    ).rejects.toThrow();
  });
  it('starts with no commitments or real ledger references', () => {
    const input = blank();
    expect(input.purchases).toEqual([]);
    expect(input.reserved).toBe(0);
    expect(input.state).toBe('Planning');
  });
});
