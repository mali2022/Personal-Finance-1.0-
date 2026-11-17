import { lazy, Suspense, useEffect, useState } from 'react';
import { AiLazyMarkdown as AiMarkdown } from '../components/ai/AiLazyMarkdown';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
  ClockCircleOutlined,
  DownloadOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { PageTitle } from '../components/PageTitle';
import { ErrorState } from '../components/Feedback';
import { useLocale } from '../i18n';
import { useUI } from '../stores/ui';
import {
  categoryLabels,
  csvCell,
  downloadTime,
  timeApi,
} from '../features/timeAssets/api';
import type { Activity, Versioned } from '../features/timeAssets/api';
import '../design/time-assets.css';
import SegmentsEditor from '../features/timeAssets/SegmentsEditor';
import TransactionSelector from '../features/timeAssets/TransactionSelector';
import { parseTimePaste } from '../features/timeAssets/api';
import currencies from '../data/currencies.json';
const Chart = lazy(() => import('../components/Chart'));
type Field = {
  name: string;
  label: string;
  type?:
    'number' | 'datetime' | 'date' | 'textarea' | 'segments' | 'transaction';
  options?: { label: string; value: string }[];
  optional?: boolean;
};
type Editor = {
  title: string;
  path: string;
  fields: Field[];
  initial: Record<string, unknown>;
  version?: string | number;
  put?: boolean;
};
const sections = [
  ['', '时间概览', 'Overview'],
  ['/activities', '时间流水', 'Activities'],
  ['/valuation', '时间估值', 'Valuation'],
  ['/budgets', '时间预算', 'Budgets'],
  ['/finance', '时间与财务', 'Time & finance'],
  ['/projects', '时间投资项目', 'Projects'],
  ['/ai', 'AI 时间分析', 'AI analysis'],
  ['/reports', '时间资产报告', 'Reports'],
];
const shanghai = (value: string) =>
  dayjs(value)
    .add(8 * 60 - dayjs(value).utcOffset(), 'minute')
    .format('YYYY-MM-DD HH:mm:ss');
