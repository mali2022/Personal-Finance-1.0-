import { decimal } from '../../utils/finance';

// Display only: exact decimal-string rounding, away from zero at half a cent.
export function investmentDisplayAmount(value: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error('Invalid investment amount');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.slice(0, 2).padEnd(2, '0')) + (Number(fraction[2] ?? '0') >= 5 ? 1n : 0n);
  return decimal(negative ? -cents : cents);
}
