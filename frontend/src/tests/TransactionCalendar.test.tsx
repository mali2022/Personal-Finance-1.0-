import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import {
  TransactionCalendar,
  transactionDay,
  loadCalendarMonth,
} from '../features/dashboard/TransactionCalendar';
import { transactionApi } from '../api/finance';
import type { Transaction } from '../types';
vi.mock('../api/finance', () => ({
  transactionApi: { list: vi.fn() },
  reportApi: {
    get: async () => ({
      points: [{ period: '2026-10-02', income: '100.00', expense: '9.50' }],
    }),
  },
}));
const item = {
  id: 'tx',
  type: 'Expense',
  amount: '12.50',
  currency: 'CNY',
  merchant: '测试商户',
  occurredAt: '2026-10-01T16:10:00Z',
} as Transaction;
afterEach(() => vi.resetAllMocks());
it('groups transactions at Shanghai midnight and fetches every page in the month', async () => {
  expect(transactionDay('2026-09-30T16:00:00Z')).toBe('2026-10-01');
  vi.mocked(transactionApi.list)
    .mockResolvedValueOnce({ items: [item], total: 2, page: 1, pageSize: 1 })
    .mockResolvedValueOnce({
      items: [{ ...item, id: 'tx2' }],
      total: 2,
      page: 2,
      pageSize: 1,
    });
  expect(await loadCalendarMonth('2026-10')).toHaveLength(2);
  expect(transactionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({
      page: 2,
      start: '2026-10-01T00:00:00+08:00',
      end: '2026-10-31T23:59:59.999+08:00',
    }),
  );
});
it('selects a date, opens transaction details, and follows a changed dashboard month', async () => {
  vi.mocked(transactionApi.list).mockResolvedValue({
    items: [item],
    total: 1,
    page: 1,
    pageSize: 100,
  });
  const detail = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const show = (month: string) => (
    <QueryClientProvider client={client}>
      <TransactionCalendar month={month} onDetail={detail} />
    </QueryClientProvider>
  );
  const { rerender } = render(show('2026-10'));
  fireEvent.click(
    await screen.findByRole('button', { name: '2026-10-02 · 1笔交易' }),
  );
  await screen.findByText('¥100.00');
  expect(screen.getByText('¥9.50')).toBeVisible();
  fireEvent.click(screen.getByText('测试商户'));
  expect(detail).toHaveBeenCalledWith(item);
  fireEvent.click(screen.getByRole('button', { name: '2026-10-03 · 0笔交易' }));
  expect(screen.getByText('当天暂无交易')).toBeVisible();
  vi.mocked(transactionApi.list).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 100,
  });
  rerender(show('2026-09'));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '2026-09-01 · 0笔交易' }),
    ).toHaveAttribute('aria-pressed', 'true'),
  );
});
