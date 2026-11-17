import { useCurrencyState } from '../../hooks/useCurrency';
import { CURRENCY_CODES } from '../../constants/currencies';
import { lazy, Suspense, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  List,
  Row as GridRow,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { ErrorState } from '../../components/Feedback';
import { Sensitive } from '../../components/Sensitive';
import { useUI } from '../../stores/ui';
import { saveBlob } from '../../utils/download';
import { payrollApi, value, type Stats, type Row } from './api';
import { usePayrollCatalog } from './catalog';
import { usePayLabel, usePayText } from './text';
import { printPayroll } from './Payslips';
const Chart = lazy(() => import('../../components/Chart'));
export function PayrollOverview({
  report = false,
  statistics = false,
  bonuses = false,
}: {
  report?: boolean;
  statistics?: boolean;
  bonuses?: boolean;
}) {
  const t = usePayText();
  const label = usePayLabel();
  const hidden = useUI((s) => s.hidden);
  const [year, setYear] = useState(
    Number(
      new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
      }).format(new Date()),
    ),
  );
  const [currency, setCurrency] = useCurrencyState();
  const [basis, setBasis] = useState('Earned');
  const [employment, setEmployment] = useState('');
  const catalog = usePayrollCatalog();
  const q = useQuery({
    queryKey: [
      'payroll-center',
      'statistics',
      year,
      currency,
      basis,
      employment,
    ],
    queryFn: () =>
      payrollApi.get<Stats>('/statistics', {
        year,
        currency,
        basis,
        employmentId: employment,
      }),
  });
  const currentMonth = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  const [month, setMonth] = useState(currentMonth);
  const selected = q.data?.months.find((x) => x.month === month)?.totals;
  const d = q.data;
  const totals = d?.totals;
  const csv = () => {
    if (!d) return;
    const rows = [
      [
        t('月份', 'Month'),
        t('应发', 'Gross'),
        t('实发', 'Net'),
        t('个税', 'Tax'),
        t('关联到账', 'Linked receipts'),
      ],
      ...d.months.map((x) => [
        x.month,
        x.totals.count ? x.totals.gross : '—',
        x.totals.count ? x.totals.net : '—',
        x.totals.count ? x.totals.tax : '—',
        x.totals.count ? x.totals.actual : '—',
      ]),
    ];
    saveBlob(
      new Blob(['\uFEFF' + rows.map((r) => r.join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
      `payroll-${year}-${currency}-${basis}.csv`,
    );
  };
  const pdf = () => {
    if (!d) return;
    printPayroll(
      `${t('薪酬年度报告', 'Annual payroll report')} · ${year}`,
      [
        t('月份', 'Month'),
        t('应发', 'Gross'),
        t('扣款', 'Deductions'),
        t('实发', 'Net'),
        t('个税', 'Tax'),
        t('关联到账', 'Linked receipts'),
      ],
      d.months.map((x) => [
        x.month,
        x.totals.count ? x.totals.gross : '—',
        x.totals.count ? x.totals.deductions : '—',
        x.totals.count ? x.totals.net : '—',
        x.totals.count ? x.totals.tax : '—',
        x.totals.count ? x.totals.actual : '—',
      ]),
      [
        t(
          '未登记月份显示 —，不表示真实工资为零。',
          'Months with no records show —, not an actual zero salary.',
        ),
        `${currency} · ${basis === 'Earned' ? t('按工资归属月份', 'Earning month basis') : t('按工资条发薪日期', 'Payslip pay-date basis')}`,
        `${t('年度应发 / 实发 / 个税', 'Annual gross / net / tax')}: ${d.totals.gross} / ${d.totals.net} / ${d.totals.tax}`,
        t(
          '排除草稿、待核对及作废记录。社保与公积金单位部分不计银行现金收入；公积金核对余额不再次增加净资产。',
          'Excludes draft, pending and voided slips. Employer contributions are not bank income; reported fund balances do not add net worth.',
        ),
        t(
          '关联到账按所选工资条汇总，区别于按银行到账日期统计的现金流。',
          'Linked receipts are grouped by selected payslips, not by bank transaction dates.',
        ),
      ],
    );
  };
  return (
    <div className="payroll-stack">
      <Card>
        <div className="payroll-toolbar">
          <Input
            type="number"
            min={1901}
            max={9997}
            aria-label={t('年度', 'Year')}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ width: 110 }}
          />
          <Select
            value={currency}
            onChange={setCurrency}
            options={CURRENCY_CODES.map((value) => ({
              value,
              label: value,
            }))}
          />
          <Select
            aria-label={t('统计口径', 'Reporting basis')}
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'Earned', label: t('工资归属月', 'Earning month') },
              { value: 'Paid', label: t('实际发薪月', 'Pay-date month') },
            ]}
          />
          <Select
            allowClear
            placeholder={t('全部工作经历', 'All employment')}
            value={employment || undefined}
            onChange={(v) => setEmployment(v || '')}
            options={catalog.employments.data?.map((x) => ({
              value: x.id,
              label: value(x, 'employerName') + ' · ' + value(x, 'position'),
            }))}
          />
          <Button onClick={() => void q.refetch()}>
            {t('刷新', 'Refresh')}
          </Button>
          {(report || statistics) && (
            <>
              <Button disabled={hidden || !d} onClick={csv}>
                {t('导出 CSV', 'Export CSV')}
              </Button>
              <Button disabled={hidden || !d} onClick={pdf}>
                {t('导出 PDF', 'Export PDF')}
              </Button>
            </>
          )}
        </div>
        {q.isError && (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        )}
      </Card>
      {!report && !statistics && (
        <Card
          title={t('本月薪酬', 'Monthly payroll')}
          extra={
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ width: 170 }}
            />
          }
        >
          <GridRow gutter={[16, 16]} className="payroll-kpi">
            {[
              [t('应发工资', 'Gross'), selected?.count ? selected.gross : '—'],
              [t('实发工资', 'Net'), selected?.count ? selected.net : '—'],
              [
                t('个税预扣', 'Income tax'),
                selected?.count ? selected.tax : '—',
              ],
              [
                t('关联到账', 'Linked receipts'),
                selected?.count ? selected.actual : '—',
              ],
            ].map(([title, v]) => (
              <Col xs={12} lg={6} key={title}>
                <Statistic
                  title={title}
                  value={hidden ? '••••' : v || '0.00'}
                  suffix={hidden ? '' : currency}
                />
              </Col>
            ))}
          </GridRow>
        </Card>
      )}
      <GridRow gutter={[16, 16]} className="payroll-kpi">
        {[
          [t('本年累计薪酬', 'Annual gross'), totals?.gross],
          [t('本年实发工资', 'Annual net'), totals?.net],
          [t('年度奖金', 'Annual bonus'), totals?.annualBonus],
          [t('年度个税预扣', 'Annual withheld tax'), totals?.tax],
          [
            t('个人社保代扣', 'Personal social withholding'),
            totals?.personalSocial,
          ],
          [
            t('个人公积金代扣', 'Personal fund withholding'),
            totals?.personalHousing,
          ],
          [
            t('基本工资占比', 'Base pay share'),
            totals?.baseShare ? totals.baseShare + '%' : '—',
          ],
          [
            t('绩效奖金占比', 'Performance / bonus share'),
            totals?.performanceShare ? totals.performanceShare + '%' : '—',
          ],
          [
            t('工资扣款占比', 'Deduction share'),
            totals?.deductionShare ? totals.deductionShare + '%' : '—',
          ],
        ].map(([title, v]) => (
          <Col xs={12} lg={6} key={title}>
            <Card loading={q.isPending}>
              <Statistic title={title} value={hidden ? '••••' : v || '0.00'} />
            </Card>
          </Col>
        ))}
      </GridRow>
      {d && (
        <>
          <Card
            title={
              bonuses
                ? t('奖金与工资结构', 'Bonuses & pay structure')
                : t('月度薪酬趋势', 'Monthly payroll trend')
            }
          >
            <Suspense fallback={<Skeleton active />}>
              <Chart
                option={{
                  tooltip: { trigger: 'axis' },
                  legend: { data: [t('应发', 'Gross'), t('实发', 'Net')] },
                  grid: { left: 60, right: 20, bottom: 40 },
                  xAxis: {
                    type: 'category',
                    data: d.months.map((x) => x.month.slice(5)),
                  },
                  yAxis: { type: 'value' },
                  series: [
                    {
                      name: t('应发', 'Gross'),
                      type: 'bar',
                      data: d.months.map((x) =>
                        x.totals.count ? Number(x.totals.gross) : null,
                      ),
                    },
                    {
                      name: t('实发', 'Net'),
                      type: 'line',
                      smooth: true,
                      data: d.months.map((x) =>
                        x.totals.count ? Number(x.totals.net) : null,
                      ),
                    },
                  ],
                }}
              />
            </Suspense>
          </Card>
          <Card title={t('月度明细与同比环比', 'Monthly details & growth')}>
            <Table
              size="small"
              rowKey="month"
              dataSource={d.months}
              pagination={false}
              scroll={{ x: 900 }}
              columns={[
                { title: t('月份', 'Month'), dataIndex: 'month' },
                ...(
                  [
                    'gross',
                    'net',
                    'actual',
                    'annualBonus',
                    'tax',
                    'personalSocial',
                    'personalHousing',
                  ] as const
                ).map((key, i) => ({
                  title: [
                    t('应发', 'Gross'),
                    t('实发', 'Net'),
                    t('关联到账', 'Linked'),
                    t('年终奖', 'Annual bonus'),
                    t('个税', 'Tax'),
                    t('个人社保', 'Social'),
                    t('个人公积金', 'Housing'),
                  ][i],
                  key,
                  render: (_: unknown, x: Stats['months'][number]) => (
                    <Sensitive>
                      {x.totals.count ? x.totals[key] : '—'}
                    </Sensitive>
                  ),
                })),
                {
                  title: t('实发环比', 'Net MoM'),
                  dataIndex: 'mom',
                  render: (v: string | null) => (
                    <Sensitive>{v === null ? '—' : v + '%'}</Sensitive>
                  ),
                },
                {
                  title: t('实发同比', 'Net YoY'),
                  dataIndex: 'yoy',
                  render: (v: string | null) => (
                    <Sensitive>{v === null ? '—' : v + '%'}</Sensitive>
                  ),
                },
              ]}
            />
          </Card>
          <GridRow gutter={[20, 20]}>
            <Col xs={24} lg={12}>
              <Card title={t('工资结构', 'Pay structure')}>
                <Table
                  rowKey={(x) => x.kind + x.category}
                  size="small"
                  pagination={false}
                  scroll={{ x: 360 }}
                  dataSource={d.structure}
                  columns={[
                    {
                      title: t('类型', 'Type'),
                      dataIndex: 'kind',
                      render: label,
                    },
                    {
                      title: t('项目', 'Category'),
                      dataIndex: 'category',
                      render: label,
                    },
                    {
                      title: t('合计', 'Total'),
                      dataIndex: 'amount',
                      render: (v: string) => <Sensitive>{v}</Sensitive>,
                    },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title={t('多单位比较', 'Employer comparison')}>
                <List
                  dataSource={d.employers}
                  renderItem={(x) => (
                    <List.Item>
                      <div>
                        <strong>{x.employer}</strong>
                        <p>
                          {t('应发 / 实发', 'Gross / net')}:{' '}
                          <Sensitive>
                            {x.totals.gross} / {x.totals.net}
                          </Sensitive>
                        </p>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </GridRow>
          <Card
            title={t(
              '社保与公积金独立统计',
              'Separate insurance & housing fund totals',
            )}
          >
            <GridRow gutter={[20, 20]} className="payroll-kpi">
              {[
                [
                  'socialPersonal',
                  t('社保个人实际缴费', 'Social: personal paid'),
                ],
                [
                  'socialEmployer',
                  t('社保单位实际缴费', 'Social: employer paid'),
                ],
                [
                  'housingPersonal',
                  t('公积金个人实际缴存', 'Fund: personal paid'),
                ],
                [
                  'housingEmployer',
                  t('公积金单位实际缴存', 'Fund: employer paid'),
                ],
                [
                  'housingExpected',
                  t('预计公积金缴存', 'Expected fund contributions'),
                ],
                [
                  'reportedFundBalance',
                  t('各账户已报告余额', 'Reported fund balances'),
                ],
              ].map(([key, title]) => (
                <Col xs={12} lg={8} key={key}>
                  <Statistic
                    title={title}
                    value={hidden ? '••••' : String(d.benefits[key] || '0.00')}
                  />
                </Col>
              ))}
            </GridRow>
          </Card>
          {d.pendingCount > 0 && (
            <Alert
              type="warning"
              message={
                t(
                  '仍有草稿或待核对工资条未纳入以上统计：',
                  'Draft / pending slips excluded: ',
                ) + d.pendingCount
              }
            />
          )}
        </>
      )}
    </div>
  );
}
export function PayrollCalendar() {
  const t = usePayText();
  const label = usePayLabel();
  const [month, setMonth] = useState(
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date()),
  );
  const q = useQuery({
    queryKey: ['payroll-center', 'calendar', month],
    queryFn: () =>
      payrollApi.get<{ slips: Row[]; expected: Row[] }>('/calendar', { month }),
  });
  return (
    <Card
      title={t('薪酬日历', 'Payroll calendar')}
      extra={
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <List
          loading={q.isPending}
          dataSource={[
            ...(q.data?.slips || []),
            ...(q.data?.expected || []),
          ].sort((a, b) => value(a, 'date').localeCompare(value(b, 'date')))}
          renderItem={(x) => (
            <List.Item>
              <Space wrap>
                <strong>{value(x, 'date')}</strong>
                <Tag
                  color={value(x, 'kind') === 'Expected' ? 'default' : 'blue'}
                >
                  {value(x, 'kind') === 'Expected'
                    ? t('计划', 'Planned')
                    : label(value(x, 'state'))}
                </Tag>
                <span>{value(x, 'name')}</span>
                <span>{value(x, 'month')}</span>
              </Space>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}
