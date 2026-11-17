import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Sensitive } from '../components/Sensitive';
import { Money } from '../components/Money';
import { useUI } from '../stores/ui';
import { activeNavigation } from '../design/navigation';

afterEach(() => {
  cleanup();
  useUI.setState({ hidden: false });
});
describe('展示隐私与嵌套导航', () => {
  it('隐私切换立即移除备注、对象与金额的 DOM 文本，关闭后恢复', () => {
    render(
      <>
        <Sensitive>私人备注与对象</Sensitive>
        <Money value="1234.56" />
      </>,
    );
    expect(screen.getByText('私人备注与对象')).toBeInTheDocument();
    act(() => useUI.getState().toggleHidden());
    expect(screen.queryByText('私人备注与对象')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('1,234.56');
    act(() => useUI.getState().toggleHidden());
    expect(screen.getByText('私人备注与对象')).toBeInTheDocument();
  });
  it('嵌套模块选中完整入口，业务详情回退到父入口', () => {
    expect(activeNavigation('/reports/custom')?.key).toBe('/reports/custom');
    expect(activeNavigation('/budgets/annual')?.key).toBe('/budgets/annual');
    expect(activeNavigation('/accounts/fund-status')?.key).toBe(
      '/accounts/fund-status',
    );
    expect(activeNavigation('/settings/payment-instruments')?.group).toBe(
      'assets',
    );
    expect(activeNavigation('/transactions/record-id')?.key).toBe(
      '/transactions',
    );
    expect(activeNavigation('/accounts/record-id')?.key).toBe('/accounts');
  });
});
