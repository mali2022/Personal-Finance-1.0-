import type { FuelReport, FuelRow, Vehicle } from './api';
import { CURRENCY_CODES } from '../../constants/currencies';
export const recordSorts = [
  'date-desc',
  'date-asc',
  'odometer-desc',
  'odometer-asc',
  'litres-desc',
  'litres-asc',
  'amount-desc',
  'amount-asc',
  'price-desc',
  'price-asc',
] as const;
export function fuelRecordFilters(params: URLSearchParams) {
  const tank = params.get('tank');
  const grade = params.get('grade') ?? '';
  const currency = params.get('recordCurrency') ?? '';
  return {
    query: (params.get('q') ?? '').slice(0, 200).trim(),
    tank: ['Full', 'Partial', 'Unknown'].includes(tank ?? '') ? tank! : '',
    grade: [
      'Unknown',
      'Petrol92',
      'Petrol95',
      'Petrol98',
      'Diesel0',
      'DieselMinus10',
      'Other',
    ].includes(grade)
      ? grade
      : '',
    currency: CURRENCY_CODES.some((code) => code === currency) ? currency : '',
    issuesOnly: params.get('issues') === '1',
    sort:
      recordSorts.find((value) => value === params.get('recordSort')) ??
      'date-desc',
  };
}
export function filterFuelRecords(
  rows: FuelRow[],
  vehicles: Vehicle[],
  quality: FuelReport['quality'],
  filters: ReturnType<typeof fuelRecordFilters>,
) {
  const names = new Map(
    vehicles.map((v) => [
      v.id,
      [v.name, v.plate, v.brand, v.model].filter(Boolean).join(' '),
    ]),
  );
  const flagged = new Set(quality?.issues.map((issue) => issue.recordId));
  const query = filters.query.toLocaleLowerCase();
  const result = rows.filter(
    (row) =>
      (!query ||
        [row.id, row.date, row.station, row.note, names.get(row.vehicleId)]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)) &&
      (!filters.tank || (row.tankStatus ?? 'Unknown') === filters.tank) &&
      (!filters.grade || (row.fuelGrade ?? 'Unknown') === filters.grade) &&
      (!filters.currency || row.currency === filters.currency) &&
      (!filters.issuesOnly || flagged.has(row.id)),
  );
  const [field, direction] = filters.sort.split('-');
  const sign = direction === 'asc' ? 1 : -1;
  const number = (row: FuelRow) =>
    field === 'odometer'
      ? row.odometer
      : field === 'litres'
        ? row.litres
        : field === 'amount'
          ? row.amount
          : row.unitPrice;
  return result.sort((a, b) => {
    // Money in different currencies is never ranked against each other.
    if ((field === 'amount' || field === 'price') && a.currency !== b.currency)
      return a.currency.localeCompare(b.currency);
    let order = 0;
    if (field === 'date') order = a.date.localeCompare(b.date);
    else {
      const x = number(a),
        y = number(b);
      if (x == null && y != null) return 1;
      if (y == null && x != null) return -1;
      if (x != null && y != null) order = x - y;
    }
    return (
      order * sign ||
      b.date.localeCompare(a.date) ||
      (b.odometer ?? -1) - (a.odometer ?? -1) ||
      a.id.localeCompare(b.id)
    );
  });
}
