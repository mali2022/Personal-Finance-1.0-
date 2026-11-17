/** Exact decimal division, rounded half up to the three decimal places used by fuel records. */
export function fuelPaymentPreview(
  litres: unknown,
  postedPrice: unknown,
  discount: unknown = 0,
  points: unknown = 0,
) {
  const scaled = (v: unknown, n: number) => {
    const text = String(v ?? '0');
    if (!new RegExp(`^\\d{1,10}(\\.\\d{1,${n}})?$`).test(text)) return;
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole) * 10n ** BigInt(n) + BigInt(fraction.padEnd(n, '0'));
  };
  const l = scaled(litres, 3),
    p = scaled(postedPrice, 3),
    d = scaled(discount, 2),
    r = scaled(points, 2);
  if (l == null || p == null || d == null || r == null || l <= 0n || p <= 0n)
    return;
  const gross = (l * p + 5000n) / 10000n;
  const paid = gross - d - r;
  if (gross > 10000000000n || paid < 0n) return;
  return { gross: Number(gross) / 100, paid: Number(paid) / 100 };
}
export function litresFromPrice(
  amount: unknown,
  price: unknown,
): number | undefined {
  const money = String(amount ?? ''),
    unit = String(price ?? '');
  if (money.length > 30 || unit.length > 30) return;
  if (!/^\d+(\.\d{1,2})?$/.test(money) || !/^\d+(\.\d{1,3})?$/.test(unit))
    return;
  const scale = (v: string, places: number) => {
    const [a, b = ''] = v.split('.');
    return BigInt(a) * 10n ** BigInt(places) + BigInt(b.padEnd(places, '0'));
  };
  const cents = scale(money, 2),
    mills = scale(unit, 3);
  if (cents <= 0n || cents > 10000000000n || mills <= 0n || mills > 1000000000n)
    return;
  const thousandths = (cents * 10000n + mills / 2n) / mills;
  if (thousandths <= 0n || thousandths > 10000000n) return;
  return Number(thousandths) / 1000;
}
