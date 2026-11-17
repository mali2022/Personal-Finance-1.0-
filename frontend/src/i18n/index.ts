import transactionsEn from './transactions.en.json' with { type: 'json' };
import reconciliationEn from './reconciliation.en.json' with { type: 'json' };
import { useUI } from '../stores/ui';
import en from './en.json' with { type: 'json' };
import aiEn from './ai.en.json' with { type: 'json' };
import agentEn from './agent.en.json' with { type: 'json' };
import releasesEn from './releases.en.json' with { type: 'json' };
export function t(
  text: string,
  ...values: (string | number | null | undefined)[]
) {
  const template =
    useUI.getState().language === 'en'
      ? (transactionsEn as Record<string, string>)[text] ||
        (reconciliationEn as Record<string, string>)[text] ||
        (releasesEn as Record<string, string>)[text] ||
        (agentEn as Record<string, string>)[text] ||
        (aiEn as Record<string, string>)[text] ||
        (en as Record<string, string>)[text] ||
        text
      : text;
  if (!values.length) return template;
  return template.replace(/\{(\d+)\}/g, (_, index: string) =>
    String(values[Number(index)] ?? ''),
  );
}
export function useLocale() {
  return useUI((state) => state.language);
}
export function localizedLabels<T extends Record<string, string>>(
  labels: T,
): T {
  return new Proxy(labels, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver);
      return typeof value === 'string' ? t(value) : value;
    },
  });
}
export function localizedPair<const V extends string>(
  value: V,
  label: string,
): [V, string] {
  const pair: [V, string] = [value, label];
  Object.defineProperty(pair, 1, { get: () => t(label), enumerable: true });
  return pair;
}
