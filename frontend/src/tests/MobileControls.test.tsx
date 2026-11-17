import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Form } from 'antd';
import dayjs from 'dayjs';
import { DateInput, DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { useUI } from '../stores/ui';

beforeEach(() => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('max-width: 760px'),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  }));
  useUI.setState({ language: 'zh-CN' });
});
afterEach(() => vi.restoreAllMocks());

describe('手机日期下拉', () => {
  it('月末和闰年选择不会跳月，确定后才提交，保留秒和时区语义', () => {
    const changed = vi.fn();
    render(
      <DatePicker
        aria-label="日期时间"
        showTime
        value={dayjs('2024-01-31T14:25:36')}
        onChange={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '日期时间' }));
    fireEvent.change(screen.getByLabelText('日期时间 · 月'), {
      target: { value: '2' },
    });
    expect(screen.getByLabelText('日期时间 · 日')).toHaveValue('29');
    fireEvent.change(screen.getByLabelText('日期时间 · 年'), {
      target: { value: '2025' },
    });
    expect(screen.getByLabelText('日期时间 · 日')).toHaveValue('28');
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(changed.mock.calls[0][0].format('YYYY-MM-DD HH:mm:ss')).toBe(
      '2025-02-28 14:25:36',
    );
    expect(screen.queryByLabelText('日期时间 · 月')).not.toBeInTheDocument();
  });
  it('取消不提交；禁用日期不能确认；清空传递 null', () => {
    const changed = vi.fn();
    render(
      <DatePicker
        aria-label="账期"
        picker="month"
        value={dayjs('2026-09-01')}
        maxDate={dayjs('2026-10-31')}
        onChange={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '账期' }));
    fireEvent.change(screen.getByLabelText('账期 · 月'), {
      target: { value: '12' },
    });
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '清除日期' }));
    expect(changed).toHaveBeenCalledWith(null, '');
  });
  it('开始晚于结束时阻止提交，快捷范围只触发一次并保持原始边界', () => {
    const changed = vi.fn();
    const preset: [dayjs.Dayjs, dayjs.Dayjs] = [
      dayjs('2026-09-01').startOf('day'),
      dayjs('2026-09-30').endOf('day'),
    ];
    render(
      <DatePicker.RangePicker
        aria-label="期间"
        value={[dayjs('2026-10-01'), dayjs('2026-10-07')]}
        presets={[{ label: '上月', value: preset }]}
        onChange={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '期间' }));
    fireEvent.change(screen.getByLabelText('开始日期 · 日'), {
      target: { value: '20' },
    });
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled();
    expect(screen.getByText('结束时间不能早于开始时间')).toBeVisible();
    fireEvent.change(screen.getByLabelText('快捷时间范围'), {
      target: { value: '0' },
    });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][0][1].toISOString()).toBe(
      preset[1].toISOString(),
    );
  });
  it('原字符串表单继续输出 YYYY-MM-DD，表单标签和重置均正常', async () => {
    const submit = vi.fn();
    render(
      <Form initialValues={{ openedAt: '2024-01-31' }} onFinish={submit}>
        <Form.Item name="openedAt" label="开户日期">
          <DateInput type="date" />
        </Form.Item>
        <button type="submit">保存</button>
      </Form>,
    );
    fireEvent.click(screen.getByLabelText('开户日期'));
    fireEvent.change(screen.getByLabelText('选择日期 · 月'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({ openedAt: '2024-02-29' }),
    );
  });
  it('datetime-local 保持已有字符串协议和秒精度', () => {
    const changed = vi.fn();
    render(
      <DateInput
        aria-label="生效时间"
        type="datetime-local"
        step={1}
        value="2026-10-15T09:12:34"
        onChange={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '生效时间' }));
    fireEvent.change(screen.getByLabelText('生效时间 · 分'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(changed.mock.calls[0][0].target.value).toBe('2026-10-15T09:45:34');
  });
  it('月份保留字符串协议，继承表单禁用状态', () => {
    const changed = vi.fn();
    const { rerender } = render(
      <DateInput
        aria-label="预算月份"
        type="month"
        value="2026-10"
        onChange={changed}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '预算月份' }));
    fireEvent.change(screen.getByLabelText('预算月份 · 月'), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(changed.mock.calls[0][0].target.value).toBe('2026-09');
    rerender(
      <Form disabled>
        <Form.Item name="date" label="已锁定日期">
          <DateInput type="date" />
        </Form.Item>
      </Form>,
    );
    expect(screen.getByLabelText('已锁定日期')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('已锁定日期'));
    expect(screen.queryByLabelText('选择日期 · 年')).not.toBeInTheDocument();
  });
});

describe('手机选项下拉', () => {
  it('点击不弹输入键盘，需要时在列表内搜索并选择', async () => {
    const changed = vi.fn();
    render(
      <Select
        aria-label="类别"
        showSearch
        optionFilterProp="label"
        onChange={changed}
        options={[
          { value: 'food', label: '生活 / 餐饮 / 午餐' },
          { value: 'travel', label: '出行 / 长途交通' },
        ]}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: '类别' });
    expect(trigger).toHaveAttribute('readonly');
    fireEvent.mouseDown(trigger);
    const search = await screen.findByRole('textbox', { name: '搜索选项' });
    expect(search).not.toHaveFocus();
    fireEvent.change(search, { target: { value: '午餐' } });
    const popup = document.querySelector(
      '.ant-select-dropdown',
    )! as HTMLElement;
    expect(
      within(popup).queryByText('出行 / 长途交通'),
    ).not.toBeInTheDocument();
    fireEvent.click(within(popup).getByText('生活 / 餐饮 / 午餐'));
    expect(changed).toHaveBeenCalledWith(
      'food',
      expect.objectContaining({ value: 'food' }),
    );
  });
  it('保留远程搜索回调及多选，不丢失已选值', async () => {
    const search = vi.fn();
    const changed = vi.fn();
    render(
      <Select
        aria-label="标签"
        mode="multiple"
        showSearch
        filterOption={false}
        onSearch={search}
        onChange={changed}
        value={['a']}
        options={[
          { value: 'a', label: '已选标签' },
          { value: 'b', label: '新标签' },
        ]}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '标签' }));
    fireEvent.change(await screen.findByRole('textbox', { name: '搜索选项' }), {
      target: { value: '新' },
    });
    expect(search).toHaveBeenCalledWith('新');
    const popup = document.querySelector(
      '.ant-select-dropdown',
    )! as HTMLElement;
    fireEvent.click(within(popup).getByText('新标签'));
    expect(changed.mock.calls[0][0]).toEqual(['a', 'b']);
  });
});
