import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import FuelTrashPanel from '../features/fuel/FuelTrashPanel';
import { fuelBulkApi } from '../features/fuel/bulk';
import type { FuelRow } from '../features/fuel/api';
vi.mock('../features/fuel/bulk', () => ({
  fuelBulkApi: { trash: vi.fn(), apply: vi.fn() },
}));
const row = (id: string): FuelRow => ({
  id,
  version: '3',
  vehicleId: 'car',
  date: '2026-01-01',
  odometer: 1000,
  litres: 20,
  amount: 160,
  currency: 'CNY',
  fullTank: false,
  tankStatus: 'Unknown',
  missedFill: false,
  station: `Station ${id}`,
  note: '',
  unitPrice: 8,
  interval: null,
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fuelBulkApi.trash).mockImplementation(async (page = 1) => ({
    records: [row(String(page))],
    total: 51,
    limit: 50,
  }));
  vi.mocked(fuelBulkApi.apply).mockResolvedValue({
    count: 2,
    action: 'Restore',
  });
});
function show(hidden = false) {
  return render(
    <App>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FuelTrashPanel hidden={hidden} english={false} />
      </QueryClientProvider>
    </App>,
  );
}
it('fetches separate server pages and preserves explicit restore selection across pages', async () => {
  const view = show();
  await screen.findByText('Station 1');
  fireEvent.click(
    view.container.querySelector(
      'tr[data-row-key="1"] input[type="checkbox"]',
    )!,
  );
  fireEvent.click(screen.getByTitle('2'));
  await screen.findByText('Station 2');
  expect(fuelBulkApi.trash).toHaveBeenLastCalledWith(2);
  fireEvent.click(
    view.container.querySelector(
      'tr[data-row-key="2"] input[type="checkbox"]',
    )!,
  );
  fireEvent.click(screen.getByRole('button', { name: '批量恢复' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '确认处理' }));
  await waitFor(() =>
    expect(fuelBulkApi.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Restore',
        targets: expect.arrayContaining([
          { id: '1', version: '3' },
          { id: '2', version: '3' },
        ]),
      }),
      expect.any(String),
    ),
  );
  expect(vi.mocked(fuelBulkApi.apply).mock.calls[0][0].targets).toHaveLength(2);
});
it('keeps private recovery data out of the view and avoids requests in privacy mode', () => {
  const view = show(true);
  expect(view.container.querySelector('.ant-card')).toBeNull();
  expect(fuelBulkApi.trash).not.toHaveBeenCalled();
});
