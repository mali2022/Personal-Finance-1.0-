import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinancialSummary } from '../features/dashboard/FinancialSummary';
import { useUI } from '../stores/ui';
import type { DashboardDto } from '../types';

const summary: DashboardDto = {
  month: '2026-10',
  assets: '90071992547409.93',
  liabilities: '200.11',
  netWorth: '90071992547209.82',
  income: '4000.30',
  previousIncome: '4000.10',
  expense: '2000.10',
  previousExpense: '2000.30',
  surplus: '2000.20',
  accounts: [],
  categories: [],
  trend: [],
  recentTransactions: [],
  budget: {
    id: 'budget',
    version: '1',
    month: '2026-10',
    total: '3000.00',
    used: '2000.10',
    items: [],
  },
};

afterEach(() => {
  cleanup();
  useUI.setState({ hidden: false });
});

describe('首页财务指标', () => {
  it('保留大金额分位，并精确计算收入和支出的上月差额', () => {
    useUI.setState({ hidden: false });
    render(
      <MemoryRouter>
        <FinancialSummary data={summary} />
      </MemoryRouter>,
    );
    expect(screen.getByText('¥90,071,992,547,209.82')).toBeInTheDocument();
    expect(screen.getByText('¥0.20')).toBeInTheDocument();
    expect(screen.getByText('-¥0.20')).toBeInTheDocument();
  });

  it('切换隐私模式立即移除金额及环比方向，关闭后恢复', () => {
    useUI.setState({ hidden: false });
    const { container } = render(
      <MemoryRouter>
        <FinancialSummary data={summary} />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll('.comparison-icon')).toHaveLength(2);
    act(() => useUI.getState().toggleHidden());
    expect(container.querySelectorAll('.comparison-icon')).toHaveLength(0);
    expect(container.textContent).not.toContain('90,071,992');
    expect(container.textContent).not.toContain('4,000.30');
    expect(container.textContent).not.toContain('0.20');
    expect(screen.getAllByText('¥••••••')).toHaveLength(8);
    act(() => useUI.getState().toggleHidden());
    expect(container.querySelectorAll('.comparison-icon')).toHaveLength(2);
    expect(screen.getByText('¥4,000.30')).toBeInTheDocument();
  });
});
