import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import FuelBulkActions from '../features/fuel/FuelBulkActions';
import { fuelBulkApi } from '../features/fuel/bulk';
import type { FuelRow } from '../features/fuel/api';
vi.mock('../features/fuel/bulk', () => ({
  fuelBulkApi: { apply: vi.fn(), trash: vi.fn() },
}));
const rows: FuelRow[] = [
  {
    id: 'a',
    version: '5',
    vehicleId: 'car',
    date: '2026-01-01',
    odometer: 1000,
    litres: 20,
    amount: 160,
    currency: 'CNY',
    fullTank: false,
    tankStatus: 'Unknown',
    missedFill: false,
    station: 'Private station',
    note: '',
    unitPrice: 8,
    interval: null,
  },
];
const onDone = vi.fn(),
  onClear = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  onDone.mockResolvedValue(undefined);
  vi.mocked(fuelBulkApi.apply).mockResolvedValue({
    count: 1,
    action: 'Delete',
  });
});
function show(restore = false) {
  return render(
    <App>
      <FuelBulkActions
        rows={rows}
        english={false}
        disabled={false}
        onDone={onDone}
        onClear={onClear}
        restore={restore}
      />
    </App>,
  );
}
it('requires reviewing a frozen id/version scope before trashing selected records', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: '批量移入回收站' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  expect(screen.getByText('Private station')).toBeVisible();
  expect(fuelBulkApi.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '确认处理' }));
  await waitFor(() =>
    expect(fuelBulkApi.apply).toHaveBeenCalledWith(
      {
        action: 'Delete',
        targets: [{ id: 'a', version: '5' }],
        fullTankConfirmed: false,
      },
      expect.any(String),
    ),
  );
  expect(onClear).toHaveBeenCalled();
});
it('requires explicit verification before setting every selected fill to full', async () => {
  show();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '批量加满状态' }));
  fireEvent.click(await screen.findByText('确认加满'));
  fireEvent.click(screen.getByRole('button', { name: '批量修改状态' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  expect(screen.getByRole('button', { name: '确认处理' })).toBeDisabled();
  fireEvent.click(
    screen.getByRole('checkbox', { name: '我已逐条核实所选记录确实加满' }),
  );
  fireEvent.click(screen.getByRole('button', { name: '确认处理' }));
  await waitFor(() =>
    expect(fuelBulkApi.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SetTankStatus',
        tankStatus: 'Full',
        fullTankConfirmed: true,
      }),
      expect.any(String),
    ),
  );
});
it('retains targets and idempotency key after failure and supports restore', async () => {
  vi.mocked(fuelBulkApi.apply).mockRejectedValueOnce(
    new Error('Network result unknown'),
  );
  show(true);
  fireEvent.click(screen.getByRole('button', { name: '批量恢复' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '确认处理' }));
  expect(await screen.findByText('Network result unknown')).toBeVisible();
  expect(onClear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '确认处理' }));
  await waitFor(() => expect(fuelBulkApi.apply).toHaveBeenCalledTimes(2));
  expect(vi.mocked(fuelBulkApi.apply).mock.calls[0]).toEqual(
    vi.mocked(fuelBulkApi.apply).mock.calls[1],
  );
});
it('hides an already-open confirmation when privacy mode is enabled', async () => {
  const view = show();
  fireEvent.click(screen.getByRole('button', { name: '批量移入回收站' }));
  await screen.findByText('Private station');
  view.rerender(
    <App>
      <FuelBulkActions
        rows={rows}
        english={false}
        disabled
        hidden
        onDone={onDone}
        onClear={onClear}
      />
    </App>,
  );
  expect(screen.queryByText('Private station')).toBeNull();
  expect(fuelBulkApi.apply).not.toHaveBeenCalled();
});
it('offers refresh and reselection after a version conflict without resubmitting stale targets', async () => {
  vi.mocked(fuelBulkApi.apply).mockRejectedValueOnce(
    new Error('Version conflict'),
  );
  show();
  fireEvent.click(screen.getByRole('button', { name: '批量移入回收站' }));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '确认处理' }));
  await screen.findByText('Version conflict');
  fireEvent.click(screen.getByRole('button', { name: '刷新后重新选择' }));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  expect(onClear).toHaveBeenCalledTimes(1);
  expect(fuelBulkApi.apply).toHaveBeenCalledTimes(1);
});
