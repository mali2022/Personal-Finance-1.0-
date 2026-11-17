import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteView,
  normalizeViewQuery,
  readViews,
  saveView,
  visibleColumns,
} from '../features/transactions/savedViews';
describe('筛选视图的用户隔离与安全保存', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it('保留合法筛选与排序，重置页码并移除未知和敏感参数', () => {
    const params = new URLSearchParams(
      'type=Expense&currency=USD&min=9.50&sort=amount:asc&page=7&token=secret&redirect=https://example.com',
    );
    const stored = new URLSearchParams(normalizeViewQuery(params));
    expect(stored.get('type')).toBe('Expense');
    expect(stored.get('min')).toBe('9.50');
    expect(stored.get('sort')).toBe('amount:asc');
    expect(stored.has('page')).toBe(false);
    expect(stored.has('token')).toBe(false);
    expect(stored.has('redirect')).toBe(false);
  });
  it('非法金额和时间阻止保存，不把错误条件转换为更宽查询', () => {
    expect(() => saveView('u', '错误', new URLSearchParams('min=-1'))).toThrow(
      '修正',
    );
    expect(() =>
      saveView('u', '错误', new URLSearchParams('start=2026-10-01')),
    ).toThrow('修正');
    expect(readViews('u')).toEqual([]);
  });
  it('按用户隔离，删除收藏不影响其他用户', () => {
    const [a] = saveView('a', '我的视图', new URLSearchParams('type=Income'));
    saveView('b', '我的视图', new URLSearchParams('type=Expense'));
    expect(readViews('b')[0].query).toContain('Expense');
    deleteView('a', a.id);
    expect(readViews('a')).toEqual([]);
    expect(readViews('b')).toHaveLength(1);
  });
  it('拒绝重复名称和超过上限，原收藏不丢失', () => {
    saveView('u', '本月', new URLSearchParams());
    expect(() => saveView('u', ' 本月 ', new URLSearchParams())).toThrow(
      '同名',
    );
    for (let i = 1; i < 30; i++)
      saveView('u', String(i), new URLSearchParams());
    expect(() => saveView('u', '满额', new URLSearchParams())).toThrow('30');
    expect(readViews('u')).toHaveLength(30);
  });
  it('损坏数据被保留，不会自动覆盖或清空', () => {
    const key = 'finance-transaction-views:v1:u';
    localStorage.setItem(key, 'invalid');
    expect(() => saveView('u', '新', new URLSearchParams())).toThrow();
    expect(localStorage.getItem(key)).toBe('invalid');
  });
  it('存储空间不足时报告失败，旧数据保留', () => {
    const initial = saveView('u', '旧', new URLSearchParams());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('空间不足', 'QuotaExceededError');
    });
    expect(() => saveView('u', '新', new URLSearchParams())).toThrow();
    expect(readViews('u')).toEqual(initial);
  });
  it('必需金额、日期、类型与操作字段不能隐藏', () => {
    expect(visibleColumns('note,unknown')).toEqual([
      'date',
      'type',
      'amount',
      'note',
      'actions',
    ]);
    expect(visibleColumns()).toHaveLength(13);
    expect(visibleColumns()).toContain('balance');
    expect(visibleColumns('date,type,amount,actions')).not.toContain('balance');
  });
});
