import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  completeOperation,
  pendingOperations,
  prepareOperation,
} from '../stores/operationJournal';

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
});
const body = { type: 'Expense', amount: '12.34', note: '测试原请求' };
const input = () => ({
  key: crypto.randomUUID(),
  method: 'post',
  path: '/transactions/expense',
  body,
});
describe('跨刷新请求记录', () => {
  it('账户分组删除支持恢复、复用幂等键和完成后清理',async()=>{
    const request={...input(),method:'delete',path:'/account-groups/11111111-1111-4111-8111-111111111111',body:undefined,version:'2'};
    const first=await prepareOperation('group-user',request);
    expect(pendingOperations('group-user')[0]).toEqual(first.operation);
    const retry=await prepareOperation('group-user',{...request,key:crypto.randomUUID()});
    expect(retry.operation.key).toBe(first.operation.key);
    completeOperation('group-user',first.operation.key);
    expect(pendingOperations('group-user')).toEqual([]);
  });
  it.each(['/account-groups','/account-groups/not-a-guid','/account-groups/11111111-1111-4111-8111-111111111111/members'])('分组删除拒绝未开放路径 %s',async path=>{
    await expect(prepareOperation('group-user',{...input(),method:'delete',path})).rejects.toThrow('请求地址不支持安全恢复');
  });
  it.each(['/fuel/vehicles','/fuel/records','/fuel/records/11111111-1111-1111-1111-111111111111','/fuel/vehicles/11111111-1111-1111-1111-111111111111/delete'])('加油写入 %s 可安全恢复',async path=>{
    const saved=await prepareOperation('fuel-user',{...input(),path});expect(pendingOperations('fuel-user')[0].key).toBe(saved.operation.key);
  });
  it.each(['/time-assets/activities', '/time-assets/batch', '/time-assets/timer', '/time-assets/timer/11111111-1111-1111-1111-111111111111/pause', '/time-assets/projects', '/time-assets/links', '/time-assets/activities/11111111-1111-1111-1111-111111111111/delete'])('时间资产请求 %s 可安全恢复', async path => {
    const saved = await prepareOperation('time-user', { ...input(), path });
    expect(pendingOperations('time-user')[0].key).toBe(saved.operation.key);
    completeOperation('time-user', saved.operation.key);
    expect(pendingOperations('time-user')).toEqual([]);
  });
  it.each([
    '/merchant-master/11111111-1111-1111-1111-111111111111/aliases',
    '/merchant-master/11111111-1111-1111-1111-111111111111/merge',
    '/merchant-master/aliases/11111111-1111-1111-1111-111111111111/remove',
    '/imports/11111111-1111-1111-1111-111111111111/normalize-merchants',
    '/imports/11111111-1111-1111-1111-111111111111/cleaning/22222222-2222-2222-2222-222222222222/undo',
    '/imports/11111111-1111-1111-1111-111111111111/suggestions/22222222-2222-2222-2222-222222222222/decision',
  ])('4.1.2 %s 写入可恢复且完成后清除', async (path) => {
    const saved = await prepareOperation('import412-user', {
      ...input(),
      path,
      version: '2',
    });
    expect(pendingOperations('import412-user')[0].key).toBe(
      saved.operation.key,
    );
    completeOperation('import412-user', saved.operation.key);
    expect(pendingOperations('import412-user')).toEqual([]);
  });
  it.each([
    '/reports/center/archives',
    '/reports/center/preferences',
    '/reports/center/archives/11111111-1111-1111-1111-111111111111/delete',
  ])('报告中心 %s 的写入可恢复', async (path) => {
    const saved = await prepareOperation('report-user', { ...input(), path });
    expect(pendingOperations('report-user')[0].key).toBe(saved.operation.key);
    completeOperation('report-user', saved.operation.key);
    expect(pendingOperations('report-user')).toEqual([]);
  });
  it.each(['slips', 'plans', 'contributions'])(
    '薪酬 %s 删除可以记录、恢复并完成',
    async (kind) => {
      const request = {
        ...input(),
        method: 'delete',
        path:
          '/payroll-center/' + kind + '/11111111-1111-1111-1111-111111111111',
        body: undefined,
        version: '7',
      };
      const first = await prepareOperation('payroll-user', request);
      expect(pendingOperations('payroll-user')[0]).toEqual(first.operation);
      expect(
        (
          await prepareOperation('payroll-user', {
            ...request,
            key: crypto.randomUUID(),
          })
        ).operation.key,
      ).toBe(first.operation.key);
      completeOperation('payroll-user', first.operation.key);
      expect(pendingOperations('payroll-user')).toEqual([]);
    },
  );
  it.each([
    '/payroll-center/employers/11111111-1111-1111-1111-111111111111',
    '/payroll-center/plans/not-a-guid',
    '/directory/merchants',
  ])('仍拒绝未开放删除路径 %s', async (path) => {
    await expect(
      prepareOperation('payroll-user', { ...input(), method: 'delete', path }),
    ).rejects.toThrow('请求地址不支持安全恢复');
  });
  it.each([
    '/directory/merchants',
    '/directory/projects',
    '/investments/assets',
    '/investments/boundary-values',
    '/investments/assets/11111111-1111-1111-1111-111111111111/project',
    '/product-prices',
    '/business',
  ])('模板导入路径 %s 可记录、复用并完成', async (path) => {
    const first = await prepareOperation('import-user', { ...input(), path });
    expect(pendingOperations('import-user')[0]).toEqual(first.operation);
    expect(
      (await prepareOperation('import-user', { ...input(), path })).operation
        .key,
    ).toBe(first.operation.key);
    completeOperation('import-user', first.operation.key);
    expect(pendingOperations('import-user')).toEqual([]);
  });
  it.each([
    ['post', '/ai/drafts/confirm-batch'],
    ['delete', '/ai/drafts/11111111-1111-1111-1111-111111111111'],
  ])('AI 草稿 %s %s 可保存、读取与复用', async (method, path) => {
    const first = await prepareOperation('alice', { ...input(), method, path });
    expect(pendingOperations('alice')[0]).toEqual(first.operation);
    const retry = await prepareOperation('alice', { ...input(), method, path });
    expect(retry.operation.key).toBe(first.operation.key);
    expect(retry.reused).toBe(true);
  });
  it.each([
    ['put', '/ai/drafts/confirm-batch'],
    ['delete', '/ai/drafts/confirm-batch'],
    ['post', '/ai/drafts/11111111-1111-1111-1111-111111111111'],
    ['delete', '/ai/drafts/not-a-guid'],
    ['post', '/ai/drafts/batch'],
    ['post', '/ai/chat/stream'],
  ])('AI 恢复白名单拒绝非指定方法和路径 %s %s', async (method, path) => {
    await expect(
      prepareOperation('alice', { ...input(), method, path }),
    ).rejects.toThrow();
    sessionStorage.setItem(
      'pf.operations.v1:alice',
      JSON.stringify([
        {
          ...input(),
          method,
          path,
          fingerprint: 'untrusted',
          createdAt: new Date().toISOString(),
        },
      ]),
    );
    expect(() => pendingOperations('alice')).toThrow('待确认请求记录损坏');
  });
  it('账户删除请求可以跨刷新恢复，其他DELETE路径仍拒绝', async () => {
    const request = {
      key: crypto.randomUUID(),
      method: 'delete',
      path: '/accounts/11111111-1111-1111-1111-111111111111',
      body: undefined,
      version: '3',
    };
    const saved = await prepareOperation('account-owner', request);
    expect(pendingOperations('account-owner')[0].key).toBe(saved.operation.key);
    expect(
      (
        await prepareOperation('account-owner', {
          ...request,
          key: crypto.randomUUID(),
        })
      ).operation.key,
    ).toBe(saved.operation.key);
    await expect(
      prepareOperation('account-owner', {
        ...request,
        path: '/transactions/11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toThrow();
  });
  it.each([
    '/currencies/USD',
    '/fund-holds',
    '/fund-holds/11111111-1111-1111-1111-111111111111/actions',
    '/prepayments/11111111-1111-1111-1111-111111111111/settle',
    '/payroll',
    '/payroll/11111111-1111-1111-1111-111111111111/reconcile',
    '/payroll/11111111-1111-1111-1111-111111111111/unlink',
    '/social-contributions',
    '/housing-fund',
    '/payment-instruments',
    '/authorized-payments',
    '/external-payment-facts',
    '/product-prices',
    '/product-prices/defaults',
    '/directory/tags/defaults',
    '/living-cost/baskets',
    '/advances',
    '/advances/groups',
    '/advances/plans',
    '/advances/plans/11111111-1111-1111-1111-111111111111',
    '/advances/plans/11111111-1111-1111-1111-111111111111/purchase',
    '/advances/plans/11111111-1111-1111-1111-111111111111/cancel',
    '/fund-holds/11111111-1111-1111-1111-111111111111/correct',
    '/prepayments/11111111-1111-1111-1111-111111111111/correct',
    '/advances/11111111-1111-1111-1111-111111111111/resolve',
    '/promotions',
    '/promotions/11111111-1111-1111-1111-111111111111',
    '/promotions/transfer-drafts',
    '/promotions/transfer-drafts/11111111-1111-1111-1111-111111111111/confirm',
    '/cashbacks/11111111-1111-1111-1111-111111111111/recover',
    '/promotions/transfer-drafts/11111111-1111-1111-1111-111111111111/revoke',
    '/cashback-recoveries/11111111-1111-1111-1111-111111111111/revoke',
    '/cashbacks',
    '/cashbacks/11111111-1111-1111-1111-111111111111/settle',
    '/cashbacks/11111111-1111-1111-1111-111111111111/revoke',
    '/promotion-usages/11111111-1111-1111-1111-111111111111/return',
    '/analysis-attributes',
    '/debt-plans',
    '/debt-plans/11111111-1111-1111-1111-111111111111',
    '/annual-budgets/2026',
    '/annual-budgets/2026/monthly-apply',
    '/budgets/carryover-apply',
    '/budgets/copy-apply',
    '/budgets/carryovers/11111111-1111-1111-1111-111111111111/correct',
    '/budget-alerts/settings',
    '/budget-alerts/evaluate',
    '/budget-templates',
    '/savings-goals',
    '/savings-goals/11111111-1111-1111-1111-111111111111/allocate',
    '/savings-goals/11111111-1111-1111-1111-111111111111/release',
    '/savings-goals/11111111-1111-1111-1111-111111111111/transfer',
    '/essential-expense-policies',
    '/cashflow/events',
    '/cashflow/events/11111111-1111-1111-1111-111111111111/actions',
    '/cashflow/scenarios',
    '/transactions/batch-apply',
    '/transactions/batch-delete',
    '/directory/merchants/batch-delete',
    '/directory/tags/batch-delete',
    '/directory/projects/batch-delete',
    '/transactions/11111111-1111-1111-1111-111111111111/review',
    '/recurring-rules',
    '/recurring-rules/11111111-1111-1111-1111-111111111111',
    '/recurring-rules/11111111-1111-1111-1111-111111111111/actions',
    '/recurring-occurrences/11111111-1111-1111-1111-111111111111/actions',
    '/subscriptions',
    '/subscriptions/11111111-1111-1111-1111-111111111111',
    '/automation-rules',
    '/automation-rules/11111111-1111-1111-1111-111111111111',
    '/automation-rules/apply',
  ])('规划写入 %s 支持刷新恢复与同内容复用', async (path) => {
    const first = await prepareOperation('alice', { ...input(), path });
    const again = await prepareOperation('alice', { ...input(), path });
    expect(again.reused).toBe(true);
    expect(again.operation.key).toBe(first.operation.key);
    expect(pendingOperations('alice')).toHaveLength(1);
  });
  it.each([
    '/reports/expense-structure',
    '/debt-plans/11111111-1111-1111-1111-111111111111/payoff-preview',
    '/analysis-attributes/../transactions',
    '/annual-budgets/2026/monthly-preview',
    '/savings-goals/11111111-1111-1111-1111-111111111111/allocation-preview',
    '/budgets/carryover-preview',
    '/transactions/batch-preview',
    '/transactions/../review',
    '/automation-rules/suggest',
    '/automation-rules/preview',
    '/admin/backup',
    'https://example.com/recurring-rules',
    '/recurring-rules/../settings',
  ])('恢复白名单拒绝 %s', async (path) => {
    await expect(
      prepareOperation('alice', { ...input(), path }),
    ).rejects.toThrow('请求地址不支持安全恢复');
    expect(pendingOperations('alice')).toHaveLength(0);
  });
  it('重新读取记录后相同内容沿用原编号，成功后相同消费可再次独立提交', async () => {
    const first = await prepareOperation('alice', input());
    expect(pendingOperations('alice')[0].key).toBe(first.operation.key);
    const retry = await prepareOperation('alice', input());
    expect(retry.operation.key).toBe(first.operation.key);
    expect(retry.reused).toBe(true);
    completeOperation('alice', first.operation.key);
    expect((await prepareOperation('alice', input())).operation.key).not.toBe(
      first.operation.key,
    );
  });
  it('用户隔离，未完成键不能被改成其他内容', async () => {
    const original = input();
    await prepareOperation('alice', original);
    expect(pendingOperations('bob')).toEqual([]);
    await expect(
      prepareOperation('alice', {
        ...original,
        body: { ...body, amount: '99.00' },
      }),
    ).rejects.toThrow('仍待核实');
  });
  it('路径和版本属于请求身份，不能串用不同业务', async () => {
    const first = await prepareOperation('alice', { ...input(), version: '1' });
    const second = await prepareOperation('alice', {
      ...input(),
      version: '2',
    });
    const third = await prepareOperation('alice', {
      ...input(),
      path: '/business',
    });
    expect(
      new Set([first.operation.key, second.operation.key, third.operation.key])
        .size,
    ).toBe(3);
  });
  it('存储失败先拒绝，不静默发送缺少恢复记录的支付', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(prepareOperation('alice', input())).rejects.toThrow('quota');
  });
  it.each([
    '/cashflow/scenarios/12345678-1234-1234-1234-123456789012/changes',
    '/cashflow/scenarios/12345678-1234-1234-1234-123456789012/calculate',
    '/debt-plans/12345678-1234-1234-1234-123456789012/allocations',
    '/debt-plans/12345678-1234-1234-1234-123456789012/allocations/12345678-1234-1234-1234-123456789013/revoke',
  ])('阶段E扩展写入可以恢复 %s', async (path) => {
    expect(
      (await prepareOperation('alice', { ...input(), path })).operation.path,
    ).toBe(path);
  });
  it('损坏记录不被静默清空', () => {
    sessionStorage.setItem('pf.operations.v1:alice', '{broken');
    expect(() => pendingOperations('alice')).toThrow();
    expect(sessionStorage.getItem('pf.operations.v1:alice')).toBe('{broken');
  });
});
it.each(['/spending-value/optimize','/spending-value/preferences','/spending-value/preferences/reset','/spending-value/feedback','/spending-value/feedback/11111111-1111-4111-8111-111111111111','/spending-value/feedback/11111111-1111-4111-8111-111111111111/revoke','/spending-value/runs/11111111-1111-4111-8111-111111111111/reevaluate'])('消费实验室2.0写入可安全恢复 %s',async path=>{
 const prepared=await prepareOperation('value-lab-user',{...input(),path});expect(prepared.operation.path).toBe(path);const retry=await prepareOperation('value-lab-user',{...input(),path});expect(retry.operation.key).toBe(prepared.operation.key);
});

it.each(['/concerts/tours', '/concerts/tours/11111111-1111-4111-8111-111111111111'])('巡演请求可恢复 %s', async path => {
  const saved = await prepareOperation('tour-user', { ...input(), path, version: '0' });
  expect(pendingOperations('tour-user')[0].key).toBe(saved.operation.key);
  expect(pendingOperations('another-user')).toEqual([]);
});
it.each(['/concerts/tours/delete-all', '/concerts/tours/invalid', '/concerts/tours/11111111-1111-4111-8111-111111111111/delete'])('拒绝未开放的巡演恢复地址 %s', async path => {
  await expect(prepareOperation('tour-user', { ...input(), path })).rejects.toThrow('请求地址不支持安全恢复');
});
it.each(['/concerts/payables','/concerts/payables/11111111-1111-4111-8111-111111111111/refund'])('他人代付真实写入只恢复同用户同摘要 %s', async path=>{
 const first=await prepareOperation('payable-user',{...input(),path,body:{confirmed:true,amount:'100'},version:'1'});
 const retry=await prepareOperation('payable-user',{...input(),path,body:{confirmed:true,amount:'100'},version:'1'});expect(retry.operation.key).toBe(first.operation.key);expect(pendingOperations('different-user')).toEqual([]);
});
it.each(['/concerts/payables/delete-all','/concerts/payables/invalid/refund','/concerts/payables/11111111-1111-4111-8111-111111111111/settle'])('拒绝未开放应付恢复地址 %s',async path=>{await expect(prepareOperation('payable-user',{...input(),path})).rejects.toThrow('请求地址不支持安全恢复');});

it.each(['trips','collections','planning-budgets','experiences/venues','experiences/seats','experiences/memories'])('P1档案请求支持同用户安全恢复 %s',async kind=>{const path='/concerts/'+kind+'/11111111-1111-4111-8111-111111111111';const first=await prepareOperation('p1-user',{...input(),path});const retry=await prepareOperation('p1-user',{...input(),path});expect(retry.operation.key).toBe(first.operation.key);expect(pendingOperations('p1-other')).toEqual([]);});
it.each(['/concerts/trips/delete-all','/concerts/experiences/accounts','/concerts/collections/not-guid','/concerts/planning-budgets/11111111-1111-4111-8111-111111111111/delete'])('P1恢复拒绝额外路径 %s',async path=>{await expect(prepareOperation('p1-user',{...input(),path})).rejects.toThrow('请求地址不支持安全恢复');});

it.each(['/categories/import', '/categories/batch-delete'])('分类CSV导入与全部删除可安全恢复 %s', async path => {
  const saved = await prepareOperation('category-user', { ...input(), path, body: { kind: 'Expense' } });
  expect(pendingOperations('category-user')[0].key).toBe(saved.operation.key);
  completeOperation('category-user', saved.operation.key);
  expect(pendingOperations('category-user')).toEqual([]);
});
it.each(['/categories', '/categories/reorder', '/categories/deletion-preview', '/categories/import-preview', '/categories/11111111-1111-4111-8111-111111111111', '/categories/11111111-1111-4111-8111-111111111111/delete'])('分类恢复拒绝未开放路径 %s', async path => {
  await expect(prepareOperation('category-user', { ...input(), path })).rejects.toThrow('请求地址不支持安全恢复');
});
