import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import VehiclePlanningPanel from '../features/fuel/VehiclePlanningPanel';
import { vehiclePlanningApi } from '../features/fuel/planning';
beforeEach(() => {
  vi.spyOn(vehiclePlanningApi, 'report').mockResolvedValue({
    link: null,
    asset: null,
    choices: [],
    opening: null,
    closing: null,
    modelConsumption: null,
    economicEstimate: null,
    rules: [],
    valuations: [],
    budgets: [],
  });
  vi.spyOn(vehiclePlanningApi, 'budget').mockResolvedValue({} as never);
  vi.spyOn(vehiclePlanningApi, 'asset');
});
function show(hidden = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App>
        <VehiclePlanningPanel
          vehicles={[
            {
              id: 'car',
              version: '1',
              name: 'Car',
              plate: '',
              fuelType: 'Petrol',
            },
          ]}
          vehicleId="car"
          from="2026-01-01"
          to="2026-10-30"
          hidden={hidden}
          english
        />
      </App>
    </QueryClientProvider>,
  );
}
it('does not query planning data in privacy mode', () => {
  show(true);
  expect(vehiclePlanningApi.report).not.toHaveBeenCalled();
});
it('does not invent economic cost without a reliable asset model', async () => {
  show();
  await screen.findByText(
    'No economic cost estimate without a reliable asset model and period data.',
  );
  expect(vehiclePlanningApi.asset).not.toHaveBeenCalled();
});
it('saves a vehicle budget with explicit original currency and period', async () => {
  show();
  await screen.findByText(
    'No economic cost estimate without a reliable asset model and period data.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add vehicle budget' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  fireEvent.change(screen.getByLabelText('Period YYYY-MM or YYYY'), {
    target: { value: '2026-10' },
  });
  fireEvent.change(screen.getByLabelText('Budget amount'), {
    target: { value: '500' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm save' }));
  await waitFor(() =>
    expect(vehiclePlanningApi.budget).toHaveBeenCalledWith(
      {
        vehicleId: 'car',
        period: '2026-10',
        category: 'Fuel',
        currency: 'CNY',
        amount: '500.00',
      },
      expect.any(String),
      undefined,
    ),
  );
});
