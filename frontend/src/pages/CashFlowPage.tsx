import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { localizedPair } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { planningLabel } from '../utils/planningLabels';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Form,
  Input,
  Space,
  Table,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  cashflowApi,
  type FutureInput,
  type FutureItem,
} from '../api/financialPlanning';
import { accountApi } from '../api/finance';
import { Money } from '../components/Money';
import Chart from '../components/Chart';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import { decimal, minor } from '../utils/finance';
import ScenarioHistoryPanel from '../features/planning/ScenarioHistoryPanel';
import { useCopilotPageContext } from '../features/ai/copilotContext';
export default function CashFlowPage() {
  useLocale();
  const [currency, setCurrency] = useCurrencyState();
  const [days, setDays] = useState(30);
  const [customEnd, setCustomEnd] = useState(
    dayjs().add(30, 'day').format('YYYY-MM-DD'),
  );
  const [accountId, setAccountId] = useState<string>();
  const [funding, setFunding] = useState<string>();
  const [scenarioId, setScenarioId] = useState<string>();
  const [includeLoanPlans, setIncludeLoanPlans] = useState(false);
  const [page, setPage] = useState(1);
  const [planPage, setPlanPage] = useState(1);
  const [scenarioPage, setScenarioPage] = useState(1);
  const [scenarioName, setScenarioName] = useState('');
  const [editing, setEditing] = useState<{
    id?: string;
    version: string;
    key: string;
  }>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [form] = Form.useForm<FutureInput>();
  const hidden = useUI((s) => s.hidden);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const scenarios = useQuery({
    queryKey: ['cashflowScenarios', scenarioPage],
    queryFn: () => cashflowApi.scenarios(scenarioPage),
  });
  const params = {
    currency,
    start: dayjs().format('YYYY-MM-DD'),
    end: days === 0 ? customEnd : dayjs().add(days, 'day').format('YYYY-MM-DD'),
    accountId,
    creditFundingAccountId: funding,
    scenarioId,
    includeLoanPlans: includeLoanPlans ? 'true' : 'false',
    page,
    pageSize: 20,
  };
  const forecast = useQuery({
    queryKey: ['cashflow', params],
    queryFn: () => cashflowApi.forecast(params),
  });
  useCopilotPageContext({
    start: params.start,
    end: params.end,
    currency,
    accountIds: accountId ? [accountId] : undefined,
    scenarioId,
  });
  const comparison = useQuery({
    queryKey: ['cashflow', 'comparison', params],
    queryFn: () => cashflowApi.comparison(params),
    enabled: !!scenarioId,
    retry: false,
  });
  const plans = useQuery({
    queryKey: ['cashflowPlans', currency, planPage],
    queryFn: () => cashflowApi.events(currency, planPage),
  });
  const refresh = () =>
    Promise.all(
      [
        'cashflow',
        'cashflowPlans',
        'cashflowScenarios',
        'financialSummary',
      ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
  const open = (e?: FutureItem) => {
    form.resetFields();
    form.setFieldsValue(
      e || {
        name: '',
        expectedDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
        type: 'Expense',
        currency,
        amount: '',
        certainty: 'Estimated',
        state: 'Planned',
        note: '',
      },
    );
    setEditing({
      id: e?.id,
      version: e?.version || '0',
      key: crypto.randomUUID(),
    });
  };
  const save = async () => {
    if (!editing || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const v = await form.validateFields();
      const body = {
        ...v,
        amount: decimal(minor(v.amount)),
        toAccountId: ['Transfer', 'CreditCardPayment'].includes(v.type)
          ? v.toAccountId || null
          : null,
        receivedAmount:
          ['Transfer', 'CreditCardPayment'].includes(v.type) && v.receivedAmount
            ? decimal(minor(v.receivedAmount))
            : null,
        transactionId: v.state === 'Posted' ? v.transactionId || null : null,
        scenarioId: v.certainty === 'Scenario' ? v.scenarioId || null : null,
        note: v.note || '',
      };
      await cashflowApi.save(body, editing.version, editing.key, editing.id);
      setEditing(undefined);
      await refresh();
      message.success(tr('预测计划已保存，正式账本未改变'));
    } catch (e) {
      message.error(
        e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : tr('保存失败'),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const trend = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: forecast.data?.days.map((d) => d.date) },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'line',
          name: tr('预计账户余额'),
          data: forecast.data?.days.map((d) => Number(d.balance)),
          showSymbol: false,
        },
      ],
    }),
    [forecast.data],
  );
  const flows = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { data: [tr('预计流入'), tr('预计流出')] },
      xAxis: { type: 'category', data: forecast.data?.days.map((d) => d.date) },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          name: tr('预计流入'),
          data: forecast.data?.days.map((d) => Number(d.inflow)),
        },
        {
          type: 'bar',
          name: tr('预计流出'),
          data: forecast.data?.days.map((d) => Number(d.outflow)),
        },
      ],
    }),
    [forecast.data],
  );
  const own = accounts.data?.filter(
    (a) => a.currency === currency && a.status === 'Active',
  );
  const type = Form.useWatch('type', form);
  const certainty = Form.useWatch('certainty', form);
  const state = Form.useWatch('state', form);
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('未来现金流')}</PageTitle>
        </div>
        <Button type="primary" onClick={() => open()}>
          {tr('创建未来计划')}
        </Button>
      </div>
      <Space wrap className="mb16">
        <Select
          aria-label={tr('预测币种')}
          value={currency}
          onChange={(v) => {
            setCurrency(v);
            setAccountId(undefined);
            setFunding(undefined);
            setPage(1);
          }}
          options={CURRENCY_CODES.map((value) => ({ value }))}
        />
        <Select
          aria-label={tr('预测范围')}
          value={days}
          onChange={(v) => {
            setDays(v);
            setPage(1);
          }}
          options={[
            { value: 7, label: tr('未来7天') },
            { value: 30, label: tr('未来30天') },
            { value: 90, label: tr('未来90天') },
            { value: 0, label: tr('自定义结束日期') },
          ]}
        />
        {days === 0 && (
          <DateInput
            type="date"
            aria-label={tr('预测结束日期（不包含）')}
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
        )}
        <Select
          allowClear
          aria-label={tr('预测账户')}
          placeholder={tr('全部活动账户')}
          style={{ width: 180 }}
          value={accountId}
          onChange={setAccountId}
          options={own?.map((a) => ({ value: a.id, label: a.name }))}
        />
        <Select
          allowClear
          aria-label={tr('信用卡预测付款账户')}
          placeholder={tr('信用卡付款账户')}
          style={{ width: 200 }}
          value={funding}
          onChange={setFunding}
          options={own
            ?.filter((a) =>
              ['Cash', 'Bank', 'Alipay', 'WeChat'].includes(a.type),
            )
            .map((a) => ({ value: a.id, label: a.name }))}
        />
        <Select
          allowClear
          aria-label={tr('预测情景')}
          placeholder={tr('基础预测')}
          style={{ width: 180 }}
          value={scenarioId}
          onChange={setScenarioId}
          options={scenarios.data?.items
            .filter((s) => s.state === 'Active')
            .map((s) => ({
              value: s.id,
              label: hidden ? tr('模拟情景') : s.name,
            }))}
        />
        <Button
          onClick={() => {
            void forecast.refetch();
            if (scenarioId) void comparison.refetch();
          }}
        >
          {tr('重新计算')}
        </Button>
        <Checkbox
          checked={includeLoanPlans}
          onChange={(e) => setIncludeLoanPlans(e.target.checked)}
        >
          {tr('纳入已核对借贷计划（沿用原资金账户；疑似重复时跳过）')}
        </Checkbox>
      </Space>
      {scenarioId && (
        <Card
          title={tr('基准与情景对比')}
          className="mb16"
          loading={comparison.isFetching}
        >
          {comparison.isError ? (
            <ErrorState
              error={comparison.error}
              retry={() => comparison.refetch()}
            />
          ) : (
            <>
              <Table
                rowKey="key"
                pagination={false}
                scroll={{ x: 600 }}
                dataSource={[
                  localizedPair('closing', '预计期末余额'),
                  localizedPair('inflow', '预计流入'),
                  localizedPair('outflow', '预计流出'),
                  localizedPair('minimum', '最低预计余额'),
                  localizedPair('freelyAvailable', '可自由支配现金'),
                ].map(([key, label]) => ({ key, label }))}
                columns={[
                  { title: tr('指标'), dataIndex: 'label' },
                  {
                    title: tr('基准'),
                    render: (_, row) => (
                      <Money
                        value={String(
                          comparison.data?.baseline[
                            row.key as keyof typeof comparison.data.baseline
                          ] ?? '0.00',
                        )}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    title: tr('模拟'),
                    render: (_, row) => (
                      <Money
                        value={String(
                          comparison.data?.simulation[
                            row.key as keyof typeof comparison.data.simulation
                          ] ?? '0.00',
                        )}
                        currency={currency}
                      />
                    ),
                  },
                  {
                    title: tr('差额'),
                    render: (_, row) => (
                      <Money
                        value={comparison.data?.differences[row.key] ?? '0.00'}
                        currency={currency}
                      />
                    ),
                  },
                ]}
              />
              <p>{comparison.data?.explanation}</p>
              <p>
                {tr('基准余额日期：')}
                {params.start}
                {tr('；结束日期（不包含）：')}
                {params.end}
                {tr('。规则：')}
                {comparison.data?.ruleVersion}。
              </p>
            </>
          )}
        </Card>
      )}
      {scenarioId && scenarios.data?.items.find((s) => s.id === scenarioId) && (
        <ScenarioHistoryPanel
          key={
            scenarioId +
            scenarios.data.items.find((s) => s.id === scenarioId)!.version
          }
          id={scenarioId}
          name={scenarios.data.items.find((s) => s.id === scenarioId)!.name}
          onArchived={() => setScenarioId(undefined)}
          version={
            scenarios.data.items.find((s) => s.id === scenarioId)!.version
          }
          initialChanges={
            scenarios.data.items.find((s) => s.id === scenarioId)!.changes || []
          }
          initialExplanation={
            scenarios.data.items.find((s) => s.id === scenarioId)!.note
          }
          input={{
            currency,
            start: params.start,
            end: params.end,
            accountId,
            creditFundingAccountId: funding,
            includeLoanPlans,
          }}
        />
      )}
      {forecast.isError ? (
        <ErrorState error={forecast.error} retry={() => forecast.refetch()} />
      ) : (
        <>
          <Card className="mb16" loading={forecast.isFetching}>
            <div className="summary-grid">
              {[
                ['当前余额合计', forecast.data?.opening],
                ['预计期末余额', forecast.data?.closing],
                ['最低预计余额', forecast.data?.minimum],
                ['可自由支配现金', forecast.data?.freelyAvailable],
              ].map(([label, value]) => (
                <div key={label}>
                  {label}
                  <div className="stat-value">
                    <Money value={value || '0.00'} currency={currency} />
                  </div>
                </div>
              ))}
            </div>
            <p>
              {tr('最低余额日期：')}
              {hidden ? '••••' : forecast.data?.minimumDate}
            </p>
            <p>
              {tr('现金')}{' '}
              <Money
                value={forecast.data?.availableCash || '0.00'}
                currency={currency}
              />{' '}
              {tr('− 目标预留')}{' '}
              <Money
                value={forecast.data?.reserved || '0.00'}
                currency={currency}
              />{' '}
              {tr('− 期间计划付款')}{' '}
              <Money
                value={forecast.data?.nearTermCommitments || '0.00'}
                currency={currency}
              />
            </p>
          </Card>
          {hidden ? (
            <Alert
              className="mb16"
              message={tr('隐私模式已隐藏余额趋势、预测收支及资金缺口图表')}
            />
          ) : (
            <div className="account-grid">
              <Card title={tr('预计余额趋势')}>
                <Chart option={trend} />
              </Card>
              <Card title={tr('未来流入与流出')}>
                <Chart option={flows} />
              </Card>
            </div>
          )}
          <Card title={tr('每日预测数据')} className="mb16">
            <Table
              rowKey="date"
              scroll={{ x: 550 }}
              dataSource={forecast.data?.days}
              pagination={{ pageSize: 15 }}
              columns={[
                { title: tr('日期'), dataIndex: 'date' },
                ...[
                  localizedPair('inflow', '流入'),
                  localizedPair('outflow', '流出'),
                  localizedPair('balance', '日末余额'),
                ].map(([key, title]) => ({
                  title,
                  dataIndex: key,
                  render: (v: string) => (
                    <Money value={v} currency={currency} />
                  ),
                })),
              ]}
            />
          </Card>
          <Card title={tr('账户最低余额与资金缺口')} className="mb16">
            <Table
              rowKey="id"
              scroll={{ x: 600 }}
              dataSource={forecast.data?.accounts}
              pagination={false}
              columns={[
                {
                  title: tr('账户'),
                  dataIndex: 'name',
                  render: (value: unknown) => (
                    <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
                  ),
                },
                {
                  title: tr('最低余额'),
                  dataIndex: 'minimum',
                  render: (v) => <Money value={v} currency={currency} />,
                },
                {
                  title: tr('最低日期'),
                  dataIndex: 'minimumDate',
                  render: (v) => (hidden ? '••••' : v),
                },
                {
                  title: tr('现金缺口 / 信用额度不足'),
                  dataIndex: 'gap',
                  render: (v) => <Money value={v} currency={currency} />,
                },
              ]}
            />
            {!hidden && (
              <Table
                scroll={{ x: 'max-content' }}
                rowKey={(r) => `${r.accountId}:${r.date}`}
                dataSource={forecast.data?.gaps}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: tr('日期'), dataIndex: 'date' },
                  {
                    title: tr('账户'),
                    dataIndex: 'name',
                    render: (value: unknown) => (
                      <Sensitive>
                        {value == null ? '—' : String(value)}
                      </Sensitive>
                    ),
                  },
                  {
                    title: tr('缺口'),
                    dataIndex: 'amount',
                    render: (v) => <Money value={v} currency={currency} />,
                  },
                ]}
              />
            )}
          </Card>
          <Card title={tr('预测事件与来源')} className="mb16">
            <Table
              rowKey="id"
              scroll={{ x: 700 }}
              dataSource={forecast.data?.events.items}
              pagination={{
                current: page,
                pageSize: 20,
                total: forecast.data?.events.total,
                onChange: setPage,
              }}
              columns={[
                {
                  title: tr('来源 ID'),
                  dataIndex: 'id',
                  render: (v) => (hidden ? '••••' : v),
                },
                { title: tr('日期'), dataIndex: 'date' },
                {
                  title: tr('名称'),
                  dataIndex: 'name',
                  render: (v) => (hidden ? '••••' : v),
                },
                {
                  title: tr('来源'),
                  dataIndex: 'source',
                  render: planningLabel,
                },
                { title: tr('类型'), dataIndex: 'type', render: planningLabel },
                {
                  title: tr('确定性'),
                  dataIndex: 'certainty',
                  render: planningLabel,
                },
                {
                  title: tr('金额'),
                  render: (_, r) => (
                    <Money
                      value={r.amount}
                      currency={r.currency as string}
                    />
                  ),
                },
              ]}
            />
            {forecast.data?.unresolved.map((u) => (
              <Alert
                key={u.sourceId}
                type="warning"
                className="mb16"
                message={`${hidden ? '待完善来源' : u.name || u.sourceId}：${u.reason}`}
              />
            ))}
            {forecast.data?.sampled && (
              <Alert
                type="info"
                showIcon
                message={tr(
                  '长期图表已采样，完整收支、期末和最低余额仍精确计算；缺口日期列表为展示样本。',
                )}
              />
            )}
          </Card>
        </>
      )}
      <Card title={tr('手工计划管理')} className="mb16">
        <Table
          rowKey="id"
          scroll={{ x: 650 }}
          dataSource={plans.data?.items}
          pagination={{
            current: planPage,
            pageSize: 20,
            total: plans.data?.total,
            onChange: setPlanPage,
          }}
          columns={[
            { title: tr('日期'), dataIndex: 'expectedDate' },
            {
              title: tr('名称'),
              dataIndex: 'name',
              render: (v) => (hidden ? '••••' : v),
            },
            {
              title: tr('金额'),
              dataIndex: 'amount',
              render: (v) => <Money value={v} currency={currency} />,
            },
            { title: tr('状态'), dataIndex: 'state', render: planningLabel },
            {
              title: tr('操作'),
              render: (_, r) => (
                <Space>
                  <Button onClick={() => open(r)}>{tr('编辑')}</Button>
                  <Button
                    disabled={busy || r.state === 'Cancelled'}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await cashflowApi.cancel(
                          r.id,
                          r.version,
                          crypto.randomUUID(),
                        );
                        await refresh();
                      } catch (e) {
                        message.error(
                          e && typeof e === 'object' && 'message' in e
                            ? String(e.message)
                            : tr('取消失败'),
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {tr('取消计划')}
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Card title={tr('独立模拟情景')}>
        <Space wrap>
          <Input
            aria-label={tr('情景名称')}
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder={tr('如：工资减少')}
          />
          <Button
            disabled={busy || !scenarioName.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await cashflowApi.saveScenario(
                  scenarioName,
                  crypto.randomUUID(),
                );
                setScenarioName('');
                await refresh();
              } catch (e) {
                message.error(
                  e && typeof e === 'object' && 'message' in e
                    ? String(e.message)
                    : tr('创建失败'),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr('创建情景')}
          </Button>
          <Button
            disabled={scenarioPage === 1}
            onClick={() => setScenarioPage((p) => p - 1)}
          >
            {tr('上一页情景')}
          </Button>
          <Button
            disabled={scenarioPage * 20 >= (scenarios.data?.total || 0)}
            onClick={() => setScenarioPage((p) => p + 1)}
          >
            {tr('下一页情景')}
          </Button>
        </Space>
      </Card>
      <Drawer
        rootClassName="planning-drawer"
        title={tr('未来现金流计划')}
        width={540}
        open={!!editing}
        onClose={() => !busy && setEditing(undefined)}
        extra={
          <Button loading={busy} onClick={save}>
            {tr('保存计划')}
          </Button>
        }
      >
        <Form form={form} layout="vertical" disabled={busy}>
          <Form.Item
            name="name"
            label={tr('计划名称')}
            rules={[{ required: true }]}
          >
            <Input maxLength={150} />
          </Form.Item>
          <Form.Item
            name="expectedDate"
            label={tr('预计日期')}
            rules={[{ required: true }]}
          >
            <DateInput type="date" />
          </Form.Item>
          <Form.Item name="type" label={tr('类型')}>
            <Select
              options={[
                { value: 'Income', label: tr('收入') },
                { value: 'Expense', label: tr('支出') },
                { value: 'Transfer', label: tr('账户转账') },
                { value: 'CreditCardPayment', label: tr('信用卡还款') },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="accountId"
            label={tr('流出/收入账户')}
            rules={[{ required: true }]}
          >
            <Select
              options={accounts.data
                ?.filter((a) => a.status === 'Active')
                .map((a) => ({
                  value: a.id,
                  label: `${a.name} · ${a.currency}`,
                }))}
            />
          </Form.Item>
          <Form.Item name="currency" label={tr('原币币种')}>
            <Select
              options={CURRENCY_CODES.map((value) => ({ value }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={tr('金额')}
            rules={[{ required: true }]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          {['Transfer', 'CreditCardPayment'].includes(type) && (
            <>
              <Form.Item
                name="toAccountId"
                label={tr('转入账户')}
                rules={[{ required: true }]}
              >
                <Select
                  options={accounts.data
                    ?.filter((a) => a.status === 'Active')
                    .map((a) => ({
                      value: a.id,
                      label: `${a.name} · ${a.currency}`,
                    }))}
                />
              </Form.Item>
              <Form.Item
                name="receivedAmount"
                label={tr('跨币种收到金额（同币种可留空）')}
              >
                <Input inputMode="decimal" />
              </Form.Item>
            </>
          )}
          <Form.Item name="certainty" label={tr('确定性')}>
            <Select
              options={[
                { value: 'Certain', label: tr('金额已知（不保证发生）') },
                { value: 'Estimated', label: tr('预计金额') },
                { value: 'Scenario', label: tr('情景金额') },
              ]}
            />
          </Form.Item>
          {certainty === 'Scenario' && (
            <Form.Item
              name="scenarioId"
              label={tr('所属情景')}
              rules={[{ required: true }]}
            >
              <Select
                options={scenarios.data?.items
                  .filter((s) => s.state === 'Active')
                  .map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
          )}
          <Form.Item name="state" label={tr('状态')}>
            <Select
              options={[
                { value: 'Planned', label: tr('未来计划') },
                { value: 'Posted', label: tr('关联已过账交易并退出预测') },
                { value: 'Cancelled', label: tr('取消') },
              ]}
            />
          </Form.Item>
          {state === 'Posted' && (
            <Form.Item
              name="transactionId"
              label={tr('真实交易 ID')}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item name="note" label={tr('说明')}>
            <Input.TextArea maxLength={2000} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
