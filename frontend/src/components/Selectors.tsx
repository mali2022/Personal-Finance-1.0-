import { Select } from './TouchSelect';
import { t as tr, useLocale } from '../i18n';

import { useQuery } from '@tanstack/react-query';
import { accountApi } from '../api/finance';
import { formatAccountBalance } from '../utils/finance';
import { useUI } from '../stores/ui';
import { CategoryPicker } from './CategoryPicker';
export function AccountSelector(props: {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  history?: boolean;
  currency?: string;
  creditOnly?: boolean;
  excludeCredit?: boolean;
  exclude?: string;
}) {
  useLocale();
  const q = useQuery({ queryKey: ['accounts'], queryFn: accountApi.list });
  const hidden = useUI((s) => s.hidden);
  return (
    <Select
      id={props.id}
      aria-label={props.id ? undefined : tr('账户')}
      showSearch
      allowClear={props.history}
      optionFilterProp="label"
      loading={q.isPending}
      value={props.value}
      onChange={props.onChange}
      options={q.data
        ?.filter(
          (a) =>
            (props.history || a.status === 'Active') &&
            (!props.currency || a.currency === props.currency) &&
            (props.history ||
              ![
                'Receivable',
                'Payable',
                'ConsumerLoan',
                'SecuredLoan',
              ].includes(a.type)) &&
            a.id !== props.exclude &&
            (!props.creditOnly ||
              ['CreditCard', 'ConsumerCredit'].includes(a.type)) &&
            (!props.excludeCredit ||
              !['CreditCard', 'ConsumerCredit'].includes(a.type)),
        )
        .map((a) => ({
          value: a.id,
          label: `${a.name} · ${formatAccountBalance(a, hidden)}${a.status !== 'Active' ? ' · 已停用' : ''}`,
        }))}
      placeholder={tr('选择账户')}
    />
  );
}
export function CategorySelector(props: {
  history?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  kind?: 'Expense' | 'Income' | 'All';
}) {
  return <CategoryPicker {...props} />;
}
