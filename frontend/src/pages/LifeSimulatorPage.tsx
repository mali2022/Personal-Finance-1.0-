import { useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Chart from '../components/Chart';
import { PageTitle } from '../components/PageTitle';
import { useLocale } from '../i18n';
import {
  lifeApi,
  type LifeArchive,
  type LifeInput,
  type LifeResult,
  type LifeSnapshot,
} from '../api/lifeSimulator';
import {
  applyLifePreset,
  type LifePreset,
} from '../features/planning/lifePresets';
import { Link } from 'react-router-dom';
import './LifeSimulatorPage.css';
import LifeRiskPanel from '../features/planning/LifeRiskPanel';
import LifeRetirementPanel from '../features/planning/LifeRetirementPanel';
import { lifeMessage } from '../features/planning/lifeLabels';
import { useCopilotPageContext } from '../features/ai/copilotContext';

export default function LifeSimulatorPage() {
  const en = useLocale() === 'en';
  const l = (zh: string, english: string) => (en ? english : zh);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const [input, setInput] = useState<LifeInput>();
  const [snapshot, setSnapshot] = useState<LifeSnapshot>();
  const [currency, setCurrency] = useState('CNY');
  const [identity, setIdentity] = useState<{ id: string; version: string }>();
  const [archive, setArchive] = useState<LifeArchive>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const inputRevision = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const [page, setPage] = useState(1);
  const [runPage, setRunPage] = useState(1);
  const saved = useQuery({
    queryKey: ['life-scenarios', page],
    queryFn: () => lifeApi.list(false, page),
  });
  const history = useQuery({
    queryKey: ['life-runs', runPage],
    queryFn: () => lifeApi.list(true, runPage),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] =
    useState<Awaited<ReturnType<typeof lifeApi.compare>>>();
  const [real, setReal] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [preset, setPreset] = useState<LifePreset>('housing');
  const [amount, setAmount] = useState(1000000);
  const [term, setTerm] = useState(360);
  const [rate, setRate] = useState(3);
  const [cost, setCost] = useState(20);
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [mode, setMode] = useState('EqualPayment');
  const [advanced, setAdvanced] = useState('');
  const [failure, setFailure] = useState('');
  const update = (b: LifeInput) => {
    inputRevision.current++;
    setInput(b);
    setArchive(undefined);
    setConfirmed(false);
  };
  useCopilotPageContext({
    currency: input?.currency || currency,
    start: input?.start,
    end: input
      ? dayjs(input.start)
          .add(input.months, 'month')
          .subtract(1, 'day')
          .format('YYYY-MM-DD')
      : undefined,
    scenarioId: identity?.id,
  });
  const work = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure('');
    try {
      await action();
    } catch (e) {
      const text =
        e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : l('操作失败，请重试', 'Operation failed. Please retry.');
      setFailure(text);
      message.error(text);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const loadInput = (b: LifeInput) => {
    update(b);
    setAdvanced(JSON.stringify({ loans: b.loans, goals: b.goals }, null, 2));
    setDate(b.start);
  };
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['life-scenarios'] });
    await cache.invalidateQueries({ queryKey: ['life-runs'] });
  };
  const create = () =>
    work(async () => {
      const x = await lifeApi.snapshot(currency);
      setSnapshot(x.snapshot);
      setIdentity(undefined);
      loadInput(x.snapshot.suggested);
    });
  const calculate = () =>
    work(async () => {
      if (!input) return;
      const revision = inputRevision.current;
      const controller = new AbortController();
      abort.current = controller;
      try {
        const x = await lifeApi.calculate(input, controller.signal);
        if (revision === inputRevision.current)
          setArchive({
            input: structuredClone(input),
            result: x.result,
            snapshot: snapshot!,
            calculatedAt: x.calculatedAt,
          });
        await refresh();
        message.success(l('模拟已归档', 'Simulation archived'));
      } finally {
        abort.current = null;
      }
    });
  const number = (
    key: keyof LifeInput,
    zh: string,
    english: string,
    min = 0,
    max = 1e12,
    step = 100,
  ) =>
    input && (
      <Col xs={24} sm={12} lg={8} key={key}>
        <label className="life-field">
          {l(zh, english)}
          <InputNumber
            aria-label={l(zh, english)}
            style={{ width: '100%' }}
            value={input[key] as number}
            min={min}
            max={max}
            step={step}
            onChange={(v) => v !== null && update({ ...input, [key]: v })}
          />
        </label>
      </Col>
    );
  const money = (n: number) =>
    new Intl.NumberFormat(en ? 'en-US' : 'zh-CN', {
      style: 'currency',
      currency: input?.currency || currency,
      maximumFractionDigits: 2,
    }).format(n);
  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const csv = () => {
    if (!archive) return;
    const quote = (x: unknown) => `"${String(x).replaceAll('"', '""')}"`;
    const fields = Object.keys(archive.result.months[0]);
    const metadata = JSON.stringify({
      model: archive.result.modelVersion,
      fingerprint: archive.result.fingerprint,
      capturedAt: archive.snapshot.capturedAt,
      calculatedAt: archive.calculatedAt,
      input: archive.input,
    });
    download(
      'life-simulation.csv',
      '\uFEFF' +
        [
          [quote('metadata'), quote(metadata)].join(','),
          fields.map(quote).join(','),
          ...archive.result.months.map((x) =>
            fields.map((k) => quote(x[k as keyof typeof x])).join(','),
          ),
        ].join('\r\n'),
      'text/csv;charset=utf-8',
    );
  };
  const chart = (
    results: { name: string; result: LifeResult }[],
    key: keyof LifeResult['months'][number],
  ) => ({
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll' },
    grid: { left: 70, right: 24, bottom: 50 },
    xAxis: {
      type: 'category',
      data: results[0]?.result.months.map((m) => m.date),
    },
    yAxis: { type: 'value' },
    series: results.map((r) => ({
      name: r.name,
      type: 'line',
      showSymbol: false,
      data: r.result.months.map((m) => m[key]),
    })),
  });
  const result = archive?.result;
  return (
    <div className="life-simulator">
      <PageTitle>
        {l('人生财务决策模拟器', 'Life Financial Decision Simulator')}
      </PageTitle>
      {failure && <Alert type="error" showIcon message={failure} />}
      <Space wrap className="life-toolbar">
        <Select
          aria-label={l('币种', 'Currency')}
          value={currency}
          onChange={setCurrency}
          options={['CNY', 'USD', 'EUR', 'HKD', 'JPY', 'GBP'].map((value) => ({
            value,
            label: value,
          }))}
        />
        <Button loading={busy} onClick={create}>
          {l('读取并冻结财务基准', 'Read and freeze baseline')}
        </Button>
        <Link to="/cashflow">
          {l('现金流与已确认计划', 'Cash flow and registered plans')}
        </Link>
        <Link to="/payroll">
          {l('薪酬政策与税后收入', 'Payroll policies and net income')}
        </Link>
      </Space>
      {snapshot && (
        <Card
          title={l('基准快照与数据缺口', 'Baseline snapshot and data gaps')}
        >
          <Typography.Paragraph>
            {snapshot.capturedAt} · {snapshot.scope}
          </Typography.Paragraph>
          <Alert
            type="warning"
            showIcon
            message={l(
              '请审核起始资产分类、贷款、必要支出及未来假设',
              'Review asset classification, loans, essential spending and assumptions',
            )}
            description={l(
              '已复用资产配置去重及汇率口径。非即时现金保守列为受限资产；贷款余额尚未建立还款条款。历史六个完整月均值只是建议。已登记计划、定存到期和目标需手工选择录入，防止重复。',
              'Reuses allocation and FX policies. Non-cash assets default to restricted assets; debt has no repayment terms yet. Six full historical months provide suggestions only. Add selected plans, deposit maturities and goals explicitly to avoid duplication.',
            )}
          />
          {snapshot.missing.map((x) => (
            <Tag key={x}>{lifeMessage(x, en)}</Tag>
          ))}
        </Card>
      )}
      {input && (
        <>
          <Card
            title={l(
              '当前财务基准（已覆盖部分）',
              'Current baseline (covered assets only)',
            )}
          >
            <Row gutter={[12, 12]}>
              {[
                [
                  l('已覆盖净资产', 'Covered net worth'),
                  money(
                    input.cash +
                      input.investments +
                      input.otherAssets +
                      input.restrictedAssets -
                      input.unscheduledDebt -
                      input.loans
                        .filter(
                          (x) =>
                            !input.events.some(
                              (e) => e.type === 'Borrow' && e.loanId === x.id,
                            ),
                        )
                        .reduce((n, x) => n + x.principal, 0),
                  ),
                ],
                [l('流动现金', 'Liquid cash'), money(input.cash)],
                [
                  l('预计月度结余', 'Assumed monthly surplus'),
                  money(input.monthlyIncome - input.monthlyExpense),
                ],
                [
                  l(
                    '现金覆盖月数（不含还贷）',
                    'Cash coverage months (excludes loans)',
                  ),
                  input.monthlyExpense > 0
                    ? (input.cash / input.monthlyExpense).toFixed(1)
                    : '—',
                ],
                [
                  l(
                    '预计储蓄率（不含债务利息）',
                    'Assumed savings ratio (excludes debt interest)',
                  ),
                  input.monthlyIncome > 0
                    ? (
                        ((input.monthlyIncome - input.monthlyExpense) /
                          input.monthlyIncome) *
                        100
                      ).toFixed(1) + '%'
                    : '—',
                ],
              ].map(([title, value]) => (
                <Col key={title} xs={24} sm={12} lg={8}>
                  <Statistic title={title} value={value} />
                </Col>
              ))}
            </Row>
          </Card>
          <Card
            title={l('情景与明确假设', 'Scenario and explicit assumptions')}
          >
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12}>
                <label className="life-field">
                  {l('情景名称', 'Scenario name')}
                  <Input
                    value={input.name}
                    maxLength={150}
                    onChange={(e) => update({ ...input, name: e.target.value })}
                  />
                </label>
              </Col>
              <Col xs={24} sm={12}>
                <label className="life-field">
                  {l(
                    '起点 / 币种（固定快照）',
                    'Start / currency (frozen snapshot)',
                  )}
                  <Input
                    readOnly
                    value={`${input.start} / ${input.currency}`}
                  />
                </label>
              </Col>
              {number(
                'months',
                '模拟月数（1–480）',
                'Months (1–480)',
                1,
                480,
                12,
              )}
              {number('cash', '可用现金', 'Available cash')}
              {number(
                'investments',
                '可投资金融资产',
                'Investable financial assets',
              )}
              {number(
                'otherAssets',
                '其他可估值资产（非现金）',
                'Other valued assets (non-cash)',
              )}
              {number(
                'restrictedAssets',
                '受限及不可提款资产',
                'Restricted / non-withdrawable assets',
              )}
              {number(
                'unscheduledDebt',
                '未建立还款计划的负债',
                'Debt without payment terms',
              )}
              {number(
                'monthlyIncome',
                '预计每月税后收入',
                'Expected monthly net income',
              )}
              {number(
                'monthlyExpense',
                '每月生活费用（不含还本及投资）',
                'Monthly living costs (excluding principal / investment)',
              )}
              {number('reserveFloor', '现金储备底线', 'Cash reserve floor')}
              {(
                [
                  'incomeGrowth',
                  'expenseGrowth',
                  'inflation',
                  'investmentReturn',
                  'cashReturn',
                  'otherReturn',
                ] as const
              ).map((key, i) =>
                number(
                  key,
                  [
                    '收入年增长率（小数）',
                    '费用年增长率（小数）',
                    '年通胀率（小数）',
                    '投资年收益假设（小数）',
                    '现金年收益假设（小数）',
                    '其他资产年估值变化（小数）',
                  ][i],
                  [
                    'Annual income growth (decimal)',
                    'Annual expense growth (decimal)',
                    'Annual inflation (decimal)',
                    'Annual investment return (decimal)',
                    'Annual cash return (decimal)',
                    'Annual other asset return (decimal)',
                  ][i],
                  -0.5,
                  0.5,
                  0.01,
                ),
              )}
            </Row>
            {input.loans.length > 0 && (
              <Table
                rowKey="id"
                size="small"
                dataSource={input.loans}
                pagination={false}
                scroll={{ x: 600 }}
                columns={[
                  { title: l('模拟贷款', 'Simulation loan'), dataIndex: 'id' },
                  {
                    title: l('原本金', 'Original principal'),
                    dataIndex: 'principal',
                    render: money,
                  },
                  {
                    title: l('提前还款策略', 'Prepayment strategy'),
                    render: (_, loan) => (
                      <Select
                        disabled={busy}
                        style={{ minWidth: 180 }}
                        value={loan.prepaymentMode || 'ShortenTerm'}
                        options={[
                          {
                            value: 'ShortenTerm',
                            label: l(
                              '保持月供 / 本金，缩短期限',
                              'Keep payment / principal, shorten term',
                            ),
                          },
                          {
                            value: 'LowerPayment',
                            label: l(
                              '保持到期日，降低月供',
                              'Keep maturity, lower payment',
                            ),
                          },
                        ]}
                        onChange={(value) => {
                          const b = {
                            ...input,
                            loans: input.loans.map((x) =>
                              x.id === loan.id
                                ? {
                                    ...x,
                                    prepaymentMode: value as
                                      'ShortenTerm' | 'LowerPayment',
                                  }
                                : x,
                            ),
                          };
                          update(b);
                          setAdvanced(
                            JSON.stringify(
                              { loans: b.loans, goals: b.goals },
                              null,
                              2,
                            ),
                          );
                        }}
                      />
                    ),
                  },
                ]}
              />
            )}
            <Space wrap className="life-toolbar">
              <Checkbox
                disabled={busy}
                checked={!!input.investmentDrawdownFrom}
                onChange={(e) =>
                  update({
                    ...input,
                    investmentDrawdownFrom: e.target.checked
                      ? input.start
                      : null,
                    drawdownFeeRate: input.drawdownFeeRate || 0,
                  })
                }
              >
                {l(
                  '允许投资提款补足负现金（不含住房及受限资产）',
                  'Allow investments to cover cash deficits (excludes home equity / restricted assets)',
                )}
              </Checkbox>
              {input.investmentDrawdownFrom && (
                <>
                  <label className="life-field">
                    {l('投资提款开始日期', 'Investment drawdown start')}
                    <Input
                      type="date"
                      min={input.start}
                      value={input.investmentDrawdownFrom}
                      onChange={(e) =>
                        update({
                          ...input,
                          investmentDrawdownFrom: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="life-field">
                    {l('提款成本率（小数）', 'Drawdown fee (decimal)')}
                    <InputNumber
                      value={input.drawdownFeeRate || 0}
                      min={0}
                      max={0.3}
                      step={0.01}
                      onChange={(v) =>
                        update({ ...input, drawdownFeeRate: v || 0 })
                      }
                    />
                  </label>
                </>
              )}
            </Space>
            <label className="life-field">
              {l(
                '假设来源、政策版本与缺失信息处理',
                'Assumption sources, policy versions and missing data handling',
              )}
              <Input.TextArea
                rows={3}
                value={input.assumptionSource}
                maxLength={4000}
                onChange={(e) =>
                  update({ ...input, assumptionSource: e.target.value })
                }
              />
            </label>
            <Checkbox
              disabled={busy}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            >
              {l(
                '我已审核未来收入、费用、资产分类和贷款假设',
                'I reviewed future income, costs, asset classes and debt assumptions',
              )}
            </Checkbox>
            <Space wrap className="life-toolbar">
              <Button
                type="primary"
                disabled={!confirmed || busy}
                onClick={calculate}
              >
                {l('执行模拟并归档', 'Calculate and archive')}
              </Button>
              <Button
                disabled={!busy || !abort.current}
                onClick={() => abort.current?.abort()}
              >
                {l('取消计算', 'Cancel calculation')}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  work(async () => {
                    const x = await lifeApi.save(
                      input,
                      identity?.id,
                      identity?.version,
                    );
                    setIdentity(x);
                    await refresh();
                    message.success(l('已保存', 'Saved'));
                  })
                }
              >
                {l('保存情景', 'Save scenario')}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  work(async () => {
                    const revision = inputRevision.current;
                    const x = await lifeApi.save({
                      ...input,
                      name: `${input.name} copy`,
                    });
                    setIdentity(x);
                    if (revision === inputRevision.current)
                      update({ ...input, name: `${input.name} copy` });
                    await refresh();
                  })
                }
              >
                {l('另存副本', 'Save a copy')}
              </Button>
              <Button
                disabled={busy}
                onClick={() => snapshot && loadInput(snapshot.suggested)}
              >
                {l('重置参数', 'Reset parameters')}
              </Button>
            </Space>
          </Card>
          <Card title={l('人生决策预设', 'Life decision presets')}>
            <Row gutter={[16, 12]}>
              <Col xs={24} sm={12}>
                <label className="life-field">
                  {l('决策类型', 'Decision type')}
                  <Select
                    style={{ width: '100%' }}
                    value={preset}
                    onChange={(v) => {
                      setPreset(v);
                      setAmount(v === 'housing' ? 1000000 : 0);
                      setCost(v === 'housing' ? 20 : 0);
                      setTerm(v === 'unemployment' ? 6 : 360);
                    }}
                    options={(
                      [
                        'housing',
                        'job',
                        'unemployment',
                        'repayment',
                        'retirement',
                        'saving',
                      ] as const
                    ).map((value, i) => ({
                      value,
                      label: l(
                        [
                          '买房',
                          '换工作',
                          '失业',
                          '提前还贷',
                          '退休',
                          '储蓄与投资',
                        ][i],
                        [
                          'Buy a home',
                          'Change jobs',
                          'Unemployment',
                          'Early repayment',
                          'Retirement',
                          'Saving and investment',
                        ][i],
                      ),
                    }))}
                  />
                </label>
              </Col>
              <Col xs={24} sm={12}>
                <label className="life-field">
                  {l('生效日期', 'Effective date')}
                  <Input
                    type="date"
                    min={input.start}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              </Col>
              <Col xs={24} sm={12}>
                <label className="life-field">
                  {l(
                    '房价 / 新税后月收入 / 还本 / 每月投资金额',
                    'Home price / new monthly net income / repayment / monthly investment',
                  )}
                  <InputNumber
                    min={0}
                    max={1e12}
                    style={{ width: '100%' }}
                    value={amount}
                    onChange={(v) => setAmount(v || 0)}
                  />
                </label>
              </Col>
              <Col xs={24} sm={12}>
                <label className="life-field">
                  {preset === 'housing'
                    ? l('首付百分比', 'Down payment percent')
                    : l(
                        '搬迁或应急费用 / 提前还款费 / 退休月支出',
                        'Relocation / emergency cost / repayment fee / retirement spending',
                      )}
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    max={preset === 'housing' ? 100 : 1e12}
                    value={cost}
                    onChange={(v) => setCost(v || 0)}
                  />
                </label>
              </Col>
              {(preset === 'housing' || preset === 'unemployment') && (
                <Col xs={24} sm={12}>
                  <label className="life-field">
                    {l('贷款 / 失业月数', 'Loan / unemployment months')}
                    <InputNumber
                      min={1}
                      max={preset === 'unemployment' ? 24 : 600}
                      value={term}
                      onChange={(v) => setTerm(v || 1)}
                    />
                  </label>
                </Col>
              )}
              {preset === 'housing' && (
                <>
                  <Col xs={24} sm={12}>
                    <label className="life-field">
                      {l(
                        '贷款年利率（百分比）',
                        'Loan annual interest percent',
                      )}
                      <InputNumber
                        value={rate}
                        min={0}
                        max={100}
                        onChange={(v) => setRate(v || 0)}
                      />
                    </label>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Select
                      aria-label={l('还款方式', 'Repayment mode')}
                      value={mode}
                      onChange={setMode}
                      options={[
                        {
                          value: 'EqualPayment',
                          label: l('等额本息', 'Equal payment'),
                        },
                        {
                          value: 'EqualPrincipal',
                          label: l('等额本金', 'Equal principal'),
                        },
                      ]}
                    />
                  </Col>
                </>
              )}
            </Row>
            <Button
              disabled={busy}
              onClick={() => {
                try {
                  const b = applyLifePreset(
                    input,
                    preset,
                    amount,
                    term,
                    rate,
                    date,
                    cost,
                    mode,
                  );
                  loadInput(b);
                } catch (e) {
                  message.error(String(e));
                }
              }}
            >
              {l('添加决策到时间线', 'Add decision to timeline')}
            </Button>
          </Card>
          <Card
            title={l(
              '事件时间线（按日期排序计算）',
              'Event timeline (computed in date order)',
            )}
          >
            <Button
              onClick={() =>
                update({
                  ...input,
                  events: [
                    ...input.events,
                    {
                      id: crypto.randomUUID(),
                      name: l('自定义事件', 'Custom event'),
                      type: 'Expense',
                      date: input.start,
                      amount: 0,
                      everyMonths: 0,
                      growth: 0,
                      currency: input.currency,
                      fxRate: 1,
                      basis: 0,
                      note: '',
                    },
                  ],
                })
              }
            >
              {l('添加事件', 'Add event')}
            </Button>
            {input.events.map((e, index) => {
              const edit = (patch: Partial<typeof e>) =>
                update({
                  ...input,
                  events: input.events.map((x, i) =>
                    i === index ? { ...x, ...patch } : x,
                  ),
                });
              return (
                <Card size="small" key={e.id} className="life-event">
                  <Row gutter={[8, 8]}>
                    <Col xs={24} sm={8}>
                      <Input
                        aria-label={l('事件名称', 'Event name')}
                        value={e.name}
                        maxLength={150}
                        onChange={(v) => edit({ name: v.target.value })}
                      />
                    </Col>
                    <Col xs={12} sm={8}>
                      <Input
                        aria-label={l('事件日期', 'Event date')}
                        type="date"
                        value={e.date}
                        onChange={(v) => edit({ date: v.target.value })}
                      />
                    </Col>
                    <Col xs={12} sm={8}>
                      <Select
                        style={{ width: '100%' }}
                        aria-label={l('事件类型', 'Event type')}
                        value={e.type}
                        onChange={(type) => edit({ type })}
                        options={[
                          'Income',
                          'Expense',
                          'IncomeChange',
                          'ExpenseChange',
                          'Invest',
                          'Withdraw',
                          'BuyAsset',
                          'SellAsset',
                          'Borrow',
                          'Repay',
                          'Transfer',
                          'InvestmentShock',
                        ].map((value, i) => ({
                          value,
                          label: l(
                            [
                              '收入',
                              '费用',
                              '月收入变更',
                              '月费用变更',
                              '投资投入',
                              '投资提款',
                              '资产购买',
                              '资产出售',
                              '新增贷款',
                              '偿还本金',
                              '内部转账',
                              '投资损失',
                            ][i],
                            value,
                          ),
                        }))}
                      />
                    </Col>
                    <Col xs={12} sm={6}>
                      <label>
                        {l('金额', 'Amount')}
                        <InputNumber
                          style={{ width: '100%' }}
                          min={0}
                          value={e.amount}
                          onChange={(amount) => edit({ amount: amount || 0 })}
                        />
                      </label>
                    </Col>
                    <Col xs={12} sm={6}>
                      <label>
                        {l('每几个月（0=一次）', 'Interval months (0=once)')}
                        <InputNumber
                          min={0}
                          max={480}
                          value={e.everyMonths}
                          onChange={(v) => edit({ everyMonths: v || 0 })}
                        />
                      </label>
                    </Col>
                    <Col xs={12} sm={6}>
                      <label>
                        {l('结束日期（含）', 'End date (inclusive)')}
                        <Input
                          type="date"
                          value={e.end || ''}
                          onChange={(v) =>
                            edit({ end: v.target.value || null })
                          }
                        />
                      </label>
                    </Col>
                    <Col xs={12} sm={6}>
                      <label>
                        {l('年增长率（小数）', 'Growth (decimal)')}
                        <InputNumber
                          min={-0.5}
                          max={0.5}
                          step={0.01}
                          value={e.growth}
                          onChange={(v) => edit({ growth: v || 0 })}
                        />
                      </label>
                    </Col>
                    <Col xs={12} sm={6}>
                      <label>
                        {l('币种', 'Currency')}
                        <Input
                          value={e.currency}
                          maxLength={3}
                          onChange={(v) =>
                            edit({ currency: v.target.value.toUpperCase() })
                          }
                        />
                      </label>
                    </Col>
                    <Col xs={12} sm={6}>
                      <label>
                        {l('假设兑换率', 'Assumed FX rate')}
                        <InputNumber
                          min={0.000001}
                          value={e.fxRate}
                          onChange={(v) => edit({ fxRate: v || 1 })}
                        />
                      </label>
                    </Col>
                    <Col xs={12} sm={6}>
                      <label>
                        {l(
                          '出售账面值（基准币）',
                          'Sale book value (base currency)',
                        )}
                        <InputNumber
                          min={0}
                          value={e.basis}
                          onChange={(v) => edit({ basis: v || 0 })}
                        />
                      </label>
                    </Col>
                    <Col xs={12} sm={6}>
                      <Select
                        style={{ width: '100%' }}
                        allowClear
                        placeholder={l('关联模拟贷款', 'Simulation loan')}
                        value={e.loanId}
                        onChange={(v) => edit({ loanId: v || null })}
                        options={input.loans.map((x) => ({
                          value: x.id,
                          label: x.id,
                        }))}
                      />
                    </Col>
                    <Col span={24}>
                      <Input
                        placeholder={l(
                          '备注 / 假设来源',
                          'Notes / assumption source',
                        )}
                        value={e.note}
                        maxLength={2000}
                        onChange={(v) => edit({ note: v.target.value })}
                      />
                    </Col>
                  </Row>
                  <Button
                    danger
                    onClick={() =>
                      update({
                        ...input,
                        events: input.events.filter((x) => x.id !== e.id),
                      })
                    }
                  >
                    {l('移除事件', 'Remove event')}
                  </Button>
                </Card>
              );
            })}
            <label className="life-field">
              {l(
                '高级：模拟贷款与目标 JSON（利率为小数）',
                'Advanced: simulation loans and goals JSON (decimal rates)',
              )}
              <Input.TextArea
                rows={8}
                value={advanced}
                onChange={(e) => setAdvanced(e.target.value)}
              />
            </label>
            <Button
              onClick={() => {
                try {
                  const x = JSON.parse(advanced);
                  if (!Array.isArray(x.loans) || !Array.isArray(x.goals))
                    throw new Error('loans / goals must be arrays');
                  update({ ...input, loans: x.loans, goals: x.goals });
                } catch (e) {
                  message.error(String(e));
                }
              }}
            >
              {l('应用贷款与目标参数', 'Apply loan and goal parameters')}
            </Button>
          </Card>
        </>
      )}
      {result && archive && (
        <Card
          className="life-report"
          title={l('财务决策报告', 'Financial decision report')}
        >
          <Space wrap>
            <Button onClick={() => window.print()}>
              {l('打印 / 保存 PDF', 'Print / save PDF')}
            </Button>
            <Button onClick={csv}>{l('导出 CSV', 'Export CSV')}</Button>
            <Button
              onClick={() =>
                download(
                  'life-report.json',
                  JSON.stringify(archive, null, 2),
                  'application/json',
                )
              }
            >
              {l('导出完整报告 JSON', 'Export full report JSON')}
            </Button>
            <Switch
              checked={real}
              onChange={setReal}
              checkedChildren={l('实际购买力', 'Real value')}
              unCheckedChildren={l('名义金额', 'Nominal value')}
            />
          </Space>
          <Typography.Paragraph>
            {archive.input.name} · {result.modelVersion} ·{' '}
            {archive.calculatedAt} · {result.currency} · {archive.input.months}{' '}
            {l('个月', 'months')} · {l('价格基期', 'Price base')}:{' '}
            {result.priceBase}
          </Typography.Paragraph>
          <Typography.Paragraph copyable>
            {result.fingerprint}
          </Typography.Paragraph>
          <Typography.Paragraph>
            {archive.input.assumptionSource}
          </Typography.Paragraph>
          <Row gutter={[12, 12]}>
            {[
              [l('期末净资产', 'Final net worth'), money(result.finalNetWorth)],
              [l('最低现金', 'Minimum cash'), money(result.minimumCash)],
              [
                l('首次现金缺口', 'First cash shortfall'),
                result.firstShortfall || '—',
              ],
              [l('累计利息', 'Total interest'), money(result.totalInterest)],
            ].map(([title, value]) => (
              <Col xs={24} sm={12} lg={6} key={title}>
                <Statistic title={title} value={value} />
              </Col>
            ))}
          </Row>
          <Alert
            type={
              result.minimumCash < archive.input.reserveFloor
                ? 'warning'
                : 'info'
            }
            message={l('风险与模型限制', 'Risks and model limitations')}
            description={l(
              '不自动出售资产补足负现金。目标以未专门预留的现金和投资合计衡量；不同目标可能争用同一资产，不表示已全部获资金保障。市场、税务及养老金政策不作保证。',
              'Assets are not automatically liquidated for cash deficits. Goals use unallocated cash plus investments; goals may compete for the same funds. Market, tax and pension outcomes are not guaranteed.',
            )}
          />
          {result.warnings.map((x) => (
            <Tag key={x}>{lifeMessage(x, en)}</Tag>
          ))}
          <h3>
            {l('净资产路径', 'Net worth path')} ·{' '}
            {real
              ? l('实际购买力', 'Real value')
              : l('名义金额', 'Nominal value')}
          </h3>
          <Chart
            option={chart(
              [{ name: archive.input.name, result }],
              real ? 'realNetWorth' : 'netWorth',
            )}
          />
          <h3>
            {l('现金余额与负债', 'Cash and debt')} ·{' '}
            {l('名义金额', 'Nominal values')}
          </h3>
          <Chart
            option={{
              ...chart([{ name: l('现金', 'Cash'), result }], 'closingCash'),
              series: [
                {
                  name: l('现金', 'Cash'),
                  type: 'line',
                  showSymbol: false,
                  data: result.months.map((m) => m.closingCash),
                },
                {
                  name: l('负债', 'Debt'),
                  type: 'line',
                  showSymbol: false,
                  data: result.months.map((m) => m.debt),
                },
              ],
            }}
          />
          <h3>
            {l('收入与费用', 'Income and expense')} ·{' '}
            {l('名义金额', 'Nominal values')}
          </h3>
          <Chart
            option={{
              ...chart([{ name: l('收入', 'Income'), result }], 'income'),
              series: [
                {
                  name: l('收入', 'Income'),
                  type: 'line',
                  showSymbol: false,
                  data: result.months.map((m) => m.income),
                },
                {
                  name: l('费用（不含本金）', 'Expenses (excludes principal)'),
                  type: 'line',
                  showSymbol: false,
                  data: result.months.map((m) => m.expense + m.interest),
                },
              ],
            }}
          />
          <Table
            rowKey="name"
            size="small"
            dataSource={result.goals}
            pagination={false}
            scroll={{ x: 600 }}
            columns={[
              { title: l('目标', 'Goal'), dataIndex: 'name' },
              {
                title: l('目标金额', 'Target'),
                dataIndex: 'target',
                render: money,
              },
              { title: l('期望日期', 'Due'), dataIndex: 'due' },
              {
                title: l(
                  '首次达到（未分配资金）',
                  'First reached (unallocated)',
                ),
                dataIndex: 'reached',
                render: (v) => v || '—',
              },
            ]}
          />
          <Table
            rowKey="date"
            size="small"
            dataSource={result.months}
            scroll={{ x: 1200 }}
            pagination={{ pageSize: 12 }}
            columns={(
              [
                'date',
                'openingCash',
                'income',
                'expense',
                'principal',
                'interest',
                'investmentContribution',
                'assetPurchase',
                'closingCash',
                'investments',
                'otherAssets',
                'restrictedAssets',
                'debt',
                'netWorth',
              ] as const
            ).map((key) => ({
              title: key,
              dataIndex: key,
              render: key === 'date' ? undefined : money,
            }))}
          />
        </Card>
      )}
      {input && <LifeRetirementPanel input={input} onApply={loadInput} />}
      {input && <LifeRiskPanel input={input} confirmed={confirmed} />}
      <Card
        title={l('已保存情景', 'Saved scenarios')}
        loading={saved.isLoading}
      >
        {saved.isError && (
          <Alert
            type="error"
            message={l('读取失败', 'Load failed')}
            action={
              <Button onClick={() => saved.refetch()}>
                {l('重试', 'Retry')}
              </Button>
            }
          />
        )}
        <Table
          rowKey="id"
          dataSource={saved.data?.items}
          scroll={{ x: 550 }}
          pagination={{
            current: page,
            pageSize: 10,
            total: saved.data?.total,
            onChange: setPage,
          }}
          columns={[
            { title: l('名称', 'Name'), dataIndex: 'name' },
            {
              title: l('操作', 'Actions'),
              render: (_, r) => (
                <Space wrap>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      work(async () => {
                        const x = await lifeApi.scenario(r.id);
                        setIdentity({ id: x.id, version: x.version });
                        setSnapshot(x.snapshot);
                        loadInput(x.content);
                      })
                    }
                  >
                    {l('打开', 'Open')}
                  </Button>
                  <Popconfirm
                    title={l(
                      '删除此模拟情景？历史运行保留。',
                      'Delete scenario? Archived runs are retained.',
                    )}
                    onConfirm={() =>
                      work(async () => {
                        await lifeApi.remove(r.id, r.version);
                        await refresh();
                      })
                    }
                  >
                    <Button danger>{l('删除', 'Delete')}</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Card
        title={l('历史运行与多方案比较', 'Archived runs and comparison')}
        loading={history.isLoading}
      >
        {history.isError && (
          <Alert
            type="error"
            message={l('读取失败', 'Load failed')}
            action={
              <Button onClick={() => history.refetch()}>
                {l('重试', 'Retry')}
              </Button>
            }
          />
        )}
        <Table
          rowKey="id"
          dataSource={history.data?.items}
          scroll={{ x: 600 }}
          rowSelection={{
            selectedRowKeys: selected,
            preserveSelectedRowKeys: true,
            onChange: (keys) => setSelected(keys.map(String)),
          }}
          pagination={{
            current: runPage,
            pageSize: 10,
            total: history.data?.total,
            onChange: setRunPage,
          }}
          columns={[
            { title: l('名称', 'Name'), dataIndex: 'name' },
            { title: l('计算时间', 'Calculated'), dataIndex: 'createdAt' },
            {
              title: l('报告', 'Report'),
              render: (_, r) => (
                <Button
                  disabled={busy}
                  onClick={() =>
                    work(async () => {
                      const x = await lifeApi.run(r.id);
                      setIdentity(undefined);
                      loadInput(x.content.input);
                      setSnapshot(x.content.snapshot);
                      setArchive(x.content);
                    })
                  }
                >
                  {l('打开报告', 'Open report')}
                </Button>
              ),
            },
          ]}
        />
        <Button
          disabled={selected.length < 2 || selected.length > 6 || busy}
          onClick={() =>
            work(async () => setComparison(await lifeApi.compare(selected)))
          }
        >
          {l('比较所选运行', 'Compare selected runs')}
        </Button>
        {comparison && (
          <>
            <Chart option={chart(comparison, 'netWorth')} />
            <Table
              rowKey="id"
              dataSource={comparison}
              scroll={{ x: 900 }}
              pagination={false}
              columns={[
                { title: l('情景', 'Scenario'), dataIndex: 'name' },
                {
                  title: l('期末净资产', 'Final net worth'),
                  render: (_, r) => money(r.result.finalNetWorth),
                },
                {
                  title: l('相对基准差额', 'Delta vs baseline'),
                  dataIndex: 'deltaNetWorth',
                  render: money,
                },
                {
                  title: '%',
                  dataIndex: 'percent',
                  render: (v) => (v === null ? '—' : v.toFixed(2)),
                },
                {
                  title: l('最低现金', 'Minimum cash'),
                  render: (_, r) => money(r.result.minimumCash),
                },
                {
                  title: l('首次缺口', 'First shortfall'),
                  render: (_, r) => r.result.firstShortfall || '—',
                },
                {
                  title: l('累计收入', 'Total income'),
                  render: (_, r) => money(r.result.totalIncome),
                },
                {
                  title: l('累计费用', 'Total expense'),
                  render: (_, r) => money(r.result.totalExpense),
                },
                {
                  title: l('累计利息', 'Total interest'),
                  render: (_, r) => money(r.result.totalInterest),
                },
              ]}
            />
          </>
        )}
      </Card>
      <Alert
        type="warning"
        message={l('当前边界', 'Current scope')}
        description={l(
          '自定义利率路径、日息贷款、税前薪酬联算及家庭共享基准尚未实现；报告提供浏览器打印，不具备独立服务端PDF或公开分享能力。',
          'Rate paths, daily-interest loans, integrated gross-pay calculation and shared-space baselines are not implemented. Reports offer browser printing; server-side PDF and public sharing are not available.',
        )}
      />
    </div>
  );
}
