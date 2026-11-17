import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { LoadingState } from '../components/LoadingState';
import { PageTitle } from '../components/PageTitle';
import { AdvancedReports } from '../features/reports/AdvancedReports';
import { lazy, Suspense, useState } from 'react';
import { Button, Card, Space, Table, Tabs, theme } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { reportApi, categoryApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import { useCopilotPageContext } from '../features/ai/copilotContext';
import type { CategoryStat, ReportGranularity } from '../types';
const Chart = lazy(() => import('../components/Chart'));
export default function ReportsPage() {
  useLocale();
  const { token } = theme.useToken();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(5, 'month').startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [granularity, setGranularity] = useState<ReportGranularity>('month');
  const [currency, setCurrency] = useCurrencyState();
  const [tab, setTab] = useState('trend');
  const [parent, setParent] = useState<{ id: string; name: string }>();
  const hidden = useUI((s) => s.hidden);
  const navigate = useNavigate();
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const filters = {
    start: range[0].format('YYYY-MM-DD'),
    end: range[1].format('YYYY-MM-DD'),
    granularity,
    currency,
    parentId: parent?.id,
  };
  const q = useQuery({
    queryKey: ['reports', filters],
    queryFn: () => reportApi.get(filters),
  });
  useCopilotPageContext({
    start: filters.start,
    end: filters.end,
    currency,
    categoryId: parent?.id,
  });
  const drill = (item: CategoryStat) => {
    if (
      item.categoryId !== parent?.id &&
      categories.data?.some((c) => c.parentId === item.categoryId)
    )
      setParent({ id: item.categoryId, name: item.name });
    else
      navigate(
        `/transactions?${new URLSearchParams({
          categoryId: item.categoryId,
          currency,
          start: range[0].startOf('day').toISOString(),
          end: range[1].endOf('day').toISOString(),
        })}`,
      );
  };
  const preset = (count: number): [dayjs.Dayjs, dayjs.Dayjs] => [
    dayjs()
      .subtract(count - 1, 'month')
      .startOf('month'),
    dayjs().endOf('month'),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('看见数字背后的生活')}</PageTitle>
        </div>
        <Button onClick={() => navigate('/benefits')}>{tr('优惠分析')}</Button>
      </div>
      <Card className="mb16">
        <Space wrap>
          <DatePicker.RangePicker
            allowClear={false}
            value={range}
            presets={[
              { label: tr('本月'), value: preset(1) },
              {
                label: tr('上月'),
                value: [
                  dayjs().subtract(1, 'month').startOf('month'),
                  dayjs().subtract(1, 'month').endOf('month'),
                ],
              },
              { label: tr('近3个月'), value: preset(3) },
              { label: tr('近6个月'), value: preset(6) },
              {
                label: tr('今年'),
                value: [dayjs().startOf('year'), dayjs().endOf('year')],
              },
              {
                label: tr('去年'),
                value: [
                  dayjs().subtract(1, 'year').startOf('year'),
                  dayjs().subtract(1, 'year').endOf('year'),
                ],
              },
            ]}
            onChange={(v) => {
              if (v?.[0] && v[1]) setRange([v[0], v[1]]);
            }}
          />
          <Select
            aria-label={tr('统计粒度')}
            value={granularity}
            style={{ width: 100 }}
            onChange={setGranularity}
            options={[
              { value: 'day', label: tr('按日') },
              { value: 'week', label: tr('按周') },
              { value: 'month', label: tr('按月') },
              { value: 'year', label: tr('按年') },
            ]}
          />
          <Select
            aria-label={tr('统计币种')}
            value={currency}
            style={{ width: 100 }}
            onChange={setCurrency}
            options={CURRENCY_CODES.map((value) => ({
              value,
              label: value,
            }))}
          />
        </Space>
      </Card>
      <AdvancedReports filters={filters} />
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <div className="summary-grid">
            {[
              { label: tr('收入'), value: q.data.income },
              { label: tr('净支出'), value: q.data.expense },
              { label: tr('期末资产'), value: q.data.assets },
              { label: tr('期末负债'), value: q.data.liabilities },
            ].map((item) => (
              <Card key={item.label}>
                <span className="muted">
                  {item.label} · {currency}
                </span>
                <div className="stat-value">
                  <Money value={item.value} currency={currency} />
                </div>
              </Card>
            ))}
          </div>
          <Card className="mt20">
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                { key: 'trend', label: tr('收支趋势') },
                { key: 'category', label: tr('分类分析') },
                { key: 'net', label: tr('净资产趋势') },
              ]}
            />
            {tab === 'category' && (
              <Space wrap className="mb16">
                <Button onClick={() => setParent(undefined)} disabled={!parent}>
                  {tr('全部一级分类')}
                </Button>
                <span>
                  {parent
                    ? tr('{0} / 下级分类', parent.name)
                    : tr('逐级查看下级分类及交易明细')}
                </span>
              </Space>
            )}
            <Suspense fallback={<LoadingState />}>
              {hidden ? (
                <div className="chart-hidden">{tr('金额已隐藏')}</div>
              ) : (
                <Chart
                  option={
                    tab === 'category'
                      ? {
                          tooltip: { trigger: 'axis' },
                          grid: {
                            left: 12,
                            right: 16,
                            top: 20,
                            bottom: 30,
                            containLabel: true,
                          },
                          xAxis: { type: 'value' },
                          yAxis: {
                            type: 'category',
                            axisLabel: { width: 88, overflow: 'truncate' },
                            data: q.data.categories.map((c) => c.name),
                          },
                          series: [
                            {
                              type: 'bar',
                              itemStyle: { color: token.colorPrimary },
                              data: q.data.categories.map((c) =>
                                Number(c.amount),
                              ),
                            },
                          ],
                        }
                      : {
                          tooltip: { trigger: 'axis' },
                          legend: { bottom: 0 },
                          grid: {
                            left: 12,
                            right: 16,
                            top: 25,
                            bottom: 50,
                            containLabel: true,
                          },
                          xAxis: {
                            type: 'category',
                            data: q.data.points.map((t) => t.period),
                          },
                          yAxis: { type: 'value' },
                          series:
                            tab === 'net'
                              ? [
                                  {
                                    name: tr('净资产'),
                                    type: 'line',
                                    areaStyle: { opacity: 0.12 },
                                    itemStyle: { color: token.colorPrimary },
                                    data: q.data.points.map((t) =>
                                      Number(t.netWorth),
                                    ),
                                  },
                                ]
                              : [
                                  {
                                    name: tr('收入'),
                                    type: 'line',
                                    itemStyle: { color: token.colorPrimary },
                                    data: q.data.points.map((t) =>
                                      Number(t.income),
                                    ),
                                  },
                                  {
                                    name: tr('净支出'),
                                    type: 'line',
                                    itemStyle: { color: token.colorWarning },
                                    data: q.data.points.map((t) =>
                                      Number(t.expense),
                                    ),
                                  },
                                ],
                        }
                  }
                  onClick={(name) => {
                    if (tab !== 'category') return;
                    const item = q.data.categories.find((c) => c.name === name);
                    if (item) drill(item);
                  }}
                />
              )}
            </Suspense>
            {tab === 'category' ? (
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="categoryId"
                dataSource={q.data.categories}
                pagination={false}
                columns={[
                  {
                    title: tr('分类'),
                    dataIndex: 'name',
                    render: (value: unknown) => (
                      <Sensitive>
                        {value == null ? '—' : String(value)}
                      </Sensitive>
                    ),
                  },
                  {
                    title: tr('净支出'),
                    align: 'right',
                    render: (_, item) => (
                      <Money value={item.amount} currency={currency} />
                    ),
                  },
                  {
                    title: tr('占比'),
                    render: (_, item) =>
                      hidden ? '••••' : `${item.share.toFixed(1)}%`,
                  },
                  {
                    title: tr('查看'),
                    render: (_, item) => (
                      <Button type="link" onClick={() => drill(item)}>
                        {item.categoryId !== parent?.id &&
                        categories.data?.some(
                          (c) => c.parentId === item.categoryId,
                        )
                          ? tr('下级分类')
                          : tr('交易明细')}
                      </Button>
                    ),
                  },
                ]}
              />
            ) : (
              <Table
                rowKey="period"
                dataSource={q.data.points}
                pagination={{ pageSize: 12 }}
                scroll={{ x: 600 }}
                columns={[
                  { title: tr('时间'), dataIndex: 'period' },
                  {
                    title: tr('收入'),
                    align: 'right',
                    render: (_, item) => (
                      <Money value={item.income} currency={currency} />
                    ),
                  },
                  {
                    title: tr('净支出'),
                    align: 'right',
                    render: (_, item) => (
                      <Money value={item.expense} currency={currency} />
                    ),
                  },
                  {
                    title: tr('推算期末净资产'),
                    align: 'right',
                    render: (_, item) => (
                      <Money value={item.netWorth} currency={currency} />
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
