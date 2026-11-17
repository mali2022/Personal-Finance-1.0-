import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import FuelQualityPanel from '../features/fuel/FuelQualityPanel';
import type { FuelReport, FuelRow } from '../features/fuel/api';
const row: FuelRow = {
  id: 'fill',
  version: '1',
  vehicleId: 'car',
  date: '2026-10-01',
  odometer: null,
  litres: 60,
  amount: 480,
  currency: 'CNY',
  fullTank: false,
  missedFill: false,
  station: 'Station',
  note: '',
  unitPrice: 8,
  interval: null,
};
const quality: NonNullable<FuelReport['quality']> = {
  ruleVersion: '1.0',
  samples: [
    { vehicleId: 'car', eligibleIntervals: 2, requiredPriorIntervals: 5 },
  ],
  issues: [
    {
      recordId: 'fill',
      code: 'EXCEEDS_TANK_CAPACITY',
      severity: 'WARNING',
      relatedRecordIds: [],
      observed: 60,
      baseline: 50,
    },
    {
      recordId: 'fill',
      code: 'POSSIBLE_DUPLICATE',
      severity: 'WARNING',
      relatedRecordIds: ['previous-fill'],
      observed: null,
      baseline: null,
    },
  ],
};
const props = {
  quality,
  rows: [row],
  vehicles: [
    {
      id: 'car',
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
it('shows deterministic evidence, limited samples and a working original-record review action', () => {
  render(<FuelQualityPanel {...props} />);
  expect(screen.getByText('加油量超过已填油箱容量')).toBeVisible();
  expect(screen.getByText('60 / 50')).toBeVisible();
  expect(screen.getByText('previous-fill')).toBeVisible();
  expect(screen.getByText(/统计样本不足/)).toBeVisible();
  fireEvent.click(screen.getAllByRole('button', { name: '核对原始记录' })[0]);
  expect(props.onEdit).toHaveBeenCalledWith(row);
  expect(row.fullTank).toBe(false);
});
it('hides findings and related ids in privacy mode', () => {
  const view = render(<FuelQualityPanel {...props} hidden />);
  expect(view.container).toBeEmptyDOMElement();
});
it('reports an empty scope without claiming that the vehicle is mechanically healthy', () => {
  render(
    <FuelQualityPanel
      {...props}
      quality={{ ...quality, issues: [] }}
      english
    />,
  );
  expect(
    screen.getByText('Current range: 0 findings (not mechanical diagnoses)'),
  ).toBeVisible();
  expect(screen.getByText(/insufficient statistical sample/)).toBeVisible();
});
