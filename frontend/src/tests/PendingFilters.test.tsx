import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingSection } from '../features/home/PendingSection';
import type * as OverviewModule from '../features/overview';
import { readTransactionFilters } from '../utils/finance';

vi.mock('../features/overview', async (importOriginal) => {
  const actual = await importOriginal<typeof OverviewModule>();
  const summaryState = {
    data: {
      total: 12,
      pending: 2,
      anomalies: 4,
      uncategorized: 3,
      basis: '演示统计口径',
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  const reconciliationState = {
    data: {
      denominator: 0,
      numerator: 0,
      coverage: null,
      conflictCount: 0,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  };
  return {
    ...actual,
    usePendingSummary: () =>
      summaryState as unknown as ReturnType<typeof actual.usePendingSummary>,
    useReconciliationOverview: () =>
      reconciliationState as unknown as ReturnType<
        typeof actual.useReconciliationOverview
      >,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('首页待处理卡片与明细筛选一致', () => {
  it('待确认 / 异常 / 未分类分别使用与统计口径一致的筛选参数', () => {
    render(
      <MemoryRouter>
        <PendingSection />
      </MemoryRouter>,
    );
    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/transactions?statusFlag=NeedsReview');
    expect(hrefs).toContain('/transactions?anomaly=Any');
    expect(hrefs).toContain('/transactions?anomaly=Category');
    expect(hrefs).toContain('/transactions/review');
    // No card may point at the review queue with a mismatched count query.
    expect(hrefs).not.toContain('/transactions?reviewState=Open');
    expect(hrefs).not.toContain('/transactions?reviewState=Open&anomaly=Any');
  });

  it('严格状态筛选会被解析进列表查询且不携带队列状态', () => {
    const { filters } = readTransactionFilters(
      new URLSearchParams('statusFlag=NeedsReview'),
    );
    expect(filters.statusFlag).toBe('NeedsReview');
    expect(filters.status).toBeUndefined();
    expect(filters.reviewState).toBeUndefined();
  });
});
