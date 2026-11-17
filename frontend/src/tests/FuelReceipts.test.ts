import { expect, it } from 'vitest';
import { parseFuelReceipt, readFuelReceipt } from '../features/fuel/receipts';
import { fuelCsv } from '../features/fuel/api';
import { parseFuelCsv } from '../features/fuel/import';
import type { FuelRow } from '../features/fuel/api';
it('extracts only labeled receipt facts and never infers tank state or unlabeled amounts', () => {
  expect(
    parseFuelReceipt(
      '2026-10-30 实付金额：150.00 加油量：20.125 累计里程：12345.6 挂牌价：8.005 加满 9999',
    ),
  ).toEqual({
    date: '2026-10-30',
    amount: 150,
    litres: 20.125,
    odometer: 12345.6,
    postedUnitPrice: 8.005,
  });
  expect(parseFuelReceipt('123456 200.00 25.0')).toEqual({});
});
it('rejects empty, oversized and unsupported files before reading', async () => {
  await expect(
    readFuelReceipt(new File([], 'x.png', { type: 'image/png' })),
  ).rejects.toThrow();
  await expect(
    readFuelReceipt(new File(['data'], 'x.svg', { type: 'image/svg+xml' })),
  ).rejects.toThrow();
  await expect(
    readFuelReceipt(
      new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'x.png', {
        type: 'image/png',
      }),
    ),
  ).rejects.toThrow();
});
it('round trips original receipt facts including unknown values and formula-like payment text', () => {
  const vehicles = [
    { id: 'car', version: '1', name: 'Car', plate: '', fuelType: 'Petrol' },
  ];
  const row = {
    id: 'r',
    version: '1',
    vehicleId: 'car',
    date: '2026-01-01',
    odometer: 100,
    litres: 20,
    amount: 150,
    currency: 'CNY',
    fullTank: false,
    tankStatus: 'Unknown',
    missedFill: false,
    station: 'Station',
    note: '',
    unitPrice: 7.5,
    interval: null,
    postedUnitPrice: 8,
    originalAmount: 160,
    discount: 5,
    pointsRedemption: 5,
    paymentMethod: '=cash',
    drivingScene: 'City',
    occurredTime: '12:34:56',
    odometerReset: true,
  } satisfies FuelRow;
  for (const english of [false, true]) {
    const parsed = parseFuelCsv(fuelCsv([row], vehicles, english), vehicles)[0];
    expect(parsed.errors).toEqual([]);
    expect(parsed.input).toMatchObject({
      postedUnitPrice: 8,
      originalAmount: 160,
      discount: 5,
      pointsRedemption: 5,
      paymentMethod: '=cash',
      drivingScene: 'City',
      occurredTime: '12:34:56',
      odometerReset: true,
    });
  }
});
