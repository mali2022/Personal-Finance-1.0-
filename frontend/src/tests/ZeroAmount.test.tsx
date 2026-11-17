import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { QuickEntry } from '../features/transactions/QuickEntry';
import { transactionApi } from '../api/finance';
import { useUI } from '../stores/ui';
import type { Transaction } from '../types';
vi.mock('../hooks/useCurrency', () => ({ usePreferredCurrency: () => 'CNY' }));
vi.mock('../api/planning', () => ({
  planningApi: {
    capabilities: vi.fn(async () => ({})),
    suggest: vi.fn(async () => ({ hitRules: [], after: {} })),
  },
}));
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
const confirmCopy = '确认保存这笔 0 元交易吗？';
beforeEach(() => {
  vi.clearAllMocks();
  document.querySelectorAll('.ant-modal-root').forEach((n) => n.remove());
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
function amountInput() {
  return screen.getAllByPlaceholderText('0.00')[0] as HTMLInputElement;
}
function confirmBar() {
  const bars = document.querySelectorAll('.ant-modal-confirm-btns');
  return bars[bars.length - 1] as HTMLElement | undefined;
}
async function fillExpense(value: string) {
  mount({ presentation: 'page' });
  fireEvent.click(await screen.findByRole('tab', { name: '支出' }));
  await waitFor(() =>
    expect(screen.getByLabelText('account')).toHaveValue('cash'),
  );
  fireEvent.change(amountInput(), { target: { value } });
  fireEvent.change(screen.getByLabelText('category'), {
    target: { value: 'food' },
  });
}
it('支出 0.00 只有确认后才保存，取消不请求也不关闭表单', async () => {
  const done = vi.fn();
  mount({ presentation: 'page', onDone: done });
  fireEvent.click(await screen.findByRole('tab', { name: '支出' }));
  await waitFor(() =>
    expect(screen.getByLabelText('account')).toHaveValue('cash'),
  );
  fireEvent.change(amountInput(), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('category'), {
    target: { value: 'food' },
  });
  const saveButton = screen.getByRole('button', { name: /^保\s*存$/ });
  fireEvent.click(saveButton);
  fireEvent.click(saveButton);
  await screen.findAllByText('实际金额为 0.00');
  expect(screen.getAllByText(confirmCopy)).toHaveLength(1);
  expect(transactionApi.save).not.toHaveBeenCalled();
  fireEvent.click(
    within(confirmBar() as HTMLElement).getByRole('button', { name: /取\s*消/ }),
  );
  await waitFor(() => expect(screen.queryAllByText(confirmCopy)).toHaveLength(0));
  expect(transactionApi.save).not.toHaveBeenCalled();
  expect(amountInput()).toHaveValue('0');
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  await screen.findAllByText(confirmCopy);
  fireEvent.click(
    within(confirmBar() as HTMLElement).getByRole('button', {
      name: /确认\s*保存/,
    }),
  );
  await waitFor(() => expect(transactionApi.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(transactionApi.save).mock.calls[0][0]).toMatchObject({
    type: 'Expense',
    amount: '0.00',
    categoryId: 'food',
    accountId: 'cash',
    payments: [],
  });
});
it('负数金额仍被校验拦下且不弹确认框', async () => {
  await fillExpense('-1');
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  await screen.findByText('请输入大于 0 的金额，最多两位小数');
  expect(screen.queryAllByText('实际金额为 0.00')).toHaveLength(0);
  expect(transactionApi.save).not.toHaveBeenCalled();
});
it('非零金额保持原行为，不弹确认框', async () => {
  await fillExpense('1.00');
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  await waitFor(() => expect(transactionApi.save).toHaveBeenCalledTimes(1));
  expect(screen.queryAllByText('实际金额为 0.00')).toHaveLength(0);
  expect(vi.mocked(transactionApi.save).mock.calls[0][0]).toMatchObject({
    type: 'Expense',
    amount: '1.00',
  });
});
it('0 元交易只允许单账户付款，总额大于 0 时付款金额仍须大于 0', async () => {
  await fillExpense('0');
  fireEvent.click(screen.getByLabelText('多账户付款'));
  await waitFor(() =>
    expect(document.querySelectorAll('.payment-split-row')).toHaveLength(2),
  );
  const rows = Array.from(document.querySelectorAll('.payment-split-row'));
  const inputs = rows.map((row) =>
    Array.from(row.querySelectorAll('input')),
  ) as HTMLInputElement[][];
  fireEvent.change(inputs[1][0], { target: { value: 'b' } });
  fireEvent.change(inputs[0][1], { target: { value: '0' } });
  fireEvent.change(inputs[1][1], { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  await screen.findByText('0 元交易只能使用一个付款账户');
  expect(screen.queryAllByText('付款金额须大于0，最多两位小数')).toHaveLength(0);
  expect(transactionApi.save).not.toHaveBeenCalled();
  expect(screen.queryAllByText('实际金额为 0.00')).toHaveLength(0);
  fireEvent.change(amountInput(), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  expect(
    await screen.findAllByText('付款金额须大于0，最多两位小数'),
  ).toHaveLength(2);
  expect(transactionApi.save).not.toHaveBeenCalled();
});
it('退款 0.00 仍被拒绝', async () => {
  mount({ refundFrom: expense });
  await waitFor(() =>
    expect(screen.getByLabelText('original')).toHaveValue('expense'),
  );
  fireEvent.change(amountInput(), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: /^保\s*存$/ }));
  await screen.findByText('退款金额必须大于 0');
  expect(screen.queryAllByText('实际金额为 0.00')).toHaveLength(0);
  expect(transactionApi.save).not.toHaveBeenCalled();
});
