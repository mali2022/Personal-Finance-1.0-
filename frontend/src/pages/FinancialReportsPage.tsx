import { minor, decimal } from '../utils/finance';
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Pagination,
  Popconfirm,
  Progress,
  Select,
  Skeleton,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Form,
} from 'antd';
import {
  ArrowRightOutlined,
  DownloadOutlined,
  FullscreenOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { DatePicker } from '../components/ResponsiveDatePicker';
import { Money } from '../components/Money';
import { returnStatus } from '../features/investmentReturns/AssetReturnPanel';
import { investmentDisplayAmount } from '../features/investmentReturns/displayAmount';
import { ErrorState } from '../components/Feedback';
import { PageTitle } from '../components/PageTitle';
import {
  financialReportsApi as api,
  type ReportSelection,
  type ReportPreferences,
  type ReportArchive,
} from '../api/financialReports';
import {
  financialReportPages,
  annualChapters,
  type FinancialReportPage,
} from '../features/financialReports/sections';
import { ReportAi } from '../features/financialReports/ReportAi';
import {
  downloadReport,
  storyImage,
} from '../features/financialReports/export';
import { saveBlob } from '../utils/download';
import { usePreferredCurrency } from '../hooks/useCurrency';
import { currencyOptions } from '../constants/currencies';
import { useUI } from '../stores/ui';
import { t, useLocale } from '../i18n';
import '../design/financial-reports.css';
const Chart = lazy(() => import('../components/Chart'));
const titles = financialReportPages;
export default function FinancialReportsPage({
  page,
}: {
  page: FinancialReportPage;
}) {
  const locale = useLocale();
  const preferred = usePreferredCurrency();
  const hidden = useUI((s) => s.hidden);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const [archivePage, setArchivePage] = useState(1);
  const [category, setCategory] = useState<string | null>(null);
  const [cumulative, setCumulative] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [imageBusy, setImageBusy] = useState(false);
  const storyRef = useRef<HTMLDivElement>(null);
  const [systemReduced, setSystemReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystemReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const preferences = useQuery({
    queryKey: ['financial-report-preferences'],
    queryFn: api.preferences,
  });
  const annual =
    page === 'annual' ||
    page === 'story' ||
    (page !== 'monthly' && params.get('mode') === 'annual');
  const rawPeriod =
    params.get('period') ||
    (annual ? dayjs().format('YYYY') : dayjs().format('YYYY-MM'));
  const period = annual
    ? rawPeriod.slice(0, 4)
    : rawPeriod.length === 4
      ? rawPeriod + '-01'
      : rawPeriod;
  const currency =
    params.get('currency') || preferences.data?.currency || preferred;
  const selection: ReportSelection = {
    mode: annual ? 'annual' : 'monthly',
    period,
    currency,
  };
  const snapshotId = params.get('snapshot');
  const needsReport = !['archives', 'preferences'].includes(page);
  const report = useQuery({
    queryKey: ['financial-report', snapshotId || selection],
    enabled: needsReport,
    queryFn: ({ signal }) =>
      snapshotId ? api.snapshot(snapshotId) : api.get(selection, signal),
    staleTime: 60000,
    retry: false,
  });
  const archives = useQuery({
    queryKey: ['financial-report-archives', archivePage],
    queryFn: () => api.archives(archivePage),
    enabled: page === 'archives',
  });
  const [prefsForm] = Form.useForm<ReportPreferences>();
  useEffect(() => {
    if (page === 'preferences' && preferences.data)
      prefsForm.setFieldsValue(preferences.data);
  }, [preferences.data, prefsForm, page]);
  const archiveKey = useRef<string>(undefined);
  const prefKey = useRef<string>(undefined);
  const deleteKeys = useRef(new Map<string, string>());
  const archive = useMutation({
    mutationFn: () => {
      archiveKey.current ??= crypto.randomUUID();
      return api.archive(report.data!.selection, archiveKey.current);
    },
    onSuccess: () => {
      archiveKey.current = undefined;
      void cache.invalidateQueries({ queryKey: ['financial-report-archives'] });
      message.success('报告快照已归档');
    },
    onError: (e: Error) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (item: ReportArchive) => {
      let key = deleteKeys.current.get(item.id);
      if (!key) {
        key = crypto.randomUUID();
        deleteKeys.current.set(item.id, key);
      }
      return api.remove(item, key);
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['financial-report-archives'] });
      message.success('归档已删除');
    },
    onError: (e: Error) => message.error(e.message),
  });
  const savePrefs = useMutation({
    mutationFn: (values: ReportPreferences) => {
      prefKey.current ??= crypto.randomUUID();
      return api.savePreferences(
        { ...values, version: preferences.data?.version ?? '0' },
        prefKey.current,
      );
    },
    onSuccess: (p) => {
      prefKey.current = undefined;
      cache.setQueryData(['financial-report-preferences'], p);
      message.success('报告偏好已保存');
    },
    onError: (e: Error) => {
      message.error(e.message);
      void preferences.refetch();
    },
  });
  const update = (values: Record<string, string>) => {
    setCategory(null);
    setChapter(0);
    archiveKey.current = undefined;
    setParams(
      new URLSearchParams({
        ...Object.fromEntries(params),
        ...values,
        snapshot: '',
      }),
    );
  };
  const r = report.data;
  const reduced = systemReduced || preferences.data?.reducedMotion;
  const query = (target: string, mode = annual ? 'annual' : 'monthly') => {
    const source = r?.selection ?? selection;
    return (
      target +
      '?' +
      new URLSearchParams({
        mode,
        period:
          mode === 'annual'
            ? source.period.slice(0, 4)
            : source.period.length === 4
              ? source.period + '-01'
              : source.period,
        currency: source.currency,
        ...(snapshotId && mode === source.mode ? { snapshot: snapshotId } : {}),
      })
    );
  };
  const drill = (extra: Record<string, string> = {}) => {
    if (!r) return;
    navigate(
      '/transactions?' +
        new URLSearchParams({
          start: r.start,
          end: dayjs(r.endExclusive).subtract(1, 'millisecond').toISOString(),
          currency: r.selection.currency,
          ...extra,
        }),
    );
  };
  const image = async (share = false) => {
    if (!r || hidden) return;
    setImageBusy(true);
    try {
      const blob = await storyImage(
        r,
        preferences.data?.redactSharing !== false,
      );
      const file = new File(
        [blob],
        `financial-story-${r.selection.period}.png`,
        { type: 'image/png' },
      );
      if (share && navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file], title: '财务报告摘要' });
      else saveBlob(blob, file.name);
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        message.error((e as Error).message);
    } finally {
      setImageBusy(false);
    }
  };
  const metrics = () =>
    r && (
      <div className="fr-metrics">
        {[
          ['收入', r.metrics.income],
          ['支出', r.metrics.expense],
          ['结余', r.metrics.surplus],
          ['结余率', r.metrics.savingsRate],
        ].map(([label, value], i) => (
          <Card key={label} className={'fr-metric fr-metric-' + i}>
            <span>{t(label!)}</span>
            <div className="fr-number">
              {i === 3 ? (
                hidden ? (
                  '••••'
                ) : value === null ? (
                  '不适用'
                ) : (
                  value + '%'
                )
              ) : (
                <Money value={value!} currency={r.selection.currency} />
              )}
            </div>
          </Card>
        ))}
      </div>
    );
  const chart = () => {
    if (!r) return null;
    const points = annual
      ? Array.from({ length: 12 }, (_, i) => {
          const month =
            r.selection.period.slice(0, 4) +
            '-' +
            String(i + 1).padStart(2, '0');
          return (
            r.points.find((p) => p.period === month) ?? {
              period: month,
              income: null,
              expense: null,
              cumulativeIncome: null,
              cumulativeExpense: null,
              netWorth: null,
              assets: null,
              liabilities: null,
            }
          );
        })
      : r.points;
    return (
      <Card
        title={annual ? '十二个月收支趋势' : '月度收支与累计趋势'}
        extra={
          <Switch
            aria-label="累计趋势"
            checked={cumulative}
            onChange={setCumulative}
            checkedChildren="累计"
            unCheckedChildren="当期"
          />
        }
      >
        <Suspense fallback={<Skeleton active />}>
          <Chart
            option={{
              animation: !reduced,
              animationDuration: 450,
              tooltip: { trigger: 'axis' },
              legend: { data: ['收入', '支出'] },
              grid: { left: 58, right: 18, bottom: 55, top: 40 },
              xAxis: { type: 'category', data: points.map((p) => p.period) },
              yAxis: { type: 'value' },
              series: [
                {
                  name: '收入',
                  type: 'line',
                  data: points.map((p) =>
                    p[cumulative ? 'cumulativeIncome' : 'income'] === null
                      ? null
                      : Number(p[cumulative ? 'cumulativeIncome' : 'income']),
                  ),
                },
                {
                  name: '支出',
                  type: 'line',
                  data: points.map((p) =>
                    p[cumulative ? 'cumulativeExpense' : 'expense'] === null
                      ? null
                      : Number(p[cumulative ? 'cumulativeExpense' : 'expense']),
                  ),
                },
              ],
            }}
            onClick={(name) => {
              const point = r.points.find((p) => p.period === name);
              if (point)
                drill({
                  start: dayjs(point.period)
                    .startOf(annual ? 'month' : 'day')
                    .toISOString(),
                  end: dayjs(point.period)
                    .endOf(annual ? 'month' : 'day')
                    .toISOString(),
                });
            }}
          />
        </Suspense>
      </Card>
    );
  };
  const amountColumn = {
    title: '净金额',
    dataIndex: 'amount',
    render: (v: string) => <Money value={v} currency={r!.selection.currency} />,
  };
  const categories = () => {
    if (!r) return null;
    const parent = r.categories.find((c) => c.id === category);
    const rows = r.categories.filter((c) => c.parentId === category);
    return (
      <Card
        title="一级 · 二级 · 三级分类分析"
        extra={
          category && (
            <Button onClick={() => setCategory(parent?.parentId ?? null)}>
              返回上级
            </Button>
          )
        }
      >
        <p>{parent?.name ?? '全部一级分类'}</p>
        <Suspense fallback={<Skeleton />}>
          <Chart
            option={{
              animation: !reduced,
              tooltip: { trigger: 'item' },
              series: [
                {
                  type: 'pie',
                  radius: ['45%', '70%'],
                  data: rows
                    .filter((c) => Number(c.amount) > 0)
                    .map((c) => ({ name: c.name, value: Number(c.amount) })),
                  label: { show: false },
                },
              ],
            }}
            onClick={(name) => {
              const c = rows.find((x) => x.name === name);
              if (c) setCategory(c.id);
            }}
          />
        </Suspense>
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '分类', dataIndex: 'name' },
            amountColumn,
            {
              title: '明细',
              render: (_, c) => (
                <Space>
                  <Button
                    type="link"
                    onClick={() => drill({ categoryId: c.id })}
                  >
                    交易
                  </Button>
                  {r.categories.some((x) => x.parentId === c.id) && (
                    <Button type="link" onClick={() => setCategory(c.id)}>
                      下钻
                    </Button>
                  )}
                </Space>
              ),
            },
          ]}
          scroll={{ x: 420 }}
        />
      </Card>
    );
  };
  const merchants = () =>
    r && (
      <Card title="商户排行榜 · 净消费前30">
        <Table
          rowKey="name"
          dataSource={r.merchants}
          columns={[
            { title: '商户', dataIndex: 'name' },
            amountColumn,
            {
              title: '明细',
              render: (_, m) => (
                <Button
                  type="link"
                  onClick={() =>
                    drill(m.name === '未登记商户' ? {} : { merchant: m.name })
                  }
                >
                  查看交易
                </Button>
              ),
            },
          ]}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 420 }}
        />
      </Card>
    );
  const behavior = () =>
    r && (
      <>
        <div className="fr-grid">
          <Card>
            <Statistic
              title="日均净支出"
              value={hidden ? '••••' : r.metrics.dailyExpense}
              suffix={r.selection.currency}
            />
          </Card>
          <Card>
            <Statistic
              title="消费次数"
              value={hidden ? '••••' : r.metrics.expenseCount}
            />
          </Card>
          <Card>
            <Statistic
              title="日均消费频次"
              value={hidden ? '••••' : r.metrics.dailyFrequency}
            />
          </Card>
          <Card>
            <Statistic
              title="消费金额中位数"
              value={hidden ? '••••' : r.metrics.medianExpense}
              suffix={r.selection.currency}
            />
          </Card>
        </div>
        <Card title="大额交易与异常金额提示">
          <p>
            提示阈值：
            <Money value={r.anomalyThreshold} currency={r.selection.currency} />
          </p>
          <Table
            rowKey="id"
            dataSource={r.largeTransactions}
            columns={[
              {
                title: '日期',
                dataIndex: 'occurredAt',
                render: (v) => dayjs(v).format('MM-DD HH:mm'),
              },
              { title: '商户', dataIndex: 'merchant' },
              amountColumn,
              {
                title: '标记',
                render: (_, v) =>
                  v.unusual ? (
                    <Tag color="orange">金额异常提示</Tag>
                  ) : (
                    <Tag>大额排行</Tag>
                  ),
              },
              {
                title: '明细',
                render: (_, v) => (
                  <Button onClick={() => navigate('/transactions/' + v.id)}>
                    查看交易
                  </Button>
                ),
              },
            ]}
            scroll={{ x: 650 }}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </>
    );
  const accounts = () =>
    r && (
      <Card title="账户收支及资产变化（历史余额推算）">
        <Table
          rowKey="id"
          dataSource={r.accounts}
          scroll={{ x: 700 }}
          pagination={false}
          columns={[
            { title: '账户', dataIndex: 'name' },
            ...(
              ['income', 'expense', 'opening', 'closing', 'change'] as const
            ).map((key, i) => ({
              title: ['收入', '支出', '期初余额', '期末余额', '余额变化'][i],
              dataIndex: key,
              render: (v: string) => (
                <Money value={v} currency={r.selection.currency} />
              ),
            })),
            {
              title: '明细',
              render: (_, v) => (
                <Button onClick={() => drill({ accountId: v.id })}>交易</Button>
              ),
            },
          ]}
        />
      </Card>
    );
  const worth = () =>
    r && (
      <Card title="净资产与负债分析">
        <div className="fr-grid">
          {[
            ['推算期初净资产', r.netWorth.opening],
            ['推算期末净资产', r.netWorth.closing],
            ['推算净资产变化', r.netWorth.change],
            ['推算期末负债', r.points.at(-1)?.liabilities ?? '0'],
          ].map(([label, value]) => (
            <div key={label}>
              <p>{label}</p>
              <strong>
                <Money value={value} currency={r.selection.currency} />
              </strong>
            </div>
          ))}
        </div>
        <Suspense fallback={<Skeleton />}>
          <Chart
            option={{
              animation: !reduced,
              tooltip: { trigger: 'axis' },
              legend: { data: ['资产', '负债', '净资产'] },
              xAxis: { type: 'category', data: r.points.map((p) => p.period) },
              yAxis: { type: 'value' },
              series: [
                ['资产', 'assets'],
                ['负债', 'liabilities'],
                ['净资产', 'netWorth'],
              ].map(([name, key]) => ({
                name,
                type: 'line',
                data: r.points.map((p) =>
                  Number(p[key as 'assets' | 'liabilities' | 'netWorth']),
                ),
              })),
            }}
          />
        </Suspense>
        <Link to={'/reports/debt-pressure?currency=' + r.selection.currency}>
          查看债务压力与还款计划
        </Link>
      </Card>
    );
  const goals = () =>
    r && (
      <Card title="储蓄及财务目标 · 当前进度">
        <Table
          rowKey="id"
          dataSource={r.goals}
          pagination={false}
          scroll={{ x: 580 }}
          columns={[
            { title: '目标', dataIndex: 'name' },
            {
              title: '目标金额',
              dataIndex: 'target',
              render: (v) => (
                <Money value={v} currency={r.selection.currency} />
              ),
            },
            {
              title: '当前已分配',
              dataIndex: 'allocated',
              render: (v) => (
                <Money value={v} currency={r.selection.currency} />
              ),
            },
            {
              title: '进度',
              render: (_, g) =>
                hidden ? (
                  '••••'
                ) : (
                  <Progress
                    percent={
                      Number(g.target) > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (Number(g.allocated) / Number(g.target)) * 100,
                            ),
                          )
                        : 0
                    }
                  />
                ),
            },
            { title: '到期日', dataIndex: 'targetDate' },
          ]}
        />
        <Link to="/goals">管理储蓄目标</Link>
      </Card>
    );
  const budget = () =>
    r && (
      <Card title="预算使用与超支分析">
        {!r.budget ? (
          <Empty description="该币种暂无预算口径（现有预算仅支持CNY）" />
        ) : (
          <>
            <div className="fr-grid">
              <div>
                预算额度{' '}
                <Money value={r.budget.total} currency={r.selection.currency} />
              </div>
              <div>
                已使用{' '}
                <Money value={r.budget.used} currency={r.selection.currency} />
              </div>
              <div>
                超支{' '}
                <Money
                  value={decimal(
                    minor(r.budget.used) > minor(r.budget.total)
                      ? minor(r.budget.used) - minor(r.budget.total)
                      : 0n,
                  )}
                  currency={r.selection.currency}
                />
              </div>
            </div>
            {!hidden && Number(r.budget.total) > 0 && (
              <Progress
                status={
                  Number(r.budget.used) > Number(r.budget.total)
                    ? 'exception'
                    : 'normal'
                }
                percent={Math.round(
                  (Number(r.budget.used) / Number(r.budget.total)) * 100,
                )}
              />
            )}
            <Table
              rowKey="id"
              pagination={false}
              dataSource={r.budget.items ?? []}
              columns={[
                {
                  title: '分类',
                  dataIndex: 'categoryId',
                  render: (id) =>
                    r.categories.find((c) => c.id === id)?.name ?? '历史分类',
                },
                {
                  title: '额度',
                  dataIndex: 'limit',
                  render: (v) => (
                    <Money value={v} currency={r.selection.currency} />
                  ),
                },
                {
                  title: '已用',
                  dataIndex: 'used',
                  render: (v) => (
                    <Money value={v} currency={r.selection.currency} />
                  ),
                },
              ]}
            />
          </>
        )}
        <Link to="/budgets">管理预算</Link>
      </Card>
    );
  const comparisons = () =>
    r && (
      <Card title={annual ? '上一年度对比' : '环比与同比'}>
        <Table
          pagination={false}
          rowKey="key"
          dataSource={[
            {
              key: 'previous',
              label: annual ? '上一年度（同期）' : '上个月（同期）',
              ...r.comparisons.previous,
            },
            ...(!annual
              ? [
                  {
                    key: 'yearOverYear',
                    label: '去年同月（同期）',
                    ...r.comparisons.yearOverYear,
                  },
                ]
              : []),
          ]}
          columns={[
            { title: '基期', dataIndex: 'label' },
            {
              title: '基期收入',
              dataIndex: 'income',
              render: (v) => (
                <Money value={v} currency={r.selection.currency} />
              ),
            },
            {
              title: '收入变化',
              dataIndex: 'incomeRate',
              render: (v) =>
                hidden ? '••••' : v === null ? '不适用' : v + '%',
            },
            {
              title: '基期支出',
              dataIndex: 'expense',
              render: (v) => (
                <Money value={v} currency={r.selection.currency} />
              ),
            },
            {
              title: '支出变化',
              dataIndex: 'expenseRate',
              render: (v) =>
                hidden ? '••••' : v === null ? '不适用' : v + '%',
            },
          ]}
          scroll={{ x: 600 }}
        />
      </Card>
    );
  const milestones = () =>
    r && (
      <Card title="年度交易里程碑">
        <div className="fr-grid">
          {[
            ['期间首笔交易', r.milestones.first],
            ['期间最近交易', r.milestones.last],
          ].map(([title, item]) => (
            <div key={String(title)}>
              <p>{String(title)}</p>
              {item && typeof item !== 'string' ? (
                <Button
                  type="link"
                  onClick={() => navigate('/transactions/' + item.id)}
                >
                  {dayjs(item.occurredAt).format('YYYY-MM-DD HH:mm')}
                </Button>
              ) : (
                <Empty description="暂无记录" />
              )}
            </div>
          ))}
        </div>
        <p>
          共记录 {r.metrics.transactionCount} 笔账务事实，消费{' '}
          {r.metrics.expenseCount} 次。
        </p>
      </Card>
    );
  const planning = () =>
    r && (
      <Card title="下一年度财务规划">
        {r.planning && (
          <>
            <h3>
              {r.planning.nextYear} 规划基线 · 已覆盖{' '}
              {r.planning.observedMonths} 个自然月
            </h3>
            <div className="fr-grid">
              {[
                ['历史月均收入', r.planning.monthlyIncomeBaseline],
                ['历史月均支出', r.planning.monthlyExpenseBaseline],
                ['历史月均结余', r.planning.monthlySurplusBaseline],
                ['当前目标月度计划', r.planning.monthlyGoalCommitment],
              ].map(([label, value]) => (
                <div key={label}>
                  <p>{label}</p>
                  <Money value={value} currency={r.selection.currency} />
                </div>
              ))}
            </div>
            <Alert type="info" message={r.planning.explanation} />
          </>
        )}
        <Space wrap style={{ marginTop: 12 }}>
          <Link to="/budgets/annual">年度预算</Link>
          <Link to="/goals">储蓄目标</Link>
          <Link to="/cashflow">现金流预测</Link>
          <Link to={query('/financial-reports/ai')}>
            让 DeepSeek 建议下一期预算
          </Link>
        </Space>
        {budget()}
      </Card>
    );
  const ai = () =>
    r &&
    (snapshotId ? (
      <Alert
        type="info"
        message="历史快照不重新查询 AI，避免与归档数据不一致。请打开实时报告生成新分析。"
      />
    ) : (
      <ReportAi
        key={r.generatedAt}
        report={r}
        auto={preferences.data?.autoAi}
      />
    ));
  const chapterContent = (i: number) =>
    [
      () => (
        <Card className="fr-intro">
          <h2>{r!.selection.period.slice(0, 4)}，每一笔都有故事</h2>
          {metrics()}
          <p>
            {r!.isPeriodClosed
              ? '本年度已结束'
              : '本年度尚未结束，报告仅覆盖已发生部分'}
          </p>
        </Card>
      ),
      () => (
        <>
          {metrics()}
          {comparisons()}
        </>
      ),
      chart,
      categories,
      behavior,
      merchants,
      accounts,
      worth,
      goals,
      milestones,
      ai,
      planning,
    ][i]();
  const changeChapter = (next: number) =>
    setChapter(Math.max(0, Math.min(11, next)));
  const onStoryKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      (e.target as HTMLElement).closest(
        'input,textarea,select,button,[contenteditable]',
      )
    )
      return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault();
      changeChapter(chapter + 1);
    }
    if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      changeChapter(chapter - 1);
    }
    if (e.key === 'Home') changeChapter(0);
    if (e.key === 'End') changeChapter(11);
  };
  return (
    <div className={'financial-reports ' + (reduced ? 'fr-reduced' : '')}>
      <div className="page-heading">
        <div>
          <PageTitle>{t(titles.find((x) => x.id === page)!.title)}</PageTitle>
        </div>
        <Link to="/financial-reports">
          <Button icon={<FileTextOutlined />}>报告中心</Button>
        </Link>
      </div>
      <nav className="fr-nav" aria-label="财务报告页面">
        {titles.map((x) => (
          <Link
            key={x.id}
            className={x.id === page ? 'active' : ''}
            to={
              x.id === 'preferences' || x.id === 'archives'
                ? x.path
                : query(
                    x.path,
                    x.id === 'annual' || x.id === 'story'
                      ? 'annual'
                      : x.id === 'monthly'
                        ? 'monthly'
                        : annual
                          ? 'annual'
                          : 'monthly',
                  )
            }
          >
            {t(x.title)}
          </Link>
        ))}
      </nav>
      {needsReport && (
        <Card className="fr-filter">
          <Space wrap>
            <Select
              aria-label="报告周期"
              value={annual ? 'annual' : 'monthly'}
              disabled={
                page === 'annual' ||
                page === 'story' ||
                page === 'monthly' ||
                !!snapshotId
              }
              options={[
                { value: 'monthly', label: '月度报告' },
                { value: 'annual', label: '年度报告' },
              ]}
              onChange={(mode) =>
                update({
                  mode,
                  period:
                    mode === 'annual'
                      ? period.slice(0, 4)
                      : period.slice(0, 4) + '-01',
                })
              }
            />
            <DatePicker
              aria-label="报告日期"
              picker={annual ? 'year' : 'month'}
              value={dayjs(
                (snapshotId ? r?.selection.period : period)?.length === 4
                  ? (snapshotId ? r?.selection.period : period) + '-01-01'
                  : (snapshotId ? r?.selection.period : period) + '-01',
              )}
              allowClear={false}
              disabled={!!snapshotId}
              disabledDate={(date) =>
                date.startOf(annual ? 'year' : 'month').isAfter(dayjs())
              }
              onChange={(date) => {
                if (date)
                  update({ period: date.format(annual ? 'YYYY' : 'YYYY-MM') });
              }}
            />
            <Select
              aria-label="报告币种"
              value={
                snapshotId ? (r?.selection.currency ?? currency) : currency
              }
              style={{ minWidth: 170 }}
              disabled={!!snapshotId}
              options={currencyOptions(locale === 'en')}
              showSearch
              optionFilterProp="label"
              onChange={(value) => update({ currency: value })}
            />
            <Button
              loading={report.isFetching}
              onClick={() => report.refetch()}
            >
              刷新报告
            </Button>
            <Button
              disabled={!r || hidden || !!snapshotId}
              loading={archive.isPending}
              onClick={() => archive.mutate()}
            >
              保存快照归档
            </Button>
          </Space>
          {snapshotId && (
            <Alert
              type="info"
              message="正在查看历史快照，金额与生成时间保持归档时状态。"
            />
          )}
        </Card>
      )}
      {needsReport && report.isPending && (
        <Skeleton active paragraph={{ rows: 12 }} />
      )}
      {needsReport && report.isError && (
        <ErrorState error={report.error} retry={() => report.refetch()} />
      )}
      {needsReport && hidden && (
        <Alert
          type="info"
          message="隐私模式已隐藏报告金额、排名及明细；导出、分享与 AI 已暂停。"
        />
      )}
      {needsReport && r && !hidden && (
        <>
          {r.investmentReturns && <Card title={t('投资现金流收益率（最多20项）')}>
            <p>{r.investmentReturns.start} — {r.investmentReturns.end} · {r.investmentReturns.currency} · Actual/365</p>
            <Table size="small" rowKey="id" dataSource={r.investmentReturns.items} pagination={{pageSize:10}} scroll={{x:500}} columns={[
              {title:t('资产'),dataIndex:'id'},
              {title:t('年化 XIRR %'),render:(_,row)=>row.xirr.status==='Success'&&row.xirr.rate!==null?`${(row.xirr.rate*100).toFixed(2)}%`:returnStatus(row.xirr.status,useUI.getState().language==='en')},
              {title:t('期间总收益'),render:(_,row)=>row.amounts.reportTotalProfit==null?'—':<Money value={investmentDisplayAmount(row.amounts.reportTotalProfit)} currency={r.selection.currency}/>},
            ]}/>
            <p>{r.investmentReturns.explanation}</p>
          </Card>}
          <div className="fr-meta">
            <Tag color={r.isPeriodClosed ? 'green' : 'gold'}>
              {r.isPeriodClosed ? '已结束期间' : '进行中 · 非全年事实'}
            </Tag>
            <span>
              {r.selection.period} · {r.selection.currency}
            </span>
            <span>
              生成于 {dayjs(r.generatedAt).format('YYYY-MM-DD HH:mm:ss')}
            </span>
          </div>
          {r.metrics.transactionCount === 0 && (
            <Empty description="此期间暂无该币种的账本记录；可以切换日期或币种。" />
          )}
          {page === 'home' && (
            <>
              <Card className="fr-hero">
                <div>
                  <h2>你的财务全景，从这里开始</h2>
                  <Space wrap>
                    <Link to={query('/financial-reports/monthly', 'monthly')}>
                      <Button type="primary" icon={<BarChartOutlined />}>
                        阅读月度报告
                      </Button>
                    </Link>
                    <Link to={query('/financial-reports/annual', 'annual')}>
                      <Button>
                        年度专业分析 <ArrowRightOutlined />
                      </Button>
                    </Link>
                    <Link to={query('/financial-reports/story', 'annual')}>
                      <Button icon={<ThunderboltOutlined />}>
                        开启年度故事
                      </Button>
                    </Link>
                  </Space>
                </div>
              </Card>
              {metrics()}
              {chart()}
              {comparisons()}
              <Alert type="info" message={r.coverage} />
            </>
          )}
          {page === 'monthly' && (
            <div className="fr-stack">
              {metrics()}
              {chart()}
              {comparisons()}
              {categories()}
              <div className="fr-grid fr-grid-two">
                {merchants()}
                <Card title="标签消费分析（前50）">
                  <Table
                    rowKey="id"
                    dataSource={r.tags}
                    columns={[
                      { title: '标签', dataIndex: 'name' },
                      amountColumn,
                      {
                        title: '明细',
                        render: (_, v) => (
                          <Button
                            type="link"
                            onClick={() => drill({ tagId: v.id })}
                          >
                            交易
                          </Button>
                        ),
                      },
                    ]}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 380 }}
                  />
                </Card>
              </div>
              {accounts()}
              {budget()}
              {behavior()}
              {ai()}
              <Alert type="info" message={r.coverage} />
            </div>
          )}
          {page === 'annual' && (
            <>
              <nav className="fr-chapter-links" aria-label="年度报告章节">
                {annualChapters.map((title, i) => (
                  <a href={'#fr-chapter-' + i} key={title}>
                    {String(i + 1).padStart(2, '0')} {title}
                  </a>
                ))}
              </nav>
              <div className="fr-stack">
                {annualChapters.map((title, i) => (
                  <section id={'fr-chapter-' + i} key={title}>
                    <h2 className="fr-chapter-title">
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      {title}
                    </h2>
                    {chapterContent(i)}
                  </section>
                ))}
              </div>
              <Alert type="info" message={r.coverage} />
            </>
          )}
          {page === 'story' && (
            <div
              ref={storyRef}
              className="fr-story"
              tabIndex={0}
              onKeyDown={onStoryKey}
              aria-label="年度故事，方向键翻页，Home首章，End末章"
            >
              <div className="fr-story-controls">
                <Button
                  onClick={() =>
                    storyRef.current
                      ?.requestFullscreen()
                      .catch(() => message.info('当前浏览器不支持全屏'))
                  }
                  icon={<FullscreenOutlined />}
                >
                  全屏
                </Button>
                <Select
                  aria-label="跳转故事章节"
                  value={chapter}
                  onChange={setChapter}
                  options={annualChapters.map((label, value) => ({
                    label,
                    value,
                  }))}
                />
                <Button loading={imageBusy} onClick={() => image()}>
                  生成分享长图
                </Button>
              </div>
              <Progress
                percent={Math.round(((chapter + 1) / 12) * 100)}
                showInfo={false}
              />
              <p role="status" aria-live="polite">
                第 {chapter + 1} / 12 章 · {annualChapters[chapter]}
              </p>
              <div key={chapter} className="fr-story-slide">
                <h2>{annualChapters[chapter]}</h2>
                {chapterContent(chapter)}
              </div>
              <div className="fr-story-controls">
                <Button
                  disabled={chapter === 0}
                  onClick={() => changeChapter(chapter - 1)}
                >
                  上一章
                </Button>
                <Button
                  type="primary"
                  disabled={chapter === 11}
                  onClick={() => changeChapter(chapter + 1)}
                >
                  下一章
                </Button>
                <span>方向键翻页 · Esc 退出全屏</span>
              </div>
            </div>
          )}
          {page === 'ai' && (
            <div className="fr-stack">
              {metrics()}
              {ai()}
            </div>
          )}
          {page === 'export' && (
            <Card title="导出与分享">
              <p>
                下载原始报告仅在本机保存；分享长图默认隐藏金额、次数及全部身份明细，不创建公开链接。
              </p>
              <Space wrap>
                <Button
                  icon={<DownloadOutlined />}
                  onClick={() => downloadReport(r, 'csv')}
                >
                  导出 CSV
                </Button>
                <Button onClick={() => downloadReport(r, 'json')}>
                  下载完整 JSON
                </Button>
                <Button onClick={() => window.print()}>打印 / 保存 PDF</Button>
                <Button loading={imageBusy} onClick={() => image()}>
                  下载分享长图 PNG
                </Button>
                <Button loading={imageBusy} onClick={() => image(true)}>
                  系统分享
                </Button>
              </Space>
              <p>
                <Link to="/financial-reports/preferences">
                  修改分享脱敏偏好
                </Link>
              </p>
              <div className="fr-print-report">
                <h2>{r.selection.period} 财务报告</h2>
                {metrics()}
                {comparisons()}
                {chart()}
                {categories()}
                {accounts()}
                {budget()}
                <p>{r.coverage}</p>
              </div>
            </Card>
          )}
        </>
      )}
      {page === 'archives' && (
        <Card title="历史报告快照">
          {archives.isError ? (
            <ErrorState
              error={archives.error}
              retry={() => archives.refetch()}
            />
          ) : (
            <Table
              loading={archives.isPending}
              rowKey="id"
              dataSource={archives.data?.items ?? []}
              pagination={false}
              columns={[
                {
                  title: '报告',
                  dataIndex: 'name',
                  render: (v: string) => (hidden ? '••••' : v),
                },
                {
                  title: '归档时间',
                  dataIndex: 'createdAt',
                  render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'),
                },
                {
                  title: '操作',
                  render: (_, item) => (
                    <Space>
                      <Link
                        to={
                          '/financial-reports/' +
                          (item.name.startsWith('annual')
                            ? 'annual'
                            : 'monthly') +
                          '?snapshot=' +
                          item.id
                        }
                      >
                        打开快照
                      </Link>
                      <Popconfirm
                        title="确认删除这份历史报告？"
                        onConfirm={() => remove.mutate(item)}
                      >
                        <Button danger loading={remove.isPending}>
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
              scroll={{ x: 550 }}
            />
          )}
          <Pagination
            current={archivePage}
            total={archives.data?.total ?? 0}
            pageSize={20}
            showSizeChanger={false}
            onChange={setArchivePage}
          />
          <p>
            <Link to="/ai-center/reports">查看 AI 历史报告</Link>
          </p>
        </Card>
      )}
      {page === 'preferences' && (
        <Card title="报告偏好">
          {preferences.isError ? (
            <ErrorState
              error={preferences.error}
              retry={() => preferences.refetch()}
            />
          ) : preferences.isPending ? (
            <Skeleton active />
          ) : (
            <Form
              form={prefsForm}
              layout="vertical"
              onFinish={(v) => savePrefs.mutate(v)}
              disabled={savePrefs.isPending}
            >
              <Form.Item
                name="currency"
                label="默认报告币种"
                rules={[{ required: true }]}
              >
                <Select
                  options={currencyOptions(locale === 'en')}
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
              <Form.Item
                name="autoAi"
                label="自动生成 AI 总结（仅在已有汇总授权且打开报告时）"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <p className="muted">
                关闭时须点击生成；开启后会使用现有 DeepSeek
                服务并计入现有调用额度。不向未授权服务自动传输明细。
              </p>
              <Form.Item
                name="reducedMotion"
                label="减少动效（同时尊重系统设置）"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="redactSharing"
                label="分享长图隐藏金额与消费次数"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={savePrefs.isPending}
              >
                保存报告偏好
              </Button>
            </Form>
          )}
        </Card>
      )}
    </div>
  );
}
