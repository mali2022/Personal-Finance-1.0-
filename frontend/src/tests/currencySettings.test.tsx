import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { CurrencySettingsPanel } from '../components/CurrencySettingsPanel';
const mocks = vi.hoisted(() => ({
  get: vi.fn(async () => ({ preferredCurrency: 'EUR', version: 3 })),
  save: vi.fn(async () => ({ preferredCurrency: 'JPY', version: 4 })),
  latest: vi.fn(async () => ({
    baseCurrency: 'EUR',
    targetCurrency: 'USD',
    rate: '1.1',
    date: '2026-10-16',
    fetchedAt: '2026-10-18T10:00:00Z',
    source: 'Frankfurter',
  })),
  write: vi.fn(async () => ({})),
}));
vi.mock('../api/profile', () => ({
  profileApi: { get: mocks.get, save: mocks.save },
}));
vi.mock('../api/currencies', () => ({ latestFx: mocks.latest }));
vi.mock('../api/investments', () => ({ investmentApi: { save: mocks.write } }));
it('shows the quote date and explicitly saves a reference rate without changing the default currency', async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <App>
        <CurrencySettingsPanel enabledCodes={['EUR', 'JPY', 'USD']} />
      </App>
    </QueryClientProvider>,
  );
  await screen.findByText('1 EUR = 1.1 USD');
  expect(screen.getByText('2026-10-16')).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: '保存此报价为历史估值汇率' }),
  );
  await waitFor(() =>
    expect(mocks.write).toHaveBeenCalledWith('/fx-valuation-rates', {
      baseCurrency: 'EUR',
      targetCurrency: 'USD',
      rate: '1.1',
      date: '2026-10-16',
      source: 'Frankfurter',
    }),
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
