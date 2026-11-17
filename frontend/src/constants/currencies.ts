import catalog from '../data/currencies.json';
export const CURRENCY_CODES = catalog.map((c) => c.code);
export const currencySymbol = (code: string) =>
  catalog.find((c) => c.code === code)?.symbol || code;
export const currencyOptions = (english = false) =>
  catalog.map((c) => ({
    value: c.code,
    label: `${c.code} · ${english ? c.internationalName : c.name}`,
  }));
