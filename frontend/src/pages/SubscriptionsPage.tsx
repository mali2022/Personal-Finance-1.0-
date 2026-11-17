import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { localizedLabels } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useRef, useState } from 'react';
import { App, Button, Drawer, Form, Input, InputNumber, Space, Switch, Table, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { accountApi } from '../api/finance';
import { planningApi } from '../api/planning';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import { formatDate, minor } from '../utils/finance';
import {
  frequencyLabels,
  type Frequency,
  type Subscription,
  type SubscriptionInput,
} from '../features/planning/types';
interface SubscriptionForm {
  name: string;
  provider: string;
  amount: string;
  accountId: string;
  categoryId: string;
  frequency: Frequency;
  interval: number;
  start: Dayjs;
  end?: Dayjs;
  effective?: Dayjs;
  autoRenew: boolean;
  state: string;
  reminderDays: number;
  note: string;
}
const states: Record<string, string> = localizedLabels({
  Active: '活跃',
  Paused: '暂停',
  CancelledUntilEnd: '已取消 · 服务未到期',
  Ended: '已结束',
});
export default function SubscriptionsPage() {
  useLocale();
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription>();
  const [history, setHistory] = useState<Subscription>();
  const [form] = Form.useForm<SubscriptionForm>();
  const key = useRef(crypto.randomUUID());
  const dirty = useRef(false);
  const q = useQuery({
    queryKey: ['subscriptions', page],
    queryFn: () => planningApi.subscriptions(page),
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const save = useMutation({
    mutationFn: (v: SubscriptionForm) => {
      const currency = accounts.data?.find(
        (a) => a.id === v.accountId,
      )?.currency;
      if (!currency) throw new Error('请选择有效账户');
      const b: SubscriptionInput = {
        name: v.name,
        provider: v.provider || '',
        autoRenew: v.autoRenew,
        state: v.state,
        note: v.note || '',
        serviceEndsAt: v.end?.toISOString(),
        priceEffectiveAt: v.effective?.toISOString(),
        rule: {
          name: v.name,
          currency,
          transaction: {
            ...editing?.rule.transaction,
            type: 'Expense',
            accountId: v.accountId,
            categoryId: v.categoryId,
            amount: v.amount,
            occurredAt: v.start.toISOString(),
            note: v.note || '',
            merchant: v.provider,
            fee: '0',
            tagIds: editing?.rule.transaction.tagIds || [],
            splits: editing?.rule.transaction.splits || [],
          },
          startLocal: v.start.format('YYYY-MM-DDTHH:mm:ss'),
          frequency: v.frequency,
          interval: v.interval,
          timeZone: editing?.rule.timeZone || 'Asia/Shanghai',
          monthEndPolicy: editing?.rule.monthEndPolicy || 'Clamp',
          reminderDays: v.reminderDays,
          state: 'Active',
        },
      };
      return planningApi.saveSubscription(b, key.current, editing);
    },
    onSuccess: () => {
      setOpen(false);
      for (const k of [
        'subscriptions',
        'recurringRules',
        'planningSummary',
        'calendarEvents',
      ])
        void cache.invalidateQueries({ queryKey: [k] });
      void message.success(tr("订阅已保存，价格历史和待确认实例已保留"));
    },
    onError: (e: Error) => message.error(e.message),
  });
  const edit = (s?: Subscription) => {
    dirty.current = false;
    setEditing(s);
    key.current = crypto.randomUUID();
    form.resetFields();
    form.setFieldsValue(
      s
        ? {
            name: s.name,
            provider: s.provider,
            amount: s.rule.transaction.amount,
            accountId: s.rule.transaction.accountId,
            categoryId: s.rule.transaction.categoryId,
            frequency: s.rule.frequency,
            interval: s.rule.interval,
            start: dayjs(s.rule.startLocal),
            end: s.serviceEndsAt ? dayjs(s.serviceEndsAt) : undefined,
            autoRenew: s.autoRenew,
            state: s.state,
            reminderDays: s.rule.reminderDays,
            note: s.note,
          }
        : {
            frequency: 'Month',
            interval: 1,
            start: dayjs(),
            autoRenew: true,
            state: 'Active',
            reminderDays: 3,
          },
    );
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
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr("订阅管理")}</PageTitle>
        </div>
        <Button type="primary" onClick={() => edit()}>
          {tr("新增订阅")}</Button>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Table<Subscription>
          rowKey="id"
          dataSource={q.data?.items}
          loading={q.isPending}
          scroll={{ x: 850 }}
          locale={{ emptyText: tr("暂无订阅，添加你实际使用的服务") }}
          pagination={{
            current: page,
            pageSize: 20,
            total: q.data?.total,
            onChange: setPage,
            showSizeChanger: false,
          }}
          columns={[
            {
              title: tr("名称 / 服务商"),
              render: (_, s) => (
                <>
                  <Sensitive>{s.name}</Sensitive>
                  <br />
                  {s.provider}
                </>
              ),
            },
            {
              title: tr("下次费用"),
              render: (_, s) => (
                <Money
                  value={
                    s.prices
                      .filter(
                        (p) =>
                          !s.rule.nextAt ||
                          dayjs(p.effectiveAt).isBefore(
                            dayjs(s.rule.nextAt).add(1, 'ms'),
                          ),
                      )
                      .sort((a, b) =>
                        b.effectiveAt.localeCompare(a.effectiveAt),
                      )[0]?.amount || s.rule.transaction.amount
                  }
                  currency={s.rule.currency}
                />
              ),
            },
            {
              title: tr("周期"),
              render: (_, s) =>
                `${frequencyLabels[s.rule.frequency]} × ${s.rule.interval}`,
            },
            {
              title: tr("下次续费"),
              render: (_, s) =>
                s.autoRenew && s.state === 'Active' && s.rule.nextAt
                  ? formatDate(s.rule.nextAt, true, true)
                  : '不续费 / 已暂停',
            },
            {
              title: tr("状态"),
              render: (_, s) => (
                <Tag>
                  {states[s.state]} · {s.autoRenew ? tr("自动续费") : tr("不自动续费")}
                </Tag>
              ),
            },
            {
              title: tr("操作"),
              render: (_, s) => (
                <Space>
                  <Button onClick={() => setHistory(s)}>{tr("价格历史")}</Button>
                  {!['CancelledUntilEnd', 'Ended'].includes(s.state) && (
                    <Button onClick={() => edit(s)}>{tr("编辑")}</Button>
                  )}
                </Space>
              ),
            },
          ]}
        />
      )}
      <Drawer
        title={editing ? tr("修改订阅") : tr("新增订阅")}
        width="min(520px, 100vw)"
        open={open}
        onClose={close}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => save.mutate({ ...form.getFieldsValue(true), ...v })}
          onValuesChange={() => {
            dirty.current = true;
          }}
          disabled={save.isPending}
        >
          {save.isError && <ErrorState error={save.error} />}
          <Form.Item
            name="name"
            label={tr("订阅名称")}
            rules={[{ required: true, max: 150 }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="provider" label={tr("服务商")} rules={[{ max: 150 }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="amount"
            label={tr("每期费用")}
            rules={[
              {
                validator: async (_, v: string) => {
                  if (!v || minor(v) <= 0n)
                    throw new Error('请输入大于零的金额，最多两位小数');
                },
              },
            ]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item
            name="accountId"
            label={tr("付款账户")}
            rules={[{ required: true }]}
          >
            <AccountSelector />
          </Form.Item>
          <Form.Item
            name="categoryId"
            label={tr("二级或三级分类")}
            rules={[{ required: true }]}
          >
            <CategorySelector kind="Expense" />
          </Form.Item>
          <Form.Item
            name="frequency"
            label={tr("计费周期")}
            rules={[{ required: true }]}
          >
            <Select
              disabled={!!editing}
              options={Object.entries(frequencyLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
          <Form.Item
            name="interval"
            label={tr("周期间隔")}
            rules={[{ required: true }]}
          >
            <InputNumber disabled={!!editing} min={1} max={366} precision={0} />
          </Form.Item>
          <Form.Item
            name="start"
            label={tr("开始日期时间（Asia/Shanghai，已有计划保持原时区）")}
            rules={[{ required: true }]}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              disabled={!!editing}
            />
          </Form.Item>
          {editing && (
            <Form.Item name="effective" label={tr("新价格生效时间（留空立即生效）")}>
              <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
            </Form.Item>
          )}
          <Form.Item name="autoRenew" label={tr("自动续费")} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="state" label={tr("订阅状态")}>
            <Select
              options={Object.entries(states)
                .filter(
                  ([value]) => editing || ['Active', 'Paused'].includes(value),
                )
                .map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="end" label={tr("服务到期时间")}>
            <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
          </Form.Item>
          <Form.Item name="reminderDays" label={tr("提前提醒天数")}>
            <InputNumber min={0} max={90} precision={0} />
          </Form.Item>
          <Form.Item name="note" label={tr("备注")} rules={[{ max: 2000 }]}>
            <Input.TextArea />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {tr("保存订阅")}</Button>
        </Form>
      </Drawer>
      <Drawer
        title={tr("费用变更历史")}
        open={!!history}
        onClose={() => setHistory(undefined)}
        width="min(520px, 100vw)"
      >
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={history?.prices}
          pagination={false}
          columns={[
            {
              title: tr("生效时间"),
              render: (_, p) => formatDate(p.effectiveAt, true, true),
            },
            {
              title: tr("费用"),
              render: (_, p) => (
                <Money value={p.amount} currency={p.currency} />
              ),
            },
          ]}
        />
      </Drawer>
    </>
  );
}
