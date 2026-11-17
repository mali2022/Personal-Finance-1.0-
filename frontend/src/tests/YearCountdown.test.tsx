import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { YearCountdown, yearCountdown } from '../features/dashboard/YearCountdown';

afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('首页年末倒计时', () => {
  it('按北京时间计算到下一年开始的日数', () => {
    expect(yearCountdown(new Date('2026-10-18T12:00:00+08:00'))).toEqual({ year: 2026, days: 75 });
    expect(yearCountdown(new Date('2026-12-31T15:59:59Z'))).toEqual({ year: 2026, days: 1 });
    expect(yearCountdown(new Date('2026-12-31T16:00:00Z'))).toEqual({ year: 2027, days: 365 });
    expect(yearCountdown(new Date('2028-01-01T00:00:00+08:00'))).toEqual({ year: 2028, days: 366 });
  });
  it('页面保持打开时跨北京时间午夜自动刷新', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T23:59:50+08:00'));
    render(<YearCountdown />);
    expect(screen.getByText('距离 2026 年结束还有 75 日')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(30000); });
    expect(screen.getByText('距离 2026 年结束还有 74 日')).toBeInTheDocument();
  });
});
