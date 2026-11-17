import { beforeEach, describe, expect, it } from 'vitest';
import { readTransactionFilters } from '../utils/finance';
import {
  readDefaultView,
  readViews,
  saveView,
  setDefaultView,
} from '../features/transactions/savedViews';
import {
  defaultTablePreferences,
  readTablePreferences,
} from '../features/transactions/WorkspaceTable';

describe('交易工作台查询和用户配置', () => {
  it('多商户支持名称中的逗号，保留旧CSV参数兼容', () => {
    const query = new URLSearchParams();
    query.set('merchants', JSON.stringify(['A, Inc.', 'B']));
    const { filters, issues } = readTransactionFilters(query);
    expect(issues).toEqual([]);
    expect(JSON.parse(filters.merchants!)).toEqual(['A, Inc.', 'B']);
    expect(
      JSON.parse(
        readTransactionFilters(new URLSearchParams('merchants=A,B')).filters
          .merchants!,
      ),
    ).toEqual(['A', 'B']);
  });
  it('旧月份链接按上海时区转换为完整日界限', () => {
    const { filters, issues } = readTransactionFilters(
      new URLSearchParams('month=2026-10'),
    );
    expect(issues).toEqual([]);
    expect(filters.start).toBe('2026-09-30T16:00:00.000Z');
    expect(filters.end).toBe('2026-10-31T15:59:59.999Z');
  });
  beforeEach(() => localStorage.clear());
  it('完整保留多选筛选和多字段排序，保存及复制视图不会带入敏感参数或页码', () => {
    const query = new URLSearchParams(
      'accountIds=a,b,a&categoryIds=root,leaf&merchants=商户甲,商户乙&tagIds=t1,t2&projectIds=p1,p2&source=Imported&anomaly=Duplicate&reconciliation=Unmatched&sort=amount:desc,occurredAt:asc&page=5&token=secret',
    );
    const { filters, issues } = readTransactionFilters(query);
    expect(issues).toEqual([]);
    expect(filters.accountIds).toBe('a,b');
    expect(filters.sort).toBe('amount:desc,occurredAt:asc');
    const first = saveView('one', '原视图', query)[0];
    saveView('one', '副本', new URLSearchParams(first.query));
    const views = readViews('one');
    expect(views[0].id).not.toBe(views[1].id);
    expect(views[0].query).toBe(views[1].query);
    expect(views[0].query).not.toContain('secret');
    expect(new URLSearchParams(views[0].query).has('page')).toBe(false);
  });
  it.each([
    'sort=amount:desc,amount:asc',
    'sort=userId:asc',
    'accountIds=a,,b',
    'source=unknown',
    'anomaly=unknown',
    'min=20&max=1',
  ])('错误筛选会产生明确问题：%s', (query) => {
    expect(
      readTransactionFilters(new URLSearchParams(query)).issues.length,
    ).toBeGreaterThan(0);
    expect(() =>
      saveView('one', 'invalid', new URLSearchParams(query)),
    ).toThrow();
  });
  it('默认视图按用户隔离，只允许指定存在的视图', () => {
    const view = saveView(
      'one',
      '默认',
      new URLSearchParams('type=Expense'),
    )[0];
    setDefaultView('one', view.id);
    expect(readDefaultView('one')).toBe(view.id);
    expect(readDefaultView('two')).toBeNull();
    expect(() => setDefaultView('two', view.id)).toThrow();
    setDefaultView('one');
    expect(readDefaultView('one')).toBeNull();
  });
  it('表格布局按用户隔离，拒绝损坏数据且不覆盖原记录', () => {
    const key = 'finance-transaction-table:v1:one';
    localStorage.setItem(
      key,
      JSON.stringify({
        ...defaultTablePreferences,
        density: 'compact',
        order: ['amount', 'date'],
        widths: { amount: 220 },
        frozen: ['date', 'amount'],
      }),
    );
    expect(readTablePreferences('one')).toMatchObject({
      density: 'compact',
      widths: { amount: 220 },
      frozen: ['date', 'amount'],
    });
    expect(readTablePreferences('two').density).toBe('standard');
    localStorage.setItem(key, 'invalid');
    expect(() => readTablePreferences('one')).toThrow();
    expect(localStorage.getItem(key)).toBe('invalid');
  });
});
