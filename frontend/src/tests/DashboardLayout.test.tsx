import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useDashboardLayout } from '../features/dashboard/DashboardLayout';
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe('dashboard preferences', () => {
  it('ignores malformed storage', () => {
    localStorage.setItem('pf-dashboard-layout-v1', '{');
    const { result } = renderHook(useDashboardLayout, {
      wrapper: MemoryRouter,
    });
    expect(result.current.visible('trend')).toBe(true);
  });
  it('restores only known module names', () => {
    localStorage.setItem(
      'pf-dashboard-layout-v1',
      JSON.stringify(['trend', 'unknown', null]),
    );
    const { result } = renderHook(useDashboardLayout, {
      wrapper: MemoryRouter,
    });
    expect(result.current.visible('trend')).toBe(false);
    expect(result.current.visible('accounts')).toBe(true);
  });
  it('handles command shortcut without changing preferences', () => {
    const { result } = renderHook(useDashboardLayout, {
      wrapper: MemoryRouter,
    });
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      ),
    );
    expect(result.current.visible('budget')).toBe(true);
  });
});
