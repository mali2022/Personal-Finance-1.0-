import { afterAll, beforeAll, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { apiClient } from '../api/client';
import { categoryApi, transactionApi } from '../api/finance';
const server = setupServer(...handlers);
beforeAll(() => {
  apiClient.defaults.baseURL = window.location.origin + '/api';
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => server.close());
it('分类编辑与全量同级排序拒绝旧版本；无引用分类可预览删除', async () => {
  await categoryApi.save({
    id: '',
    name: '版本测试',
    kind: 'Expense',
    status: 'Active',
    sortOrder: 50,
    version: '0',
  });
  const c = (await categoryApi.list()).find((c) => c.name === '版本测试')!;
  await categoryApi.save({ ...c, name: '版本测试已改' }, c.id);
  await expect(categoryApi.save(c, c.id)).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  });
  const siblings = (await categoryApi.list()).filter(
    (x) => !x.parentId && x.kind === c.kind,
  );
  const snapshot = siblings.map((c) => ({ id: c.id, version: c.version }));
  await categoryApi.reorder(snapshot);
  await expect(categoryApi.reorder(snapshot)).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  });
  const preview = await categoryApi.deletionPreview(c.id);
  expect(preview.canDelete).toBe(true);
  await expect(categoryApi.remove(c.id, c.version)).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  });
  await categoryApi.remove(c.id, preview.version);
  expect((await categoryApi.list()).some((x) => x.id === c.id)).toBe(false);
});
it('有历史交易或子分类的分类禁止删除', async () => {
  const preview = await categoryApi.deletionPreview('lunch');
  expect(preview.canDelete).toBe(false);
  await expect(
    categoryApi.remove('lunch', preview.version),
  ).rejects.toMatchObject({ code: 'CATEGORY_IN_USE' });
  expect(
    (await categoryApi.deletionPreview('food')).references.some(
      (r) => r.kind === 'children' && r.count > 0,
    ),
  ).toBe(true);
});
it('普通交易恢复必须携带删除后的版本', async () => {
  const created = await transactionApi.save({
    type: 'Expense',
    amount: '1.00',
    accountId: 'alipay',
    categoryId: 'lunch',
    occurredAt: new Date().toISOString(),
    note: '',
    tagIds: [],
    splits: [],
    fee: '0.00',
  });
  const t = await transactionApi.detail(created.data.data.id);
  await transactionApi.remove(t.id, t.version);
  await expect(transactionApi.restore(t.id, t.version)).rejects.toMatchObject({
    code: 'VERSION_CONFLICT',
  });
  const current = await transactionApi.detail(t.id);
  await transactionApi.restore(t.id, current.version);
  await expect(
    transactionApi.restore(t.id, current.version),
  ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
});
