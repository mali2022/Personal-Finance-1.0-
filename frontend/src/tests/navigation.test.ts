import { reportAnalysisSections } from '../features/reports/sections';
import { afterEach, expect, it } from 'vitest';
import {
  activeNavigation,
  canonicalNavigationPath,
  groupRoutes,
  navigationAliases,
  navigationEntries,
  navigationGroups,
  settingsNavigation,
} from '../design/navigation';
import { useUI } from '../stores/ui';
afterEach(() => useUI.getState().setLanguage('zh-CN'));
const allRoutes = () => navigationEntries.flatMap((group) => groupRoutes(group));
it('groups every destination into seven rail entries', () => {
  useUI.getState().setLanguage('zh-CN');
  expect(navigationGroups.map((g) => g.label)).toEqual([
    '总览',
    '记账',
    '账户与资产',
    '薪酬与社保',
    '预算与计划',
    '分析与报告',
    'AI 智能中心',
  ]);
  expect(navigationGroups.some((g) => g.key === 'settings')).toBe(false);
  for (const group of navigationGroups) {
    expect(group.sections.length).toBeGreaterThan(0);
    for (const section of group.sections) {
      expect(section.routes.length).toBeGreaterThan(0);
    }
  }
});
it('gives each destination and menu label exactly one owner', () => {
  const entries = allRoutes();
  expect(new Set(entries.map(([path]) => path)).size).toBe(entries.length);
  expect(new Set(entries.map(([, label]) => label)).size).toBe(entries.length);
  for (const [alias, target] of Object.entries(navigationAliases)) {
    expect(entries.some(([path]) => path === alias)).toBe(false);
    expect(entries.filter(([path]) => path === target)).toHaveLength(1);
    expect(canonicalNavigationPath(alias)).toBe(target);
    expect(activeNavigation(alias)?.key).toBe(target);
  }
});
it('places management outside the feature tree and assigns nested routes correctly', () => {
  expect(groupRoutes(settingsNavigation)).toHaveLength(7);
  expect(activeNavigation('/profile')?.group).toBe('settings');
  expect(activeNavigation('/settings/currencies')?.group).toBe('settings');
  expect(activeNavigation('/admin')?.group).toBe('settings');
  expect(activeNavigation('/settings/payment-instruments')?.group).toBe(
    'assets',
  );
  expect(activeNavigation('/accounts/fund-status')?.key).toBe(
    '/accounts/fund-status',
  );
  expect(activeNavigation('/transactions/review')?.key).toBe(
    '/transactions/review',
  );
  expect(activeNavigation('/payroll/bonuses')?.key).toBe('/payroll/bonuses');
});
it('keeps unique labels and identities in English', () => {
  useUI.getState().setLanguage('en');
  expect(navigationGroups[1].label).toBe('Bookkeeping');
  const entries = allRoutes();
  expect(new Set(entries.map(([, label]) => label)).size).toBe(entries.length);
  expect(activeNavigation('/ai-center/budget')?.group).toBe('planning');
});
it('exposes the seven report tools only as analysis second-level entries', () => {
  const analysis = navigationGroups.find((g) => g.key === 'analysis')!;
  const routes = groupRoutes(analysis);
  for (const section of reportAnalysisSections) {
    expect(routes.filter(([path]) => path === section.path)).toHaveLength(1);
    expect(activeNavigation(section.path)?.key).toBe(section.path);
    expect(activeNavigation(section.path)?.group).toBe('analysis');
  }
});
