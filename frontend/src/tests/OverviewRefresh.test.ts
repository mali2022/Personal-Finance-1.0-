import { describe, expect, it } from 'vitest';
import {
  FINANCE_REFRESH_QUERY_ROOTS,
  shouldRefreshFinanceQuery,
} from '../features/overview/refresh';

/**
 * The Home/Dashboard amounts must refresh after bookkeeping mutations. The API
 * client emits `finance:planning-changed`; this predicate decides what dies.
 */
describe('财务变更后的统一刷新范围', () => {
  it('覆盖首页与仪表盘的新概览查询', () => {
    for (const queryKey of [
      ['overview-pending-summary'],
      ['overview-planning-summary'],
      ['overview-goals', 'CNY'],
      ['overview-cash-forecast', 'CNY', 30],
      ['overview-allocation', 'CNY'],
      ['overview-net-worth', 'CNY', '30d'],
      ['overview-monthly-flow', 'CNY', 12],
      ['dashboard', '2026-10'],
      ['accounts'],
      ['concert','trips'],
      ['concert','collections'],
      ['concert','overview','CNY',2026],
      ['concerts'],
      ['concert-annual'],
      ['music-purchases'],
      ['music-report'],
      ['smart-reconciliation', 'overview'],
    ]) {
      expect(shouldRefreshFinanceQuery({ queryKey })).toBe(true);
    }
  });

  it('保留既有财务与规划查询键', () => {
    for (const root of [
      'cashflow',
      'savingsGoals',
      'budgetAlerts',
      'net-worth-attribution',
      'investments',
    ]) {
      expect(FINANCE_REFRESH_QUERY_ROOTS).toContain(root);
      expect(shouldRefreshFinanceQuery({ queryKey: [root] })).toBe(true);
    }
  });

  it('不会无差别刷新无关缓存', () => {
    expect(shouldRefreshFinanceQuery({ queryKey: ['profile'] })).toBe(false);
    expect(shouldRefreshFinanceQuery({ queryKey: ['session'] })).toBe(false);
    expect(shouldRefreshFinanceQuery({ queryKey: ['ai-settings'] })).toBe(
      false,
    );
  });

  it('刷新交易列表、报表窗口与仪表盘日历', () => {
    expect(shouldRefreshFinanceQuery({ queryKey: ['transactions'] })).toBe(
      true,
    );
    expect(
      shouldRefreshFinanceQuery({
        queryKey: ['transactions', 'dashboard-calendar', '2026-10'],
      }),
    ).toBe(true);
    expect(shouldRefreshFinanceQuery({ queryKey: ['reports'] })).toBe(true);
  });
});
