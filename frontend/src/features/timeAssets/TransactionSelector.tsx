import { useState } from 'react';
import { Select, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { transactionApi } from '../../api/finance';
import { useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
export default function TransactionSelector({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (value: string) => void;
}) {
  const en = useLocale() === 'en';
  const hidden = useUI((s) => s.hidden);
  const [keyword, setKeyword] = useState('');
  const q = useQuery({
    queryKey: ['time-assets-link-search', keyword],
    queryFn: () =>
      transactionApi.list({
        page: 1,
        pageSize: 50,
        sort: 'occurredAt:desc',
        keyword,
      }),
    retry: false,
  });
  return (
    <>
      <Select
        style={{ width: '100%' }}
        showSearch
        filterOption={false}
        onSearch={setKeyword}
        value={value}
        onChange={onChange}
        loading={q.isFetching}
        placeholder={en ? 'Search existing transactions' : '搜索已有财务流水'}
        options={q.data?.items.map((t) => ({
          value: t.id,
          label: `${t.occurredAt.slice(0, 10)} · ${t.merchant ?? t.type} · ${hidden ? '••••' : t.currency + ' ' + t.amount}`,
        }))}
      />
      {q.isError && (
        <Typography.Text type="danger">
          {en
            ? 'Could not load transactions. Please retry.'
            : '暂时无法读取流水，请重新搜索重试。'}
        </Typography.Text>
      )}
    </>
  );
}
