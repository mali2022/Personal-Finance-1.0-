import { useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useLocale, t } from '../i18n';
import { useUI } from '../stores/ui';
import { PageTitle } from '../components/PageTitle';
import { ErrorState } from '../components/Feedback';
import { Money } from '../components/Money';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
import { currencyOptions } from '../constants/currencies';
import {
  policyApi,
  policyPreset,
  type ManagedPolicy,
  type PolicyAnalysis,
  type PolicyOptions,
  type PolicyHistory,
} from '../features/reports/statisticsPolicyApi';
import {
  policyModules,
  type Bilingual,
  type PolicyRule,
} from '../features/reports/statisticsPolicyCatalog';
import type { ApiError } from '../types';
import './statistics-management.css';
const L = (zh: string, en: string) =>
  useUI.getState().language === 'en' ? en : zh;
const B = (pair: Bilingual) => L(...pair);
const modes: {
  value: PolicyOptions['mode'];
  title: Bilingual;
  detail: Bilingual;
}[] = [
  {
    value: 'Everyday',
    title: ['日常记账模式', 'Everyday finances'],
    detail: [
      '日常收入、消费、预算与储蓄率',
      'Daily income, spending, budgets and savings',
    ],
  },
  {
    value: 'Assets',
    title: ['资产管理模式', 'Asset management'],
    detail: [
      '资产负债、投资损益与资金流',
      'Assets, debt, investments and cash movements',
    ],
  },
  {
    value: 'Comprehensive',
    title: ['综合财务模式', 'Comprehensive finances'],
    detail: [
      '同时核对收支、资金流与财富变化',
      'Review spending, cash flow and wealth together',
    ],
  },
  {
    value: 'Custom',
    title: ['自定义统计模式', 'Custom policy'],
    detail: [
      '保留并独立调整当前规则组合',
      'Keep and customize your current rules',
    ],
  },
];
export default function StatisticsManagementPage() {
  useLocale();
  const q = useQuery({
    queryKey: ['statisticsManagement'],
    queryFn: policyApi.get,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  return (
    <div className="statistics-management">
      <PageTitle>
        {L('财务统计口径管理', 'Financial statistics policy management')}
      </PageTitle>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data ? (
        <Spin />
      ) : (
        <Editor
          key={`${q.data.version}:${q.data.ledgerVersion}`}
          saved={q.data}
        />
      )}
    </div>
  );
}
function Editor({ saved }: { saved: ManagedPolicy }) {
  const [draft, setDraft] = useState(saved);
  const [active, setActive] = useState('income');
  const [keyword, setKeyword] = useState('');
  const [anchor, setAnchor] = useState(
    dayjs(
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    ),
  );
  const [period, setPeriod] = useState('month');
  const [currencyChoice, setCurrencyChoice] = useState<string>();
  const currency = currencyChoice ?? draft.options.baseCurrency;
  const [request, setRequest] = useState<{
    value: ManagedPolicy;
    anchor: string;
    period: string;
    currency: string;
  }>();
  const cache = useQueryClient();
  const { message } = App.useApp();
  const history = useQuery({
    queryKey: ['statisticsManagementHistory'],
    queryFn: policyApi.history,
  });
  const preview = useQuery({
    queryKey: ['statisticsManagementPreview', request],
    queryFn: () =>
      policyApi.preview(
        request!.value,
        request!.anchor,
        request!.period,
        request!.currency,
      ),
    enabled: !!request,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  const mutation = useMutation({
    mutationFn: policyApi.save,
    onSuccess: async () => {
      await cache.invalidateQueries();
      void message.success(L('统计口径方案已保存', 'Statistics policy saved'));
    },
    onError: (e: ApiError) => {
      void message.error(e.message);
    },
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const currentRequest = {
    value: draft,
    anchor: anchor.format('YYYY-MM-DD'),
    period,
    currency,
  };
  const stalePreview =
    !!request && JSON.stringify(currentRequest) !== JSON.stringify(request);
  const setOption = (field: keyof PolicyOptions, value: unknown) =>
    setDraft((d) => ({
      ...d,
      options: { ...d.options, mode: 'Custom', [field]: value },
    }));
  const setLedger = (field: string, value: boolean) =>
    setDraft((d) => ({
      ...d,
      ledgerRules: { ...d.ledgerRules, [field]: value },
      options: { ...d.options, mode: 'Custom' },
    }));
  const choose = (mode: PolicyOptions['mode']) =>
    setDraft((d) => ({
      ...d,
      options: policyPreset(mode, d.options),
      ledgerRules:
        mode === 'Custom'
          ? d.ledgerRules
          : {
              includeFees: true,
              includeAssetLoss: false,
              includeDecreasingAdjustments: false,
            },
    }));
  function control(rule: PolicyRule) {
    const field = rule.field as keyof PolicyOptions;
    if (rule.kind === 'ledger')
      return (
        <Switch
          aria-label={B(rule.title)}
          checked={
            draft.ledgerRules[rule.field as keyof typeof draft.ledgerRules]
          }
          onChange={(v) => setLedger(rule.field!, v)}
          disabled={mutation.isPending}
        />
      );
    const value = draft.options[field];
    if (typeof value === 'boolean')
      return (
        <Switch
          aria-label={B(rule.title)}
          checked={value}
          onChange={(v) => setOption(field, v)}
          disabled={mutation.isPending}
        />
      );
    if (field === 'baseCurrency')
      return (
        <Select
          aria-label={B(rule.title)}
          value={value}
          options={currencyOptions(useUI.getState().language === 'en')}
          onChange={(v) => setOption(field, v)}
          disabled={mutation.isPending}
        />
      );
    if (field === 'monthStartDay' || field === 'yearStartMonth')
      return (
        <InputNumber
          aria-label={B(rule.title)}
          value={Number(value)}
          min={1}
          max={field === 'monthStartDay' ? 31 : 12}
          precision={0}
          onChange={(v) => v != null && setOption(field, v)}
          disabled={mutation.isPending}
        />
      );
    if (field === 'largeTransactionThreshold')
      return (
        <InputNumber
          aria-label={B(rule.title)}
          stringMode
          value={String(value)}
          min="0.01"
          max="1000000000"
          precision={2}
          onChange={(v) => v != null && setOption(field, String(v))}
          disabled={mutation.isPending}
        />
      );
    const choices: Record<string, { value: string | number; label: string }[]> =
      {
        weekStartsOn: [
          ['星期一', 'Monday'],
          ['星期二', 'Tuesday'],
          ['星期三', 'Wednesday'],
          ['星期四', 'Thursday'],
          ['星期五', 'Friday'],
          ['星期六', 'Saturday'],
          ['星期日', 'Sunday'],
        ].map(([zh, en], i) => ({ value: i + 1, label: L(zh, en) })),
        refundDisplay: [
          { value: 'Net', label: L('净支出', 'Net expenses') },
          {
            value: 'Separate',
            label: L('费用与退款分列', 'Expenses and refunds separately'),
          },
        ],
        payrollBasis: [
          { value: 'Net', label: L('实发工资', 'Net salary') },
          { value: 'Gross', label: L('应发工资', 'Gross salary') },
        ],
        payrollTimeBasis: [
          { value: 'Paid', label: L('发薪日期', 'Pay date') },
          { value: 'Earned', label: L('归属月份', 'Earned month') },
        ],
      };
    return (
      <Select
        aria-label={B(rule.title)}
        value={value}
        options={choices[field]}
        onChange={(v) => setOption(field, v)}
        disabled={mutation.isPending}
      />
    );
  }
  const filteredModules = policyModules.map((m) => ({
    ...m,
    rules: m.rules.filter((r) =>
      `${B(r.title)} ${B(r.detail)}`
        .toLowerCase()
        .includes(keyword.trim().toLowerCase()),
    ),
  }));
  const visibleModules = filteredModules.filter((m) => m.rules.length > 0);
  return (
    <>
      <div className="statistics-presets">
        {modes.map((m) => (
          <Button
            key={m.value}
            className="statistics-preset"
            type={draft.options.mode === m.value ? 'primary' : 'default'}
            disabled={mutation.isPending}
            onClick={() => choose(m.value)}
          >
            <strong>{B(m.title)}</strong>
            <span>{B(m.detail)}</span>
          </Button>
        ))}
      </div>
      <Card className="mb16" size="small">
        <Space wrap>
          <Tag>
            {L('方案版本', 'Policy version')} {saved.version}
          </Tag>
          <Tag>
            {L('全账本版本', 'Ledger version')} {saved.ledgerVersion}
          </Tag>
          <Tag color={dirty ? 'orange' : 'green'}>
            {dirty
              ? L('有未保存修改', 'Unsaved changes')
              : L('已与服务器同步', 'Synced with server')}
          </Tag>
          <Button
            type="primary"
            loading={mutation.isPending}
            disabled={!dirty}
            onClick={() => mutation.mutate(draft)}
          >
            {L('保存统计方案', 'Save policy')}
          </Button>
          <Button
            disabled={!dirty || mutation.isPending}
            onClick={() => setDraft(saved)}
          >
            {L('撤销未保存修改', 'Discard changes')}
          </Button>
        </Space>
        {mutation.isError && (
          <Alert
            className="mt20"
            type="error"
            message={L(
              '保存失败，修改已保留。版本冲突时刷新服务器配置后再核对；不会自动覆盖他人的修改。',
              'Save failed and edits are retained. For a version conflict, reload and review server settings before saving.',
            )}
            action={
              <Button
                onClick={() =>
                  cache.invalidateQueries({
                    queryKey: ['statisticsManagement'],
                  })
                }
              >
                {L('重新读取服务器配置', 'Reload server policy')}
              </Button>
            }
          />
        )}
      </Card>
      <Card
        className="mb16"
        title={L('规则目录与配置', 'Rules and configuration')}
        extra={
          <Tag>
            {policyModules.reduce((n, m) => n + m.rules.length, 0)}{' '}
            {L('项', 'rules')}
          </Tag>
        }
      >
        <Input.Search
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          aria-label={L('搜索统计规则', 'Search statistics rules')}
          placeholder={L(
            '搜索退款、信用卡、汇率等规则',
            'Search refunds, credit cards, exchange rates…',
          )}
        />
        {visibleModules.length === 0 ? (
          <Empty description={L('没有匹配的规则', 'No matching rules')} />
        ) : (
          <Tabs
            activeKey={
              visibleModules.some((m) => m.id === active)
                ? active
                : visibleModules[0].id
            }
            onChange={setActive}
            items={visibleModules.map((module) => ({
              key: module.id,
              label: `${B(module.title)} (${module.rules.length})`,
              children: (
                <div>
                  {module.rules.map((rule) => (
                    <div key={rule.id} className="statistics-rule">
                      <div>
                        <Space wrap>
                          <strong>{B(rule.title)}</strong>
                          <Tag
                            color={
                              rule.kind === 'ledger'
                                ? 'orange'
                                : rule.kind === 'option'
                                  ? 'blue'
                                  : rule.kind === 'unavailable'
                                    ? 'default'
                                    : 'green'
                            }
                          >
                            {rule.kind === 'ledger'
                              ? L('全账本配置', 'Ledger-wide')
                              : rule.kind === 'option'
                                ? L('分析配置', 'Analysis option')
                                : rule.kind === 'related'
                                  ? L('专项管理', 'Specialist module')
                                  : rule.kind === 'unavailable'
                                    ? L('尚缺核算数据', 'Data not available')
                                    : L('固定核算原则', 'Accounting principle')}
                          </Tag>
                        </Space>
                      </div>
                      <div className="statistics-rule-control">
                        {rule.kind === 'option' || rule.kind === 'ledger' ? (
                          control(rule)
                        ) : rule.link ? (
                          <Link to={rule.link}>{L('前往管理', 'Manage')}</Link>
                        ) : rule.value === undefined ? null : (
                          <Tag>
                            {rule.value ? L('是', 'Yes') : L('否', 'No')}
                          </Tag>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ),
            }))}
          />
        )}
      </Card>
      <Card
        className="mb16"
        title={L(
          '真实账本预览与口径比较',
          'Ledger preview and policy comparison',
        )}
      >
        <Space wrap className="mb16">
          <DatePicker
            value={anchor}
            allowClear={false}
            onChange={(v) => v && setAnchor(v)}
            aria-label={L('账期内任一天', 'Any date in the period')}
          />
          <Select
            aria-label={L('预览账期类型', 'Preview period')}
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'month', label: L('自定义月账期', 'Custom month') },
              { value: 'year', label: L('财务年度', 'Fiscal year') },
              { value: 'week', label: L('统计周', 'Reporting week') },
            ]}
          />
          <Select
            aria-label={L('预览币种', 'Preview currency')}
            value={currency}
            onChange={setCurrencyChoice}
            options={currencyOptions(useUI.getState().language === 'en')}
          />
          <Button
            loading={preview.isFetching}
            onClick={() => setRequest({ ...currentRequest })}
          >
            {L('预览当前方案', 'Preview current policy')}
          </Button>
          <Button
            disabled={!request || preview.isFetching}
            onClick={() => preview.refetch()}
          >
            {L('刷新预览', 'Refresh preview')}
          </Button>
        </Space>
        {stalePreview && (
          <Alert
            className="mb16"
            type="warning"
            message={L(
              '配置或账期已改变，下方为上次预览。请重新预览当前方案。',
              'Settings or period changed. Results below are the previous preview; preview the current policy again.',
            )}
          />
        )}
        {preview.isError ? (
          <ErrorState error={preview.error} retry={() => preview.refetch()} />
        ) : preview.isFetching ? (
          <Spin />
        ) : preview.data ? (
          <Analysis data={preview.data} />
        ) : (
          <Empty
            description={L(
              '选择账期内的日期，预览不会保存任何修改',
              'Select a date within the period. Preview does not save changes.',
            )}
          />
        )}
      </Card>
      <Card title={L('最近50次口径变更', 'Latest 50 policy changes')}>
        {history.isError ? (
          <ErrorState error={history.error} retry={() => history.refetch()} />
        ) : (
          <Table
            loading={history.isLoading}
            dataSource={history.data ?? []}
            rowKey="id"
            pagination={{ pageSize: 5 }}
            columns={[
              {
                title: L('时间（上海）', 'Time (Shanghai)'),
                dataIndex: 'createdAt',
                width: 180,
                render: (value: string) =>
                  new Intl.DateTimeFormat(
                    useUI.getState().language === 'en' ? 'en-GB' : 'zh-CN',
                    {
                      timeZone: 'Asia/Shanghai',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    },
                  ).format(new Date(value)),
              },
              {
                title: L('修改内容', 'Changes'),
                dataIndex: 'changes',
                render: (changes: PolicyHistory['changes']) => (
                  <HistoryChanges changes={changes} />
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
function HistoryChanges({ changes }: { changes: PolicyHistory['changes'] }) {
  const aliases: Record<string, string> = {
    IncludeFees: 'includeFees',
    IncludeAssetLoss: 'includeAssetLoss',
    IncludeDecreasingAdjustments: 'includeDecreasingAdjustments',
  };
  const rules = policyModules.flatMap((m) => m.rules);
  const format = (v: unknown) =>
    v == null
      ? '—'
      : String(v).toLowerCase() === 'true'
        ? L('开启', 'On')
        : String(v).toLowerCase() === 'false'
          ? L('关闭', 'Off')
          : typeof v === 'object'
            ? JSON.stringify(v)
            : String(v);
  const visible = changes.filter(
    (c) =>
      rules.some((r) => r.field === (aliases[c.field] ?? c.field)) ||
      c.field === 'mode',
  );
  return visible.length ? (
    <>
      {visible.map((c) => (
        <p key={c.field}>
          {B(
            rules.find((r) => r.field === (aliases[c.field] ?? c.field))
              ?.title ?? ['方案模式', 'Policy mode'],
          )}
          : {format(c.before)} → {format(c.after)}
        </p>
      ))}
    </>
  ) : (
    <span>{L('配置版本更新', 'Policy version updated')}</span>
  );
}
function Metrics({
  data,
  fields,
  currency,
}: {
  data: Record<string, unknown>;
  fields: [string, string, string][];
  currency: string;
}) {
  return (
    <Descriptions
      column={{ xs: 1, sm: 2, lg: 3 }}
      size="small"
      items={fields.map(([key, zh, en]) => ({
        key,
        label: L(zh, en),
        children:
          data[key] == null ? (
            L('不适用', 'Not applicable')
          ) : (
            <Money value={String(data[key])} currency={currency} />
          ),
      }))}
    />
  );
}
function Analysis({ data }: { data: PolicyAnalysis }) {
  const [transactionId, setTransactionId] = useState<string>();
  const c = data.currency;
  const hidden = useUI((s) => s.hidden);
  const date = (v: string) =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(v));
  const percent = (v: unknown) =>
    hidden ? '••••' : v == null ? L('不适用', 'Not applicable') : `${v}%`;
  const dailyFields: [string, string, string][] = [
    ['income', '分析日常收入', 'Analysis daily income'],
    ['displayedExpense', '展示支出', 'Displayed expenses'],
    ['refunds', '到账退款冲减', 'Received refunds'],
    ['netExpense', '净支出', 'Net expenses'],
    ['surplus', '日常结余', 'Daily surplus'],
    ['excludedIncome', '按方案排除的收入', 'Income excluded by policy'],
    ['oneTimeIncome', '已标注一次性收入', 'Classified one-time income'],
    ['savingsIncome', '储蓄率收入基数', 'Savings-rate income basis'],
    ['cashRewardIncome', '已关联奖励收入', 'Linked cash rewards'],
    ['depositInterest', '已关联存款利息', 'Linked deposit interest'],
    [
      'investmentCashIncome',
      '已关联投资现金收入',
      'Linked investment cash income',
    ],
  ];
  const comparison = data.comparison;
  return (
    <>
      <p>
        {date(data.start)} → {date(data.plannedEndExclusive)}{' '}
        {L('（结束日不含）', '(end date excluded)')} · {c} · Asia/Shanghai ·{' '}
        {data.transactionCount} {L('笔交易', 'transactions')}
      </p>
      {!data.isPeriodClosed && (
        <Alert
          className="mb16"
          type="info"
          message={L(
            '账期尚未结束，实际统计仅截至生成时点；未来计划另列。',
            'This period is open. Actual amounts stop at generation time; future plans are separate.',
          )}
        />
      )}
      {data.transactionCount === 0 && (
        <Alert
          className="mb16"
          message={L(
            '该账期与币种暂无已确认交易，零值不代表真实没有收支。',
            'No confirmed transactions in this period and currency. Zero values do not prove no financial activity.',
          )}
        />
      )}
      <Card
        size="small"
        className="mb16"
        title={L('日常收支与储蓄', 'Daily income, expenses and savings')}
      >
        <Metrics data={data.daily} fields={dailyFields} currency={c} />
        <p>
          {L('日常储蓄率', 'Daily savings rate')}:{' '}
          {percent(data.daily.savingsRate)}
        </p>
      </Card>
      {comparison && (
        <Card
          size="small"
          className="mb16"
          title={L('与服务器已保存方案比较', 'Compare with the saved policy')}
        >
          <p>
            {L('已保存方案账期', 'Saved policy period')}:{' '}
            {date(comparison.start)} → {date(comparison.endExclusive)}
          </p>
          {!comparison.samePeriod && (
            <Alert
              type="warning"
              className="mb16"
              message={L(
                '两种方案的账期不同，数值差异包含时间范围变化，不宜视为单纯规则影响。',
                'The periods differ. Differences include a change in time scope, not only rule changes.',
              )}
            />
          )}
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={[
              'income',
              'netExpense',
              'surplus',
              'savingsIncome',
            ].map((key) => ({
              key,
              label: L(
                ...(
                  {
                    income: ['日常收入', 'Daily income'],
                    netExpense: ['净支出', 'Net expenses'],
                    surplus: ['日常结余', 'Daily surplus'],
                    savingsIncome: ['储蓄率收入基数', 'Savings income basis'],
                  } as Record<string, [string, string]>
                )[key],
              ),
              before: comparison.daily[key],
              after: data.daily[key],
            }))}
            columns={[
              { title: L('指标', 'Metric'), dataIndex: 'label' },
              {
                title: L('已保存方案', 'Saved policy'),
                dataIndex: 'before',
                render: (v) => <Money value={String(v)} currency={c} />,
              },
              {
                title: L('当前方案', 'Current policy'),
                dataIndex: 'after',
                render: (v) => <Money value={String(v)} currency={c} />,
              },
            ]}
          />
          <Metrics
            currency={c}
            data={data.daily}
            fields={[
              [
                'savedLedgerExpense',
                '同账期原全账本支出',
                'Saved ledger expenses in this period',
              ],
              [
                'ledgerExpense',
                '同账期新全账本支出',
                'Proposed ledger expenses in this period',
              ],
              [
                'ledgerExpenseDifference',
                '全账本开关影响',
                'Ledger-setting expense difference',
              ],
            ]}
          />
        </Card>
      )}
      {data.accounts && (
        <Card
          className="mb16"
          size="small"
          title={L('流动账户现金流', 'Liquid-account cash flows')}
        >
          <Metrics
            currency={c}
            data={data.accounts}
            fields={[
              ['inflow', '现金流入', 'Cash inflow'],
              ['outflow', '现金流出', 'Cash outflow'],
              ['surplus', '现金流结余', 'Cash surplus'],
            ]}
          />
          <p>
            {L('现金流结余率', 'Cash surplus rate')}:{' '}
            {percent(data.accounts.surplusRate)}
          </p>
          <p>{t(data.accounts.note)}</p>
          <Table
            size="small"
            rowKey="id"
            dataSource={data.accounts.items}
            pagination={{ pageSize: 5 }}
            columns={[
              { title: L('账户', 'Account'), dataIndex: 'name' },
              {
                title: L('资金流入', 'Account inflow'),
                dataIndex: 'inflow',
                render: (v) => <Money value={v} currency={c} />,
              },
              {
                title: L('资金流出', 'Account outflow'),
                dataIndex: 'outflow',
                render: (v) => <Money value={v} currency={c} />,
              },
              {
                title: L('账面变化', 'Book movement'),
                dataIndex: 'change',
                render: (v) => <Money value={v} currency={c} />,
              },
            ]}
          />
        </Card>
      )}
      {data.debt && (
        <Card
          className="mb16"
          size="small"
          title={L(
            '债务现金流与还款压力',
            'Debt cash flows and repayment pressure',
          )}
        >
          <Metrics
            currency={c}
            data={data.debt}
            fields={[
              ['received', '借款到账', 'Borrowed funds'],
              ['principalRepaid', '已还贷款本金', 'Loan principal repaid'],
              ['cardRepaid', '信用还款本金', 'Card principal repaid'],
              ['interest', '已核对利息', 'Reconciled interest'],
              ['serviceFees', '已核对手续费', 'Reconciled service fees'],
              [
                'unclassifiedFees',
                '已核对未分类费用',
                'Reconciled unclassified fees',
              ],
              [
                'remainingPrincipal',
                '借入业务剩余本金',
                'Borrowing principal outstanding',
              ],
              [
                'plannedPrincipal',
                '计划未核对本金',
                'Unreconciled planned principal',
              ],
              ['plannedFees', '计划未核对费用', 'Unreconciled planned fees'],
              [
                'plannedRemainingPayment',
                '本账期待核对计划余款',
                'Planned payment awaiting reconciliation',
              ],
            ]}
          />
          <p>{t(String(data.debt.note))}</p>
          {Array.isArray(data.debt.months) && data.debt.months.length > 0 && (
            <Table
              size="small"
              rowKey="month"
              pagination={false}
              scroll={{ x: 800 }}
              dataSource={data.debt.months as Record<string, string>[]}
              columns={[
                { title: L('月份', 'Month'), dataIndex: 'month' },
                ...[
                  ['received', '借款到账', 'Borrowed funds'],
                  ['principalRepaid', '偿还本金', 'Principal repaid'],
                  ['cardRepaid', '信用还款', 'Card repayments'],
                  ['interest', '利息', 'Interest'],
                  ['serviceFees', '手续费', 'Service fees'],
                  ['unclassifiedFees', '未分类费用', 'Unclassified fees'],
                ].map(([key, zh, en]) => ({
                  title: L(zh, en),
                  dataIndex: key,
                  render: (v: string) => <Money value={v} currency={c} />,
                })),
              ]}
            />
          )}
          <Link to="/cashflow">
            {L('核对偿还计划', 'Review repayment plans')}
          </Link>
        </Card>
      )}
      {data.investment && (
        <Card
          className="mb16"
          size="small"
          title={L('投资损益附表', 'Investment performance schedule')}
        >
          <Metrics
            currency={c}
            data={data.investment.summary}
            fields={[
              ['realizedInPeriod', '期间已实现损益', 'Realized period gains'],
              [
                'incomeInPeriod',
                '期间分红利息净额',
                'Net dividend and interest income',
              ],
              [
                'unrealizedCovered',
                '期末已覆盖浮盈亏',
                'Covered unrealized gains',
              ],
              ['remainingCost', '剩余持仓成本', 'Remaining position cost'],
              ['marketValueCovered', '已覆盖持仓市值', 'Covered market value'],
            ]}
          />
          <p>
            {L('缺少估值的资产数', 'Assets missing valuation')}:{' '}
            {String(data.investment.summary.missingValuations)}
          </p>
          <p>{t(data.investment.scope)}</p>
          <Link to="/investments/performance">
            {L('查看投资明细', 'View investment details')}
          </Link>
        </Card>
      )}
      {data.wealth && (
        <Card
          className="mb16"
          size="small"
          title={L(
            '财富变动与综合估值',
            'Wealth changes and consolidated valuation',
          )}
        >
          <Metrics
            currency={c}
            data={data.wealth}
            fields={[
              [
                'openingNetWorth',
                '推算期初账面净资产',
                'Estimated opening ledger net worth',
              ],
              [
                'closingNetWorth',
                '推算期末账面净资产',
                'Estimated closing ledger net worth',
              ],
              ['change', '账面净资产变化', 'Ledger net-worth change'],
              [
                'nonSurplusChange',
                '净资产变化减分析结余',
                'Net-worth change less analysis surplus',
              ],
            ]}
          />
          <p>{t(data.wealth.note)}</p>
          <Alert
            type={
              data.wealth.consolidatedValuation.complete ? 'success' : 'warning'
            }
            message={
              L('综合估值未覆盖项', 'Uncovered valuation items') +
              ': ' +
              data.wealth.consolidatedValuation.uncovered
            }
          />
          {data.wealth.consolidatedValuation.groups.map((g) => (
            <Metrics
              key={g.currency}
              currency={g.currency}
              data={g}
              fields={[
                ['assets', '综合估值资产', 'Consolidated assets'],
                ['liabilities', '综合估值负债', 'Consolidated liabilities'],
                ['netWorth', '综合估值净资产', 'Consolidated net worth'],
              ]}
            />
          ))}
          <Link to="/assets/allocation">
            {L(
              '查看估值及汇率依据',
              'View valuation and exchange-rate evidence',
            )}
          </Link>
        </Card>
      )}
      <Card
        className="mb16"
        size="small"
        title={L('工资与扣缴附表', 'Salary and withholding schedule')}
      >
        <Metrics
          currency={c}
          data={data.payroll}
          fields={[
            ['displayedSalary', '所选口径工资', 'Salary in selected basis'],
            ['gross', '应发工资', 'Gross salary'],
            ['deductions', '个人扣缴', 'Personal deductions'],
            ['adjustments', '更正项', 'Adjustments'],
            ['net', '实发工资', 'Net salary'],
            ['actual', '关联实际到账', 'Linked actual receipts'],
            ['tax', '个人所得税', 'Personal income tax'],
            ['personalSocial', '个人社保', 'Personal social insurance'],
            ['personalHousing', '个人公积金', 'Personal housing fund'],
            ['annualBonus', '年终奖', 'Annual bonus'],
          ]}
        />
        <p>{t(String(data.payroll.note))}</p>
      </Card>
      <Card
        size="small"
        className="mb16"
        title={L('数据质量与范围', 'Data quality and scope')}
      >
        <p>
          {L('未分类费用分录', 'Unclassified expense entries')}:{' '}
          {data.quality.unclassifiedCount} ·{' '}
          <Money value={data.quality.unclassifiedExpense} currency={c} />
        </p>
        <p>
          {L(
            '排除未来交易 / 未结算交易',
            'Excluded future / unsettled transactions',
          )}
          : {data.quality.futureExcluded} / {data.quality.unsettledExcluded}
        </p>
        {data.quality.largeTransactions.length > 0 && (
          <Table
            size="small"
            rowKey="id"
            dataSource={data.quality.largeTransactions}
            pagination={false}
            columns={[
              {
                title: L('日期', 'Date'),
                dataIndex: 'occurredAt',
                render: date,
              },
              {
                title: L('金额', 'Amount'),
                dataIndex: 'amount',
                render: (v) => <Money value={v} currency={c} />,
              },
              {
                title: L('交易', 'Transaction'),
                dataIndex: 'id',
                render: (id) => (
                  <Button type="link" onClick={() => setTransactionId(id)}>
                    {L('查看交易', 'View transaction')}
                  </Button>
                ),
              },
            ]}
          />
        )}
        {data.notes.map((note) => (
          <p className="muted" key={note}>
            {t(note)}
          </p>
        ))}
      </Card>
      <TransactionDrawer
        id={transactionId}
        onClose={() => setTransactionId(undefined)}
      />
    </>
  );
}
