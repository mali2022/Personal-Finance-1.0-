import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import { QuickEntry } from '../features/transactions/QuickEntry';
import { transactionApi } from '../api/finance';
import { useUI } from '../stores/ui';
import type { Transaction } from '../types';
vi.mock('../hooks/useCurrency', () => ({ usePreferredCurrency: () => 'CNY' }));
vi.mock('../api/finance', () => ({
  accountApi: {
    list: async () => [
      { id: 'cash', type: 'Cash', currency: 'CNY', status: 'Active' },
    ],
  },
  transactionApi: {
    save: vi.fn(async () => ({ data: { data: { id: 'saved' } } })),
    refundSource: vi.fn(async () => ({
      id: 'expense',
      amount: '20.00',
      refundedAmount: '0.00',
      refundableAmount: '20.00',
      currency: 'CNY',
      splits: [],
      refundableSplits: [],
    })),
  },
}));
vi.mock('../components/Selectors', () => ({
  AccountSelector: (p: { value?: string; onChange?: (s: string) => void }) => (
    <input
      aria-label="account"
      value={p.value || ''}
      onChange={(e) => p.onChange?.(e.target.value)}
    />
  ),
  CategorySelector: (p: { value?: string; onChange?: (s: string) => void }) => (
    <input
      aria-label="category"
      value={p.value || ''}
      onChange={(e) => p.onChange?.(e.target.value)}
    />
  ),
}));
vi.mock('../components/BusinessSelectors', () => ({
  DirectorySelector: () => null,
  MerchantSelector: () => null,
}));
vi.mock('../features/transactions/PromotionFields', () => ({
  PromotionFields: () => null,
}));
vi.mock('../features/collaboration/TransactionSharingFields', () => ({
  TransactionSharingFields: () => null,
}));
vi.mock('../features/transactions/RefundSourceSelector', () => ({
  RefundSourceSelector: (p: { value?: string }) => (
    <input aria-label="original" value={p.value || ''} readOnly />
  ),
}));
const expense = {
  id: 'expense',
  type: 'Expense',
  amount: '20.00',
  currency: 'CNY',
  accountId: 'cash',
  categoryId: 'food',
  occurredAt: '2026-01-15T04:23:45Z',
  fee: '0',
  note: '',
  tagIds: [],
  splits: [],
  version: '3',
  refundedAmount: '0.00',
  status: 'Confirmed',
  createdAt: '2026-01-15T04:23:45Z',
  updatedAt: '2026-01-15T04:23:45Z',
} as Transaction;
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({
    entryType: null,
    aiDraft: undefined,
    template: undefined,
    language: 'zh-CN',
  });
});
function mount(props: React.ComponentProps<typeof QuickEntry>) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <App>
          <QuickEntry {...props} />
        </App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('changes an edited expense to income without stale expense fields', async () => {
  mount({ editing: expense });
  fireEvent.click(await screen.findByRole('tab', { name: '收入' }));
  fireEvent.change(screen.getByLabelText('category'), {
    target: { value: 'salary' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  await waitFor(() => expect(transactionApi.save).toHaveBeenCalled());
  expect(vi.mocked(transactionApi.save).mock.calls[0][0]).toMatchObject({
    type: 'Income',
    amount: '20.00',
    categoryId: 'salary',
    payments: [],
    version: '3',
  });
});
it('date shortcuts preserve time and use yesterday', async () => {
  mount({ editing: expense });
  fireEvent.click(await screen.findByRole('button', { name: /昨\s*天/ }));
  const date = screen.getByLabelText('日期时间') as HTMLInputElement;
  expect(date.value).toBe(
    dayjs().subtract(1, 'day').format('YYYY-MM-DD') +
      ' ' +
      dayjs(expense.occurredAt).format('HH:mm:ss'),
  );
});
it('prefills the original expense when refunding from details', async () => {
  mount({ refundFrom: expense });
  await waitFor(() =>
    expect(screen.getByLabelText('original')).toHaveValue('expense'),
  );
  expect(transactionApi.refundSource).toHaveBeenCalledWith(
    'expense',
    undefined,
  );
  expect(screen.getByLabelText('account')).toHaveValue('cash');
});

it('keeps the independent page draft when the global drawer is opened and closed', async () => {
  mount({ presentation: 'page' });
  expect(await screen.findByRole('region', { name: '记账中心' })).toBeVisible();
  expect(useUI.getState().entryType).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '收入' }));
  fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], {
    target: { value: '42.50' },
  });
  act(() => useUI.getState().openEntry('Transfer'));
  act(() => useUI.getState().closeEntry());
  expect(screen.getAllByPlaceholderText('0.00')[0]).toHaveValue('42.50');
  expect(screen.getByRole('tab', { name: '收入' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }));
  await waitFor(() =>
    expect(screen.getAllByPlaceholderText('0.00')[0]).toHaveValue(''),
  );
  expect(screen.getByRole('tab', { name: '支出' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
it('uses shared validation and saving, retaining failed page inputs and resetting only after success', async () => {
  const done = vi.fn();
  mount({ presentation: 'page', onDone: done });
  fireEvent.click(await screen.findByRole('tab', { name: '收入' }));
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }));
  await waitFor(() => expect(screen.getByText('请输入金额')).toBeVisible());
  expect(transactionApi.save).not.toHaveBeenCalled();
  fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], {
    target: { value: '42.50' },
  });
  fireEvent.change(screen.getByLabelText('category'), {
    target: { value: 'salary' },
  });
  vi.mocked(transactionApi.save).mockRejectedValueOnce({ message: '保存失败' });
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }));
  await waitFor(() => expect(transactionApi.save).toHaveBeenCalledTimes(1));
  await screen.findAllByText('保存失败');
  expect(screen.getAllByPlaceholderText('0.00')[0]).toHaveValue('42.50');
  expect(done).not.toHaveBeenCalled();
  await waitFor(
    () =>
      expect(screen.getByRole('button', { name: '保存并继续' })).toBeEnabled(),
    { timeout: 6000 },
  );
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }));
  await waitFor(() =>
    expect(screen.getAllByPlaceholderText('0.00')[0]).toHaveValue(''),
  );
  expect(transactionApi.save).toHaveBeenCalledTimes(2);
  const calls = vi.mocked(transactionApi.save).mock.calls;
  expect(calls[0][0]).toMatchObject({
    type: 'Income',
    amount: '42.50',
    accountId: 'cash',
    categoryId: 'salary',
  });
  expect(calls[0][2]).toBe(calls[1][2]);
  expect(done).not.toHaveBeenCalled();
  fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], {
    target: { value: '10' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
}, 30000);
