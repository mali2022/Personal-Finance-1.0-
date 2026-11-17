import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { lazy, Suspense, useState } from 'react';
import { useCopilotPageContext } from '../features/ai/copilotContext';
import { Alert, Breadcrumb, Button, Card, Col, Descriptions, Empty, Row, Skeleton, Space, Table, Tabs, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  categoryStatisticsApi,
  type CategorySummary,
  type CategoryBudgetPeriod,
  type CategoryBudgetLine,
} from '../api/categoryStatistics';
import { PageTitle } from '../components/PageTitle';
import { Money } from '../components/Money';
import { Sensitive } from '../components/Sensitive';
import { ErrorState } from '../components/Feedback';
import { t as tr, useLocale } from '../i18n';
import { formatDate } from '../utils/finance';
const Chart = lazy(() => import('../components/Chart'));
type SummaryRow = {
  id?: string;
  name: string;
  summary: CategorySummary;
  share?: string | null;
};
export default function CategoryDetailPage() {
  useLocale();
  const { id } = useParams();
  const navigate = useNavigate();
  const [currency, setCurrency] = useCurrencyState();
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  useCopilotPageContext({currency,categoryId:id,start:dayjs(month+'-01').format('YYYY-MM-DD'),end:dayjs(month+'-01').endOf('month').format('YYYY-MM-DD')});
  const q = useQuery({
    queryKey: ['categoryStatistics', id, currency, month],
    queryFn: () => categoryStatisticsApi.detail(id!, currency, month),
    enabled: !!id,
  });
  const money = (value: string) => <Money value={value} currency={currency} />;
  const percentage = (value: string | number | null) => (
    <Sensitive>{value == null ? tr('无可比数据') : `${value}%`}</Sensitive>
  );
  const breakdown = (rows: SummaryRow[], share = false, links = false) => (
    <Table<SummaryRow>
      rowKey={(r) => r.id || r.name}
      size="small"
      dataSource={rows}
      scroll={{ x: 600 }}
      pagination={{ pageSize: 10, showSizeChanger: false }}
      columns={[
        {
          title: tr('名称'),
          render: (_, r) =>
            links && r.id ? (
              <Button
                type="link"
                onClick={() => navigate(`/categories/${r.id}`)}
              >
                <Sensitive>{tr(r.name)}</Sensitive>
              </Button>
            ) : (
              <Sensitive>{tr(r.name)}</Sensitive>
            ),
        },
        { title: tr('净额'), render: (_, r) => money(r.summary.net) },
        {
          title: tr('交易笔数'),
          render: (_, r) => <Sensitive>{r.summary.count}</Sensitive>,
        },
        { title: tr('退款金额'), render: (_, r) => money(r.summary.refunds) },
        ...(share
          ? [
              {
                title: tr('贡献占比'),
                render: (_: unknown, r: SummaryRow) =>
                  percentage(r.share ?? null),
              },
            ]
          : []),
      ]}
    />
  );
  if (q.isPending) return <Skeleton active />;
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const data = q.data!,
    income = data.category.kind === 'Income';
  const trend = (rows: { period: string; summary: CategorySummary }[]) => (
    <Suspense fallback={<Skeleton active />}>
      <Chart
        option={{
          tooltip: { trigger: 'axis' },
          legend: { data: [tr('净额'), tr('交易笔数')] },
          grid: { left: 65, right: 55, bottom: 40 },
          xAxis: { type: 'category', data: rows.map((r) => r.period) },
          yAxis: [
            { type: 'value', name: currency },
            { type: 'value', name: tr('笔') },
          ],
          series: [
            {
              type: 'bar',
              name: tr('净额'),
              data: rows.map((r) => Number(r.summary.net)),
            },
            {
              type: 'line',
              name: tr('交易笔数'),
              yAxisIndex: 1,
              data: rows.map((r) => r.summary.count),
            },
          ],
        }}
      />
    </Suspense>
  );
  const metrics = [
    {
      key: 'gross',
      label: income ? tr('累计收入') : tr('累计支出'),
      children: money(data.cumulative.gross),
    },
    {
      key: 'net',
      label: income ? tr('净收入') : tr('净支出'),
      children: money(data.cumulative.net),
    },
    {
      key: 'count',
      label: tr('累计交易笔数'),
      children: <Sensitive>{data.cumulative.count}</Sensitive>,
    },
    {
      key: 'month',
      label: tr('本月金额（所选月）'),
      children: money(data.currentMonth.net),
    },
    {
      key: 'month-count',
      label: tr('本月笔数（所选月）'),
      children: <Sensitive>{data.currentMonth.count}</Sensitive>,
    },
    {
      key: 'year',
      label: tr('本年金额（所选年）'),
      children: money(data.currentYear.net),
    },
    {
      key: 'year-count',
      label: tr('本年笔数（所选年）'),
      children: <Sensitive>{data.currentYear.count}</Sensitive>,
    },
    {
      key: 'previous',
      label: tr('上月金额'),
      children: money(data.previousMonth.net),
    },
    {
      key: 'last-year',
      label: tr('去年同期金额'),
      children: money(data.lastYearSameMonth.net),
    },
    {
      key: 'mom',
      label: tr('环比'),
      children: percentage(data.monthOverMonth),
    },
    { key: 'yoy', label: tr('同比'), children: percentage(data.yearOverYear) },
    {
      key: 'average',
      label: tr('平均单笔金额'),
      children: money(data.cumulative.average),
    },
    {
      key: 'max',
      label: tr('单笔最大金额'),
      children: money(data.cumulative.maximum),
    },
    {
      key: 'first',
      label: tr('最早交易日期'),
      children: (
        <Sensitive>
          {data.cumulative.firstDate
            ? formatDate(data.cumulative.firstDate)
            : '—'}
        </Sensitive>
      ),
    },
    {
      key: 'last',
      label: tr('最近交易日期'),
      children: (
        <Sensitive>
          {data.cumulative.lastDate
            ? formatDate(data.cumulative.lastDate)
            : '—'}
        </Sensitive>
      ),
    },
    {
      key: 'refunds',
      label: tr('退款金额'),
      children: money(data.cumulative.refunds),
    },
    {
      key: 'other',
      label: tr('其他费用冲减'),
      children: money(data.cumulative.otherCredits),
    },
    {
      key: 'discounts',
      label: tr('优惠金额'),
      children: money(data.cumulative.discount),
    },
  ];
  return (
    <>
      <Breadcrumb
        className="mb16"
        items={[
          {
            title: (
              <Button type="link" onClick={() => navigate('/categories')}>
                {tr('收支分类')}
              </Button>
            ),
          },
          ...data.category.path.map((c) => ({
            title: (
              <Button
                type="link"
                onClick={() => navigate(`/categories/${c.id}`)}
              >
                <Sensitive>{c.name}</Sensitive>
              </Button>
            ),
          })),
        ]}
      />
      <div className="page-heading">
        <div>
          <PageTitle>
            <Sensitive>{data.category.name}</Sensitive>
          </PageTitle>
          <Space>
            <Tag>{income ? tr('收入') : tr('支出')}</Tag>
            <Tag>{tr('{0}级分类', data.category.level)}</Tag>
            <Tag>
              {data.category.status !== 'Active'
                ? tr('已停用')
                : data.category.effectiveActive === false
                  ? tr('上级已停用')
                  : tr('启用')}
            </Tag>
          </Space>
        </div>
        <Button
          onClick={() =>
            navigate(
              `/transactions?${new URLSearchParams({ categoryId: id!, currency })}`,
            )
          }
        >
          {tr('分类交易明细')}
        </Button>
      </div>
      <Space wrap className="mb16">
        <span>{tr('统计月份')}</span>
        <DatePicker
          picker="month"
          allowClear={false}
          value={dayjs(month + '-01')}
          onChange={(v) => v && setMonth(v.format('YYYY-MM'))}
        />
        <Select
          aria-label={tr('统计币种')}
          value={currency}
          onChange={setCurrency}
          options={CURRENCY_CODES.map((value) => ({
            value,
            label: value,
          }))}
        />
      </Space>
      <Card title={tr('分类统计')} className="mb16">
        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, sm: 2, lg: 3 }}
          items={metrics}
        />
      </Card>
      <Card title={tr('月度、年度趋势')} className="mb16">
        <Tabs
          items={[
            {
              key: 'month',
              label: tr('月度趋势'),
              children: trend(data.monthlyTrend),
            },
            {
              key: 'year',
              label: tr('年度趋势'),
              children: data.annualTrend.length ? (
                trend(data.annualTrend)
              ) : (
                <Empty description={tr('暂无记录')} />
              ),
            },
          ]}
        />
      </Card>
      <Row gutter={[16, 16]} className="mb16">
        <Col xs={24} lg={12}>
          <Card title={income ? tr('主要付款方') : tr('分类商户排行')}>
            {breakdown(data.merchants)}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={income ? tr('主要收入账户') : tr('主要付款账户')}>
            {breakdown(data.accounts, true)}
          </Card>
        </Col>
      </Row>
      <Card title={tr('子分类贡献占比')} className="mb16">
        {data.childContributions.length ? (
          breakdown(data.childContributions, true, true)
        ) : (
          <Empty description={tr('该分类没有下级分类')} />
        )}
      </Card>
      <Row gutter={[16, 16]} className="mb16">
        {[
          { title: tr('退款分析'), rows: data.refunds },
          { title: tr('优惠分析'), rows: data.discounts },
        ].map((section, i) => (
          <Col xs={24} lg={12} key={i}>
            <Card title={section.title}>
              <Table
                rowKey="period"
                dataSource={section.rows}
                size="small"
                pagination={{ pageSize: 6, showSizeChanger: false }}
                columns={[
                  { title: tr('月份'), dataIndex: 'period' },
                  { title: tr('金额'), render: (_, r) => money(r.amount) },
                  {
                    title: tr('交易笔数'),
                    render: (_, r) => <Sensitive>{r.count}</Sensitive>,
                  },
                ]}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Card title={tr('分类预算执行')} className="mb16">
        {!data.budgets.supported ? (
          <Alert
            type="info"
            message={tr(data.budgets.reason || '未设置预算')}
          />
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <BudgetPeriod
                  title={tr('月度预算')}
                  period={data.budgets.monthly!}
                />
              </Col>
              <Col xs={24} lg={12}>
                <BudgetPeriod
                  title={tr('年度预算')}
                  period={data.budgets.annual!}
                />
              </Col>
            </Row>
            <p className="muted">{data.budgets.scope}</p>
            {data.budgets.annualState === 'Archived' && (
              <Tag>{tr('年度预算已归档')}</Tag>
            )}
          </>
        )}
      </Card>
      <Alert
        type="info"
        showIcon
        message={tr('统计口径')}
        description={data.scope}
      />
    </>
  );
}
function BudgetPeriod({
  title,
  period,
}: {
  title: string;
  period: CategoryBudgetPeriod;
}) {
  const amount = (value: string | null) => (
    <Sensitive>
      {value == null ? tr('未设置独立预算') : <Money value={value} />}
    </Sensitive>
  );
  const table = (lines: CategoryBudgetLine[]) => (
    <Table
      rowKey="id"
      size="small"
      dataSource={lines}
      pagination={false}
      scroll={{ x: 450 }}
      columns={[
        {
          title: tr('分类'),
          render: (_, r) => <Sensitive>{r.name}</Sensitive>,
        },
        { title: tr('预算'), render: (_, r) => amount(r.limit) },
        { title: tr('已用'), render: (_, r) => amount(r.used) },
        {
          title: tr('执行率'),
          render: (_, r) => (
            <Sensitive>
              {r.executionPercent == null ? '—' : r.executionPercent + '%'}
            </Sensitive>
          ),
        },
      ]}
    />
  );
  return (
    <Card type="inner" title={title}>
      {period.overlapping && (
        <Alert
          type="warning"
          message={tr('历史预算有层级重叠，明细单列，不合计重复额度')}
        />
      )}
      <Descriptions
        column={1}
        items={[
          {
            key: 'limit',
            label: tr('独立额度'),
            children: amount(period.limit),
          },
          {
            key: 'used',
            label: tr('净执行金额'),
            children: amount(period.used),
          },
          {
            key: 'remaining',
            label: tr('剩余额度'),
            children: amount(period.remaining),
          },
          {
            key: 'percent',
            label: tr('执行率'),
            children: (
              <Sensitive>
                {period.executionPercent == null
                  ? '—'
                  : period.executionPercent + '%'}
              </Sensitive>
            ),
          },
        ]}
      />
      {period.allocatedLines.length > 0 && table(period.allocatedLines)}
      {period.sharedLines.length > 0 && (
        <>
          <p>{tr('上级共享预算（不自动拆分）')}</p>
          {table(period.sharedLines)}
        </>
      )}
    </Card>
  );
}
