import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App, Grid } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TransactionsPage from '../pages/TransactionsPage';
import { accountApi, categoryApi, transactionApi } from '../api/finance';
import { authApi } from '../api/client';

vi.mock('../components/Selectors', () => ({
  AccountSelector: () => null,
  CategorySelector: () => null,
}));
vi.mock('../components/BusinessSelectors', () => ({
  DirectorySelector: () => null,
}));
vi.mock('../features/transactions/SavedViewPicker', () => ({
  SavedViewPicker: () => null,
}));
vi.mock('../features/transactions/TransactionDrawer', () => ({
  TransactionDrawer: () => null,
}));
vi.mock('../features/transactions/BatchDrawer', () => ({
  BatchDrawer: () => null,
}));
vi.mock('../features/transactions/ReviewDrawer', () => ({
  ReviewDrawer: () => null,
}));
afterEach(() => vi.restoreAllMocks());
function Location() {
  return <output data-testid="current-query">{useLocation().search}</output>;
}

describe('移动交易分页', () => {
  it.each(['amount:asc', 'amount:desc', 'occurredAt:asc'])(
    '翻页保留 %s 排序和原筛选',
    async (sort) => {
      vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ md: false });
      vi.spyOn(authApi, 'me').mockResolvedValue({ id: 'owner' } as Awaited<
        ReturnType<typeof authApi.me>
      >);
      vi.spyOn(accountApi, 'list').mockResolvedValue([]);
      vi.spyOn(categoryApi, 'list').mockResolvedValue([]);
      const list = vi
        .spyOn(transactionApi, 'list')
        .mockResolvedValue({ items: [], total: 120, page: 1, pageSize: 20 });
      const initial = `/transactions?sort=${sort}&accountId=selected-account&currency=USD&page=1&pageSize=20`;
      render(
        <App>
          <QueryClientProvider
            client={
              new QueryClient({ defaultOptions: { queries: { retry: false } } })
            }
          >
            <MemoryRouter initialEntries={[initial]}>
              <TransactionsPage />
              <Location />
            </MemoryRouter>
          </QueryClientProvider>
        </App>,
      );
      await waitFor(() => expect(list).toHaveBeenCalled());
      fireEvent.click(await screen.findByTitle('2'));
      await waitFor(() =>
        expect(list).toHaveBeenLastCalledWith(
          expect.objectContaining({
            page: 2,
            pageSize: 20,
            sort,
            accountId: 'selected-account',
            currency: 'USD',
          }),
          expect.any(AbortSignal),
        ),
      );
      const query = new URLSearchParams(
        screen.getByTestId('current-query').textContent ?? '',
      );
      expect(query.get('sort')).toBe(sort);
      expect(query.get('page')).toBe('2');
      expect(query.get('currency')).toBe('USD');
    },
  );
});
