import { expect, it } from 'vitest';
import {
  prepareOperation,
  pendingOperations,
  completeOperation,
} from '../stores/operationJournal';
it.each([
  '/life-simulator/snapshots',
  '/life-simulator/runs',
  '/life-simulator/monte-carlo',
  '/life-simulator/scenarios',
  '/life-simulator/scenarios/11111111-1111-4111-8111-111111111111/delete',
])('simulation writes recover safely: %s', async (path) => {
  const user = 'life-' + crypto.randomUUID();
  const request = {
    key: crypto.randomUUID(),
    method: 'post',
    path,
    body: { test: true },
    version: '0',
  };
  const a = await prepareOperation(user, request);
  const b = await prepareOperation(user, {
    ...request,
    key: crypto.randomUUID(),
  });
  expect(b.operation.key).toBe(a.operation.key);
  expect(pendingOperations(user)).toHaveLength(1);
  completeOperation(user, a.operation.key);
  expect(pendingOperations(user)).toHaveLength(0);
});
it('does not make real account commands available through simulator paths', async () => {
  await expect(
    prepareOperation('life-bad', {
      key: crypto.randomUUID(),
      method: 'post',
      path: '/life-simulator/accounts',
      body: {},
    }),
  ).rejects.toThrow();
});
