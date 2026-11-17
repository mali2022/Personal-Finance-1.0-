import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FuelPricesPanel from '../features/fuel/FuelPricesPanel';
import type { FuelRow, FuelStationPrices } from '../features/fuel/api';

vi.mock('../components/Chart', () => ({
  default: () => <div>Paid price trend</div>,
}));
const row: FuelRow = {
  id: 'r',
  version: '1',
  vehicleId: 'v',
  date: '2026-10-01',
  odometer: 1000,
  litres: 20,
  amount: 140,
  currency: 'CNY',
  fullTank: false,
  missedFill: false,
  station: '  Original station  ',
  note: '',
  unitPrice: 7,
  interval: null,
  fuelGrade: 'Petrol92',
};
const group: FuelStationPrices = {
  station: 'ORIGINAL STATION',
  vehicleId: 'v',
  fuelGrade: 'Petrol92',
  currency: 'CNY',
  count: 1,
  litres: 20,
  amount: 140,
  weightedUnitPrice: 7,
  minimumUnitPrice: 7,
  maximumUnitPrice: 7,
  estimatedQuantityCount: 0,
  recordIds: ['r'],
  trend: [
    { date: '2026-10-01', unitPrice: 7 },
    { date: '2026-10-02', unitPrice: 8 },
  ],
};
const props = {
  rows: [row],
  groups: [group],
  vehicles: [
    {
      id: 'v',
      version: '1',
      name: 'Private vehicle',
      plate: '',
      fuelType: 'Petrol',
    },
  ],
  hidden: false,
  english: false,
  onEdit: vi.fn(),
};

it('shows actual paid metrics, original evidence, trend and working edit action', async () => {
  const view = render(<FuelPricesPanel {...props} />);
  expect(screen.getByText('92号汽油')).toBeVisible();
  expect(screen.getByText('Private vehicle')).toBeVisible();
  fireEvent.click(
    view.container.querySelector('button.ant-table-row-expand-icon')!,
  );
  expect(await screen.findByText('Paid price trend')).toBeVisible();
  expect(screen.getByText('Original station', { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '编辑记录' }));
  expect(props.onEdit).toHaveBeenCalledWith(row);
  view.rerender(<FuelPricesPanel {...props} hidden />);
  expect(screen.queryByText('Private vehicle')).toBeNull();
  expect(screen.queryByText('Paid price trend')).toBeNull();
});

it('provides honest empty and English states', () => {
  const view = render(<FuelPricesPanel {...props} groups={[]} />);
  expect(screen.getByText('当前筛选范围暂无油价分析数据')).toBeVisible();
  view.rerender(<FuelPricesPanel {...props} english />);
  expect(screen.getByText('Petrol 92')).toBeVisible();
});
