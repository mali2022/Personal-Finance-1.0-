import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { useEffect, useState } from 'react';
import { Button, Space } from 'antd';
import { useInfiniteQuery } from '@tanstack/react-query';
import { transactionApi } from '../../api/finance';
import { formatDate, formatMoney } from '../../utils/finance';
import { useUI } from '../../stores/ui';
import type { RefundSourceDto } from '../../types';
export function RefundSourceSelector({
  id,
  value,
  onChange,
  selected,
}: {
  id?: string;
  value?: string;
  onChange?: (id: string) => void;
  selected?: RefundSourceDto;
}) {
  useLocale();
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const hidden = useUI((s) => s.hidden);
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const q = useInfiniteQuery({
    queryKey: ['transactions', 'refund-sources', keyword],
    queryFn: ({ pageParam }) =>
      transactionApi.refundSources(keyword, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) || [];
  if (selected && !rows.some((r) => r.id === selected.id))
    rows.unshift(selected);
  return (
    <Select
      id={id}
      value={value}
      onChange={onChange}
      showSearch
      filterOption={false}
      onSearch={setSearch}
      placeholder={tr("搜索商户、备注、金额或日期")}
      loading={q.isFetching}
      options={rows.map((t) => ({
        value: t.id,
        label: tr("{0} · {1} · {2} 可退", formatDate(t.occurredAt), t.merchant || t.note || '消费', formatMoney(t.refundableAmount, t.currency, hidden)),
      }))}
      notFoundContent={
        q.isError
          ? tr("查询失败，请重新搜索")
          : q.isFetching
            ? tr("正在查询…")
            : tr("没有可退款消费")
      }
      popupRender={(menu) => (
        <>
          {menu}
          <Space style={{ padding: 8 }}>
            {q.hasNextPage && (
              <Button
                size="small"
                loading={q.isFetchingNextPage}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => q.fetchNextPage()}
              >
                {tr("加载更多原交易")}</Button>
            )}
            {q.isError && <Button onClick={() => q.refetch()}>{tr("重试")}</Button>}
          </Space>
        </>
      )}
    />
  );
}
