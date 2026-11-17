import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { useCopilotPageContext } from '../features/ai/copilotContext';
import { planningLabel } from '../utils/planningLabels';
import { useRef, useState } from 'react';
import { Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Pagination, Space, Table, Tag } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  goalApi,
  type AllocationInput,
  type AllocationPreview,
  type GoalInput,
  type GoalView,
} from '../api/financialPlanning';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
import { decimal, minor } from '../utils/finance';
const states = [
  { value: 'Planned', get label(){return tr("计划中");} },
  { value: 'Active', get label(){return tr("进行中");} },
  { value: 'Completed', get label(){return tr("已完成");} },
  { value: 'Paused', get label(){return tr("已暂停");} },
  { value: 'Cancelled', get label(){return tr("已取消");} },
];
const types = [
  { value: 'Emergency', get label(){return tr("应急储备金");} },
  { value: 'Travel', get label(){return tr("旅行");} },
  { value: 'Renovation', get label(){return tr("装修");} },
  { value: 'Car', get label(){return tr("购车");} },
  { value: 'Home', get label(){return tr("住房");} },
  { value: 'Education', get label(){return tr("教育");} },
  { value: 'Electronics', get label(){return tr("电子产品");} },
  { value: 'Other', get label(){return tr("其他");} },
];
export default function GoalsPage() {
  useLocale();
  const [currency, setCurrency] = useCurrencyState();
  useCopilotPageContext({currency});
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [destinationPage, setDestinationPage] = useState(1);
  const [editing, setEditing] = useState<{
    id?: string;
    version: string;
    key: string;
  }>();
  const [selected, setSelected] = useState<GoalView>();
  const [action, setAction] = useState<'allocate' | 'release' | 'transfer'>(
    'allocate',
  );
  const [preview, setPreview] = useState<{
    body: AllocationInput;
    result: AllocationPreview;
    key: string;
  }>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ signature: string; key: string } | undefined>(
    undefined,
  );
  const [form] = Form.useForm<GoalInput>();
  const [allocation] = Form.useForm<AllocationInput & { toGoalId: string }>();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const hidden = useUI((s) => s.hidden);
  const q = useQuery({
    queryKey: ['savingsGoals', currency, page],
    queryFn: () => goalApi.list(currency, page),
  });
  const destinations = useQuery({
    queryKey: ['savingsGoals', currency, destinationPage, 'transfer'],
    queryFn: () => goalApi.list(currency, destinationPage),
    enabled: !!selected && action === 'transfer',
  });
  const detail = useQuery({
    queryKey: ['goalDetail', selected?.id, historyPage],
    queryFn: () => goalApi.detail(selected!.id, historyPage),
    enabled: !!selected,
  });
  const refresh = async () => {
    await Promise.all(
      [
        'savingsGoals',
        'goalDetail',
        'financialIndicators',
        'financialSummary',
        'cashflow',
      ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
  };
  const edit = (g?: GoalView) => {
    form.resetFields();
    form.setFieldsValue(
      g || {
        name: '',
        type: 'Other',
        target: '',
        currency,
        startDate: dayjs().format('YYYY-MM-DD'),
        targetDate: dayjs().add(1, 'year').format('YYYY-MM-DD'),
        monthlySaving: '0.00',
        priority: 1,
        state: 'Planned',
        note: '',
      },
    );
    setEditing({
      id: g?.id,
      version: g?.version || '0',
      key: crypto.randomUUID(),
    });
  };
  const save = async () => {
    if (!editing || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const body = await form.validateFields();
      await goalApi.save(
        {
          ...body,
          target: decimal(minor(body.target)),
          monthlySaving: decimal(minor(body.monthlySaving)),
        },
        editing.version,
        editing.key,
        editing.id,
      );
      setEditing(undefined);
      await refresh();
      message.success(tr("储蓄目标已保存"));
    } catch (e) {
      if (e && typeof e === 'object' && 'message' in e)
        message.error(String(e.message));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const buildAllocation = async () => {
    const values = await allocation.validateFields();
    const account = detail.data?.accounts.find(
      (a) => a.id === values.accountId,
    );
    if (!account) throw new Error('请重新加载账户');
    return {
      accountId: account.id,
      accountVersion: account.version,
      amount: decimal(minor(values.amount)),
      reason: values.reason,
    };
  };
  const showPreview = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const body = await buildAllocation();
      const result = await goalApi.preview(selected.id, body);
      setPreview({ body, result, key: crypto.randomUUID() });
    } catch (e) {
      message.error(
        e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : tr("预览失败"),
      );
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!selected || !detail.data || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const version = detail.data.goal.version;
      if (action === 'allocate') {
        if (!preview?.result.allowed) return;
        await goalApi.allocate(
          selected.id,
          { ...preview.body, fingerprint: preview.result.fingerprint },
          preview.result.goalVersion,
          preview.key,
          'allocate',
        );
      } else {
        const body = await buildAllocation();
        const signature = JSON.stringify([
          selected.id,
          action,
          version,
          body,
          allocation.getFieldValue('toGoalId'),
        ]);
        if (retry.current?.signature !== signature)
          retry.current = { signature, key: crypto.randomUUID() };
        if (action === 'release')
          await goalApi.allocate(
            selected.id,
            body,
            version,
            retry.current.key,
            'release',
          );
        else {
          const to = destinations.data?.items.find(
            (g) => g.id === allocation.getFieldValue('toGoalId'),
          );
          if (!to) throw new Error('请选择目标，或切换目标分页后重试');
          await goalApi.transfer(
            selected.id,
            { ...body, toGoalId: to.id, toGoalVersion: to.version },
            version,
            retry.current.key,
          );
        }
      }
      setPreview(undefined);
      allocation.resetFields();
      await refresh();
      message.success(tr("资金用途预留已更新，实际余额未改变"));
    } catch (e) {
      message.error(
        e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : tr("操作失败"),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr("储蓄目标")}</PageTitle>
        </div>
        <Space>
          <Select
            aria-label={tr("目标币种")}
            value={currency}
            onChange={(v) => {
              setCurrency(v);
              setPage(1);
            }}
            options={CURRENCY_CODES.map((value) => ({ value }))}
          />
          <Button type="primary" onClick={() => edit()}>
            {tr("创建目标")}</Button>
        </Space>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <Card loading={q.isPending} className="mb16">
            <div className="summary-grid">
              <div>
                {tr("目标总数")}<strong>{q.data?.total || 0}</strong>
              </div>
              <div>
                {tr("进行中")}{q.data?.active || 0} {tr("· 已完成")}{q.data?.completed || 0}
              </div>
              <div>
                {tr("目标额度")}{' '}
                <Money value={q.data?.target || '0.00'} currency={currency} />
              </div>
              <div>
                {tr("已预留")}{' '}
                <Money value={q.data?.reserved || '0.00'} currency={currency} />
              </div>
            </div>
          </Card>
          {q.data?.accounts
            .filter((a) => a.currency === currency && minor(a.shortage) > 0n)
            .map((a) => (
              <Alert
                key={a.id}
                className="mb16"
                type="warning"
                message={
                  <>
                    {a.name} {tr("预留不足")}{' '}
                    <Money value={a.shortage} currency={currency} />
                    {tr("；请释放或调整预留。")}</>
                }
              />
            ))}
          <div className="account-grid">
            {q.data?.items.map((g) => (
              <Card
                key={g.id}
                title={hidden ? tr("储蓄目标") : g.name}
                extra={
                  <Tag>{states.find((s) => s.value === g.state)?.label}</Tag>
                }
              >
                <p>
                  {tr("目标")}<Money value={g.target} currency={currency} /> {tr("· 已预留")}{' '}
                  <Money value={g.allocated} currency={currency} />
                </p>
                <p>
                  {tr("剩余")}<Money value={g.remaining} currency={currency} /> {tr("· 进度")}{' '}
                  {hidden ? '••••' : `${g.progress}%`}
                </p>
                <p>
                  {tr("截止")}{g.targetDate}
                  {g.overdue ? tr(" · 已逾期") : ''}
                </p>
                <p>
                  {tr("建议每月")}{' '}
                  <Money value={g.recommendedMonthly} currency={currency} /> {tr("·\r\n                  预计完成")}{' '}
                  {hidden ? '••••' : g.estimatedCompletion || tr("尚无月储蓄计划")}
                </p>
                <Space>
                  <Button onClick={() => edit(g)}>{tr("编辑")}</Button>
                  <Button
                    onClick={() => {
                      setSelected(g);
                      setHistoryPage(1);
                      allocation.resetFields();
                      setPreview(undefined);
                    }}
                  >
                    {tr("管理预留")}</Button>
                </Space>
              </Card>
            ))}
          </div>
          <Pagination
            current={page}
            pageSize={12}
            total={q.data?.total}
            onChange={setPage}
          />
        </>
      )}
      <Drawer
        rootClassName="planning-drawer"
        title={tr("储蓄目标")}
        width={520}
        open={!!editing}
        onClose={() => !busy && setEditing(undefined)}
        extra={
          <Button loading={busy} onClick={save}>
            {tr("保存目标")}</Button>
        }
      >
        <Form form={form} layout="vertical" disabled={busy}>
          <Form.Item name="name" label={tr("名称")} rules={[{ required: true }]}>
            <Input maxLength={150} />
          </Form.Item>
          <Form.Item name="type" label={tr("类型")}>
            <Select options={types} />
          </Form.Item>
          <Form.Item
            name="target"
            label={tr("目标金额")}
            rules={[{ required: true }]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name="currency" label={tr("币种")}>
            <Select
              options={CURRENCY_CODES.map((value) => ({ value }))}
            />
          </Form.Item>
          <Form.Item
            name="startDate"
            label={tr("开始日期")}
            rules={[{ required: true }]}
          >
            <DateInput type="date" />
          </Form.Item>
          <Form.Item
            name="targetDate"
            label={tr("目标日期")}
            rules={[{ required: true }]}
          >
            <DateInput type="date" />
          </Form.Item>
          <Form.Item
            name="monthlySaving"
            label={tr("每月储蓄计划")}
            rules={[{ required: true }]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name="priority" label={tr("优先级（1最高）")}>
            <InputNumber min={1} max={5} />
          </Form.Item>
          <Form.Item name="state" label={tr("状态")}>
            <Select options={states} />
          </Form.Item>
          <Form.Item name="note" label={tr("备注")}>
            <Input.TextArea maxLength={2000} />
          </Form.Item>
        </Form>
      </Drawer>
      <Drawer
        rootClassName="planning-drawer"
        title={hidden ? tr("管理预留") : selected?.name}
        width={680}
        open={!!selected}
        onClose={() => !busy && setSelected(undefined)}
      >
        {detail.isError && (
          <ErrorState error={detail.error} retry={() => detail.refetch()} />
        )}
        <Form
          form={allocation}
          layout="vertical"
          disabled={busy}
          onValuesChange={() => setPreview(undefined)}
        >
          <Select
            aria-label={tr("预留操作")}
            className="mb16"
            value={action}
            onChange={(v) => {
              setAction(v);
              setPreview(undefined);
            }}
            options={[
              { value: 'allocate', label: tr("增加预留") },
              { value: 'release', label: tr("释放预留") },
              { value: 'transfer', label: tr("转移至另一目标") },
            ]}
          />
          <Form.Item
            name="accountId"
            label={tr("资金账户")}
            rules={[{ required: true }]}
          >
            <Select
              options={detail.data?.accounts
                .filter(
                  (a) =>
                    a.currency === currency &&
                    (action !== 'allocate' ||
                      (a.eligible && a.status === 'Active')),
                )
                .map((a) => ({ value: a.id, label: a.name }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={tr("调整金额")}
            rules={[{ required: true }]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          {action === 'transfer' && (
            <Form.Item
              name="toGoalId"
              label={tr("转入目标")}
              rules={[{ required: true }]}
            >
              <Select
                options={destinations.data?.items
                  .filter(
                    (g) =>
                      g.id !== selected?.id &&
                      ['Planned', 'Active'].includes(g.state),
                  )
                  .map((g) => ({ value: g.id, label: g.name }))}
              />
            </Form.Item>
          )}
          {action === 'transfer' && (
            <Pagination
              size="small"
              current={destinationPage}
              pageSize={12}
              total={destinations.data?.total ?? 0}
              showSizeChanger={false}
              onChange={(next) => {
                setDestinationPage(next);
                allocation.setFieldValue('toGoalId', undefined);
              }}
            />
          )}
          <Form.Item
            name="reason"
            label={tr("调整原因")}
            rules={[{ required: true }]}
          >
            <Input.TextArea maxLength={2000} />
          </Form.Item>
          <Space>
            {action === 'allocate' && (
              <Button loading={busy} onClick={showPreview}>
                {tr("预览分配")}</Button>
            )}
            <Button
              type="primary"
              loading={busy}
              disabled={
                (action === 'allocate' && !preview?.result.allowed) ||
                !detail.data
              }
              onClick={execute}
            >
              {tr("确认调整")}</Button>
          </Space>
        </Form>
        {preview && (
          <Alert
            className="mb16"
            type={preview.result.allowed ? 'info' : 'warning'}
            message={
              <>
                <p>
                  {tr("可分配")}{' '}
                  <Money value={preview.result.available} currency={currency} />{' '}
                  {tr("· 账户余额")}{' '}
                  <Money value={preview.result.balance} currency={currency} />
                </p>
                <p>
                  {preview.result.allowed
                    ? tr("允许分配")
                    : tr("账户可用余额、币种或目标状态不满足条件")}
                </p>
                {preview.result.scope}
              </>
            }
          />
        )}
        <Table
          scroll={{ x: 'max-content' }}
          className="mb16"
          rowKey="id"
          dataSource={detail.data?.allocations}
          pagination={false}
          columns={[
            {
              title: tr("账户"),
              render: (_, r) =>
                detail.data?.accounts.find((a) => a.id === r.accountId)?.name,
            },
            {
              title: tr("预留"),
              dataIndex: 'amount',
              render: (v) => <Money value={v} currency={currency} />,
            },
          ]}
        />
        <Table
          rowKey="id"
          scroll={{ x: 500 }}
          dataSource={detail.data?.history.items}
          pagination={{
            current: historyPage,
            pageSize: 10,
            total: detail.data?.history.total,
            onChange: setHistoryPage,
          }}
          columns={[
            {
              title: tr("时间"),
              dataIndex: 'createdAt',
              render: (v) => new Date(v).toLocaleString(),
            },
            { title: tr("操作"), dataIndex: 'action', render: planningLabel },
            {
              title: tr("之前"),
              dataIndex: 'before',
              render: (v) => <Money value={v} currency={currency} />,
            },
            {
              title: tr("之后"),
              dataIndex: 'after',
              render: (v) => <Money value={v} currency={currency} />,
            },
            {
              title: tr("原因"),
              dataIndex: 'reason',
              render: (v) => (hidden ? '••••' : v),
            },
          ]}
        />
        <Card title={tr("目标变更历史")}>
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="id"
            dataSource={detail.data?.changes.items}
            pagination={{
              current: historyPage,
              pageSize: 10,
              total: detail.data?.changes.total,
              onChange: setHistoryPage,
            }}
            columns={[
              {
                title: tr("时间"),
                dataIndex: 'createdAt',
                render: (v) => new Date(v).toLocaleString(),
              },
              { title: tr("操作"), dataIndex: 'action', render: planningLabel },
              {
                title: tr("变化"),
                dataIndex: 'changesJson',
                render: (v) =>
                  hidden
                    ? '••••'
                    : JSON.parse(v)
                        .map(
                          (c: {
                            field: string;
                            before: string | null;
                            after: string | null;
                          }) =>
                            `${c.field}: ${c.before || '—'} → ${c.after || '—'}`,
                        )
                        .join('；'),
              },
            ]}
          />
        </Card>
      </Drawer>
    </>
  );
}
