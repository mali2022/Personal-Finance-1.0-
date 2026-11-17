import { apiClient } from './client';
import type { ApiResponse } from '../types';
export interface LiveFxQuote {
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  date: string;
  fetchedAt: string;
  source: string;
}
export const latestFx = (baseCurrency: string, targetCurrency: string) =>
  apiClient
    .get<ApiResponse<LiveFxQuote>>('/fx/latest', {
      params: { baseCurrency, targetCurrency },
      timeout: 15000,
    })
    .then((r) => r.data.data);
