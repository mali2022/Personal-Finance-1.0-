import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BudgetsPage from '../pages/BudgetsPage';
import { budgetApi } from '../api/finance';
import type { Budget, Category } from '../types';

const month = dayjs().format('YYYY-MM');
const categories: Category[] = [
  {
    id: 'parent',
    name: '历史餐饮',
    kind: 'Expense',
    status: 'Active',
    sortOrder: 0,
    version: '1',
  },
  {
    id: 'child',
    parentId: 'parent',
    name: '历史午餐',
    kind: 'Expense',
    status: 'Active',
    sortOrder: 0,
    version: '1',
  },
];
const budget: Budget = {
  id: 'b',
  month,
  total: '1000',
  used: '50',
  version: '3',
  items: [{ id: 'line', categoryId: 'child', limit: '100', used: '50' }],
};
function mount(value = budget, cats = categories) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  });
  client.setQueryData(['budgets', month], value);
  client.setQueryData(['categories'], cats);
  render(
    <QueryClientProvider client={client}>
      <App>
        <BudgetsPage />
      </App>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => vi.restoreAllMocks());
describe('预算历史与编辑快照', () => {
  it('查询刷新后保存仍使用打开时版本，不能借新版本覆盖旧表单', async () => {
    const save = vi
      .spyOn(budgetApi, 'save')
      .mockRejectedValue({ message: '预算版本冲突', code: 'VERSION_CONFLICT' });
    const client = mount();
    fireEvent.click(screen.getByRole('button', { name: '编辑预算' }));
    expect(screen.getByLabelText('预算月份')).toBeDisabled();
    await act(async () => {
      client.setQueryData(['budgets', month], {
        ...budget,
        version: '4',
        total: '2000',
      });
    });
    fireEvent.change(screen.getByLabelText('月度预算总额'), {
      target: { value: '1200' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存预算' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        month,
        expect.objectContaining({ version: '3', total: '1200.00' }),
      ),
    );
    expect(await screen.findByText('预算版本冲突')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
    expect(screen.getByLabelText('月度预算总额')).toHaveValue('1200');
  });
  it('停用分类保留名称与金额，替换或移除前不能保存', async () => {
    const save = vi.spyOn(budgetApi, 'save');
    mount(
      budget,
      categories.map((c) =>
        c.id === 'parent' ? { ...c, status: 'Disabled' } : c,
      ),
    );
    expect(screen.getByText('历史餐饮 / 历史午餐（已停用）')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '编辑预算' }));
    await waitFor(() =>
      expect(screen.getByText(/预算包含已停用或不可用分类/)).toBeVisible(),
      { timeout: 5000 },
    );
    fireEvent.click(screen.getByRole('button', { name: '保存预算' }));
    expect(await screen.findByText('请替换或移除已停用的分类')).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  });
  it('旧父子重叠记录仍显示并提示，保存时拒绝重叠', async () => {
    const save = vi.spyOn(budgetApi, 'save');
    mount({
      ...budget,
      items: [
        ...budget.items,
        { id: 'parent-line', categoryId: 'parent', limit: '200', used: '50' },
      ],
    });
    expect(screen.getByText(/历史预算存在父子分类重叠/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '编辑预算' }));
    fireEvent.click(screen.getByRole('button', { name: '保存预算' }));
    expect(
      await screen.findByText(
        '同月不能同时设置父分类及其子分类预算，请保留其中一层',
      ),
    ).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  });
});
