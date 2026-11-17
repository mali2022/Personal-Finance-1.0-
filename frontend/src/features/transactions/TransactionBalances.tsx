import { Money } from '../../components/Money';
import { useUI } from '../../stores/ui';
import { t } from '../../i18n';
import type { Transaction } from '../../types';
export function TransactionBalances({
  transaction,
}: {
  transaction: Transaction;
}) {
  const hidden = useUI((s) => s.hidden);
  if (transaction.status === 'Deleted') return null;
  const balances = transaction.accountBalances ?? [];
  return (
    <div
      className="transaction-balances"
      style={{
        fontSize: 12,
        lineHeight: 1.8,
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
      }}
      title={t(
        '按期初余额和全部有效流水，依发生时间、创建时间计算；补记、修改或删除后重新计算，筛选和分页不影响余额',
      )}
    >
      {(transaction.payments?.length ?? 0) > 1 && (
        <strong>{t('多账户付款')}</strong>
      )}
      {balances.map((a) => (
        <div key={a.accountId}>
          <span>{hidden ? '••••' : a.name}</span>
          <br />
          {t('交易后余额')}：<Money value={a.balance} currency={a.currency} />
        </div>
      ))}
      {balances.length === 0 && t('交易后余额暂不可用')}
    </div>
  );
}
