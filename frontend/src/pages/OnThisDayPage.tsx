import { useState } from 'react';
import { AiLazyMarkdown as AiMarkdown } from '../components/ai/AiLazyMarkdown';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  Drawer,
  Empty,
  Input,
  Modal,
  Pagination,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  DownloadOutlined,
  FilterOutlined,
  HeartFilled,
  HeartOutlined,
  HistoryOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiClient } from '../api/client';
import { investmentApi } from '../api/investments';
import { Money } from '../components/Money';
import { PageTitle } from '../components/PageTitle';
import { ErrorState } from '../components/Feedback';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import Chart from '../components/Chart';
import { CURRENCY_CODES } from '../constants/currencies';
import { useUI } from '../stores/ui';
import type { ApiResponse, Currency } from '../types';
import './on-this-day.css';

type Summary = {
  year: number;
  currency: Currency;
  expense: string;
  income: string;
  refund: string;
  count: number;
  maximumExpense?: string;
  categories: { name: string; amount: string }[];
  merchants: { name: string; count: number }[];
};
type Transaction = {
  id: string;
  type: string;
  currency: Currency;
  amount: string;
  occurredAt: string;
  merchant?: string;
  productName?: string;
  note: string;
  tags: string[];
};
type Aggregate = {
  currency: Currency;
  expense: string;
  income: string;
  refund: string;
  count: number;
  years: number;
  average: string;
  highestYear: number;
};
type Report = {
  date: string;
  summaries: Summary[];
  aggregates: Aggregate[];
  coveredYears: number[];
  latestYear?: number;
  categories: { name: string; amount: string }[];
  merchants: { name: string; count: number; years: number }[];
  tags: { name: string; count: number }[];
  highest: { id: string; currency: Currency; amount: string }[];
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
};
type Bookmark = {
  id: string;
  key: string;
  transactionId?: string;
  favorite: boolean;
  note: string;
  version: string;
};
type Candidate = {
  found: boolean;
  date: string;
  year: number;
  month?: number;
  day?: number;
  transactionId?: string;
  merchant?: string;
  message?: string;
};
const endpoint = '/reports/on-this-day';
const today = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const transactionTypes = [
  { value: '', label: '消费与退款' },
  { value: 'All', label: '全部活动' },
  ...[
    ['Expense', '支出'],
    ['Income', '收入'],
    ['Refund', '退款'],
    ['Transfer', '转账'],
    ['CreditCardPayment', '信用卡还款'],
    ['LoanRepaymentPaid', '偿还借款'],
    ['LoanRepaymentReceived', '收回借款'],
    ['LoanGiven', '借出'],
    ['LoanReceived', '借入'],
    ['ReimbursementAdvance', '报销垫付'],
    ['ReimbursementReceived', '报销到账'],
    ['RewardReversal', '奖励冲回'],
    ['AssetLoss', '资产损失'],
    ['InvestmentPrincipal', '投资本金'],
    ['Adjustment', '调整'],
  ].map(([value, label]) => ({ value, label })),
];
const typeName = (type: string) =>
  transactionTypes.find((x) => x.value === type)?.label || type;
const load = <T,>(path: string, params?: Record<string, string | number>) =>
  apiClient.get<ApiResponse<T>>(path, { params }).then((r) => r.data.data);
const localDate = (text: string) =>
  new Date(text).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

function YearTransactions({
  params,
  year,
  enabled,
  bookmarks,
  onSave,
}: {
  params: Record<string, string>;
  year: number;
  enabled: boolean;
  bookmarks: Bookmark[];
  onSave: (key: string, transactionId?: string) => void;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['memory-year', params, year, page],
    enabled,
    queryFn: () =>
      load<Report>(endpoint, {
        ...params,
        years: String(year),
        year: '',
        page,
        pageSize: 10,
      }),
  });
  if (query.isError)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (query.isPending) return <Skeleton active />;
  return (
    <div className="memory-transactions">
      {query.data.items.map((tx) => (
        <article className="memory-transaction" key={tx.id}>
          <div className="memory-transaction-icon">
            {tx.merchant?.slice(0, 1) || '账'}
          </div>
          <div className="memory-transaction-main">
            <Link to={`/transactions/${tx.id}`}>
              {tx.merchant || tx.productName || typeName(tx.type)}
            </Link>
            <small>
              {localDate(tx.occurredAt)} · {typeName(tx.type)}
              {tx.productName ? ` · ${tx.productName}` : ''}
            </small>
            {tx.note && <p>{tx.note}</p>}
            <Space size={4} wrap>
              {tx.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Space>
          </div>
          <div className="memory-transaction-amount">
            <Money value={tx.amount} currency={tx.currency} />
            <Tooltip title="收藏交易回忆">
              <Button
                type="text"
                aria-label="收藏交易回忆"
                icon={
                  bookmarks.some(
                    (b) => b.key === `tx:${tx.id}` && b.favorite,
                  ) ? (
                    <HeartFilled />
                  ) : (
                    <HeartOutlined />
                  )
                }
                onClick={() => onSave(`tx:${tx.id}`, tx.id)}
              />
            </Tooltip>
          </div>
        </article>
      ))}
      <Pagination
        current={page}
        total={query.data.total}
        pageSize={10}
        showSizeChanger={false}
        onChange={setPage}
        size="small"
        hideOnSinglePage
      />
    </div>
  );
}

