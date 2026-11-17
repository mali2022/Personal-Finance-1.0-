import dayjs from 'dayjs';
import { CURRENCY_CODES } from '../../constants/currencies';

export const fuelViews = [
  'overview',
  'records',
  'analysis',
  'prices',
  'costs',
  'ai',
  'vehicles',
] as const;
export function fuelWorkspace(params: URLSearchParams) {
  const requested = params.get('tab');
  const tab = fuelViews.find((view) => view === requested) ?? 'overview';
  const date = (value: string | null) =>
    value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dayjs(value).isValid() &&
    dayjs(value).format('YYYY-MM-DD') === value
      ? dayjs(value)
      : undefined;
  const from = date(params.get('from'));
  const to = date(params.get('to'));
  const validRange =
    from && to && !from.isAfter(to) && to.diff(from, 'day') <= 3660;
  const currency = params.get('currency') ?? 'CNY';
  return {
    tab,
    vehicleId: params.get('vehicle') || undefined,
    currency: CURRENCY_CODES.some((code) => code === currency)
      ? currency
      : 'CNY',
    range: validRange
      ? ([from, to] as [dayjs.Dayjs, dayjs.Dayjs])
      : ([dayjs().startOf('year'), dayjs()] as [dayjs.Dayjs, dayjs.Dayjs]),
  };
}
