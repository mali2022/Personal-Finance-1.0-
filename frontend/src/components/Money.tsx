import { formatMoney } from '../utils/finance';
import { useUI } from '../stores/ui';
import type { Currency, TransactionType } from '../types';
import { useLocale } from '../i18n';
export function Money({
  value,
  currency = 'CNY',
  type,
  adjustmentDirection,
}: {
  value: string;
  currency?: Currency;
  type?: TransactionType;
  adjustmentDirection?: 'Increase' | 'Decrease';
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const sign =
    type === 'Expense' ||
    type === 'RewardReversal' ||
    type === 'AssetLoss' ||
    (type === 'Adjustment' && adjustmentDirection === 'Decrease')
      ? '- '
      : type === 'Income' ||
          type === 'Refund' ||
          (type === 'Adjustment' && adjustmentDirection === 'Increase')
        ? '+ '
        : '';
  return (
    <span className={`money ${type?.toLowerCase() || ''}`}>
      {hidden ? '' : sign}
      {formatMoney(value, currency, hidden)}
    </span>
  );
}
