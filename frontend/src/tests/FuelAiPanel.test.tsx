import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FuelAiPanel from '../features/fuel/FuelAiPanel';
import { fuelAiApi } from '../features/fuel/ai';
import { aiApi } from '../api/ai';
vi.mock('../components/ai/AiLazyMarkdown', () => ({
  AiLazyMarkdown: ({ text }: { text: string }) => <div>{text}</div>,
}));
beforeEach(() => {
  vi.spyOn(aiApi, 'settings').mockResolvedValue({
    configured: true,
    privacy: { enabled: true, allowSummary: true },
  } as never);
  vi.spyOn(fuelAiApi, 'evidence').mockResolvedValue({
    from: '2026-01-01',
    to: '2026-01-31',
    currency: 'CNY',
    task: 'Fuel',
    ruleVersion: 'fuel-2.0',
    fuel: {
      count: 1,
      litres: 20,
      amount: 150,
      currency: 'CNY',
      otherCurrencyCount: 0,
      completedIntervals: 0,
      distance: 0,
      consumedLitres: 0,
      litresPer100Km: null,
    },
    monthly: [],
    intervalStates: [],
    quality: [],
    cashCosts: [],
    limitations: '',
  });
  vi.spyOn(fuelAiApi, 'history').mockResolvedValue([]);
  vi.spyOn(fuelAiApi, 'analyze').mockRejectedValue(
    new Error('Provider unavailable'),
  );
});
function show(hidden = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FuelAiPanel
        vehicleId="car"
        from="2026-01-01"
        to="2026-01-31"
        currency="CNY"
        hidden={hidden}
        english
      />
    </QueryClientProvider>,
  );
}
it('does not read or transmit evidence in privacy mode', () => {
  show(true);
  expect(fuelAiApi.evidence).not.toHaveBeenCalled();
  expect(aiApi.settings).not.toHaveBeenCalled();
  expect(fuelAiApi.analyze).not.toHaveBeenCalled();
});
it('requires explicit transmission consent and preserves deterministic evidence on provider failure', async () => {
  show();
  await screen.findByText('Insufficient data');
  const button = screen.getByRole('button', {
    name: 'Generate vehicle analysis',
  });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByText('Provider unavailable');
  expect(screen.getByText('Insufficient data')).toBeInTheDocument();
  expect(fuelAiApi.analyze).toHaveBeenCalledWith(
    expect.objectContaining({ confirmTransmission: true, vehicleId: 'car' }),
    expect.any(String),
  );
  expect(
    screen.queryByText('Model explanation (verify against evidence)'),
  ).not.toBeInTheDocument();
});
it('keeps analysis disabled when the configured privacy policy does not authorize summaries', async () => {
  vi.mocked(aiApi.settings).mockResolvedValue({
    configured: true,
    privacy: { enabled: true, allowSummary: false },
  } as never);
  show();
  await screen.findByText(
    'AI is unconfigured or summary consent is missing; core calculations remain available',
  );
  fireEvent.click(screen.getByRole('checkbox'));
  expect(
    screen.getByRole('button', { name: 'Generate vehicle analysis' }),
  ).toBeDisabled();
  expect(fuelAiApi.analyze).not.toHaveBeenCalled();
});
