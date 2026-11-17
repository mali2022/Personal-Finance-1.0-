import { useState } from 'react';
import { Button, Drawer, Input, Space, Tag, TreeSelect } from 'antd';
import { Select } from '../../components/TouchSelect';
import { DatePicker } from '../../components/ResponsiveDatePicker';
import { DirectorySelector } from '../../components/BusinessSelectors';
import { useQuery } from '@tanstack/react-query';
import { accountApi, categoryApi } from '../../api/finance';
import { useMobile } from '../../hooks/useMobile';
import { CURRENCY_CODES } from '../../constants/currencies';
import { transactionLabels } from '../../constants/mappings';
import { t as tr, useLocale } from '../../i18n';
import { formatDate } from '../../utils/finance';
import type { TransactionFilters } from '../../types';
import dayjs from 'dayjs';
import { anomalyLabels } from './anomalyRules';
import { categoryLabel } from '../../utils/categories';

export function WorkspaceFilters({
  params,
  filters,
  onApply,
  review,
}: {
  params: URLSearchParams;
  filters: TransactionFilters;
  onApply: (p: URLSearchParams) => void;
  review: boolean;
}) {
  useLocale();
  const mobile = useMobile();
  const [expanded, setExpanded] = useState(false);
  const [previous, setPrevious] = useState<string>();
  const [merchantSearch, setMerchantSearch] = useState('');
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const set = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (value) next.set(key, value);
    else next.delete(key);
    onApply(next);
  };
  const multi = (key: string, values: string[]) =>
    set(
      key,
      values.length
        ? key === 'merchants'
          ? JSON.stringify(values)
          : values.join(',')
        : undefined,
    );
  const selected = (key: string): string[] => {
    const raw = params.get(key);
    if (!raw) return [];
    try {
      const values: unknown =
        key === 'merchants' && raw.startsWith('[')
          ? JSON.parse(raw)
          : raw.split(',');
      return Array.isArray(values) && values.every((v) => typeof v === 'string')
        ? values
        : [];
    } catch {
      return [];
    }
  };
  const range = (start: string, end: string) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    next.delete('month');
    next.set('start', dayjs(`${start}T00:00:00+08:00`).toISOString());
    next.set('end', dayjs(`${end}T23:59:59.999+08:00`).toISOString());
    onApply(next);
  };
  const today = formatDate(new Date().toISOString());
  const displayValue = (key: string, value: string): string => {
    if (key === 'merchants') return selected(key).join(', ');
    if (key === 'accountId' || key === 'accountIds')
      return value
        .split(',')
        .map((id) => accounts.data?.find((a) => a.id === id)?.name || id)
        .join(', ');
    if (key === 'categoryId' || key === 'categoryIds')
      return value
        .split(',')
        .map((id) => categoryLabel(categories.data || [], id) || id)
        .join(', ');
    const options: Record<string, Record<string, string>> = {
      status: { Confirmed: '已确认', NeedsReview: '待整理', Deleted: '回收站' },
      statusFlag: { NeedsReview: '待确认（仅状态）' },
      source: { Imported: '导入', Manual: '手动 / 其他', Ai: 'AI确认' },
      anomaly: { Any: '全部异常', ...anomalyLabels },
      reviewState: {
        Open: '待处理 / 到期',
        Resolved: '已处理',
        Ignored: '已忽略',
        Deferred: '已延后',
        All: '全部问题',
      },
      reconciliation: { Matched: '已匹配', Unmatched: '未匹配' },
      transferKind: { TopUp: '充值', Withdrawal: '提现' },
      type: transactionLabels,
    };
    return options[key]?.[value] ? tr(options[key][value]) : value;
  };
  const labels: Record<string, string> = {
    keyword: '关键词',
    accountId: '账户',
    accountIds: '多账户',
    categoryId: '分类',
    categoryIds: '多分类',
    projectId: '项目',
    projectIds: '多项目',
    tagId: '标签',
    tagIds: '多标签',
    merchant: '商户',
    merchants: '多商户',
    currency: '币种',
    start: '开始日期',
    end: '结束日期',
    min: '最低金额',
    max: '最高金额',
    type: '类型',
    status: '状态',
    statusFlag: '状态标记',
    source: '数据来源',
    anomaly: '异常规则',
    reconciliation: '对账状态',
    importJobId: '导入任务',
    reviewState: '处理状态',
    month: '月份',
    transferKind: '转账用途',
  };
  const fields = (
    <div className="workspace-filter-grid">
      <label>
        {tr('多账户')}
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          value={selected('accountIds')}
          options={accounts.data?.map((a) => ({
            value: a.id,
            label: `${a.name} · ${a.currency}`,
          }))}
          onChange={(v) => multi('accountIds', v)}
        />
      </label>
      <label>
        {tr('三级分类')}
        <TreeSelect
          treeCheckable
          allowClear
          showSearch
          treeNodeFilterProp="title"
          value={selected('categoryIds')}
          onChange={(v) => multi('categoryIds', v)}
          treeData={(categories.data || []).map((c) => ({
            id: c.id,
            pId: c.parentId || undefined,
            value: c.id,
            title: c.name,
          }))}
          treeDataSimpleMode
          style={{ width: '100%' }}
        />
      </label>
      <label>
        {tr('多商户')}
        <Select
          mode="tags"
          showSearch
          searchValue={merchantSearch}
          onSearch={setMerchantSearch}
          value={selected('merchants')}
          onChange={(v) => {multi('merchants', v);setMerchantSearch('');}}
          placeholder={tr('输入商户名称后回车')}
        />
      </label>
      <label>
        {tr('多标签')}
        <DirectorySelector
          kind="tags"
          history
          multiple
          value={selected('tagIds')}
          onChange={(v) => multi('tagIds', v as string[])}
        />
      </label>
      <label>
        {tr('多项目')}
        <DirectorySelector
          kind="projects"
          history
          multiple
          value={selected('projectIds')}
          onChange={(v) => multi('projectIds', v as string[])}
        />
      </label>
      <label>
        {tr('交易币种')}
        <Select
          allowClear
          value={filters.currency}
          options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
          onChange={(v) => set('currency', v)}
        />
      </label>
      <label>
        {tr('日期范围')}
        <DatePicker.RangePicker
          presets={[
            { label: tr('今天'), value: [dayjs(today), dayjs(today)] },
            {
              label: tr('昨天'),
              value: [
                dayjs(today).subtract(1, 'day'),
                dayjs(today).subtract(1, 'day'),
              ],
            },
            {
              label: tr('本周'),
              value: [dayjs(today).startOf('week'), dayjs(today).endOf('week')],
            },
            {
              label: tr('本月'),
              value: [
                dayjs(today).startOf('month'),
                dayjs(today).endOf('month'),
              ],
            },
            {
              label: tr('上月'),
              value: [
                dayjs(today).subtract(1, 'month').startOf('month'),
                dayjs(today).subtract(1, 'month').endOf('month'),
              ],
            },
            {
              label: tr('今年'),
              value: [dayjs(today).startOf('year'), dayjs(today).endOf('year')],
            },
            {
              label: tr('去年'),
              value: [
                dayjs(today).subtract(1, 'year').startOf('year'),
                dayjs(today).subtract(1, 'year').endOf('year'),
              ],
            },
          ]}
          value={
            filters.start && filters.end
              ? [
                  dayjs(formatDate(filters.start)),
                  dayjs(formatDate(filters.end)),
                ]
              : null
          }
          onChange={(v) => {
            if (v?.[0] && v[1])
              range(v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD'));
            else {
              const next = new URLSearchParams(params);
              ['start', 'end', 'month', 'page'].forEach((k) => next.delete(k));
              onApply(next);
            }
          }}
        />
      </label>
      <label>
        {tr('记录状态')}
        <Select
          allowClear
          disabled={review}
          value={filters.status}
          onChange={(v) => set('status', v)}
          options={['Confirmed', 'NeedsReview', 'Deleted'].map((value, i) => ({
            value,
            label: tr(['已确认', '待整理', '回收站'][i]),
          }))}
        />
      </label>
      <label>
        {tr('最低金额')}
        <Input
          inputMode="decimal"
          key={filters.min || 'min'}
          defaultValue={filters.min}
          onBlur={(e) => set('min', e.target.value)}
        />
      </label>
      <label>
        {tr('最高金额')}
        <Input
          inputMode="decimal"
          key={filters.max || 'max'}
          defaultValue={filters.max}
          onBlur={(e) => set('max', e.target.value)}
        />
      </label>
      <label>
        {tr('数据来源')}
        <Select
          allowClear
          value={filters.source}
          onChange={(v) => set('source', v)}
          options={['Imported', 'Manual', 'Ai'].map((value, i) => ({
            value,
            label: tr(['导入', '手动 / 其他', 'AI确认'][i]),
          }))}
        />
      </label>
      <label>
        {tr('异常规则')}
        <Select
          allowClear
          value={filters.anomaly}
          onChange={(v) => set('anomaly', v)}
          options={[
            'Any',
            'Extreme',
            'Duplicate',
            'Balance',
            'Category',
            'Merchant',
            'Refund',
            'Transfer',
            'Date',
          ].map((value, i) => ({
            value,
            label: tr(
              [
                '全部异常',
                '极端金额',
                '重复交易嫌疑',
                '分录不平衡',
                '分类缺失',
                '商户映射异常',
                '退款关联异常',
                '转账配对异常',
                '日期异常',
              ][i],
            ),
          }))}
        />
      </label>
      <label>
        {tr('对账状态')}
        <Select
          allowClear
          value={filters.reconciliation}
          onChange={(v) => set('reconciliation', v)}
          options={[
            { value: 'Matched', label: tr('已匹配') },
            { value: 'Unmatched', label: tr('未匹配') },
          ]}
        />
      </label>
      {(review || filters.anomaly) && (
        <label>
          {tr('处理状态')}
          <Select
            allowClear
            value={filters.reviewState}
            onChange={(v) => set('reviewState', v)}
            options={['Open', 'Resolved', 'Ignored', 'Deferred', 'All'].map(
              (value) => ({
                value,
                label: tr(
                  {
                    Open: '待处理 / 到期',
                    Resolved: '已处理',
                    Ignored: '已忽略',
                    Deferred: '已延后',
                    All: '全部问题',
                  }[value] || value,
                ),
              }),
            )}
          />
        </label>
      )}
    </div>
  );
  return (
    <section className="workspace-filters" aria-label={tr('筛选交易')}>
      <Space wrap>
        <Input.Search
          aria-label={tr('搜索交易')}
          placeholder={tr('搜索商户、备注、金额…')}
          key={filters.keyword || 'search'}
          defaultValue={filters.keyword}
          allowClear
          onSearch={(v) => set('keyword', v)}
        />
        <Select
          allowClear
          aria-label={tr('交易类型')}
          placeholder={tr('全部类型')}
          value={filters.transferKind || filters.type}
          style={{ width: 140 }}
          onChange={(value) => {
            const next = new URLSearchParams(params);
            ['page', 'type', 'transferKind'].forEach((key) => next.delete(key));
            if (value === 'TopUp' || value === 'Withdrawal') {
              next.set('type', 'Transfer');
              next.set('transferKind', value);
            } else if (value) next.set('type', value);
            onApply(next);
          }}
          options={[
            ...Object.entries(transactionLabels).map(([value, label]) => ({
              value,
              label,
            })),
            { value: 'TopUp', label: tr('充值') },
            { value: 'Withdrawal', label: tr('提现') },
          ]}
        />
        <Button onClick={() => range(today, today)}>{tr('今天')}</Button>
        <Button
          onClick={() =>
            range(
              dayjs(today).startOf('month').format('YYYY-MM-DD'),
              dayjs(today).endOf('month').format('YYYY-MM-DD'),
            )
          }
        >
          {tr('本月')}
        </Button>
        <Button onClick={() => set('status', 'NeedsReview')}>
          {tr('待确认交易')}
        </Button>
        <Button onClick={() => set('anomaly', 'Any')}>{tr('异常交易')}</Button>
        <Button aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {tr('高级筛选')}
        </Button>
        <Button
          onClick={() => {
            setPrevious(params.toString());
            const next = new URLSearchParams();
            for (const key of ['columns', 'sort', 'pageSize'])
              if (params.has(key)) next.set(key, params.get(key)!);
            onApply(next);
          }}
        >
          {tr('清除筛选')}
        </Button>
        {previous !== undefined && (
          <Button
            onClick={() => {
              onApply(new URLSearchParams(previous));
              setPrevious(undefined);
            }}
          >
            {tr('恢复筛选')}
          </Button>
        )}
      </Space>
      <div className="workspace-filter-tags">
        {[...params.entries()]
          .filter(([key]) => labels[key])
          .map(([key, value]) => (
            <Tag key={key} closable onClose={() => set(key)}>
              {tr(labels[key])}:{' '}
              <span title={displayValue(key, value)}>
                {displayValue(key, value).length > 65
                  ? `${displayValue(key, value).slice(0, 65)}…`
                  : displayValue(key, value)}
              </span>
            </Tag>
          ))}
      </div>
      {mobile ? (
        <Drawer
          title={tr('搜索及筛选')}
          placement="bottom"
          height="85dvh"
          open={expanded}
          onClose={() => setExpanded(false)}
        >
          {fields}
          <Button block type="primary" onClick={() => setExpanded(false)}>
            {tr('查看筛选结果')}
          </Button>
        </Drawer>
      ) : (
        expanded && fields
      )}
    </section>
  );
}
