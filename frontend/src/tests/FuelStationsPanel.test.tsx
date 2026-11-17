import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FuelStationsPanel, {
  stationApi,
} from '../features/fuel/FuelStationsPanel';

beforeEach(() => {
  vi.spyOn(stationApi, 'list');
  vi.spyOn(stationApi, 'save');
  vi.spyOn(stationApi, 'merge');
  vi.mocked(stationApi.list).mockResolvedValue([
    {
      id: 's',
      version: '2',
      input: {
        name: 'Main station',
        brand: 'Brand',
        address: 'Address',
        aliases: ['OLD STATION'],
        favorite: true,
        archived: false,
      },
    },
  ]);
  vi.mocked(stationApi.save).mockResolvedValue({} as never);
});
function show(hidden = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FuelStationsPanel hidden={hidden} english />
    </QueryClientProvider>,
  );
}
it('does not request or display station data in privacy mode', () => {
  show(true);
  expect(stationApi.list).not.toHaveBeenCalled();
  expect(screen.queryByText('Main station')).not.toBeInTheDocument();
});
it('edits metadata with the original version and preserves historical aliases', async () => {
  show();
  await screen.findByText('★ Main station');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  fireEvent.change(screen.getByLabelText('Station name'), {
    target: { value: 'Renamed station' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() =>
    expect(stationApi.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Renamed station',
        aliases: ['OLD STATION'],
      }),
      expect.any(String),
      expect.objectContaining({ id: 's', version: '2' }),
    ),
  );
});
it('keeps the editor and the same idempotency key after a network failure', async () => {
  vi.mocked(stationApi.save)
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValue({} as never);
  show();
  await screen.findByText('★ Main station');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  await screen.findByText('Network unavailable');
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(stationApi.save).toHaveBeenCalledTimes(2));
  expect(vi.mocked(stationApi.save).mock.calls[0][1]).toBe(
    vi.mocked(stationApi.save).mock.calls[1][1],
  );
});
