import { expect, it } from 'vitest';
import { filterFuelRecords, fuelRecordFilters } from '../features/fuel/records';
import { fuelCsv } from '../features/fuel/api';
import type { FuelReport, FuelRow } from '../features/fuel/api';
const r = (
  id: string,
  date: string,
  amount: number,
  currency = 'CNY',
  odometer: number | null = 1000,
): FuelRow => ({
  id,
  date,
  amount,
  currency,
  odometer,
  version: '1',
  vehicleId: 'car',
  litres: 20,
  fullTank: false,
  tankStatus: 'Unknown',
  fuelGrade: 'Unknown',
  missedFill: false,
  station: id,
  note: '',
  unitPrice: amount / 20,
  interval: null,
});
const rows = [
  r('Alpha', '2026-10-01', 200),
  {
    ...r('Beta', '2026-10-03', 80, 'USD', null),
    tankStatus: 'Full' as const,
    fuelGrade: 'Petrol95',
  },
  {
    ...r('Gamma', '2026-10-02', 160),
    tankStatus: 'Partial' as const,
    note: 'Weekend trip',
  },
];
const vehicles = [
  {
    id: 'car',
    version: '1',
    name: 'Family Car',
    plate: 'ABC',
    fuelType: 'Petrol',
  },
];
const quality: FuelReport['quality'] = {
  ruleVersion: '1',
  samples: [],
  issues: [
    {
      recordId: 'Beta',
      code: 'UNKNOWN',
      severity: 'WARNING',
      observed: null,
      baseline: null,
      relatedRecordIds: [],
    },
  ],
};
const select = (query: string) =>
  filterFuelRecords(
    rows,
    vehicles,
    quality,
    fuelRecordFilters(new URLSearchParams(query)),
  );
it('combines case-insensitive search and filters without changing source records', () => {
  expect(select('q=weekEND').map((r) => r.id)).toEqual(['Gamma']);
  expect(
    select(
      'q=family+car&tank=Full&grade=Petrol95&recordCurrency=USD&issues=1',
    ).map((r) => r.id),
  ).toEqual(['Beta']);
  expect(select('issues=1&recordCurrency=CNY')).toEqual([]);
  expect(rows.map((r) => r.id)).toEqual(['Alpha', 'Beta', 'Gamma']);
});
it('sorts numbers numerically and places missing readings last in either direction', () => {
  const input = [
    r('ten', '2026-01-01', 10, 'CNY', 10),
    r('two', '2026-01-01', 2, 'CNY', 2),
    r('null', '2026-01-01', 1, 'CNY', null),
  ];
  for (const order of ['asc', 'desc']) {
    const sorted = filterFuelRecords(
      input,
      [],
      undefined,
      fuelRecordFilters(new URLSearchParams(`recordSort=odometer-${order}`)),
    );
    expect(sorted.at(-1)?.id).toBe('null');
    expect(sorted[0].id).toBe(order === 'asc' ? 'two' : 'ten');
  }
});
it('keeps original currencies grouped when sorting money', () => {
  expect(select('recordSort=amount-desc').map((r) => r.id)).toEqual([
    'Alpha',
    'Gamma',
    'Beta',
  ]);
  expect(select('recordSort=amount-asc').map((r) => r.id)).toEqual([
    'Gamma',
    'Alpha',
    'Beta',
  ]);
});
it('exports precisely the matching rows in the matching order', () => {
  const csv = fuelCsv(
    select('recordCurrency=CNY&recordSort=date-asc'),
    vehicles,
  );
  expect(csv.split('\r\n')).toHaveLength(3);
  expect(csv).not.toContain('Beta');
  expect(csv.indexOf('Alpha')).toBeLessThan(csv.indexOf('Gamma'));
});
it('bounds query length and falls back for malformed enum states', () => {
  const filters = fuelRecordFilters(
    new URLSearchParams({
      q: 'x'.repeat(300),
      tank: 'Wrong',
      grade: 'Wrong',
      recordCurrency: 'FAKE',
      recordSort: 'Wrong',
    }),
  );
  expect(filters.query).toHaveLength(200);
  expect(filters.tank).toBe('');
  expect(filters.grade).toBe('');
  expect(filters.currency).toBe('');
  expect(filters.sort).toBe('date-desc');
});
it('does not label every record as having findings when quality data is absent', () => {
  expect(
    filterFuelRecords(
      rows,
      vehicles,
      undefined,
      fuelRecordFilters(new URLSearchParams('issues=1')),
    ),
  ).toEqual([]);
});
