import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickEntry } from '../features/transactions/QuickEntry';
import { TransactionBalances } from '../features/transactions/TransactionBalances';
import { accountApi, transactionApi } from '../api/finance';
import { planningApi } from '../api/planning';
import { collaborationApi } from '../features/collaboration/api';
import { useUI } from '../stores/ui';
import type { Transaction, Account } from '../types';
vi.mock('../hooks/useCurrency', () => ({ usePreferredCurrency: () => 'CNY' }));
vi.mock('../hooks/useMobile', () => ({ useMobile: () => false }));
vi.mock('../features/transactions/PromotionFields', () => ({
  PromotionFields: () => null,
}));
vi.mock('../components/BusinessSelectors', () => ({
  DirectorySelector: () => null,
  MerchantSelector: () => null,
}));
vi.mock('../components/Selectors', () => ({
  AccountSelector: (p: {
    id?: string;
    value?: string;
    onChange?: (v: string) => void;
  }) => (
    <select
      id={p.id}
      aria-label={p.id ? undefined : '账户'}
      value={p.value ?? ''}
      onChange={(e) => p.onChange?.(e.target.value)}
    >
      <option value="">选择账户</option>
      <option value="a">银行卡</option>
      <option value="b">钱包</option>
    </select>
  ),
  CategorySelector: (p: {
    id?: string;
    value?: string;
    onChange?: (v: string) => void;
  }) => (
    <select
      id={p.id}
      value={p.value}
      onChange={(e) => p.onChange?.(e.target.value)}
    >
      <option value="c">午餐</option>
    </select>
  ),
}));
const accounts = [
  {
    id: 'a',
    name: '银行卡',
    balance: '960.00',
    currency: 'CNY',
    type: 'Bank',
    status: 'Active',
  },
  {
    id: 'b',
    name: '钱包',
    balance: '940.00',
    currency: 'CNY',
    type: 'Alipay',
    status: 'Active',
  },
] as Account[];
const expense = {
  id: 't',
  status: 'Confirmed',
  createdAt: '2026-10-19T12:00:00+08:00',
  updatedAt: '2026-10-19T12:00:00+08:00',
  type: 'Expense',
  amount: '100.00',
  accountId: 'a',
  currency: 'CNY',
  categoryId: 'c',
  occurredAt: '2026-10-19T12:00:00+08:00',
  note: '',
  splits: [],
  tagIds: [],
  fee: '0',
  refundedAmount: '0',
  version: '2',
  accountBalances: [
    { accountId: 'a', name: '银行卡', currency: 'CNY', balance: '970.00' },
    { accountId: 'b', name: '支付宝', currency: 'CNY', balance: '950.00' },
  ],
  payments: [
    { accountId: 'a', amount: '40.00' },
    { accountId: 'b', amount: '60.00' },
  ],
} as Transaction;
beforeEach(() => {
  vi.spyOn(collaborationApi, 'list').mockResolvedValue([]);
  vi.spyOn(collaborationApi, 'assignment').mockResolvedValue(null);
  vi.spyOn(transactionApi, 'detail').mockResolvedValue({...expense, entries: [], attachments: [], relatedTransactions: []});
  vi.spyOn(accountApi, 'list').mockResolvedValue(accounts);
  vi.spyOn(planningApi, 'capabilities').mockResolvedValue({} as never);
  vi.spyOn(transactionApi, 'save').mockResolvedValue({
    data: { data: { id: 't' } },
  } as never);
  useUI.setState({ entryType: null, hidden: false, language: 'zh-CN' });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount(element: React.ReactNode) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter>
      <QueryClientProvider client={cache}>
        <App>{element}</App>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return cache;
}
it('编辑多账户消费保留付款明细，保存后显示交易后余额', async () => {
  const cache = mount(<QuickEntry editing={expense} />);
  await waitFor(() => expect(cache.isFetching()).toBe(0));
  await screen.findByLabelText('付款金额 1');
  expect(screen.getByLabelText('付款金额 1')).toHaveValue('40.00');
  expect(screen.getByLabelText('付款金额 2')).toHaveValue('60.00');
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));
  await waitFor(() => expect(transactionApi.save, Array.from(document.querySelectorAll('.ant-form-item-explain-error')).map(e => e.textContent).join('; ')).toHaveBeenCalled());
  expect(vi.mocked(transactionApi.save).mock.calls[0][0]).toEqual(
    expect.objectContaining({
      amount: '100.00',
      accountId: 'a',
      payments: expense.payments,
      version: '2',
    }),
  );
  await screen.findByText('消费已保存 · 交易后余额');
  expect(screen.getAllByText(/970\.00/).length).toBeGreaterThan(0);
});
it('付款合计不等于消费金额时禁止提交', async () => {
  mount(<QuickEntry editing={expense} />);
  await screen.findByLabelText('付款金额 1');
  fireEvent.change(screen.getByLabelText('付款金额 2'), {
    target: { value: '59.99' },
  });
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));
  await screen.findByText('付款合计必须等于消费实付金额');
  expect(transactionApi.save).not.toHaveBeenCalled();
});
it('列表显示多个付款账户及交易后余额，隐私模式遮蔽名称和金额', async () => {
  const cache = mount(<TransactionBalances transaction={expense} />);
  cache.setQueryData(['accounts'], accounts);
  await screen.findByText('多账户付款');
  expect(screen.getByText('银行卡')).toBeInTheDocument();
  expect(screen.getAllByText(/970\.00/)).toHaveLength(1);
  cleanup();
  useUI.setState({ hidden: true });
  mount(<TransactionBalances transaction={expense} />);
  await screen.findByText('多账户付款');
  expect(screen.queryByText('银行卡')).not.toBeInTheDocument();
  expect(screen.queryByText(/970\.00/)).not.toBeInTheDocument();
});
