import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import VehicleCostsPanel from '../features/fuel/VehicleCostsPanel';
import { costApi } from '../features/fuel/costs';
vi.mock('../components/Chart', () => ({ default: () => null }));
vi.mock('../features/transactions/TransactionDrawer', () => ({
  TransactionDrawer: ({ id }: { id?: string }) =>
    id ? <div>Ledger detail {id}</div> : null,
}));
const row = {
  id: 'cost',
  version: '2',
  input: {
    vehicleId: 'car',
    transactionId: 'tx',
    category: 'Fuel',
    amount: '150.00',
    kind: 'Expense' as const,
    note: '',
  },
  currency: 'CNY',
  date: '2026-01-01',
  signedAmount: 150,
  transactionVersion: '3',
  merchant: 'Station',
};
beforeEach(() => {
  vi.spyOn(costApi, 'report').mockResolvedValue({
    rows: [row],
    originalExpenses: [row],
    summary: [
      { currency: 'CNY', paid: 150, refunds: 0, reimbursements: 0, net: 150 },
    ],
    monthly: [],
    categories: [],
    vehicles: [],
    rule: '',
  });
  vi.spyOn(costApi, 'candidates').mockResolvedValue([]);
  vi.spyOn(costApi, 'unlink').mockResolvedValue({} as never);
  vi.spyOn(costApi, 'create');
  vi.spyOn(costApi, 'link');
});
function show(hidden = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <App>
        <VehicleCostsPanel
          vehicles={[
            {
              id: 'car',
              version: '1',
              name: 'Car',
              plate: '',
              fuelType: 'Petrol',
            },
          ]}
          records={[]}
          vehicleId="car"
          from="2026-01-01"
          to="2026-01-31"
          hidden={hidden}
          english
        />
      </App>
    </QueryClientProvider>,
  );
}
it('does not request costs in privacy mode', () => {
  show(true);
  expect(costApi.report).not.toHaveBeenCalled();
  expect(screen.queryByText('150 CNY')).not.toBeInTheDocument();
});
it('opens the actual ledger drawer without creating another transaction', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'tx · Station' }));
  expect(screen.getByText('Ledger detail tx')).toBeInTheDocument();
  expect(costApi.create).not.toHaveBeenCalled();
});
it('confirms unlinking an allocation and passes its original version', async () => {
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Unlink' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  expect(
    screen.getByText(/Only the allocation is removed/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() =>
    expect(costApi.unlink).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cost', version: '2' }),
    ),
  );
  expect(costApi.create).not.toHaveBeenCalled();
});
it('opening the editor does not auto-select or auto-post a candidate transaction', async () => {
  show();
  fireEvent.click(
    screen.getByRole('button', { name: 'Add or link vehicle cost' }),
  );
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  await waitFor(() => expect(costApi.candidates).toHaveBeenCalled());
  expect(costApi.link).not.toHaveBeenCalled();
  expect(costApi.create).not.toHaveBeenCalled();
});
