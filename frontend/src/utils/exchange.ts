import { decimal, minor } from './finance';
export function convertAmount(amount: string, rate: string): string {
  if (!/^\d+(\.\d{1,8})?$/.test(rate))
    throw new Error('汇率须大于 0，最多八位小数');
  const [whole, fraction = ''] = rate.split('.');
  const scaled = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
  if (scaled <= 0n) throw new Error('汇率必须大于 0');
  return decimal((minor(amount) * scaled + 50000000n) / 100000000n);
}