// Construct explicit Shanghai timestamps; browser locale never changes the recorded instant.
const stamp = (value: string) => value.replace(' ', 'T') + '+08:00';
export default function TimeAssetsPage() {
  const en = useLocale() === 'en';
  const text = (zh: string, eng: string) => (en ? eng : zh);
  const hidden = useUI((s) => s.hidden);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const location = useLocation();
  const section = location.pathname.slice('/time-assets'.length);
  const today = dayjs(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }),
  );
  const [range, setRange] = useState<[string, string]>([
    today.startOf('month').format('YYYY-MM-DD'),
    today.startOf('month').add(1, 'month').format('YYYY-MM-DD'),
  ]);
  const [currency, setCurrency] = useState('CNY');
  const [projectId, setProjectId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [bulk, setBulk] = useState<string>();
  const [bulkPreview, setBulkPreview] = useState<Record<string, unknown>[]>();
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState('distribution');
  const [scenarioHours, setScenarioHours] = useState(1);
  const [analysis, setAnalysis] = useState<{
    explanation: string;
    evidence: unknown;
  }>();
  const [analyzing, setAnalyzing] = useState(false);
  const catalog = useQuery({
    queryKey: ['time-assets-catalog'],
    queryFn: timeApi.catalog,
    refetchInterval: 10000,
  });
  const report = useQuery({
    queryKey: ['time-assets-report', range, currency, projectId],
    queryFn: () =>
      timeApi.report({ from: range[0], to: range[1], currency, projectId }),
    refetchInterval: catalog.data?.timers.some((t) => t.state === 'Running')
      ? 10000
      : false,
  });
  useEffect(() => {
    setAnalysis(undefined);
  }, [range, currency, projectId, mode, scenarioHours]);
  const categoryOptions = Object.entries(categoryLabels).map(
    ([value, names]) => ({ value, label: names[en ? 1 : 0] }),
  );
  const projectOptions = (catalog.data?.projects ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const labelCategory = (v: string) => categoryLabels[v]?.[en ? 1 : 0] ?? v;
  const hours = (seconds: number) =>
    hidden ? '••••' : (seconds / 3600).toFixed(2);
  const money = (amount: number | string | null | undefined) =>
    hidden
      ? '••••'
      : amount == null
        ? text('缺少估值或汇率', 'Missing valuation or FX')
        : `${currency} ${Number(amount).toFixed(2)}`;
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ['time-assets-catalog'] });
    await cache.invalidateQueries({ queryKey: ['time-assets-report'] });
  }
  async function write(
    path: string,
    data: unknown,
    version?: string | number,
    put = false,
  ) {
    await timeApi.write(path, data, version, put);
    await refresh();
    void message.success(text('已保存', 'Saved'));
  }
  const fail = (e: unknown) =>
    void message.error(
      e instanceof Error
        ? e.message
        : (e as { message?: string })?.message ||
            text('操作失败，请重试', 'Request failed; try again'),
    );
  function open(ed: Editor) {
    setEditor(ed);
    form.resetFields();
    form.setFieldsValue(ed.initial);
  }
  function remove(kind: string, row: Versioned) {
    modal.confirm({
      title: text('确认删除？', 'Delete this record?'),
      content: text(
        '仅删除时间模块中的记录或关联，不删除财务流水。',
        'Deletes the time record or link. Financial transactions are retained.',
      ),
      onOk: () =>
        write(`/${kind}/${row.id}/delete`, {}, row.version).catch((e) => {
          fail(e);
          throw e;
        }),
    });
  }
  const dateField = (name: string, label: string, datetime = false): Field => ({
    name,
    label,
    type: datetime ? 'datetime' : 'date',
  });
  const projectField: Field = {
    name: 'projectId',
    label: text('时间项目', 'Time project'),
    options: projectOptions,
    optional: true,
  };
  const categoryField: Field = {
    name: 'category',
    label: text('分类', 'Category'),
    options: categoryOptions,
  };
  function activity(row?: Activity) {
    open({
      title: text('时间流水', 'Time activity'),
      path: '/activities' + (row ? '/' + row.id : ''),
      version: row?.version,
      put: !!row,
      initial: row
        ? {
            ...row,
            start: shanghai(row.segments[0].start),
            end: shanghai(row.segments.at(-1)!.end),
            segments: row.segments.map((s) => ({
              start: shanghai(s.start),
              end: shanghai(s.end),
            })),
          }
        : {
            category: 'Learning',
            start: today.subtract(1, 'hour').format('YYYY-MM-DD HH:mm:ss'),
            end: today.format('YYYY-MM-DD HH:mm:ss'),
          },
      fields: [
        { name: 'title', label: text('活动名称', 'Activity title') },
        categoryField,
        ...(!row || row.segments.length === 1
          ? [
              dateField(
                'start',
                text('开始（北京时间）', 'Start (Shanghai)'),
                true,
              ),
              dateField(
                'end',
                text('结束（北京时间）', 'End (Shanghai)'),
                true,
              ),
            ]
          : []),
        ...(row && row.segments.length > 1
          ? [
              {
                name: 'segments',
                label: text(
                  '计时片段（北京时间，保留暂停间隔）',
                  'Timer segments (Shanghai; retain pause gaps)',
                ),
                type: 'segments' as const,
              },
            ]
          : []),
        projectField,
        {
          name: 'note',
          label: text('备注', 'Notes'),
          type: 'textarea',
          optional: true,
        },
      ],
    });
  }
  const d = report.data;
  const s = d?.summary;
  function period(kind: string) {
    const a =
      kind === 'day'
        ? today.startOf('day')
        : kind === 'week'
          ? today.startOf('day').subtract((today.day() + 6) % 7, 'day')
          : kind === 'year'
            ? today.startOf('year')
            : today.startOf('month');
    const b =
      kind === 'day'
        ? a.add(1, 'day')
        : kind === 'week'
          ? a.add(7, 'day')
          : kind === 'year'
            ? a.add(1, 'year')
            : a.add(1, 'month');
    setRange([a.format('YYYY-MM-DD'), b.format('YYYY-MM-DD')]);
  }
  const filtered = (d?.activities ?? []).filter(
    (a) =>
      (!category || a.category === category) &&
      `${a.title} ${a.note}`
        .toLocaleLowerCase()
        .includes(keyword.toLocaleLowerCase()),
  );
  function exportData(kind: 'json' | 'csv') {
    if (!d || hidden) return;
    if (kind === 'json')
      downloadTime(
        JSON.stringify(d, null, 2),
        `time-assets-${range[0]}.json`,
        'application/json',
      );
    else {
      const rows = [
        [
          text('活动', 'Activity'),
          text('分类', 'Category'),
          'Start (ISO)',
          'End (ISO)',
          'Seconds',
          'Reference cost',
          'Currency',
          'Project',
          'Note',
        ],
        ...filtered.map((a) => [
          a.title,
          labelCategory(a.category),
          a.segments[0].start,
          a.segments.at(-1)!.end,
          a.seconds,
          a.referenceCost,
          currency,
          a.projectId,
          a.note,
        ]),
      ];
      downloadTime(
        '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'),
        `time-activities-${range[0]}.csv`,
        'text/csv;charset=utf-8',
      );
    }
  }
  return (
    <section className="time-assets-page">
      <div className="time-heading">
        <div>
          <PageTitle>
            {text('时间资产管理', 'Time Assets Management')}
          </PageTitle>
        </div>
        <ClockCircleOutlined className="time-heading-icon" />
      </div>
      <nav
        className="time-navigation"
        aria-label={text('时间资产导航', 'Time assets navigation')}
      >
        {sections.map(([path, zh, eng]) => (
          <Link
            key={path}
            to={'/time-assets' + path}
            aria-current={section === path ? 'page' : undefined}
          >
            {en ? eng : zh}
          </Link>
        ))}
      </nav>
      <Card className="time-selection">
        <Space wrap>
          {[
            ['day', '今日', 'Today'],
            ['week', '本周', 'This week'],
            ['month', '本月', 'This month'],
            ['year', '本年', 'This year'],
          ].map(([key, zh, eng]) => (
            <Button key={key} onClick={() => period(key)}>
              {en ? eng : zh}
            </Button>
          ))}
          <DatePicker.RangePicker
            aria-label={text(
              '统计日期（结束不含当天）',
              'Period (end exclusive)',
            )}
            allowClear={false}
            value={[dayjs(range[0]), dayjs(range[1])]}
            onChange={(v) => {
              if (v?.[0] && v[1])
                setRange([
                  v[0].format('YYYY-MM-DD'),
                  v[1].format('YYYY-MM-DD'),
                ]);
            }}
          />
          <Select
            aria-label={text('报告币种', 'Report currency')}
            value={currency}
            onChange={setCurrency}
            options={currencies.map((c) => ({ value: c.code, label: c.code }))}
          />
          <Select
            aria-label={text('筛选时间项目', 'Filter time project')}
            placeholder={text('全部项目', 'All projects')}
            allowClear
            value={projectId}
            onChange={setProjectId}
            options={projectOptions}
            style={{ minWidth: 150 }}
          />
        </Space>
      </Card>
      {catalog.isError && (
        <ErrorState error={catalog.error} retry={() => catalog.refetch()} />
      )}
      {report.isError && (
        <ErrorState error={report.error} retry={() => report.refetch()} />
      )}
      {report.isPending && <Skeleton active />}
      {d && (
        <>
          {(section === '' || section === '/reports') && (
            <>
              <Row gutter={[16, 16]} className="time-metrics">
                {[
                  [
                    text('已记录 / 小时', 'Recorded / hours'),
                    hours(s!.recordedSeconds),
                  ],
                  [
                    text('覆盖率 / %', 'Coverage / %'),
                    hidden ? '••••' : (s!.coveragePercent?.toFixed(2) ?? '—'),
                  ],
                  [
                    text('未记录 / 小时', 'Unrecorded / hours'),
                    hours(s!.unrecordedSeconds),
                  ],
                  [
                    text('参考时间价值', 'Reference time value'),
                    money(s!.referenceCost),
                  ],
                  [
                    text(
                      '已记录可支配时间 / 小时',
                      'Recorded discretionary / hours',
                    ),
                    hours(s!.observedDiscretionarySeconds),
                  ],
                  [
                    text('估值覆盖率 / %', 'Valuation coverage / %'),
                    hidden
                      ? '••••'
                      : (s!.valuationCoveragePercent?.toFixed(2) ?? '—'),
                  ],
                ].map(([title, value]) => (
                  <Col xs={24} sm={12} xl={8} key={title}>
                    <Card>
                      <Statistic title={title} value={value} />
                    </Card>
                  </Col>
                ))}
              </Row>
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <Card title={text('时间分类分布', 'Time distribution')}>
                    <Suspense fallback={<Skeleton />}>
                      <Chart
                        option={{
                          tooltip: { trigger: 'item' },
                          series: [
                            {
                              type: 'pie',
                              radius: ['45%', '72%'],
                              data: d.categories
                                .filter((c) => c.seconds > 0)
                                .map((c) => ({
                                  name: labelCategory(c.category),
                                  value: Number((c.seconds / 3600).toFixed(2)),
                                })),
                            },
                          ],
                        }}
                      />
                    </Suspense>
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card title={text('时间趋势 / 小时', 'Time trend / hours')}>
                    <Suspense fallback={<Skeleton />}>
                      <Chart
                        option={{
                          tooltip: { trigger: 'axis' },
                          xAxis: {
                            type: 'category',
                            data: d.trend.map((p) => p.date),
                          },
                          yAxis: { type: 'value' },
                          series: [
                            {
                              type: 'line',
                              smooth: true,
                              data: d.trend.map((p) =>
                                Number((p.seconds / 3600).toFixed(2)),
                              ),
                            },
                          ],
                        }}
                      />
                    </Suspense>
                  </Card>
                </Col>
              </Row>
              <Table
                rowKey="category"
                size="small"
                pagination={false}
                dataSource={d.categories}
                columns={[
                  {
                    title: text('分类', 'Category'),
                    dataIndex: 'category',
                    render: labelCategory,
                  },
                  {
                    title: text('小时', 'Hours'),
                    dataIndex: 'seconds',
                    render: hours,
                  },
                  {
                    title: text(
                      '占已记录时间 / %',
                      'Share of recorded time / %',
                    ),
                    dataIndex: 'percentOfRecorded',
                    render: (v) => (hidden ? '••••' : (v ?? '—')),
                  },
                ]}
              />
            </>
          )}
          {section === '/activities' && (
            <>
              <Card
                title={text('实时计时', 'Live timer')}
                extra={
                  <Button
                    onClick={() =>
                      open({
                        title: text('开始计时', 'Start timer'),
                        path: '/timer',
                        initial: { category: 'Work' },
                        fields: [
                          {
                            name: 'title',
                            label: text('活动名称', 'Activity title'),
                          },
                          categoryField,
                          projectField,
                        ],
                      })
                    }
                  >
                    {text('开始计时', 'Start timer')}
                  </Button>
                }
              >
                {catalog.data?.timers.length ? (
                  catalog.data.timers.map((t) => (
                    <Space key={t.id} wrap>
                      <Tag color={t.state === 'Running' ? 'green' : 'orange'}>
                        {t.state === 'Running'
                          ? text('进行中', 'Running')
                          : text('已暂停', 'Paused')}
                      </Tag>
                      <strong>{t.title}</strong>
                      <span>
                        {hours(t.seconds)}{' '}
                        {text(
                          '小时（每10秒同步）',
                          'hours (syncs every 10 seconds)',
                        )}
                      </span>
                      <Button
                        onClick={() =>
                          void write(
                            `/timer/${t.id}/${t.state === 'Running' ? 'pause' : 'resume'}`,
                            {},
                            t.version,
                          ).catch(fail)
                        }
                      >
                        {t.state === 'Running'
                          ? text('暂停', 'Pause')
                          : text('继续', 'Resume')}
                      </Button>
                      <Button
                        onClick={() =>
                          void write(
                            `/timer/${t.id}/stop`,
                            {},
                            t.version,
                          ).catch(fail)
                        }
                      >
                        {text('停止并保存', 'Stop & save')}
                      </Button>
                    </Space>
                  ))
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={text('暂无计时活动', 'No active timer')}
                  />
                )}
              </Card>
              <Space wrap className="time-toolbar">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => activity()}
                >
                  {text('记录时间', 'Add activity')}
                </Button>
                <Button
                  onClick={() => {
                    setBulk('');
                    setBulkPreview(undefined);
                  }}
                >
                  {text('批量补录', 'Batch backfill')}
                </Button>
                <Input.Search
                  aria-label={text('搜索时间流水', 'Search time activities')}
                  placeholder={text('搜索名称或备注', 'Search title or notes')}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  style={{ width: 240 }}
                />
                <Select
                  placeholder={text('全部分类', 'All categories')}
                  allowClear
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  style={{ minWidth: 130 }}
                />
                <Button
                  icon={<DownloadOutlined />}
                  disabled={hidden}
                  onClick={() => exportData('csv')}
                >
                  CSV
                </Button>
              </Space>
              <Table
                scroll={{ x: 850 }}
                rowKey="id"
                dataSource={filtered}
                columns={[
                  { title: text('活动', 'Activity'), dataIndex: 'title' },
                  {
                    title: text('分类', 'Category'),
                    dataIndex: 'category',
                    render: labelCategory,
                  },
                  {
                    title: text('开始（北京时间）', 'Start (Shanghai)'),
                    render: (_, a) => shanghai(a.segments[0].start),
                  },
                  {
                    title: text('小时', 'Hours'),
                    dataIndex: 'seconds',
                    render: hours,
                  },
                  {
                    title: text('参考成本', 'Reference cost'),
                    dataIndex: 'referenceCost',
                    render: money,
                  },
                  {
                    title: text('操作', 'Actions'),
                    render: (_, a) => (
                      <Space>
                        <Button
                          size="small"
                          disabled={a.state !== 'Completed'}
                          onClick={() => activity(a)}
                        >
                          {text('编辑', 'Edit')}
                        </Button>
                        <Button
                          danger
                          size="small"
                          onClick={() => remove('activities', a)}
                        >
                          {text('删除', 'Delete')}
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />
              <Card
                className="mt20"
                title={text('重复活动模板', 'Recurring activity templates')}
                extra={
                  <Button
                    onClick={() =>
                      open({
                        title: text('活动模板', 'Activity template'),
                        path: '/templates',
                        initial: {
                          category: 'Learning',
                          minutes: 30,
                          repeat: 'Daily',
                        },
                        fields: [
                          {
                            name: 'name',
                            label: text('模板名称', 'Template name'),
                          },
                          categoryField,
                          {
                            name: 'minutes',
                            label: text('时长 / 分钟', 'Duration / minutes'),
                            type: 'number',
                          },
                          {
                            name: 'repeat',
                            label: text('重复方式', 'Repeat'),
                            options: [
                              { value: 'Daily', label: text('每天', 'Daily') },
                              {
                                value: 'Weekdays',
                                label: text('工作日', 'Weekdays'),
                              },
                              {
                                value: 'Weekly',
                                label: text('每周', 'Weekly'),
                              },
                            ],
                          },
                          projectField,
                        ],
                      })
                    }
                  >
                    {text('新增模板', 'New template')}
                  </Button>
                }
              >
                <Table
                  rowKey="id"
                  dataSource={catalog.data?.templates}
                  columns={[
                    { title: text('名称', 'Name'), dataIndex: 'name' },
                    { title: text('分钟', 'Minutes'), dataIndex: 'minutes' },
                    { title: text('重复', 'Repeat'), dataIndex: 'repeat' },
                    {
                      title: text('操作', 'Actions'),
                      render: (_, t) => (
                        <Space>
                          <Button
                            onClick={() =>
                              open({
                                title: text(
                                  '按模板补录（确认后写入）',
                                  'Backfill from template (writes on confirmation)',
                                ),
                                path: `/templates/${t.id}/apply`,
                                initial: {
                                  start: today
                                    .subtract(1, 'day')
                                    .hour(9)
                                    .minute(0)
                                    .second(0)
                                    .format('YYYY-MM-DD HH:mm:ss'),
                                  count: 1,
                                },
                                fields: [
                                  dateField(
                                    'start',
                                    text(
                                      '首次开始（北京时间）',
                                      'First start (Shanghai)',
                                    ),
                                    true,
                                  ),
                                  {
                                    name: 'count',
                                    label: text(
                                      '次数（1–31）',
                                      'Occurrences (1–31)',
                                    ),
                                    type: 'number',
                                  },
                                ],
                              })
                            }
                          >
                            {text('使用', 'Apply')}
                          </Button>
                          <Button danger onClick={() => remove('templates', t)}>
                            {text('删除', 'Delete')}
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          )}
          {section === '/valuation' && (
            <Card
              title={text('时间估值与历史版本', 'Time valuation & history')}
              extra={
                <Button
                  type="primary"
                  onClick={() =>
                    open({
                      title: text('新增估值版本', 'New valuation version'),
                      path: '/valuations',
                      initial: {
                        method: 'Custom',
                        currency,
                        effectiveFrom: range[0],
                        hourlyRate: 50,
                        income: 0,
                        hours: 0,
                      },
                      fields: [
                        {
                          name: 'method',
                          label: text('估值方法', 'Valuation method'),
                          options: [
                            ['LaborIncome', '劳动收入法', 'Labor income'],
                            [
                              'DisposableIncome',
                              '可支配收入法',
                              'Disposable income',
                            ],
                            [
                              'OpportunityCost',
                              '机会成本法',
                              'Opportunity cost',
                            ],
                            ['Custom', '自定义时薪', 'Custom hourly rate'],
                          ].map(([value, zh, eng]) => ({
                            value,
                            label: en ? eng : zh,
                          })),
                        },
                        {
                          name: 'source',
                          label: text(
                            '来源及计算依据（必填）',
                            'Source & calculation basis (required)',
                          ),
                        },
                        { name: 'currency', label: text('币种', 'Currency') },
                        dateField(
                          'effectiveFrom',
                          text('生效日期', 'Effective date'),
                        ),
                        {
                          name: 'income',
                          label: text(
                            '期间劳动 / 可支配收入',
                            'Period labor / disposable income',
                          ),
                          type: 'number',
                        },
                        {
                          name: 'hours',
                          label: text(
                            '对应期间劳动小时',
                            'Labor hours in same period',
                          ),
                          type: 'number',
                        },
                        {
                          name: 'hourlyRate',
                          label: text(
                            '机会成本 / 自定义时薪',
                            'Opportunity / custom hourly rate',
                          ),
                          type: 'number',
                        },
                      ],
                    })
                  }
                >
                  {text('新增历史版本', 'Add version')}
                </Button>
              }
            >
              <Table
                scroll={{ x: 750 }}
                rowKey="id"
                dataSource={catalog.data?.valuations}
                columns={[
                  { title: text('版本', 'Revision'), dataIndex: 'revision' },
                  { title: text('方法', 'Method'), dataIndex: 'method' },
                  {
                    title: text('生效日期', 'Effective date'),
                    dataIndex: 'effectiveFrom',
                  },
                  {
                    title: text('时薪', 'Hourly rate'),
                    render: (_, v) =>
                      hidden ? '••••' : `${v.currency} ${v.hourlyRate}`,
                  },
                  { title: text('来源', 'Source'), dataIndex: 'source' },
                ]}
              />
            </Card>
          )}
          {section === '/budgets' && (
            <Card
              title={text('时间预算', 'Time budgets')}
              extra={
                <Button
                  type="primary"
                  onClick={() =>
                    open({
                      title: text('新增时间预算', 'New time budget'),
                      path: '/budgets',
                      initial: {
                        period: 'Day',
                        startDate: today.format('YYYY-MM-DD'),
                        minutes: 120,
                      },
                      fields: [
                        {
                          name: 'period',
                          label: text('周期', 'Period'),
                          options: [
                            ['Day', '每日', 'Day'],
                            ['Week', '每周', 'Week'],
                            ['Month', '每月', 'Month'],
                          ].map(([value, zh, eng]) => ({
                            value,
                            label: en ? eng : zh,
                          })),
                        },
                        dateField(
                          'startDate',
                          text(
                            '起始日（周一 / 每月1日）',
                            'Start (Monday / first of month)',
                          ),
                        ),
                        { ...categoryField, optional: true },
                        {
                          name: 'minutes',
                          label: text('预算分钟', 'Budget minutes'),
                          type: 'number',
                        },
                      ],
                    })
                  }
                >
                  {text('新增预算', 'New budget')}
                </Button>
              }
            >
              <Table
                rowKey="id"
                dataSource={d.budgets}
                columns={[
                  {
                    title: text('周期 / 起始日', 'Period / start'),
                    render: (_, b) => `${b.period} · ${b.startDate}`,
                  },
                  {
                    title: text('分类', 'Category'),
                    dataIndex: 'category',
                    render: (c) => (c ? labelCategory(c) : text('全部', 'All')),
                  },
                  {
                    title: text('分钟 / 预算', 'Minutes / budget'),
                    render: (_, b) =>
                      hidden ? '••••' : `${b.usedMinutes} / ${b.minutes}`,
                  },
                  {
                    title: text('进度', 'Progress'),
                    render: (_, b) =>
                      hidden ? (
                        '••••'
                      ) : (
                        <Progress
                          percent={Math.min(100, b.progressPercent)}
                          status={b.overMinutes > 0 ? 'exception' : 'normal'}
                          format={() => `${b.progressPercent}%`}
                        />
                      ),
                  },
                  {
                    title: text('超额分钟', 'Over minutes'),
                    dataIndex: 'overMinutes',
                    render: (v) => (hidden ? '••••' : v),
                  },
                  {
                    title: text('操作', 'Actions'),
                    render: (_, b) => (
                      <Button danger onClick={() => remove('budgets', b)}>
                        {text('删除', 'Delete')}
                      </Button>
                    ),
                  },
                ]}
              />
            </Card>
          )}
          {section === '/finance' && (
            <>
              <Row gutter={[16, 16]} className="time-metrics">
                {[
                  [text('关联收入', 'Linked income'), money(s!.linkedIncome)],
                  [
                    text('关联净支出', 'Linked net expenses'),
                    money(s!.linkedExpense),
                  ],
                  [
                    text('综合资源成本', 'Combined resource cost'),
                    money(s!.combinedResourceCost),
                  ],
                  [
                    text(
                      '实际工作时薪（含通勤）',
                      'Actual work hourly rate (incl. commute)',
                    ),
                    money(s!.actualWorkHourlyRate),
                  ],
                  [
                    text('通勤参考成本', 'Commute reference cost'),
                    money(s!.commuteReferenceCost),
                  ],
                ].map(([title, value]) => (
                  <Col key={title} xs={24} md={12} xl={8}>
                    <Card>
                      <Statistic title={title} value={value} />
                    </Card>
                  </Col>
                ))}
              </Row>
              <Button
                type="primary"
                onClick={() =>
                  open({
                    title: text('关联财务流水', 'Link financial transaction'),
                    path: '/links',
                    initial: {},
                    fields: [
                      {
                        name: 'transactionId',
                        label: text(
                          '选择已有财务流水',
                          'Select existing transaction',
                        ),
                        type: 'transaction',
                      },
                      {
                        name: 'activityId',
                        label: text(
                          '时间活动（与项目二选一）',
                          'Time activity (choose activity or project)',
                        ),
                        options: d.activities.map((a) => ({
                          value: a.id,
                          label: a.title,
                        })),
                        optional: true,
                      },
                      projectField,
                    ],
                  })
                }
              >
                {text('新增关联', 'Add link')}
              </Button>
              <Table
                scroll={{ x: 800 }}
                rowKey="id"
                dataSource={d.financialTransactions}
                columns={[
                  {
                    title: text('财务流水', 'Financial transaction'),
                    dataIndex: 'id',
                    render: (id) => (
                      <Link to={`/transactions/${id}`}>{id}</Link>
                    ),
                  },
                  {
                    title: text('原币种', 'Source currency'),
                    dataIndex: 'sourceCurrency',
                  },
                  {
                    title: text('折算收入', 'Converted income'),
                    dataIndex: 'income',
                    render: money,
                  },
                  {
                    title: text('折算净支出', 'Converted net expense'),
                    dataIndex: 'expense',
                    render: money,
                  },
                  {
                    title: text('消费所需劳动小时', 'Labor hours for spending'),
                    dataIndex: 'laborHours',
                    render: (v) =>
                      hidden ? '••••' : v == null ? '—' : Number(v).toFixed(2),
                  },
                ]}
              />
              <Table
                rowKey="id"
                dataSource={d.financialLinks}
                columns={[
                  {
                    title: text('关联流水 ID', 'Linked transaction ID'),
                    dataIndex: 'transactionId',
                  },
                  {
                    title: text('关联目标', 'Link target'),
                    render: (_, l) => l.activityId ?? l.projectId,
                  },
                  {
                    title: text('操作', 'Actions'),
                    render: (_, l) => (
                      <Button danger onClick={() => remove('links', l)}>
                        {text('解除关联', 'Unlink')}
                      </Button>
                    ),
                  },
                ]}
              />
            </>
          )}
          {section === '/projects' && (
            <Card
              title={text('时间投资项目', 'Time investment projects')}
              extra={
                <Button type="primary" onClick={() => projectEditor()}>
                  {text('创建项目', 'Create project')}
                </Button>
              }
            >
              <Table
                scroll={{ x: 1050 }}
                rowKey="id"
                dataSource={d.projects}
                columns={[
                  {
                    title: text('项目 / 目标', 'Project / goal'),
                    render: (_, p) => (
                      <>
                        <strong>{p.name}</strong>
                        <div>{p.goal}</div>
                      </>
                    ),
                  },
                  {
                    title: text('累计小时 / 预算', 'Lifetime hours / budget'),
                    render: (_, p) =>
                      hidden
                        ? '••••'
                        : `${((p.lifetimeMinutes ?? 0) / 60).toFixed(2)} / ${(p.budgetMinutes / 60).toFixed(2)}`,
                  },
                  {
                    title: text('本期投入小时', 'Period hours'),
                    render: (_, p) => hours((p.minutes ?? 0) * 60),
                  },
                  {
                    title: text('累计回报 / 小时', 'Lifetime return / hour'),
                    render: (_, p) =>
                      hidden
                        ? '••••'
                        : p.returnPerHour == null
                          ? '—'
                          : `${p.returnPerHour.toFixed(2)} ${p.returnUnit}`,
                  },
                  {
                    title: text('回报 / 目标', 'Return / target'),
                    render: (_, p) =>
                      hidden
                        ? '••••'
                        : `${p.actualReturn} / ${p.targetReturn} ${p.returnUnit}`,
                  },
                  {
                    title: text('完成度', 'Goal progress'),
                    render: (_, p) =>
                      hidden ? '••••' : `${p.goalProgressPercent ?? 0}%`,
                  },
                  {
                    title: text('参考时间成本', 'Reference time cost'),
                    dataIndex: 'referenceTimeCost',
                    render: money,
                  },
                  {
                    title: text('关联净支出', 'Linked net expense'),
                    dataIndex: 'linkedExpense',
                    render: money,
                  },
                  {
                    title: text('操作', 'Actions'),
                    render: (_, p) => (
                      <Space>
                        <Button onClick={() => projectEditor(p)}>
                          {text('编辑 / 更新回报', 'Edit / update return')}
                        </Button>
                        <Button danger onClick={() => remove('projects', p)}>
                          {text('删除', 'Delete')}
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </Card>
          )}
          {section === '/ai' && (
            <Card title={text('AI 时间分析', 'AI time analysis')}>
              <Typography.Paragraph>
                {text(
                  '复用现有 DeepSeek 配置。后端确定性计算，AI 仅解释。仅发送时间统计、分类汇总和分析定义，不发送活动名称、备注、流水 ID 或原文件。财务联合模式会发送已授权的关联收支汇总。',
                  'Uses existing DeepSeek configuration. The backend computes numbers; AI explains them. Sends time aggregates, category summaries and definitions, never activity titles, notes, transaction IDs or files. Joint financial mode includes authorized linked financial totals.',
                )}
              </Typography.Paragraph>
              <Space wrap>
                <Select
                  aria-label={text('分析类型', 'Analysis mode')}
                  value={mode}
                  onChange={setMode}
                  options={[
                    'distribution',
                    'finance',
                    'budget',
                    'project',
                    'scenario',
                  ].map((value, i) => ({
                    value,
                    label: text(
                      [
                        '分布诊断',
                        '时间财务联合',
                        '预算建议',
                        '项目投入',
                        '情景模拟',
                      ][i],
                      [
                        'Distribution',
                        'Time & finance',
                        'Budget advice',
                        'Project inputs',
                        'Scenario',
                      ][i],
                    ),
                  }))}
                />
                {mode === 'scenario' && (
                  <InputNumber
                    aria-label={text('假设投入小时', 'Hypothetical hours')}
                    min={0}
                    max={8760}
                    value={scenarioHours}
                    onChange={(v) => setScenarioHours(v ?? 0)}
                  />
                )}
                <Checkbox
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                >
                  {text(
                    '本次同意发送统计摘要',
                    'Consent to send these summaries',
                  )}
                </Checkbox>
                <Button
                  type="primary"
                  disabled={!consent || hidden}
                  loading={analyzing}
                  onClick={async () => {
                    setAnalyzing(true);
                    setAnalysis(undefined);
                    try {
                      setAnalysis(
                        await timeApi.analyze({
                          from: range[0],
                          to: range[1],
                          currency,
                          projectId,
                          mode,
                          sendTimeSummary: consent,
                          scenarioHours,
                        }),
                      );
                    } catch (e) {
                      fail(e);
                    } finally {
                      setAnalyzing(false);
                    }
                  }}
                >
                  {text('生成解释', 'Generate explanation')}
                </Button>
                <Link to="/settings/ai">
                  {text('AI 与隐私设置', 'AI & privacy settings')}
                </Link>
              </Space>
              {analysis && !hidden && (
                <>
                  <Alert
                    type="warning"
                    message={text(
                      'AI 解释仅供参考；数字与事实以以下后端依据为准，建议不会自动修改记录。',
                      'AI explanations are references. Backend evidence is authoritative; suggestions never change records.',
                    )}
                  />
                  <div style={{ marginTop: 16 }}><AiMarkdown text={analysis.explanation} /></div>
                  <details>
                    <summary>
                      {text('查看计算依据', 'View calculation evidence')}
                    </summary>
                    <pre className="time-evidence">
                      {JSON.stringify(analysis.evidence, null, 2)}
                    </pre>
                  </details>
                </>
              )}
            </Card>
          )}
          {section === '/reports' && (
            <Card
              title={text(
                '月报、年报与时间投资报告',
                'Monthly, annual & time investment reports',
              )}
            >
              <Space wrap>
                <Button onClick={() => period('month')}>
                  {text('本月报告', 'Monthly report')}
                </Button>
                <Button onClick={() => period('year')}>
                  {text('本年报告', 'Annual report')}
                </Button>
                <Button disabled={hidden} onClick={() => exportData('json')}>
                  {text('导出完整报告 JSON', 'Export complete report JSON')}
                </Button>
                <Button disabled={hidden} onClick={() => exportData('csv')}>
                  {text('导出流水 CSV', 'Export activities CSV')}
                </Button>
                <Button disabled={hidden} onClick={() => window.print()}>
                  {text('打印 / 保存 PDF', 'Print / save PDF')}
                </Button>
              </Space>
              <Table
                rowKey="id"
                size="small"
                dataSource={d.projects}
                columns={[
                  {
                    title: text('时间投资项目', 'Time investment project'),
                    dataIndex: 'name',
                  },
                  {
                    title: text('本期投入小时', 'Period hours'),
                    render: (_, p) => hours((p.minutes ?? 0) * 60),
                  },
                  {
                    title: text('累计目标完成度', 'Cumulative goal progress'),
                    render: (_, p) =>
                      hidden ? '••••' : `${p.goalProgressPercent ?? 0}%`,
                  },
                  {
                    title: text('累计回报 / 小时', 'Lifetime return / hour'),
                    render: (_, p) =>
                      hidden
                        ? '••••'
                        : p.returnPerHour == null
                          ? '—'
                          : `${p.returnPerHour.toFixed(2)} ${p.returnUnit}`,
                  },
                  {
                    title: text('关联净支出', 'Linked net expenses'),
                    dataIndex: 'linkedExpense',
                    render: money,
                  },
                ]}
              />
              <Table
                rowKey="id"
                dataSource={d.budgets}
                columns={[
                  {
                    title: text('预算期间', 'Budget period'),
                    dataIndex: 'startDate',
                  },
                  {
                    title: text('分类', 'Category'),
                    dataIndex: 'category',
                    render: (c) => (c ? labelCategory(c) : text('全部', 'All')),
                  },
                  {
                    title: text('实际 / 预算分钟', 'Used / budget minutes'),
                    render: (_, b) =>
                      hidden ? '••••' : `${b.usedMinutes} / ${b.minutes}`,
                  },
                ]}
              />
              <Typography.Paragraph>
                {text('关联净支出', 'Linked net expense')}:{' '}
                {money(s!.linkedExpense)} ·{' '}
                {text('综合资源成本', 'Combined resource cost')}:{' '}
                {money(s!.combinedResourceCost)}
              </Typography.Paragraph>
            </Card>
          )}
        </>
      )}
      <Modal
        title={editor?.title}
        open={!!editor}
        onCancel={() => setEditor(undefined)}
        confirmLoading={saving}
        destroyOnHidden
        onOk={async () => {
          if (!editor) return;
          try {
            const raw = await form.validateFields();
            const values: Record<string, unknown> = { ...raw };
            for (const field of editor.fields) {
              if (field.type === 'datetime')
                values[field.name] = stamp(String(values[field.name]));
              if (
                field.optional &&
                (values[field.name] === '' || values[field.name] === undefined)
              )
                values[field.name] = null;
            }
            if (Array.isArray(values.segments)) {
              values.segments = (
                values.segments as { start: string; end: string }[]
              ).map((s) => ({ start: stamp(s.start), end: stamp(s.end) }));
              const parts = values.segments as { start: string; end: string }[];
              values.start = parts[0]?.start;
              values.end = parts.at(-1)?.end;
            }
            setSaving(true);
            await write(editor.path, values, editor.version, editor.put);
            setEditor(undefined);
          } catch (e) {
            if (!(e as { errorFields?: unknown }).errorFields) fail(e);
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form form={form} layout="vertical">
          {editor?.fields.map((field) => (
            <Form.Item
              key={field.name}
              name={field.name}
              label={field.label}
              rules={[
                {
                  required: !field.optional,
                  message: text('请填写此项', 'Required'),
                },
                ...(field.type === 'datetime'
                  ? [
                      {
                        pattern: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
                        message: 'YYYY-MM-DD HH:mm:ss',
                      },
                    ]
                  : field.type === 'date'
                    ? [
                        {
                          pattern: /^\d{4}-\d{2}-\d{2}$/,
                          message: 'YYYY-MM-DD',
                        },
                      ]
                    : []),
              ]}
            >
              {field.type === 'transaction' ? (
                <TransactionSelector />
              ) : field.type === 'segments' ? (
                <SegmentsEditor />
              ) : field.options ? (
                <Select
                  allowClear={field.optional}
                  showSearch
                  optionFilterProp="label"
                  options={field.options}
                />
              ) : field.type === 'number' ? (
                <InputNumber
                  min={0}
                  max={1000000000000}
                  style={{ width: '100%' }}
                />
              ) : field.type === 'textarea' ? (
                <Input.TextArea maxLength={2000} />
              ) : (
                <Input
                  maxLength={field.name === 'source' ? 500 : 200}
                  placeholder={
                    field.type === 'datetime'
                      ? 'YYYY-MM-DD HH:mm:ss'
                      : field.type === 'date'
                        ? 'YYYY-MM-DD'
                        : undefined
                  }
                />
              )}
            </Form.Item>
          ))}
        </Form>
      </Modal>
      <Modal
        title={text(
          '批量补录：校验与确认',
          'Batch backfill: validate & confirm',
        )}
        open={bulk !== undefined}
        onCancel={() => setBulk(undefined)}
        okText={text('确认写入', 'Confirm save')}
        okButtonProps={{ disabled: !bulkPreview?.length || saving }}
        confirmLoading={saving}
        onOk={async () => {
          if (!bulkPreview) return;
          setSaving(true);
          try {
            await write('/batch', bulkPreview);
            setBulk(undefined);
          } catch (e) {
            fail(e);
          } finally {
            setSaving(false);
          }
        }}
      >
        <pre className="time-evidence">
          {'阅读\t学习\t2026-10-18 09:00\t2026-10-18 09:30'}
        </pre>
        <Input.TextArea
          rows={8}
          value={bulk}
          onChange={(e) => {
            setBulk(e.target.value);
            setBulkPreview(undefined);
          }}
        />
        <Button
          onClick={() => {
            try {
              const rows = parseTimePaste(bulk ?? '');
              setBulkPreview(rows);
            } catch (e) {
              fail(e);
            }
          }}
        >
          {text('校验并预览', 'Validate & preview')}
        </Button>
        {bulkPreview && (
          <Table
            size="small"
            rowKey={(_, i) => String(i)}
            dataSource={bulkPreview}
            columns={[
              { title: text('活动', 'Activity'), dataIndex: 'title' },
              { title: text('开始', 'Start'), dataIndex: 'start' },
              { title: text('结束', 'End'), dataIndex: 'end' },
            ]}
          />
        )}
      </Modal>
    </section>
  );
  function projectEditor(p?: import('../features/timeAssets/api').Project) {
    open({
      title: text('时间投资项目', 'Time investment project'),
      path: '/projects' + (p ? '/' + p.id : ''),
      version: p?.version,
      put: !!p,
      initial: p
        ? { ...p }
        : {
            budgetMinutes: 600,
            returnUnit: text('页', 'pages'),
            targetReturn: 100,
            actualReturn: 0,
            state: 'Active',
          },
      fields: [
        { name: 'name', label: text('项目名称', 'Project name') },
        { name: 'goal', label: text('目标', 'Goal'), type: 'textarea' },
        {
          name: 'budgetMinutes',
          label: text('预算分钟', 'Budget minutes'),
          type: 'number',
        },
        {
          name: 'returnUnit',
          label: text(
            '回报单位（可为非货币）',
            'Return unit (may be non-monetary)',
          ),
        },
        {
          name: 'targetReturn',
          label: text('目标回报', 'Target return'),
          type: 'number',
        },
        {
          name: 'actualReturn',
          label: text('累计实际回报', 'Cumulative actual return'),
          type: 'number',
        },
        {
          name: 'state',
          label: text('状态', 'State'),
          options: [
            ['Active', '进行中', 'Active'],
            ['Completed', '已完成', 'Completed'],
            ['Archived', '已归档', 'Archived'],
          ].map(([value, zh, eng]) => ({ value, label: en ? eng : zh })),
        },
      ],
    });
  }
}
