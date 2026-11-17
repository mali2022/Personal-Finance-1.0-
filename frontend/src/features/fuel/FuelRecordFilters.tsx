import { Checkbox, Input, Select, Space, Typography, Button } from 'antd';
import { CURRENCY_CODES } from '../../constants/currencies';
import { fuelGradeOptions } from './FuelPricesPanel';
import type { fuelRecordFilters } from './records';
export default function FuelRecordFilters({
  filters,
  query,
  onQuery,
  onChange,
  count,
  total,
  english,
  hidden,
  qualityAvailable,
}: {
  filters: ReturnType<typeof fuelRecordFilters>;
  query: string;
  onQuery: (q: string) => void;
  onChange: (values: Record<string, string | undefined>) => void;
  count: number;
  total: number;
  english: boolean;
  hidden: boolean;
  qualityAvailable: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search
          aria-label={tr('搜索加油记录', 'Search fuel records')}
          placeholder={tr(
            '搜索站点、备注或车辆',
            'Search station, notes or vehicle',
          )}
          value={hidden ? '' : query}
          disabled={hidden}
          maxLength={200}
          allowClear
          onChange={(event) => onQuery(event.target.value)}
          style={{ width: 250, maxWidth: '100%' }}
        />
        <Select
          aria-label={tr('筛选加满状态', 'Filter tank status')}
          value={filters.tank || undefined}
          placeholder={tr('全部加满状态', 'All tank states')}
          allowClear
          onChange={(value) => onChange({ tank: value })}
          style={{ width: 155 }}
          options={['Full', 'Partial', 'Unknown'].map((value, i) => ({
            value,
            label: [
              tr('确认加满', 'Full'),
              tr('未加满', 'Partial'),
              tr('未知', 'Unknown'),
            ][i],
          }))}
        />
        <Select
          aria-label={tr('筛选油品', 'Filter fuel grade')}
          value={filters.grade || undefined}
          placeholder={tr('全部油品', 'All grades')}
          allowClear
          onChange={(value) => onChange({ grade: value })}
          style={{ width: 165 }}
          options={fuelGradeOptions.map((g) => ({
            value: g.value,
            label: english ? g.en : g.zh,
          }))}
        />
        <Select
          aria-label={tr('筛选记录币种', 'Filter record currency')}
          value={filters.currency || undefined}
          placeholder={tr('全部记录币种', 'All record currencies')}
          allowClear
          onChange={(value) => onChange({ recordCurrency: value })}
          style={{ width: 160 }}
          options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
        />
        <Select
          aria-label={tr('记录排序', 'Record order')}
          value={filters.sort}
          onChange={(value) => onChange({ recordSort: value })}
          style={{ width: 190 }}
          options={(
            [
              ['date-desc', tr('日期：新到旧', 'Date: newest first')],
              ['date-asc', tr('日期：旧到新', 'Date: oldest first')],
              ['odometer-desc', tr('里程：高到低', 'Odometer: high to low')],
              ['odometer-asc', tr('里程：低到高', 'Odometer: low to high')],
              ['litres-desc', tr('油量：高到低', 'Litres: high to low')],
              ['litres-asc', tr('油量：低到高', 'Litres: low to high')],
              [
                'amount-desc',
                tr('实付：币种内高到低', 'Paid: descending within currency'),
              ],
              [
                'amount-asc',
                tr('实付：币种内低到高', 'Paid: ascending within currency'),
              ],
              [
                'price-desc',
                tr('单价：币种内高到低', 'Price: descending within currency'),
              ],
              [
                'price-asc',
                tr('单价：币种内低到高', 'Price: ascending within currency'),
              ],
            ] as const
          ).map(([value, label]) => ({ value, label }))}
        />
        <Checkbox
          checked={filters.issuesOnly}
          disabled={!qualityAvailable}
          onChange={(event) =>
            onChange({ issues: event.target.checked ? '1' : undefined })
          }
        >
          {tr('仅看质量提示记录', 'Only records with quality findings')}
        </Checkbox>
        <Button
          onClick={() => {
            onQuery('');
            onChange({
              q: undefined,
              tank: undefined,
              grade: undefined,
              recordCurrency: undefined,
              issues: undefined,
              recordSort: undefined,
            });
          }}
        >
          {tr('清除记录筛选', 'Clear record filters')}
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        {hidden
          ? tr(
              '隐私模式已隐藏搜索内容和记录计数。',
              'Privacy mode hides search text and record counts.',
            )
          : tr(
              `显示 ${count} / ${total} 条。记录筛选和排序只影响下方列表及导出，不改变顶端车辆与日期范围的统计口径。金额与单价排序按原币分组，缺失值置后。`,
              `Showing ${count} / ${total}. Record filters/order affect the list and export only; report statistics retain the top-level vehicle/date scope. Amount and price sorting groups original currencies; missing values come last.`,
            )}
      </Typography.Paragraph>
    </>
  );
}
