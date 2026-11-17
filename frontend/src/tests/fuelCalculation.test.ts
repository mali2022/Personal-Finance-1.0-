import { it, expect } from 'vitest';
import {
  litresFromPrice,
  fuelPaymentPreview,
} from '../features/fuel/calculation';
import reference from '../data/fuel-price-reference.json';
it.each([
  [200, 8, 25],
  [200, 8.63, 23.175],
  [300, 7.36, 40.761],
  [0.01, 6.4, 0.002],
  ['200.00', '8.000', 25],
])('calculates %s / %s with exact half-up rounding', (amount, price, result) =>
  expect(litresFromPrice(amount, price)).toBe(result),
);
it.each([
  [200, 0],
  [200, null],
  [null, 8],
  [-1, 8],
  [200, -1],
  ['1e3', 8],
  [200, '8.1234'],
  ['200.001', 8],
  [100000001, 8],
  [200, 0.001],
  [0.01, 1000000],
])('rejects invalid or out-of-range calculation %s / %s', (amount, price) =>
  expect(litresFromPrice(amount, price)).toBeUndefined(),
);
it('preserves the supplied reference snapshot and 31 province names', () => {
  expect(reference.asOf).toBe('2026-10-16');
  expect(reference.prices).toHaveLength(31);
  expect(new Set(reference.prices.map((p) => p.province)).size).toBe(31);
  expect(
    reference.prices.find((p) => p.province === '广东')?.prices['92'],
  ).toBe(8.63);
  expect(
    reference.prices.every((p) => Object.values(p.prices).every((v) => v > 0)),
  ).toBe(true);
});

it('previews gross and paid amounts with decimal half-up rounding and refuses excessive discounts', () => {
  expect(fuelPaymentPreview('20.125', '8.005', '5.00', '5.00')).toEqual({
    gross: 161.1,
    paid: 151.1,
  });
  expect(fuelPaymentPreview(20, 8, 155, 5)).toEqual({ gross: 160, paid: 0 });
  expect(fuelPaymentPreview(20, 8, 160, 5)).toBeUndefined();
});
