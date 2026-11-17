import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useRef, useState } from 'react';
import { App, Button, Collapse, Drawer, Form, Input, InputNumber, Space, Table, Tabs, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { planningApi } from '../api/planning';
import { accountApi, categoryApi, transactionApi } from '../api/finance';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { minor, formatDate } from '../utils/finance';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
import { PlanningDirectorySelector } from '../features/planning/DirectorySelector';
import { Link } from 'react-router-dom';
import {
  frequencyLabels,
  planningLabels,
  type Execution,
  type Frequency,
  type Occurrence,
  type RecurringInput,
  type RecurringRule,
} from '../features/planning/types';

interface RuleForm {
  name: string;
  type: 'Expense' | 'Income' | 'Transfer';
  amount: string;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  fee?: string;
  feeCategoryId?: string;
  receivedAmount?: string;
  exchangeRate?: string;
  merchant?: string;
  note?: string;
  detailedNote?: string;
  projectId?: string;
  tagIds?: string[];
  start: Dayjs;
  end?: Dayjs;
  frequency: Frequency;
  interval: number;
  timeZone: string;
  monthEndPolicy: 'Clamp' | 'Skip';
  reminderDays: number;
  state: 'Active' | 'Draft' | 'Paused';
}
export default function RecurringPage() {
  useLocale();
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [occPage, setOccPage] = useState(1);
  const [state, setState] = useState<string>();
  const [editing, setEditing] = useState<RecurringRule>();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<RecurringRule>();
  const [historyPage, setHistoryPage] = useState(1);
  const [transactionId, setTransactionId] = useState<string>();
  const [form] = Form.useForm<RuleForm>();
  const type = Form.useWatch('type', form);
  const accountId = Form.useWatch('accountId', form);
  const targetId = Form.useWatch('toAccountId', form);
  const submitKey = useRef(crypto.randomUUID());
  const dirty = useRef(false);
  const q = useQuery({
    queryKey: ['recurringRules', page],
    queryFn: () => planningApi.rules(page),
  });
  const oq = useQuery({
    queryKey: ['recurringOccurrences', occPage, state],
    queryFn: () => planningApi.occurrences(occPage, state),
    refetchInterval: 60000,
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const categoryName = (id?: string) =>
    categories.data?.find((c) => c.id === id)?.name || '—';
  const historyQuery = useQuery({
    queryKey: ['recurringHistory', history?.id, historyPage],
    queryFn: () => planningApi.history(history!.id, historyPage),
    enabled: !!history,
  });
  const crossCurrency =
    accounts.data?.find((a) => a.id === accountId)?.currency !==
      accounts.data?.find((a) => a.id === targetId)?.currency && !!targetId;
  const refresh = () => {
    for (const key of [
      'recurringRules',
      'recurringOccurrences',
      'recurringHistory',
      'accounts',
      'dashboard',
      'transactions',
      'reports',
      'budget',
      'planningSummary',
      'calendarEvents',
    ])
      void cache.invalidateQueries({ queryKey: [key] });
  };
  const save = useMutation({
    mutationFn: (v: RuleForm) => {
      const currency = accounts.data?.find(
        (a) => a.id === v.accountId,
      )?.currency;
      if (!currency) throw new Error('请选择有效账户');
      const body: RecurringInput = {
        name: v.name,
        currency,
        startLocal: v.start.format('YYYY-MM-DDTHH:mm:ss'),
        endLocal: v.end?.format('YYYY-MM-DDTHH:mm:ss'),
        frequency: v.frequency,
        interval: v.interval,
        timeZone: v.timeZone,
        monthEndPolicy: v.monthEndPolicy,
        reminderDays: v.reminderDays,
        state: v.state,
        detailedNote: v.detailedNote || '',
        transaction: {
          type: v.type,
          amount: v.amount,
          accountId: v.accountId,
          toAccountId: v.type === 'Transfer' ? v.toAccountId : undefined,
          categoryId: v.type === 'Transfer' ? undefined : v.categoryId,
          occurredAt: v.start.toISOString(),
          note: v.note || '',
          merchant: v.merchant,
          fee: v.type === 'Transfer' ? v.fee || '0' : '0',
          feeCategoryId: v.feeCategoryId,
          receivedAmount: crossCurrency ? v.receivedAmount : undefined,
          exchangeRate: crossCurrency ? v.exchangeRate : undefined,
          tagIds: v.tagIds || [],
          projectId: v.projectId,
          splits: editing?.transaction.splits || [],
        },
      };
      return planningApi.saveRule(body, submitKey.current, editing);
    },
    onSuccess: () => {
      setOpen(false);
      refresh();
      void message.success(tr("周期规则已保存，不会立即过账"));
    },
    onError: (e: Error) => message.error(e.message),
  });
  const action = useMutation({
    mutationFn: async (input: {
      occurrence?: Occurrence;
      rule?: RecurringRule;
      action: string;
      key: string;
    }) => {
      if (input.rule)
        return planningApi.ruleAction(input.rule, input.action, input.key);
      const occurrence = input.occurrence!;
      let transactionVersion: string | undefined;
      if (['Revoke', 'Restore'].includes(input.action))
        transactionVersion = (
          await transactionApi.detail(occurrence.transactionId!)
        ).version;
      return planningApi.occurrenceAction(
        occurrence,
        input.action,
        input.key,
        transactionVersion,
      );
    },
    onSuccess: () => {
      refresh();
      void message.success(tr("操作成功"));
    },
    onError: (e: Error) => {
      refresh();
      void message.error(e.message);
    },
  });
  const generate = useMutation({
    mutationFn: planningApi.generate,
    onSuccess: () => {
      refresh();
      void message.success(tr("到期规则已检查，余额不变"));
    },
    onError: (e: Error) => message.error(e.message),
  });
  const busy = action.isPending || generate.isPending || save.isPending;
  const ask = (
    item: Occurrence | RecurringRule,
    kind: string,
    isRule = false,
  ) => {
    const key = crypto.randomUUID();
    modal.confirm({
      title: planningLabels[kind] || kind,
      content:
        kind === 'Confirm' ? (
          <>
            <p>{tr("将创建实际交易，并影响余额与统计；保存时重新验证业务约束。")}</p>
            <p>
              {tr("账户：")}{accounts.data?.find(
                (a) => a.id === (item as Occurrence).transaction.accountId,
              )?.name || '—'}
              {(item as Occurrence).transaction.toAccountId && (
                <>
                  {' '}
                  →{' '}
                  {accounts.data?.find(
                    (a) =>
                      a.id === (item as Occurrence).transaction.toAccountId,
                  )?.name || '—'}
                </>
              )}
            </p>
            <p>
              {tr("金额：")}<Money
                value={(item as Occurrence).amount}
                currency={(item as Occurrence).currency}
              />
            </p>
            <p>
              {tr("分类：")}{categoryName((item as Occurrence).transaction.categoryId)}
            </p>
            <p>
              {tr("时间：")}{formatDate((item as Occurrence).scheduledAt, true, true)}
            </p>
            <p>{tr("备注：")}{(item as Occurrence).transaction.note || '—'}</p>
            {(item as Occurrence).transaction.splits?.map((s, i) => (
              <p key={i}>
                {categoryName(s.categoryId)} ·{' '}
                <Money
                  value={s.amount}
                  currency={(item as Occurrence).currency}
                />
              </p>
            ))}
          </>
        ) : ['Revoke', 'Restore'].includes(kind) ? (
          '将通过原交易的撤销/恢复机制影响余额与统计；存在退款等依赖时可能拒绝。'
        ) : (
          '此操作保留历史。暂停仅停止生成新实例；取消规则会取消其未过账实例。'
        ),
      onOk: () =>
        action.mutateAsync({
          ...(isRule
            ? { rule: item as RecurringRule }
            : { occurrence: item as Occurrence }),
          action: kind,
          key,
        }),
    });
  };
  const edit = (r?: RecurringRule) => {
    dirty.current = false;
    setEditing(r);
    submitKey.current = crypto.randomUUID();
    form.resetFields();
    if (r)
      form.setFieldsValue({
        name: r.name,
        detailedNote: r.detailedNote,
        ...r.transaction,
        type: r.transaction.type as RuleForm['type'],
        start: dayjs(r.startLocal),
        end: r.endLocal ? dayjs(r.endLocal) : undefined,
        frequency: r.frequency,
        interval: r.interval,
        timeZone: r.timeZone,
        monthEndPolicy: r.monthEndPolicy,
        reminderDays: r.reminderDays,
        state: r.state as RuleForm['state'],
      });
    else
      form.setFieldsValue({
        type: 'Expense',
        start: dayjs(),
        frequency: 'Month',
        interval: 1,
        timeZone: 'Asia/Shanghai',
        monthEndPolicy: 'Clamp',
        reminderDays: 3,
        state: 'Active',
        fee: '0',
      });
    setOpen(true);
  };
  const close = () => {
    if (save.isPending) return;
    if (dirty.current)
      modal.confirm({
        title: tr("放弃未保存的修改？"),
        onOk: () => setOpen(false),
      });
    else setOpen(false);
  };
  const amountRule = {
    validator: async (_: unknown, v: string) => {
      if (!v || minor(v) <= 0n) throw new Error('金额必须大于零，最多两位小数');
    },
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr("周期交易")}</PageTitle>
        </div>
        <Space wrap>
          <Button
            disabled={busy}
            loading={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {tr("检查到期规则")}</Button>
          <Button type="primary" onClick={() => edit()}>
            {tr("新增周期规则")}</Button>
        </Space>
      </div>
      <Tabs
        items={[
          {
            key: 'rules',
            label: tr("周期规则"),
            children: q.isError ? (
              <ErrorState error={q.error} retry={() => q.refetch()} />
            ) : (
              <Table<RecurringRule>
                rowKey="id"
                loading={q.isPending}
                dataSource={q.data?.items}
                scroll={{ x: 900 }}
                locale={{ emptyText: tr("暂无周期规则，创建你的第一项固定计划") }}
                pagination={{
                  current: page,
                  total: q.data?.total,
                  pageSize: 20,
                  onChange: setPage,
                  showSizeChanger: false,
                }}
                columns={[
                  {
                    title: tr("名称"),
                    dataIndex: 'name',
                    render: (value: unknown) => (
                      <Sensitive>
                        {value == null ? '—' : String(value)}
                      </Sensitive>
                    ),
                  },
                  {
                    title: tr("金额"),
                    render: (_, r) => (
                      <Money
                        value={r.transaction.amount}
                        currency={r.currency}
                        type={r.transaction.type}
                      />
                    ),
                  },
                  {
                    title: tr("周期"),
                    render: (_, r) =>
                      `${frequencyLabels[r.frequency]} × ${r.interval}`,
                  },
                  {
                    title: tr("下次执行"),
                    render: (_, r) =>
                      r.nextAt ? formatDate(r.nextAt, true, true) : '—',
                  },
                  {
                    title: tr("状态"),
                    render: (_, r) => <Tag>{planningLabels[r.state]}</Tag>,
                  },
                  {
                    title: tr("操作"),
                    render: (_, r) => (
                      <Space wrap>
                        <Button
                          onClick={() => {
                            setHistory(r);
                            setHistoryPage(1);
                          }}
                        >
                          {tr("历史")}</Button>
                        {r.source === 'Subscription' && (
                          <Link to="/subscriptions">{tr("管理订阅")}</Link>
                        )}
                        {r.source !== 'Subscription' &&
                          !['Cancelled', 'Ended'].includes(r.state) && (
                            <>
                              <Button disabled={busy} onClick={() => edit(r)}>
                                {tr("编辑")}</Button>
                              <Button
                                disabled={busy}
                                onClick={() =>
                                  ask(
                                    r,
                                    r.state === 'Active' ? 'Pause' : 'Resume',
                                    true,
                                  )
                                }
                              >
                                {r.state === 'Active' ? tr("暂停") : tr("启用")}
                              </Button>
                              <Button
                                disabled={busy}
                                danger
                                onClick={() => ask(r, 'Cancel', true)}
                              >
                                {tr("取消")}</Button>
                            </>
                          )}
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'occurrences',
            label: tr("待确认与执行实例"),
            children: (
              <>
                <Select
                  className="mb16"
                  aria-label={tr("实例状态")}
                  allowClear
                  placeholder={tr("全部状态")}
                  value={state}
                  onChange={(v) => {
                    setState(v);
                    setOccPage(1);
                  }}
                  options={[
                    'Pending',
                    'Failed',
                    'Posted',
                    'Skipped',
                    'Cancelled',
                    'Revoked',
                  ].map((value) => ({ value, label: planningLabels[value] }))}
                />
                {oq.isError ? (
                  <ErrorState error={oq.error} retry={() => oq.refetch()} />
                ) : (
                  <Table<Occurrence>
                    rowKey="id"
                    loading={oq.isPending}
                    dataSource={oq.data?.items}
                    scroll={{ x: 900 }}
                    locale={{
                      emptyText: tr("暂无执行实例；未来计划不会提前生成实际交易"),
                    }}
                    pagination={{
                      current: occPage,
                      pageSize: 20,
                      total: oq.data?.total,
                      onChange: setOccPage,
                      showSizeChanger: false,
                    }}
                    columns={[
                      {
                        title: tr("计划时间"),
                        render: (_, o) => formatDate(o.scheduledAt, true, true),
                      },
                      {
                        title: tr("金额"),
                        render: (_, o) => (
                          <Money
                            value={o.amount}
                            currency={o.currency}
                            type={o.transaction.type}
                          />
                        ),
                      },
                      {
                        title: tr("对象"),
                        render: (_, o) => o.transaction.merchant || '—',
                      },
                      {
                        title: tr("账户"),
                        render: (_, o) =>
                          accounts.data?.find(
                            (a) => a.id === o.transaction.accountId,
                          )?.name || '—',
                      },
                      {
                        title: tr("分类"),
                        render: (_, o) =>
                          o.transaction.type === 'Transfer'
                            ? '转账本金不计收支'
                            : categoryName(o.transaction.categoryId),
                      },
                      {
                        title: tr("状态"),
                        render: (_, o) => <Tag>{planningLabels[o.state]}</Tag>,
                      },
                      {
                        title: tr("操作"),
                        render: (_, o) => (
                          <Space wrap>
                            {o.transactionId && (
                              <Button
                                onClick={() =>
                                  setTransactionId(o.transactionId)
                                }
                              >
                                {tr("关联交易")}</Button>
                            )}
                            {(o.state === 'Pending' ||
                              o.state === 'Failed') && (
                              <>
                                <Button
                                  type="primary"
                                  disabled={busy}
                                  onClick={() => ask(o, 'Confirm')}
                                >
                                  {tr("确认过账")}</Button>
                                <Button
                                  disabled={busy}
                                  onClick={() => ask(o, 'Skip')}
                                >
                                  {tr("跳过")}</Button>
                                <Button
                                  disabled={busy}
                                  onClick={() => ask(o, 'Cancel')}
                                >
                                  {tr("取消")}</Button>
                              </>
                            )}
                            {o.state === 'Posted' && (
                              <Button
                                danger
                                disabled={busy}
                                onClick={() => ask(o, 'Revoke')}
                              >
                                {tr("撤销")}</Button>
                            )}
                            {o.state === 'Revoked' && (
                              <Button
                                disabled={busy}
                                onClick={() => ask(o, 'Restore')}
                              >
                                {tr("恢复原交易")}</Button>
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </>
            ),
          },
        ]}
      />
      <Drawer
        title={editing ? tr("编辑周期规则") : tr("新增周期规则")}
        open={open}
        onClose={close}
        width="min(540px, 100vw)"
        destroyOnHidden
      >
        {save.isError && <ErrorState error={save.error} />}
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => save.mutate({ ...form.getFieldsValue(true), ...v })}
          onValuesChange={() => {
            dirty.current = true;
          }}
          disabled={save.isPending}
        >
          <Form.Item
            name="name"
            label={tr("名称")}
            rules={[{ required: true, max: 150 }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="type" label={tr("交易类型")} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'Expense', label: tr("支出") },
                { value: 'Income', label: tr("收入") },
                { value: 'Transfer', label: tr("转账") },
              ]}
            />
          </Form.Item>
          <Form.Item name="amount" label={tr("金额")} rules={[amountRule]}>
            <Input inputMode="decimal" size="large" />
          </Form.Item>
          <Form.Item
            name="accountId"
            label={tr("来源账户")}
            rules={[{ required: true }]}
          >
            <AccountSelector />
          </Form.Item>
          {type === 'Transfer' ? (
            <>
              <Form.Item
                name="toAccountId"
                label={tr("转入账户")}
                dependencies={['accountId']}
                rules={[
                  { required: true },
                  {
                    validator: async (_, v) => {
                      if (v === form.getFieldValue('accountId'))
                        throw new Error('转出与转入账户不能相同');
                    },
                  },
                ]}
              >
                <AccountSelector exclude={accountId} />
              </Form.Item>
              {crossCurrency && (
                <>
                  <Form.Item
                    name="receivedAmount"
                    label={tr("实际转入金额")}
                    rules={[amountRule]}
                  >
                    <Input inputMode="decimal" />
                  </Form.Item>
                  <Form.Item
                    name="exchangeRate"
                    label={tr("明确约定汇率")}
                    rules={[{ required: true }]}
                  >
                    <Input inputMode="decimal" />
                  </Form.Item>
                </>
              )}
              <Form.Item name="fee" label={tr("手续费")}>
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item name="feeCategoryId" label={tr("手续费分类")}>
                <CategorySelector kind="Expense" />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="categoryId"
              label={tr("二级或三级分类")}
              rules={[{ required: true }]}
            >
              <CategorySelector
                kind={type === 'Income' ? 'Income' : 'Expense'}
              />
            </Form.Item>
          )}
          <Form.Item name="merchant" label={tr("商户 / 对象")}>
            <Input />
          </Form.Item>
          <Form.Item name="note" label={tr("备注")}>
            <Input.TextArea />
          </Form.Item>
          <Collapse
            items={[
              {
                key: 'metadata',
                label: tr("项目、标签与详细备注"),
                children: (
                  <>
                    <Form.Item name="projectId" label={tr("项目")}>
                      <PlanningDirectorySelector kind="projects" />
                    </Form.Item>
                    <Form.Item name="tagIds" label={tr("标签")}>
                      <PlanningDirectorySelector kind="tags" multiple />
                    </Form.Item>
                    <Form.Item
                      name="detailedNote"
                      label={tr("详细备注（计划说明，不写入交易金额）")}
                      rules={[{ max: 4000 }]}
                    >
                      <Input.TextArea rows={4} />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
          <Form.Item
            name="start"
            label={tr("开始日期时间（所选时区）")}
            rules={[{ required: true }]}
          >
            <DatePicker
              disabled={!!editing}
              showTime
              format="YYYY-MM-DD HH:mm:ss"
            />
          </Form.Item>
          <Form.Item name="frequency" label={tr("周期")} rules={[{ required: true }]}>
            <Select
              disabled={!!editing}
              options={Object.entries(frequencyLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
          <Form.Item
            name="interval"
            label={tr("间隔倍数 / 自定义天数")}
            rules={[{ required: true }]}
          >
            <InputNumber disabled={!!editing} min={1} max={366} precision={0} />
          </Form.Item>
          <Collapse
            items={[
              {
                key: 'advanced',
                label: tr("更多计划选项"),
                children: (
                  <>
                    <Form.Item
                      name="timeZone"
                      label={tr("时区")}
                      rules={[{ required: true }]}
                    >
                      <Select
                        disabled={!!editing}
                        showSearch
                        options={[
                          'Asia/Shanghai',
                          'Asia/Hong_Kong',
                          'America/New_York',
                          'Europe/London',
                          'UTC',
                        ].map((value) => ({ value, label: value }))}
                      />
                    </Form.Item>
                    <Form.Item name="monthEndPolicy" label={tr("缺少锚点日期时")}>
                      <Select
                        disabled={!!editing}
                        options={[
                          { value: 'Clamp', label: tr("月底执行") },
                          { value: 'Skip', label: tr("跳过该期") },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="end" label={tr("结束日期时间")}>
                      <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
                    </Form.Item>
                    <Form.Item name="reminderDays" label={tr("提前提醒天数")}>
                      <InputNumber min={0} max={90} precision={0} />
                    </Form.Item>
                    <Form.Item name="state" label={tr("状态")}>
                      <Select
                        options={['Active', 'Draft', 'Paused'].map((value) => ({
                          value,
                          label: planningLabels[value],
                        }))}
                      />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
          <Button
            className="mt20"
            type="primary"
            htmlType="submit"
            loading={save.isPending}
          >
            {tr("保存规则")}</Button>
        </Form>
      </Drawer>
      <Drawer
        title={history?.name + ' · 执行历史'}
        open={!!history}
        onClose={() => setHistory(undefined)}
        width="min(700px, 100vw)"
      >
        {historyQuery.isError ? (
          <ErrorState
            error={historyQuery.error}
            retry={() => historyQuery.refetch()}
          />
        ) : (
          <Table<Execution>
            scroll={{ x: 'max-content' }}
            rowKey="id"
            dataSource={historyQuery.data?.items}
            loading={historyQuery.isPending}
            pagination={{
              current: historyPage,
              pageSize: 20,
              total: historyQuery.data?.total,
              onChange: setHistoryPage,
              showSizeChanger: false,
            }}
            columns={[
              {
                title: tr("时间"),
                render: (_, e) => formatDate(e.createdAt, true, true),
              },
              {
                title: tr("操作"),
                render: (_, e) => planningLabels[e.action] || e.action,
              },
              {
                title: tr("来源"),
                render: (_, e) => planningLabels[e.source] || e.source,
              },
              {
                title: tr("说明"),
                dataIndex: 'message',
                render: (value: unknown) => (
                  <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
                ),
              },
            ]}
          />
        )}
      </Drawer>
      <TransactionDrawer
        id={transactionId}
        onClose={() => setTransactionId(undefined)}
      />
    </>
  );
}
