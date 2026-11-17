import { useState } from 'react';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { CategorySelector } from '../components/Selectors';
import { categories } from '../mocks/seed';
import type { Category } from '../types';

const thirdLevel: Category[] = [
  {
    id: 'chinese',
    name: '中式正餐',
    parentId: 'dinner',
    kind: 'Expense',
    version: '1',
    status: 'Active',
    sortOrder: 100,
  },
  {
    id: 'western',
    name: '西式正餐',
    parentId: 'dinner',
    kind: 'Expense',
    version: '1',
    status: 'Active',
    sortOrder: 101,
  },
];
const withThirdLevel: Category[] = [...categories, ...thirdLevel];
const withInactive: Category[] = withThirdLevel.map((category) =>
  category.id === 'coffee' ? { ...category, status: 'Archived' as const } : category,
);

type SelectorProps = ComponentProps<typeof CategorySelector>;

function client(rows: Category[] = withThirdLevel) {
  const instance = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  instance.setQueryData(['categories'], rows);
  return instance;
}

function renderSelector(props: SelectorProps = {}, rows: Category[] = withThirdLevel) {
  return render(
    <QueryClientProvider client={client(rows)}>
      <CategorySelector {...props} />
    </QueryClientProvider>,
  );
}

function Controlled(props: SelectorProps) {
  const [value, setValue] = useState<string | undefined>(props.value);
  return (
    <CategorySelector
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

function renderControlled(props: SelectorProps = {}) {
  return render(
    <QueryClientProvider client={client()}>
      <Controlled {...props} />
    </QueryClientProvider>,
  );
}

const trigger = () =>
  screen.getByRole('button', { name: '二级或三级分类' }) as HTMLButtonElement;
const open = () => fireEvent.click(trigger());
const option = (name: string) => screen.getByRole('button', { name });
const panel = () => screen.queryByRole('dialog');

describe('逐级进入式分类选择器', () => {
  it('逐级点选到三级分类后回传三级 id 并显示完整路径', () => {
    const onChange = vi.fn();
    renderControlled({ onChange });

    open();
    expect(panel()).toBeInTheDocument();

    fireEvent.click(option('餐饮食品 · 进入下级'));
    expect(screen.getByRole('button', { name: '返回上一级' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '分类层级' })).toHaveTextContent(
      '全部/餐饮食品',
    );

    fireEvent.click(option('餐饮食品 / 聚餐宴请 · 进入下级'));
    expect(screen.getByRole('navigation', { name: '分类层级' })).toHaveTextContent(
      '全部/餐饮食品/聚餐宴请',
    );
    expect(screen.getByText('最终分类路径：未选择')).toBeInTheDocument();

    fireEvent.click(option('餐饮食品 / 聚餐宴请 / 中式正餐'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('chinese');
    expect(panel()).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('餐饮食品 / 聚餐宴请 / 中式正餐');
  });

  it('带三级子类的二级分类不可直接选中，无子类二级可直接选中', () => {
    const onChange = vi.fn();
    renderControlled({ onChange });

    open();
    fireEvent.click(option('餐饮食品 · 进入下级'));

    const dinner = option('餐饮食品 / 聚餐宴请 · 进入下级');
    expect(dinner).toHaveAttribute('data-selectable', 'false');
    expect(option('餐饮食品 / 日常午餐')).toHaveAttribute('data-selectable', 'true');

    fireEvent.click(dinner);
    expect(onChange).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
    expect(option('餐饮食品 / 聚餐宴请 / 中式正餐')).toBeInTheDocument();
    expect(option('餐饮食品 / 聚餐宴请 / 西式正餐')).toBeInTheDocument();

    fireEvent.click(option('返回上一级'));
    expect(option('餐饮食品 / 聚餐宴请 · 进入下级')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(option('餐饮食品 · 进入下级')).toBeInTheDocument();
  });

  it('顶部搜索「午餐」命中末级并显示完整路径，可直接选中', () => {
    const onChange = vi.fn();
    renderControlled({ onChange });

    open();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索分类' }), {
      target: { value: '午餐' },
    });

    const hit = option('餐饮食品 / 日常午餐');
    expect(hit).toHaveTextContent('餐饮食品 / 日常午餐');
    expect(hit).toHaveAttribute('data-selectable', 'true');

    fireEvent.click(hit);

    expect(onChange).toHaveBeenCalledWith('lunch');
    expect(trigger()).toHaveTextContent('餐饮食品 / 日常午餐');
    expect(panel()).not.toBeInTheDocument();
  });

  it('搜索只允许选中末级，命中带子类的二级分类时进入下级', () => {
    const onChange = vi.fn();
    renderControlled({ onChange });

    open();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索分类' }), {
      target: { value: '聚餐' },
    });

    const branch = option('餐饮食品 / 聚餐宴请 · 进入下级');
    expect(branch).toHaveAttribute('data-selectable', 'false');
    fireEvent.click(branch);

    expect(onChange).not.toHaveBeenCalled();
    expect(option('餐饮食品 / 聚餐宴请 / 中式正餐')).toBeInTheDocument();
  });

  it('kind 为支出时不出现收入分类，kind 为 All 时收入支出按方向分组', () => {
    const expense = renderSelector({ kind: 'Expense' });
    open();
    expect(option('餐饮食品 · 进入下级')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /职业收入/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '收入' })).not.toBeInTheDocument();
    expense.unmount();

    renderSelector({ kind: 'All' });
    open();
    expect(screen.getByRole('heading', { name: '支出' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '收入' })).toBeInTheDocument();
    expect(option('支出 · 餐饮食品 · 进入下级')).toBeInTheDocument();
    expect(option('收入 · 职业收入 · 进入下级')).toBeInTheDocument();
  });

  it('kind 为 All 时搜索命中项带收入或支出方向标识', () => {
    renderSelector({ kind: 'All' });
    open();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索分类' }), {
      target: { value: '工资' },
    });
    expect(option('收入 · 职业收入 / 工资薪酬')).toHaveTextContent(
      '收入 · 职业收入 / 工资薪酬',
    );
  });

  it('历史二级分类 id 原值回显且不触发 onChange', () => {
    const onChange = vi.fn();
    renderSelector({ value: 'dinner', onChange });

    expect(trigger()).toHaveTextContent('餐饮食品 / 聚餐宴请');
    expect(onChange).not.toHaveBeenCalled();

    open();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('最终分类路径：餐饮食品 / 聚餐宴请')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel()).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger()).toHaveTextContent('餐饮食品 / 聚餐宴请');
  });

  it('history 允许停用分类并标注已停用，默认过滤停用分类', () => {
    const inactive = renderSelector({}, withInactive);
    open();
    fireEvent.click(option('餐饮食品 · 进入下级'));
    expect(screen.queryByRole('button', { name: /咖啡茶饮/ })).not.toBeInTheDocument();
    inactive.unmount();

    renderSelector({ history: true }, withInactive);
    open();
    fireEvent.click(option('餐饮食品 · 进入下级'));
    expect(option('餐饮食品 / 咖啡茶饮 · 已停用')).toHaveTextContent('咖啡茶饮 · 已停用');
  });

  it('disabled 时触发器不可打开，Esc 与点击空白关闭面板', () => {
    const disabled = renderSelector({ disabled: true });
    expect(trigger()).toBeDisabled();
    fireEvent.click(trigger());
    expect(panel()).not.toBeInTheDocument();
    disabled.unmount();

    renderSelector();
    open();
    expect(panel()).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel()).not.toBeInTheDocument();

    open();
    expect(panel()).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(panel()).not.toBeInTheDocument();
  });

  it('ariaLabel 覆盖默认触发器可访问名称', () => {
    renderSelector({ ariaLabel: '交易分类' });
    expect(screen.getByRole('button', { name: '交易分类' })).toBeInTheDocument();
  });

  it('没有子类的一级分类不可选，因为后端只接受二级或三级分类', () => {
    const childless: Category[] = [
      ...withThirdLevel,
      {
        id: 'solo',
        name: '单独大类',
        kind: 'Expense',
        version: '1',
        status: 'Active',
        sortOrder: 200,
      },
    ];
    renderSelector({}, childless);
    open();
    expect(
      screen.queryByRole('button', { name: /单独大类/ }),
    ).not.toBeInTheDocument();
    expect(option('餐饮食品 · 进入下级')).toBeInTheDocument();
  });
});
