import { expect, it } from 'vitest';
import { parseFuelCsv } from '../features/fuel/import';
import { fuelCsv } from '../features/fuel/api';
import type { FuelRow } from '../features/fuel/api';
const vehicles = [
  { id: 'car', version: '1', name: 'Family', plate: '', fuelType: 'Petrol' },
];
const header = 'Date,Vehicle ID,Litres,Amount,Currency,Full tank';
const record: FuelRow = {
  id: 'r',
  version: '1',
  vehicleId: 'car',
  date: '2026-01-01',
  odometer: 1000,
  litres: 25,
  amount: 200,
  currency: 'CNY',
  fullTank: true,
  tankStatus: 'Full',
  missedFill: false,
  station: ' =SUM(1,2)',
  note: '\'=literal\n"quoted"',
  unitPrice: 8,
  enteredUnitPrice: 8,
  quantitySource: 'Calculated',
  fuelGrade: 'Petrol95',
  interval: null,
};
it.each([false, true])(
  'round-trips exported CSV and formula guards without losing provenance: English=%s',
  (english) => {
    const row = parseFuelCsv(fuelCsv([record], vehicles, english), vehicles)[0];
    expect(row.errors).toEqual([]);
    expect(row.input).toMatchObject({
      vehicleId: 'car',
      tankStatus: 'Full',
      litres: 25,
      amount: 200,
      enteredUnitPrice: 8,
      quantitySource: 'Calculated',
      fuelGrade: 'Petrol95',
      station: record.station,
      note: record.note,
    });
  },
);
it('never promotes legacy boolean tank flags to confirmed full', () => {
  const rows = parseFuelCsv(
    `${header}\n2026-01-01,car,20,160,CNY,true\n2026-01-02,car,20,160,CNY,false`,
    vehicles,
  );
  expect(
    rows.every(
      (r) =>
        r.input?.tankStatus === 'Unknown' &&
        !r.input.fullTank &&
        r.warnings.length,
    ),
  ).toBe(true);
});
it('keeps missing readings null and unknown tank/grade facts unknown', () => {
  const [row] = parseFuelCsv(
    '日期,车辆,加油量(L),实付金额,币种\n2026-01-01,Family,20,160,CNY',
    vehicles,
  );
  expect(row.errors).toEqual([]);
  expect(row.input).toMatchObject({
    odometer: null,
    historicalBackfill: true,
    tankStatus: 'Unknown',
    fuelGrade: 'Unknown',
  });
});
it('rejects ambiguous vehicle names while stable IDs remain usable', () => {
  const both = [...vehicles, { ...vehicles[0], id: 'other' }];
  expect(
    parseFuelCsv(
      'Date,Vehicle,Litres,Amount,Currency\n2026-01-01,Family,20,160,CNY',
      both,
    )[0].errors.join(),
  ).toContain('名称不唯一');
  expect(
    parseFuelCsv(`${header}\n2026-01-01,car,20,160,CNY,Unknown`, both)[0]
      .errors,
  ).toEqual([]);
});
it('reports numeric, date, currency, tank and column errors per row', () => {
  const rows = parseFuelCsv(
    `${header}\n2026-02-30,car,-20,1e3,FAKE,Maybe\n2026-01-01,car,20,160,CNY,Unknown,extra`,
    vehicles,
  );
  expect(rows[0].errors.length).toBeGreaterThan(3);
  expect(rows[1].errors).toContain('列数与表头不同');
});
it('bounds batch size and rejects malformed headers and quoting', () => {
  expect(() =>
    parseFuelCsv(
      'Date,Date,Litres,Amount,Currency,Vehicle\n2026-01-01,x,20,160,CNY,Family',
      vehicles,
    ),
  ).toThrow('重复字段');
  expect(() =>
    parseFuelCsv('Date,Vehicle\n2026-01-01,Family', vehicles),
  ).toThrow('必填表头');
  expect(() => parseFuelCsv(`${header}\n"unclosed`, vehicles)).toThrow('引号');
  expect(() =>
    parseFuelCsv(
      `${header}\n` + '2026-01-01,car,20,160,CNY,Unknown\n'.repeat(201),
      vehicles,
    ),
  ).toThrow('200');
});
it('does not permit archived vehicles or silent price provenance changes', () => {
  const csv = fuelCsv([{ ...record, quantitySource: 'Manual' }], vehicles);
  expect(parseFuelCsv(csv, vehicles)[0].errors.join()).toContain('手填油量');
  expect(
    parseFuelCsv(`${header}\n2026-01-01,car,20,160,CNY,Unknown`, [
      { ...vehicles[0], status: 'Archived' },
    ])[0].errors.join(),
  ).toContain('归档');
});
