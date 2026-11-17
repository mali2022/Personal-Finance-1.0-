import { expect, it } from 'vitest';
import { fuelWorkspace } from '../features/fuel/workspace';

it('restores shareable workspace filters', () => {
  const state = fuelWorkspace(
    new URLSearchParams(
      'tab=analysis&vehicle=car&currency=USD&from=2025-12-01&to=2026-10-30',
    ),
  );
  expect(state.tab).toBe('analysis');
  expect(state.vehicleId).toBe('car');
  expect(state.currency).toBe('USD');
  expect(state.range.map((x) => x.format('YYYY-MM-DD'))).toEqual([
    '2025-12-01',
    '2026-10-30',
  ]);
});

it.each([
  'from=2026-02-30&to=2026-10-30',
  'from=2026-10-30&to=2026-01-01',
  'from=1901-01-01&to=2026-10-30',
])('rejects invalid or excessive date ranges: %s', (query) => {
  const state = fuelWorkspace(
    new URLSearchParams(`tab=missing&currency=FAKE&${query}`),
  );
  expect(state.tab).toBe('overview');
  expect(state.currency).toBe('CNY');
  expect(state.range[0].isAfter(state.range[1])).toBe(false);
  expect(state.range[1].diff(state.range[0], 'day')).toBeLessThanOrEqual(3660);
});
