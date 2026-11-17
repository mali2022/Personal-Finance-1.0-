import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Money } from '../components/Money';
import { useUI } from '../stores/ui';
import {
  decimal,
  formatMoney,
  minor,
  parseFilters,
  validateRefund,
  validateSplits,
  validateTransfer,
} from '../utils/finance';
describe('财务输入与格式', () => {
  it('大金额与负零点金额显示不丢失分位', () => {
    expect(formatMoney('9007199254740993.25')).toContain(
      '9,007,199,254,740,993.25',
    );
    expect(formatMoney('-0.01')).toContain('-');
    expect(formatMoney('-0.01')).toContain('0.01');
  });
  it('精确处理十进制金额，不产生 0.1 + 0.2 误差', () =>
    expect(decimal(minor('0.10') + minor('0.20'))).toBe('0.30'));
  it('拒绝第三位小数', () => expect(() => minor('2.345')).toThrow());
  it('转账不能使用相同账户', () =>
    expect(validateTransfer('a', 'a')).toBeTruthy());
  it('允许有效转账', () => expect(validateTransfer('a', 'b')).toBeUndefined());
  it('退款校验累计金额', () => {
    expect(validateRefund('70', '100', '30')).toBeUndefined();
    expect(validateRefund('70.01', '100', '30')).toBeTruthy();
    expect(validateRefund('0', '100', '30')).toBeTruthy();
  });
  it('拆分必须精确相等', () => {
    expect(
      validateSplits('200', [
        { categoryId: 'a', amount: '120' },
        { categoryId: 'b', amount: '50' },
        { categoryId: 'c', amount: '30' },
      ]),
    ).toBeUndefined();
    expect(
      validateSplits('200', [{ categoryId: 'a', amount: '199.99' }]),
    ).toBeTruthy();
  });
  it('0 元交易只允许一条 0 元拆分', () => {
    expect(
      validateSplits('0', [{ categoryId: 'a', amount: '0' }]),
    ).toBeUndefined();
    expect(
      validateSplits('0', [
        { categoryId: 'a', amount: '0' },
        { categoryId: 'b', amount: '0' },
      ]),
    ).toBeTruthy();
    expect(
      validateSplits('0', [{ categoryId: 'a', amount: '0.01' }]),
    ).toBeTruthy();
  });
  it('读取筛选 URL，分页上限为 100', () => {
    const f = parseFilters(
      new URLSearchParams('type=Expense&keyword=午餐&page=2&pageSize=1000'),
    );
    expect(f.type).toBe('Expense');
    expect(f.keyword).toBe('午餐');
    expect(f.page).toBe(2);
    expect(f.pageSize).toBe(100);
  });
  it('支出同时显示负号和金额', () => {
    useUI.setState({ hidden: false });
    render(<Money value="1250.00" type="Expense" />);
    expect(screen.getByText(/-.*1,250.00/)).toBeInTheDocument();
  });
  it('隐私模式遮住金额', () => {
    useUI.setState({ hidden: true });
    render(<Money value="1250.00" />);
    expect(screen.getByText('¥••••••')).toBeInTheDocument();
    useUI.setState({ hidden: false });
  });
  it('美元与港币独立格式化', () => {
    render(
      <>
        <Money value="25.50" currency="USD" />
        <Money value="100.00" currency="HKD" />
      </>,
    );
    expect(screen.getByText(/25.50/)).toHaveTextContent('US$');
    expect(screen.getByText(/100.00/)).toHaveTextContent('HK$');
  });
});