export default function OnThisDayPage() {
  const { message } = App.useApp();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const rawDate = search.get('date') || today();
  const date = dayjs(rawDate).isValid() ? rawDate : today();
  const params = Object.fromEntries(
    [
      'date',
      'currency',
      'years',
      'year',
      'type',
      'categoryId',
      'merchant',
      'tagId',
      'accountId',
      'keyword',
    ].map((key) => [key, search.get(key) || '']),
  );
  params.date = date;
  params.currency ||= 'CNY';
  const [tagSearch, setTagSearch] = useState('');
  const [filters, setFilters] = useState(false);
  const [settings, setSettings] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [showTrends, setShowTrends] = useState(true);
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState<string[]>();
  const [randomMode, setRandomMode] = useState('date');
  const [randomBusy, setRandomBusy] = useState(false);
  const [edit, setEdit] = useState<{ key: string; transactionId?: string }>();
  const [note, setNote] = useState('');
  const [favorite, setFavorite] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [story, setStory] = useState(false);
  const [aiResult, setAiResult] = useState<{
    signature: string;
    scope: string;
    explanation: string;
  }>();
  const hidden = useUI((s) => s.hidden);
  const query = useQuery({
    queryKey: ['financial-memory', params],
    queryFn: () => load<Report>(endpoint, { ...params, pageSize: 1 }),
  });
  const bookmarks = useQuery({
    queryKey: ['memory-bookmarks'],
    queryFn: () => load<Bookmark[]>('/memories/bookmarks'),
  });
  const nearest = useQuery({
    queryKey: ['memory-nearest', params],
    enabled: query.data?.total === 0 && !hidden,
    queryFn: () =>
      load<Candidate>(`${endpoint}/candidate`, { ...params, mode: 'nearest' }),
  });
  const tags = useQuery({
    queryKey: ['memory-tag-options', tagSearch],
    enabled: filters,
    queryFn: () =>
      load<{ items: { id: string; name: string }[] }>('/directory/tags', {
        pageSize: 200,
        keyword: tagSearch,
      }),
  });
  const data = query.data;
  const aggregate = data?.aggregates[0];
  const currency = params.currency as Currency;
  const scope = `${date.slice(5).replace('-', '月')}日 · ${data?.coveredYears.join('、') || '无匹配年份'} · ${currency} · ${transactionTypes.find((x) => x.value === params.type)?.label || typeName(params.type)} · 当前全部筛选条件`;
  const active =
    expanded ?? (data?.latestYear ? [String(data.latestYear)] : []);
  function update(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(search);
    Object.entries(changes).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    setSearch(next);
    setExpanded(undefined);
    setAiResult(undefined);
  }
  function startEdit(key: string, transactionId?: string) {
    const existing = bookmarks.data?.find((b) => b.key === key);
    setEdit({ key, transactionId });
    setNote(existing?.note || '');
    setFavorite(existing?.favorite ?? true);
  }
  async function saveBookmark() {
    if (!edit) return;
    setSaving(true);
    try {
      const old = bookmarks.data?.find((b) => b.key === edit.key);
      await investmentApi.save(
        '/memories/bookmarks',
        { ...edit, note, favorite },
        old?.version || '0',
        'put',
      );
      await bookmarks.refetch();
      setEdit(undefined);
      message.success('回忆已保存');
    } catch (e) {
      message.error((e as Error).message);
      await bookmarks.refetch();
    } finally {
      setSaving(false);
    }
  }
  async function random(mode = randomMode) {
    setRandomBusy(true);
    try {
      const result = await load<Candidate>(`${endpoint}/candidate`, {
        ...params,
        mode,
      });
      if (!result.found) {
        message.info(result.message || '当前筛选范围没有可回顾的记录');
        return;
      }
      const chosenDate =
        mode === 'year' ? date : `2000-${result.date.slice(5)}`;
      update({
        date: chosenDate,
        years:
          mode === 'year' ? String(result.year) : params.years || params.year,
        year: undefined,
        ...(mode === 'merchant' ? { merchant: result.merchant } : {}),
      });
      if (result.transactionId && mode === 'expense')
        message.success('已找到一笔历史消费，正在打开原始交易');
      if (result.transactionId && mode === 'expense')
        navigate(`/transactions/${result.transactionId}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRandomBusy(false);
    }
  }
  async function analyze() {
    setAiBusy(true);
    try {
      const response = await apiClient.post<
        ApiResponse<{ explanation: string }>
      >(
        `${endpoint}/analysis`,
        { sendSummary: consent, mode: story ? 'story' : 'summary' },
        { params, timeout: 120000 },
      );
      setAiResult({
        signature: JSON.stringify(params),
        scope,
        explanation: response.data.data.explanation,
      });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  function exportCard() {
    if (!aggregate) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 900;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#eef4f4';
    context.fillRect(0, 0, 1080, 900);
    context.fillStyle = '#173b3b';
    context.font = '28px sans-serif';
    context.fillText('PERSONAL FINANCE · 消费时光机', 70, 90);
    context.font = 'bold 80px sans-serif';
    context.fillText(`${date.slice(5).replace('-', ' / ')}`, 70, 210);
    context.font = '32px sans-serif';
    context.fillText(`历史净消费 ${currency} ${aggregate.expense}`, 70, 320);
    context.fillText(
      `${aggregate.count} 笔交易 · ${aggregate.years} 个有记录年份`,
      70,
      390,
    );
    context.font = '24px sans-serif';
    const lines = [
      `历史年份：${data!.coveredYears.join('、')}`,
      `平均有记录年份消费：${currency} ${aggregate.average}`,
      `退款或冲回：${currency} ${aggregate.refund}`,
      '口径：上海时间，当前筛选条件，按原币统计。',
      '没有记录不等于零消费。',
    ];
    lines.forEach((line, i) => context.fillText(line, 70, 480 + i * 52, 940));
    const link = document.createElement('a');
    link.download = `消费回忆-${date.slice(5)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
  const years = Array.from(
    { length: Math.max(0, Number(today().slice(0, 4)) - 1900) },
    (_, i) => Number(today().slice(0, 4)) - 1 - i,
  );
  const trendYears = data?.coveredYears.length
    ? Array.from(
        {
          length: Number(today().slice(0, 4)) - Math.min(...data.coveredYears),
        },
        (_, i) => Math.min(...data.coveredYears) + i,
      )
    : [];
  const visibleTrendYears =
    params.years || params.year
      ? (params.years || params.year)
          .split(',')
          .map(Number)
          .sort((a, b) => a - b)
      : trendYears;
  const dateBookmark = bookmarks.data?.find(
    (b) => b.key === `day:${date.slice(5)}`,
  );
  return (
    <div className={`memory-page ${compact ? 'memory-compact' : ''}`}>
      <header className="memory-heading">
        <div>
          <PageTitle>历史上的今天</PageTitle>
        </div>
        <Space wrap>
          <DatePicker
            aria-label="月日选择"
            value={dayjs(date)}
            format="MM月DD日"
            allowClear={false}
            onChange={(value) =>
              value && update({ date: value.format('YYYY-MM-DD') })
            }
          />
          <Button
            icon={<HistoryOutlined />}
            aria-label="随机回顾"
            loading={randomBusy}
            onClick={() => random()}
          >
            随机回顾
          </Button>
          <Button
            icon={<SettingOutlined />}
            aria-label="页面设置"
            onClick={() => setSettings(true)}
          />
        </Space>
      </header>
      <section className="memory-hero">
        <div>
          <h2>
            {date.slice(5, 7)}
            <span>月</span>
            {date.slice(8)}
            <span>日</span>
          </h2>
          <Space wrap>
            <Tag>{data?.coveredYears.length || 0} 个有记录年份</Tag>
            {data?.latestYear && <Tag>最近记录 · {data.latestYear} 年</Tag>}
            <Tag>{currency}</Tag>
          </Space>
          {!hidden && dateBookmark?.note && (
            <p className="memory-personal-note">
              我的记忆：{dateBookmark.note}
            </p>
          )}
        </div>
        <div className="memory-hero-actions">
          <Space>
            <Button
              shape="circle"
              aria-label="前一天"
              icon={<ArrowLeftOutlined />}
              onClick={() =>
                update({
                  date: dayjs(`2000-${date.slice(5)}`)
                    .subtract(1, 'day')
                    .format('YYYY-MM-DD'),
                })
              }
            />
            <Button onClick={() => update({ date: today() })}>回到今天</Button>
            <Button
              shape="circle"
              aria-label="后一天"
              icon={<ArrowRightOutlined />}
              onClick={() =>
                update({
                  date: dayjs(`2000-${date.slice(5)}`)
                    .add(1, 'day')
                    .format('YYYY-MM-DD'),
                })
              }
            />
          </Space>
          <Button
            icon={dateBookmark?.favorite ? <HeartFilled /> : <HeartOutlined />}
            onClick={() => startEdit(`day:${date.slice(5)}`)}
          >
            收藏 / 记忆备注
          </Button>
          <Button onClick={() => setFavorites(true)}>查看收藏</Button>
        </div>
      </section>
      <div className="memory-toolbar">
        <Space wrap>
          <Button
            aria-label="筛选历史记忆"
            icon={<FilterOutlined />}
            onClick={() => setFilters(true)}
          >
            筛选
            {Object.values(params).filter(Boolean).length > 2
              ? ' · 已应用'
              : ''}
          </Button>
          <Select
            aria-label="币种"
            value={currency}
            options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
            onChange={(value) => update({ currency: value })}
          />
          <Select
            aria-label="交易类型"
            value={params.type}
            options={transactionTypes}
            onChange={(value) => update({ type: value })}
            style={{ minWidth: 140 }}
          />
          <Button
            type="text"
            onClick={() => {
              setSearch({ date, currency });
              setAiResult(undefined);
              setExpanded(undefined);
            }}
          >
            重置筛选
          </Button>
        </Space>
        <Space wrap>
          <Select
            aria-label="随机回顾类型"
            value={randomMode}
            onChange={setRandomMode}
            options={[
              ['date', '随机历史日期'],
              ['year', '随机历史年份'],
              ['expense', '随机历史消费'],
              ['merchant', '随机商户回忆'],
            ].map(([value, label]) => ({ value, label }))}
          />
          <Button loading={randomBusy} onClick={() => random()}>
            出发 →
          </Button>
        </Space>
      </div>
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : hidden ? (
        <Alert message="隐私模式已隐藏金额、交易和回忆内容" />
      ) : query.isPending ? (
        <Skeleton active />
      ) : !aggregate ? (
        <Card className="memory-empty">
          <Empty
            image={
              <HistoryOutlined
                aria-hidden
                style={{ fontSize: 48, color: '#668982' }}
              />
            }
            description={
              <>
                <h3>{date.slice(5).replace('-', '月')}日 · 当前筛选范围</h3>
                <p>
                  没有找到符合条件的历史记录。其他日期或筛选范围可能仍有记录。
                </p>
              </>
            }
          />
          <Space wrap>
            <Button loading={randomBusy} onClick={() => random('nearest')}>
              <span aria-label="最近有记录的日期">
                {nearest.data?.found
                  ? `最近有记录：${nearest.data.date.slice(5).replace('-', '月')}日`
                  : '最近有记录的日期'}
              </span>
            </Button>
            <Button loading={randomBusy} onClick={() => random('date')}>
              随机回顾
            </Button>
            <Button
              onClick={() => {
                setSearch({ date, currency });
                setAiResult(undefined);
              }}
            >
              重置筛选
            </Button>
            <Link to="/transactions">全部交易 →</Link>
          </Space>
        </Card>
      ) : (
        <>
          <section className="memory-statistics">
            {[
              {
                label: '历史累计消费（净额）',
                value: <Money value={aggregate.expense} currency={currency} />,
              },
              {
                label: '历史交易笔数',
                value: aggregate.count,
              },
              {
                label: '最高消费年份',
                value: `${aggregate.highestYear} 年`,
              },
              {
                label: '平均有记录年份消费',
                value: <Money value={aggregate.average} currency={currency} />,
              },
              {
                label: '历史退款或冲回',
                value: <Money value={aggregate.refund} currency={currency} />,
              },
              ...(params.type === 'All' || params.type === 'Income'
                ? [
                    {
                      label: '历史收入',
                      value: (
                        <Money value={aggregate.income} currency={currency} />
                      ),
                    },
                  ]
                : []),
            ].map((item) => (
              <Card key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </Card>
            ))}
          </section>
          {showTrends && (
            <Card
              className="memory-section"
              title="历年同日趋势"
              extra={
                <Segmented
                  value={chartType}
                  onChange={(v) => setChartType(v as 'bar' | 'line')}
                  options={[
                    { label: '柱状图', value: 'bar' },
                    { label: '趋势图', value: 'line' },
                  ]}
                />
              }
            >
              <Chart
                onClick={(year) => {
                  update({ years: year, year: undefined });
                  setExpanded([year]);
                }}
                option={{
                  tooltip: { trigger: 'axis' },
                  grid: { left: 65, right: 20, bottom: 35, top: 15 },
                  xAxis: {
                    type: 'category',
                    data: visibleTrendYears.map(String),
                  },
                  yAxis: { type: 'value' },
                  series: [
                    {
                      name: '净消费',
                      type: chartType,
                      connectNulls: false,
                      itemStyle: {
                        color: '#538d87',
                        borderRadius: chartType === 'bar' ? [7, 7, 0, 0] : 0,
                      },
                      data: visibleTrendYears.map((year) => {
                        const summary = data!.summaries.find(
                          (x) => x.year === year,
                        );
                        return summary ? Number(summary.expense) : null;
                      }),
                    },
                  ],
                }}
              />
            </Card>
          )}
          <section className="memory-columns">
            <div>
              <div className="memory-section-heading">
                <h2>消费回忆时间线</h2>
                <Space>
                  <Button
                    size="small"
                    onClick={() => setExpanded(data!.coveredYears.map(String))}
                  >
                    全部展开
                  </Button>
                  <Button size="small" onClick={() => setExpanded([])}>
                    全部折叠
                  </Button>
                </Space>
              </div>
              <Collapse
                className="memory-timeline"
                activeKey={active}
                onChange={(keys) =>
                  setExpanded(typeof keys === 'string' ? [keys] : keys)
                }
                items={data!.summaries.map((summary) => ({
                  key: String(summary.year),
                  label: (
                    <div className="memory-year-heading">
                      <div>
                        <span className="memory-year">{summary.year}</span>
                        <small>
                          {date.slice(5).replace('-', '月')}日 · {summary.count}{' '}
                          笔交易
                        </small>
                      </div>
                      <Money
                        value={summary.expense}
                        currency={summary.currency}
                      />
                    </div>
                  ),
                  children: (
                    <>
                      <div className="memory-year-context">
                        <p>
                          主要分类：
                          {summary.categories
                            .slice(0, 3)
                            .map((x) => x.name)
                            .join('、') || '无消费分类'}
                        </p>
                        <p>
                          主要商户：
                          {summary.merchants
                            .slice(0, 3)
                            .map((x) => x.name)
                            .join('、') || '未记录商户'}
                        </p>
                        <Space wrap>
                          <Button
                            size="small"
                            onClick={() =>
                              startEdit(`date:${summary.year}-${date.slice(5)}`)
                            }
                          >
                            收藏这一天 / 添加备注
                          </Button>
                          {
                            bookmarks.data?.find(
                              (b) =>
                                b.key ===
                                `date:${summary.year}-${date.slice(5)}`,
                            )?.note
                          }
                        </Space>
                      </div>
                      <YearTransactions
                        key={`${summary.year}-${JSON.stringify(params)}`}
                        year={summary.year}
                        enabled={active.includes(String(summary.year))}
                        params={params}
                        bookmarks={bookmarks.data || []}
                        onSave={startEdit}
                      />
                    </>
                  ),
                }))}
              />
            </div>
            <aside className="memory-recollections">
              <Card title="分类回忆">
                <ol>
                  {data!.categories.slice(0, 6).map((category) => (
                    <li key={category.name}>
                      <span>{category.name}</span>
                      <Money value={category.amount} currency={currency} />
                    </li>
                  ))}
                </ol>
                {data!.categories.length === 0 && (
                  <p>当前记录没有计入消费的分类金额。</p>
                )}
              </Card>
              <Card title="商户足迹">
                <ol>
                  {data!.merchants.map((merchant) => (
                    <li key={merchant.name}>
                      <Button
                        type="link"
                        onClick={() => update({ merchant: merchant.name })}
                      >
                        {merchant.name}
                      </Button>
                      <span>
                        {merchant.count} 笔 · {merchant.years} 年
                        {merchant.years > 1 ? '回访' : ''}
                      </span>
                    </li>
                  ))}
                </ol>
                {!data!.merchants.length && <p>当前交易未记录商户。</p>}
              </Card>
              <Card title="记忆碎片">
                <p className="memory-muted">常见标签</p>
                <Space wrap>
                  {data!.tags.map((tag) => (
                    <Tag key={tag.name}>
                      {tag.name} · {tag.count}
                    </Tag>
                  ))}
                  {!data!.tags.length && '当前交易未记录标签'}
                </Space>
                {data!.highest.map((tx) => (
                  <div className="memory-highest" key={tx.id}>
                    <small>最高单笔消费</small>
                    <Link to={`/transactions/${tx.id}`}>
                      <Money value={tx.amount} currency={tx.currency} /> →
                    </Link>
                  </div>
                ))}
                <p className="memory-muted">交易数量变化</p>
                {[...data!.summaries].reverse().map((s) => (
                  <div className="memory-count" key={s.year}>
                    <span>{s.year}</span>
                    <meter
                      min={0}
                      max={Math.max(...data!.summaries.map((x) => x.count))}
                      value={s.count}
                    />
                    <span>{s.count} 笔</span>
                  </div>
                ))}
              </Card>
            </aside>
          </section>
          <Card
            className="memory-ai memory-section"
            title={
              <Space>
                <ThunderboltOutlined />
                AI 消费回忆
              </Space>
            }
            extra={
              <Button
                icon={<DownloadOutlined />}
                onClick={() => setCardOpen(true)}
              >
                生成回忆卡片
              </Button>
            }
          >
            <p className="memory-muted">数据范围：{scope}</p>
            <Space direction="vertical">
              <Checkbox
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              >
                同意向 AI
                发送当前统计摘要及分类、商户名称（不含交易备注），并使用已有 AI
                隐私授权
              </Checkbox>
              <Checkbox
                checked={story}
                onChange={(e) => setStory(e.target.checked)}
              >
                生成年度消费故事
              </Checkbox>
              <Button
                type="primary"
                disabled={!consent}
                loading={aiBusy}
                onClick={analyze}
              >
                生成消费回忆
              </Button>
            </Space>
            {aiResult && aiResult.signature === JSON.stringify(params) && (
              <div className="memory-ai-result">
                <small>生成依据：{aiResult.scope}</small>
                <AiMarkdown text={aiResult.explanation} />
              </div>
            )}
          </Card>
        </>
      )}
      <Drawer
        title="筛选历史记忆"
        open={filters}
        onClose={() => setFilters(false)}
        width={380}
      >
        <div className="memory-filter-fields">
          <label>
            历史年份
            <Select
              mode="multiple"
              allowClear
              placeholder="全部历史年份"
              value={(params.years || params.year).split(',').filter(Boolean)}
              options={years.map((year) => ({
                value: String(year),
                label: `${year} 年`,
              }))}
              onChange={(values) =>
                update({ years: values.join(','), year: undefined })
              }
            />
          </label>
          <label>
            分类
            <CategorySelector
              history
              kind="All"
              value={params.categoryId || undefined}
              onChange={(value) => update({ categoryId: value })}
            />
          </label>
          <label>
            商户
            <Input.Search
              key={params.merchant}
              defaultValue={params.merchant}
              placeholder="商户名称关键词"
              allowClear
              onSearch={(value) => update({ merchant: value })}
            />
          </label>
          <label>
            标签
            <Select
              allowClear
              placeholder="全部标签"
              showSearch
              filterOption={false}
              onSearch={setTagSearch}
              value={params.tagId || undefined}
              options={tags.data?.items.map((x) => ({
                value: x.id,
                label: x.name,
              }))}
              onChange={(value) => update({ tagId: value })}
            />
          </label>
          <label>
            账户
            <AccountSelector
              history
              value={params.accountId || undefined}
              onChange={(value) => update({ accountId: value })}
            />
          </label>
          <label>
            备注关键词
            <Input.Search
              key={params.keyword}
              defaultValue={params.keyword}
              placeholder="输入后搜索"
              allowClear
              onSearch={(value) => update({ keyword: value })}
            />
          </label>
          <p className="memory-muted">分享链接会包含筛选关键词。</p>
          <Button type="primary" onClick={() => setFilters(false)}>
            查看结果
          </Button>
        </div>
      </Drawer>
      <Drawer
        title="页面设置"
        open={settings}
        onClose={() => setSettings(false)}
      >
        <Space direction="vertical">
          <Checkbox
            checked={showTrends}
            onChange={(e) => setShowTrends(e.target.checked)}
          >
            显示历年趋势
          </Checkbox>
          <Checkbox
            checked={compact}
            onChange={(e) => setCompact(e.target.checked)}
          >
            紧凑时间线
          </Checkbox>
          <Link to="/settings">前往系统设置 →</Link>
        </Space>
      </Drawer>
      <Drawer
        title="我的收藏与记忆"
        open={favorites}
        onClose={() => setFavorites(false)}
        width={440}
      >
        {hidden ? (
          <Alert message="隐私模式已隐藏收藏内容" />
        ) : bookmarks.isError ? (
          <ErrorState
            error={bookmarks.error}
            retry={() => bookmarks.refetch()}
          />
        ) : bookmarks.isPending ? (
          <Skeleton active />
        ) : (
          <>
            {!(bookmarks.data || []).some((b) => b.favorite || b.note) && (
              <Empty description="还没有收藏或记忆备注" />
            )}
            {bookmarks.data
              ?.filter((b) => b.favorite || b.note)
              .map((b) => (
                <Card key={b.id} size="small" className="mb16">
                  <Space>
                    {b.favorite && <HeartFilled />}
                    {b.transactionId ? (
                      <Link to={`/transactions/${b.transactionId}`}>
                        单笔交易回忆 →
                      </Link>
                    ) : (
                      <Button
                        type="link"
                        onClick={() => {
                          update({
                            date: b.key.startsWith('day:')
                              ? '2000-' + b.key.slice(4)
                              : b.key.slice(5),
                            years: b.key.startsWith('day:')
                              ? undefined
                              : b.key.slice(5, 9),
                            year: undefined,
                          });
                          setFavorites(false);
                        }}
                      >
                        {b.key.startsWith('day:')
                          ? b.key.slice(4)
                          : b.key.slice(5)}
                      </Button>
                    )}
                  </Space>
                  <p>{b.note}</p>
                  <Button
                    size="small"
                    onClick={() => startEdit(b.key, b.transactionId)}
                  >
                    编辑 / 取消收藏
                  </Button>
                </Card>
              ))}
          </>
        )}
      </Drawer>
      <Modal
        zIndex={1400}
        title="收藏与个人记忆"
        open={!!edit && !hidden}
        onCancel={() => setEdit(undefined)}
        onOk={saveBookmark}
        confirmLoading={saving}
      >
        <p>
          {edit?.transactionId
            ? '单笔交易回忆'
            : edit?.key.startsWith('day:')
              ? edit.key.slice(4)
              : edit?.key.slice(5)}
        </p>
        <Checkbox
          checked={favorite}
          onChange={(e) => setFavorite(e.target.checked)}
        >
          收藏此回忆
        </Checkbox>
        <Input.TextArea
          aria-label="个人记忆备注"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          showCount
          rows={5}
          placeholder="写下自己的记忆，仅本人可见"
        />
      </Modal>
      <Modal
        zIndex={1400}
        title="生成回忆卡片"
        open={cardOpen && !hidden}
        onCancel={() => setCardOpen(false)}
        footer={
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={exportCard}
          >
            下载 PNG 卡片
          </Button>
        }
      >
        <div className="memory-card-preview">
          <span>PERSONAL FINANCE · 消费时光机</span>
          <h2>{date.slice(5).replace('-', ' / ')}</h2>
          <h3>
            历史净消费{' '}
            <Money value={aggregate?.expense || '0'} currency={currency} />
          </h3>
          <p>
            {aggregate?.count} 笔交易 · {aggregate?.years} 个有记录年份
          </p>
          <p>{scope}</p>
          <small>没有记录不等于零消费。</small>
        </div>
      </Modal>
    </div>
  );
}
