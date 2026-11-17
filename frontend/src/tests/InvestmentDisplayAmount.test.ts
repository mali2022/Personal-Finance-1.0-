import { expect, it } from 'vitest';
import { investmentDisplayAmount } from '../features/investmentReturns/displayAmount';
it('rounds decimal strings for display without losing large integer precision', () => {
  expect(investmentDisplayAmount('100.0000000000000000')).toBe('100.00');
  expect(investmentDisplayAmount('1.005')).toBe('1.01');
  expect(investmentDisplayAmount('-1.005')).toBe('-1.01');
  expect(investmentDisplayAmount('999999999999999999.995')).toBe('1000000000000000000.00');
});
