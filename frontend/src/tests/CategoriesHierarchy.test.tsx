import { render, screen, fireEvent, within } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import CategoriesPage from '../pages/CategoriesPage';
import CategoryDetailPage from '../pages/CategoryDetailPage';
import {
  categoryPath,
  categoryLabel,
  categoryActive,
  categoriesOverlap,
} from '../utils/categories';
import type { Category } from '../types';
import type { CategoryStatistics } from '../api/categoryStatistics';
vi.mock('../components/Chart', () => ({ default: () => <div>趋势图</div> }));
const categories: Category[] = [
  {
    id: 'root',
    name: '餐饮',
    kind: 'Expense',
    status: 'Active',
    version: '1',
    sortOrder: 0,
  },
  {
    id: 'second',
    name: '午餐',
    parentId: 'root',
    kind: 'Expense',
    status: 'Active',
    version: '1',
    sortOrder: 0,
  },
  {
    id: 'third',
    name: '工作日午餐',
    parentId: 'second',
    kind: 'Expense',
    status: 'Active',
    version: '1',
    sortOrder: 0,
  },
];
const summary = {
  gross: '100.00',
  refunds: '20.00',
  otherCredits: '0.00',
  net: '80.00',
  count: 2,
  positiveCount: 1,
  refundCount: 1,
  average: '100.00',
  maximum: '100.00',
  discount: '10.00',
};
function mount(detail?: CategoryStatistics) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['categories'], categories);
  client.setQueryData(['categoryOverview', 'CNY'], {
    items: categories.map((c) => ({ id: c.id, summary })),
  });
  if (detail)
    client.setQueryData(
      [
        'categoryStatistics',
        'root',
        'CNY',
        new Date().toLocaleDateString('sv-SE').slice(0, 7),
      ],
      detail,
    );
  render(
    <App>
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[detail ? '/categories/root' : '/categories']}
        >
          <Routes>
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/categories/:id" element={<CategoryDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}
describe('三级分类管理和统计', () => {
  it('任意祖先停用及祖孙预算重叠均被识别，完整路径包含三级', () => {
    expect(categoryPath(categories, 'third')).toHaveLength(3);
    expect(categoryLabel(categories, 'third')).toBe('餐饮 / 午餐 / 工作日午餐');
    expect(categoriesOverlap(categories, ['root', 'third'])).toBe(true);
    expect(
      categoryActive(
        categories.map((c) =>
          c.id === 'root' ? { ...c, status: 'Disabled' } : c,
        ),
        'third',
      ),
    ).toBe(false);
  });
  it('一级及二级逐次展开，可在二级按需新增三级，三级无新增下级入口', async () => {
    mount();
    expect(
      screen.queryByRole('button', { name: '午餐' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '餐饮' }));
    fireEvent.click(screen.getByRole('button', { name: '午餐' }));
    expect(
      screen.getByRole('button', { name: '工作日午餐' }),
    ).toBeInTheDocument();
    const row = screen
      .getByRole('button', { name: '工作日午餐' })
      .closest('tr')!;
    expect(within(row).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(
      within(row).getByRole('button', { name: '分类操作：工作日午餐' }),
    );
    const thirdMenu = await screen.findByRole('menu');
    expect(
      within(thirdMenu).queryByRole('menuitem', { name: '＋ 三级分类' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(row).getByRole('button', { name: '分类操作：工作日午餐' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '分类操作：午餐' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: '＋ 三级分类' }),
    );
    expect(
      await screen.findByText(
        '将创建或编辑 3 级分类。三级按需创建；已有分类保持原层级与历史交易。',
      ),
    ).toBeInTheDocument();
  }, 15000);
  it('每行统一操作菜单包含原有功能，边界排序禁用且修改可打开', async () => {
    mount();
    expect(
      screen.queryByRole('button', { name: '删除' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '分类操作：餐饮' }));
    const menu = await screen.findByRole('menu');
    for (const name of ['详情', '修改', '停用', '＋ 二级分类', '删除'])
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    for (const name of ['↑ 排序', '↓ 排序'])
      expect(within(menu).getByRole('menuitem', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
    fireEvent.click(within(menu).getByRole('menuitem', { name: '修改' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('分类详情展示统计指标、趋势、分析和未设置预算的明确状态', async () => {
    const period = {
      limit: null,
      used: '80.00',
      remaining: null,
      executionPercent: null,
      overlapping: false,
      allocatedLines: [],
      sharedLines: [],
    };
    mount({
      category: {
        ...categories[0],
        level: 1,
        path: [{ id: 'root', name: '餐饮' }],
      },
      currency: 'CNY',
      month: '2026-10',
      year: 2026,
      cumulative: summary,
      currentMonth: summary,
      currentYear: summary,
      previousMonth: summary,
      lastYearSameMonth: summary,
      monthOverMonth: null,
      yearOverYear: null,
      monthlyTrend: [{ period: '2026-10', summary }],
      annualTrend: [],
      merchants: [],
      accounts: [],
      childContributions: [],
      refunds: [],
      discounts: [],
      budgets: { supported: true, monthly: period, annual: period },
      scope: '验证统计口径',
    });
    expect(await screen.findByText('累计交易笔数')).toBeInTheDocument();
    for (const name of [
      '平均单笔金额',
      '单笔最大金额',
      '分类商户排行',
      '主要付款账户',
      '退款分析',
      '优惠分析',
      '分类预算执行',
    ])
      expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getAllByText('无可比数据')).toHaveLength(2);
    expect(screen.getAllByText('未设置独立预算').length).toBeGreaterThan(0);
  });
});
