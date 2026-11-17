import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FuelOverviewPanel from '../features/fuel/FuelOverviewPanel';
import { costApi } from '../features/fuel/costs';
import { apiClient } from '../api/client';
import type { FuelReport } from '../features/fuel/api';
vi.mock('../components/Chart', () => ({ default: () => null }));
const report: FuelReport = {
  records: [],
  monthly: [],
  summary: {
    count: 1,
    litres: 20,
    amount: 150,
    currency: 'CNY',
    weightedUnitPrice: 7.5,
    otherCurrencyCount: 0,
    completedIntervals: 1,
    distance: 500,
    consumedLitres: 20,
    litresPer100Km: 4,
  },
};
beforeEach(() => {
  vi.spyOn(costApi, 'report').mockResolvedValue({
    rows: [],
    originalExpenses: [],
    summary: [
      { currency: 'CNY', paid: 150, refunds: 0, reimbursements: 0, net: 150 },
    ],
    monthly: [],
    categories: [],
    vehicles: [],
    rule: '',
    distanceCosts: [
      {
        vehicleId: 'car',
        currency: 'CNY',
        validDistance: 500,
        linkedNet: 150,
        linkedCashPerValidKm: 0.3,
        fuelDistance: 500,
        intervalFuelPaid: 150,
        fuelCostPerKm: 0.3,
        validIntervals: 1,
        rule: '',
      },
    ],
  });
  vi.spyOn(apiClient, 'get').mockResolvedValue({
    data: {
      data: [
        {
          id: 'budget',
          version: '1',
          input: {
            vehicleId: 'car',
            period: '2026-10',
            category: 'Fuel',
            currency: 'CNY',
            amount: '100.00',
          },
          actual: 150,
          remaining: -50,
          usedPercent: 150,
        },
      ],
    },
  } as never);
});
function show(hidden = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FuelOverviewPanel
        report={report}
        vehicles={[
          {
            id: 'car',
            version: '1',
            name: 'Car',
            plate: '',
            fuelType: 'Petrol',
          },
        ]}
        from="2026-01-01"
        to="2026-10-31"
        currency="CNY"
        hidden={hidden}
        english
        onCosts={() => {}}
      />
    </QueryClientProvider>,
  );
}
it('keeps financial and budget queries disabled in privacy mode', () => {
  show(true);
  expect(costApi.report).not.toHaveBeenCalled();
  expect(apiClient.get).not.toHaveBeenCalled();
});
it('separates paid purchase price, interval cost and linked cash, and displays actual budget overrun', async () => {
  show();
  await screen.findByText('150%');
  expect(
    screen.getByText('Period weighted paid fuel price'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Fuel cost/100km in valid intervals'),
  ).toBeInTheDocument();
  expect(screen.getByText('30')).toBeInTheDocument();
  expect(screen.getByText('150 / -50')).toBeInTheDocument();
  expect(
    screen
      .getByText('Selected vehicle economic cost estimate')
      .closest('.ant-card'),
  ).toHaveTextContent('—');
});
