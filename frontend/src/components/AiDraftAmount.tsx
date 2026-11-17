import type { AiDraft } from '../api/ai';
import { t } from '../i18n';
import { Money } from './Money';
import { Sensitive } from './Sensitive';

export function AiDraftAmount({ parsed }: { parsed: AiDraft['parsed'] }) {
  const { amount, currency } = parsed;
  if (amount == null)
    return (
      <>
        {t('待确认')} {currency}
      </>
    );
  if (
    /^-?\d+(\.\d{1,2})?$/.test(amount) &&
    (currency === 'CNY' || currency === 'USD' || currency === 'HKD')
  )
    return <Money value={amount} currency={currency} />;
  // An incomplete model draft may contain an unconfirmed amount or currency.
  return (
    <>
      <Sensitive>{amount}</Sensitive> {currency}
    </>
  );
}
