import { Select } from './TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { useEffect, useState } from 'react';
import { AutoComplete, Button } from 'antd';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { directoryApi } from '../api/business';
import { categoryApi } from '../api/finance';
import { categoryActive } from '../utils/categories';
import type { DirectoryRecord } from '../types';
import { useMobile } from '../hooks/useMobile';
function useSearch(value: string) {
  const [keyword, setKeyword] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setKeyword(value), 200);
    return () => clearTimeout(timer);
  }, [value]);
  return keyword;
}
export function DirectorySelector({
  kind,
  id,
  value,
  onChange,
  multiple = false,
  history = false,
}: {
  kind: DirectoryRecord['kind'];
  id?: string;
  value?: string | string[];
  onChange?: (v: string | string[]) => void;
  multiple?: boolean;
  history?: boolean;
}) {
  useLocale();
  const [search, setSearch] = useState('');
  const keyword = useSearch(search);
  const q = useInfiniteQuery({
    queryKey: ['directory', kind, 'options', keyword],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => directoryApi.list(kind, keyword, pageParam),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) || [];
  return (
    <Select
      id={id}
      aria-label={
        id ? undefined : kind === 'projects' ? tr('项目') : tr('标签')
      }
      mode={multiple ? 'multiple' : undefined}
      allowClear
      showSearch
      filterOption={false}
      onSearch={setSearch}
      value={value}
      onChange={(v) => {
        onChange?.(v);
        setSearch('');
      }}
      loading={q.isPending}
      options={rows
        .filter(
          (d) =>
            history ||
            d.status === 'Active' ||
            (Array.isArray(value) ? value.includes(d.id) : value === d.id),
        )
        .map((d) => ({
          value: d.id,
          label: d.defaultCode ? `${d.defaultCode} ${d.name}` : d.name,
        }))}
      popupRender={(menu) => (
        <>
          {menu}
          {q.hasNextPage && (
            <Button
              block
              type="text"
              loading={q.isFetchingNextPage}
              onClick={() => q.fetchNextPage()}
            >
              {tr('加载更多')}
            </Button>
          )}
        </>
      )}
      placeholder={tr('选填，搜索名称')}
    />
  );
}
export function MerchantSelector({
  id,
  value,
  onChange,
  onRecommend,
  categoryKind,
}: {
  id?: string;
  value?: string;
  onChange?: (v: string) => void;
  onRecommend?: (id: string) => void;
  categoryKind?: 'Expense' | 'Income';
}) {
  useLocale();
  const mobile = useMobile();
  const [search, setSearch] = useState('');
  const keyword = useSearch(mobile ? search : value || '');
  const q = useQuery({
    queryKey: ['directory', 'merchants', 'options', keyword],
    queryFn: () => directoryApi.list('merchants', keyword),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
    enabled: !!onRecommend && !!categoryKind,
  });
  const options =
    q.data?.items
      .filter((d) => d.status === 'Active')
      .map((d) => ({ value: d.name, label: d.name })) || [];
  const recommend = (v: string) => {
    const d = q.data?.items.find((d) => d.name === v);
    if (
      d?.categoryId &&
      (!categoryKind ||
        categories.data?.some(
          (c) =>
            c.id === d.categoryId &&
            c.kind === categoryKind &&
            categoryActive(categories.data || [], c.id),
        ))
    )
      onRecommend?.(d.categoryId);
  };
  if (mobile) {
    const custom = search.trim();
    return (
      <Select
        id={id}
        aria-label={id ? undefined : tr('商户 / 对象')}
        value={value || undefined}
        allowClear
        showSearch
        filterOption={false}
        loading={q.isPending}
        onSearch={setSearch}
        onChange={(v) => {
          onChange?.(v || '');
          setSearch('');
          if (v) recommend(v);
        }}
        options={
          custom && !options.some((o) => o.value === custom)
            ? [
                { value: custom, label: `${tr('使用此名称')}：${custom}` },
                ...options,
              ]
            : options
        }
        placeholder={tr('选填，选择商户推荐分类')}
      />
    );
  }
  return (
    <AutoComplete
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      onSelect={recommend}
      placeholder={tr('选填，选择商户推荐分类')}
    />
  );
}
