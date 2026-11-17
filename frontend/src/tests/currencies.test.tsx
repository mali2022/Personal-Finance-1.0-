import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES, currencySymbol } from '../constants/currencies';
import { formatMoney } from '../utils/finance';
import { parseTemplate, templateDefinition } from '../utils/templateImport';
vi.mock('../api/profile', () => ({
  profileApi: { get: async () => ({ preferredCurrency: 'EUR' }) },
}));
it('uses saved default after load and preserves an explicit selection', async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCurrencyState(), { wrapper });
  await waitFor(() => expect(result.current[0]).toBe('EUR'));
  act(() => result.current[1]('JPY'));
  act(() => cache.setQueryData(['profile'], { preferredCurrency: 'GBP' }));
  expect(result.current[0]).toBe('JPY');
});
it('tracks changed defaults when no currency was explicitly selected', async () => {
  const cache = new QueryClient();
  cache.setQueryData(['profile'], { preferredCurrency: 'EUR' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCurrencyState(), { wrapper });
  expect(result.current[0]).toBe('EUR');
  act(() => cache.setQueryData(['profile'], { preferredCurrency: 'GBP' }));
  await waitFor(() => expect(result.current[0]).toBe('GBP'));
});
it('offers 32 currencies with distinct symbols and precise amounts', () => {
  expect(new Set(CURRENCY_CODES).size).toBe(32);
  expect(CURRENCY_CODES).toContain('EUR');
  expect(CURRENCY_CODES).toContain('JPY');
  expect(formatMoney('1234.56', 'EUR')).toContain('1,234.56');
  expect(formatMoney('1234.56', 'JPY')).toContain('1,234.56');
  expect(formatMoney('1', 'EUR', true)).toBe('€••••••');
  expect(currencySymbol('GBP')).toBe('£');
});
it('accepts new currency codes in existing CSV imports', () => {
  const d = templateDefinition('projects');
  const values = [...d.example];
  values[1] = 'EUR';
  expect(
    parseTemplate('projects', d.headers.join(',') + '\n' + values.join(','))[0]
      .currency,
  ).toBe('EUR');
  values[1] = 'BAD';
  expect(() =>
    parseTemplate('projects', d.headers.join(',') + '\n' + values.join(',')),
  ).toThrow();
});
