import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { profileApi } from '../api/profile';
import { CURRENCY_CODES } from '../constants/currencies';
export function usePreferredCurrency() {
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
    staleTime: 60000,
  });
  const code = profile.data?.preferredCurrency;
  return code && CURRENCY_CODES.includes(code) ? code : 'CNY';
}
export function useCurrencyState() {
  const preferred = usePreferredCurrency();
  const [choice, setChoice] = useState<string>();
  return [choice ?? preferred, setChoice] as const;
}
