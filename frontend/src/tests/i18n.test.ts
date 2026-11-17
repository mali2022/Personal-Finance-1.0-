import { afterEach, describe, expect, it } from 'vitest';
import { t, localizedLabels } from '../i18n';
import { useUI } from '../stores/ui';
import { minor, formatMoney } from '../utils/finance';
afterEach(() => useUI.getState().setLanguage('zh-CN'));
describe('language and financial data', () => {
  it('switches labels reactively and preserves unknown user text', () => {
    const labels = localizedLabels({ income: '收入' });
    expect(labels.income).toBe('收入');
    useUI.getState().setLanguage('en');
    expect(labels.income).toBe('Income');
    expect(t('我的测试商户')).toBe('我的测试商户');
    expect(Object.entries(labels)).toEqual([['income', 'Income']]);
  });
  it('does not change exact monetary arithmetic', () => {
    const value = '90071992547409.93';
    const cents = minor(value);
    useUI.getState().setLanguage('en');
    expect(minor(value)).toBe(cents);
    expect(formatMoney(value, 'CNY')).toContain('.93');
  });
  it('persisted UI preferences contain no credentials or profile values', () => {
    useUI.getState().setLanguage('en');
    const data = JSON.parse(localStorage.getItem('finance-ui')!);
    expect(data.state.language).toBe('en');
    expect(Object.keys(data.state).sort()).toEqual([
      'defaultAccount',
      'hidden',
      'language',
      'theme',
    ]);
  });
});
