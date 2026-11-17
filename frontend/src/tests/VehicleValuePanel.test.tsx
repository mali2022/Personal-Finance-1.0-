import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import VehicleValuePanel from '../features/fuel/VehicleValuePanel';
import { apiClient } from '../api/client';
beforeEach(() => {
  vi.spyOn(apiClient, 'post').mockImplementation(
    async (url) =>
      ({
        data: {
          data:
            url === '/spending-value/compare'
              ? [
                  {
                    id: '1',
                    totalCost: 0,
                    hours: 0,
                    remaining: 10000,
                    preferenceScore: 5,
                    feasible: true,
                    reasons: [],
                  },
                ]
              : { id: 'native-plan' },
        },
      }) as never,
  );
});
function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VehicleValuePanel
        hidden={false}
        english
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
      />
    </QueryClientProvider>,
  );
}
it('requires reviewed assumptions before invoking the existing comparison engine', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Compare options' }));
  await screen.findByText('Review assumptions and subjective scores first');
  expect(apiClient.post).not.toHaveBeenCalled();
});
it('saves reviewed alternatives in the native value lab rather than financial transactions', async () => {
  show();
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I reviewed all period costs and scores; defaults are not recommendations',
    }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Save to spending value lab' }),
  );
  await screen.findByText('Saved decision: native-plan');
  expect(apiClient.post).toHaveBeenCalledWith(
    '/spending-value',
    expect.objectContaining({
      dimensions: ['Comfort', 'Flexibility'],
      reviews: [],
      input: expect.objectContaining({
        options: expect.arrayContaining([
          expect.objectContaining({ scoresConfirmed: true }),
        ]),
      }),
    }),
    expect.objectContaining({
      headers: expect.objectContaining({ 'If-Match': '0' }),
    }),
  );
  expect(
    vi
      .mocked(apiClient.post)
      .mock.calls.some((c) => String(c[0]).includes('/transactions')),
  ).toBe(false);
});
it('creates a native approval draft only after required evidence is entered', async () => {
  show();
  fireEvent.change(screen.getByLabelText('Repair, maintenance or upgrade'), {
    target: { value: 'Tyres' },
  });
  fireEvent.change(screen.getByLabelText('Requested amount'), {
    target: { value: '500' },
  });
  fireEvent.change(screen.getByLabelText('Evidence and necessity'), {
    target: { value: 'User maintenance estimate' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create spending approval draft' }),
  );
  await waitFor(() =>
    expect(apiClient.post).toHaveBeenCalledWith(
      '/fuel/vehicles/car/approval',
      expect.objectContaining({
        name: 'Tyres',
        amount: 500,
        currency: 'CNY',
        reason: 'User maintenance estimate',
      }),
      expect.any(Object),
    ),
  );
  await screen.findByText('Approval draft created: native-plan');
});
