import { CURRENCY_CODES } from '../constants/currencies';
import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { localizedLabels } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useRef, useState } from 'react';
import { App, Alert, Button, Drawer, Form, Input, InputNumber, Switch, Table, Tabs, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { planningApi } from '../api/planning';
import { ErrorState } from '../components/Feedback';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import { PlanningDirectorySelector } from '../features/planning/DirectorySelector';
import { Money } from '../components/Money';
import { formatDate } from '../utils/finance';
import type {
  AutomationInput,
  AutomationPreview,
  AutomationRule,
  Occurrence,
} from '../features/planning/types';
const fields: Record<string, string> = localizedLabels({
  categoryId: '分类',
  merchant: '商户',
  tagIds: '标签',
  projectId: '项目',
  note: '备注',
});
interface RuleForm extends AutomationInput {
  range?: [Dayjs, Dayjs];
}
export default function AutomationPage() {
  useLocale();
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [occPage, setOccPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const [preview, setPreview] = useState<AutomationPreview>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule>();
  const [form] = Form.useForm<RuleForm>();
  const key = useRef(crypto.randomUUID());
  const dirty = useRef(false);
  const conditionType = Form.useWatch(['conditions', 'type'], form);
  const q = useQuery({
    queryKey: ['automationRules', page],
    queryFn: () => planningApi.automations(page),
  });
  const oq = useQuery({
    queryKey: ['recurringOccurrences', occPage, 'Pending'],
    queryFn: () => planningApi.occurrences(occPage, 'Pending'),
  });
  const logs = useQuery({
    queryKey: ['automationHistory', historyPage],
    queryFn: () => planningApi.automationHistory(historyPage),
  });
  const refresh = () => {
    for (const k of [
      'automationRules',
      'automationHistory',
      'recurringOccurrences',
      'calendarEvents',
    ])
      void cache.invalidateQueries({ queryKey: [k] });
  };
  const save = useMutation({
    mutationFn: (v: RuleForm) =>
      planningApi.saveAutomation(
        {
          name: v.name,
          priority: v.priority,
          state: v.state,
          previewOnly: v.previewOnly,
          conditions: {
            ...v.conditions,
            source: v.conditions.source,
            start: v.range?.[0].toISOString(),
            end: v.range?.[1].toISOString(),
          },
          actions: v.actions,
        },
        key.current,
        editing,
      ),
    onSuccess: () => {
      setOpen(false);
      refresh();
      void message.success(tr("规则已保存，不会修改已确认交易"));
    },
    onError: (e: Error) => message.error(e.message),
  });
  const suggest = useMutation({
    mutationFn: () => planningApi.previewAutomation(selection),
    onSuccess: setPreview,
    onError: (e: Error) => message.error(e.message),
  });
  const apply = useMutation({
    mutationFn: (token: string) =>
      planningApi.applyAutomation(selection, token, key.current),
    onSuccess: (r) => {
      setPreview(undefined);
      setSelection([]);
      refresh();
      void message.success(tr("已整理 {0} 笔，未创建实际交易", r.changed));
    },
    onError: (e: Error) => {
      setPreview(undefined);
      refresh();
      void message.error(e.message);
    },
  });
  const edit = (r?: AutomationRule) => {
    dirty.current = false;
    setEditing(r);
    key.current = crypto.randomUUID();
    form.resetFields();
    form.setFieldsValue(
      r
        ? {
            ...r,
            range:
              r.conditions.start && r.conditions.end
                ? [dayjs(r.conditions.start), dayjs(r.conditions.end)]
                : undefined,
          }
        : {
            priority: 100,
            state: 'Active',
            previewOnly: true,
            conditions: { source: 'Recurring' },
            actions: {},
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
  const labels = (values: string[]) =>
    values.map((v) => fields[v] || v).join('、') || '—';
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr("自动分类规则")}</PageTitle>
        </div>
        <Button type="primary" onClick={() => edit()}>
          {tr("新增规则")}</Button>
      </div>
      <Tabs
        items={[
          {
            key: 'rules',
            label: tr("规则管理"),
            children: q.isError ? (
              <ErrorState error={q.error} retry={() => q.refetch()} />
            ) : (
              <Table<AutomationRule>
                rowKey="id"
                dataSource={q.data?.items}
                loading={q.isPending}
                scroll={{ x: 750 }}
                pagination={{
                  current: page,
                  pageSize: 20,
                  total: q.data?.total,
                  onChange: setPage,
                  showSizeChanger: false,
                }}
                locale={{ emptyText: tr("暂无规则，可从商户关键词开始") }}
                columns={[
                  {
                    title: tr("规则名称"),
                    dataIndex: 'name',
                    render: (value: unknown) => (
                      <Sensitive>
                        {value == null ? '—' : String(value)}
                      </Sensitive>
                    ),
                  },
                  { title: tr("优先级"), dataIndex: 'priority' },
                  {
                    title: tr("执行方式"),
                    render: (_, r) => (
                      <Tag>
                        {r.state === 'Active' ? tr("启用") : tr("停用")} ·{' '}
                        {r.previewOnly ? tr("仅预览") : tr("确认后应用")}
                      </Tag>
                    ),
                  },
                  { title: tr("应用命中数"), dataIndex: 'hitCount' },
                  {
                    title: tr("操作"),
                    render: (_, r) => (
                      <Button onClick={() => edit(r)}>
                        {tr("编辑 / 排序 / 停用")}</Button>
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: 'preview',
            label: tr("执行预览"),
            children: (
              <>
                <Button
                  className="mb16"
                  disabled={!selection.length || apply.isPending}
                  loading={suggest.isPending}
                  onClick={() => suggest.mutate()}
                >
                  {tr("预览选中实例（")}{selection.length}）
                </Button>
                {oq.isError ? (
                  <ErrorState error={oq.error} retry={() => oq.refetch()} />
                ) : (
                  <Table<Occurrence>
                    rowKey="id"
                    rowSelection={{
                      selectedRowKeys: selection,
                      onChange: (keys) => setSelection(keys.map(String)),
                      preserveSelectedRowKeys: false,
                    }}
                    dataSource={oq.data?.items}
                    loading={oq.isPending}
                    scroll={{ x: 650 }}
                    pagination={{
                      current: occPage,
                      pageSize: 20,
                      total: oq.data?.total,
                      onChange: (p) => {
                        setOccPage(p);
                        setSelection([]);
                      },
                      showSizeChanger: false,
                    }}
                    locale={{ emptyText: tr("暂无待确认实例") }}
                    columns={[
                      {
                        title: tr("计划时间"),
                        render: (_, o) => formatDate(o.scheduledAt, true, true),
                      },
                      {
                        title: tr("商户"),
                        render: (_, o) => o.transaction.merchant || '—',
                      },
                      {
                        title: tr("金额"),
                        render: (_, o) => (
                          <Money value={o.amount} currency={o.currency} />
                        ),
                      },
                      { title: tr("备注"), render: (_, o) => o.transaction.note },
                    ]}
                  />
                )}
              </>
            ),
          },
          {
            key: 'logs',
            label: tr("执行日志"),
            children: logs.isError ? (
              <ErrorState error={logs.error} retry={() => logs.refetch()} />
            ) : (
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={logs.data?.items}
                loading={logs.isPending}
                pagination={{
                  current: historyPage,
                  pageSize: 20,
                  total: logs.data?.total,
                  onChange: setHistoryPage,
                  showSizeChanger: false,
                }}
                columns={[
                  {
                    title: tr("执行时间"),
                    render: (_, l) => formatDate(l.createdAt, true, true),
                  },
                  {
                    title: tr("规则 / 实例"),
                    render: (_, l) => (
                      <>
                        {l.ruleId}
                        <br />
                        {l.occurrenceId}
                      </>
                    ),
                  },
                  {
                    title: tr("结果"),
                    render: (_, l) =>
                      l.state === 'Applied'
                        ? '已应用到待确认表单'
                        : '仅预览或字段受保护',
                  },
                  {
                    title: tr("建议字段"),
                    render: (_, l) =>
                      labels(JSON.parse(l.changedFieldsJson) as string[]),
                  },
                ]}
              />
            ),
          },
        ]}
      />
      <Drawer
        title={editing ? tr("编辑自动分类规则") : tr("新增自动分类规则")}
        open={open}
        onClose={close}
        width="min(560px, 100vw)"
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
            label={tr("规则名称")}
            rules={[{ required: true, max: 150 }]}
          >
            <Input autoFocus />
          </Form.Item>
          <Form.Item
            name="priority"
            label={tr("优先级（数字越小越优先）")}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={100000} precision={0} />
          </Form.Item>
          <Form.Item name="state" label={tr("状态")}>
            <Select
              options={[
                { value: 'Active', label: tr("启用") },
                { value: 'Disabled', label: tr("停用") },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="previewOnly"
            label={tr("仅预览模式")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <h3>{tr("匹配条件（同时满足）")}</h3>
          <Form.Item name={['conditions', 'source']} label={tr("数据来源")}>
            <Select
              allowClear
              placeholder={tr("周期实例及手动草稿")}
              options={[
                { value: 'Recurring', label: tr("周期待确认实例") },
                { value: 'Manual', label: tr("手动记账草稿") },
              ]}
            />
          </Form.Item>
          {(['merchantExact', 'merchantKeyword', 'noteKeyword'] as const).map(
            (name, i) => (
              <Form.Item
                key={name}
                name={['conditions', name]}
                label={['商户精确匹配', '商户关键词', '备注关键词'][i]}
                rules={[{ max: 200 }]}
              >
                <Input />
              </Form.Item>
            ),
          )}
          <Form.Item name={['conditions', 'minimumAmount']} label={tr("最低金额")}>
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name={['conditions', 'maximumAmount']} label={tr("最高金额")}>
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name={['conditions', 'accountId']} label={tr("限定账户")}>
            <AccountSelector />
          </Form.Item>
          <Form.Item name={['conditions', 'type']} label={tr("交易类型")}>
            <Select
              allowClear
              options={[
                { value: 'Expense', label: tr("支出") },
                { value: 'Income', label: tr("收入") },
                { value: 'Transfer', label: tr("转账") },
              ]}
            />
          </Form.Item>
          <Form.Item name={['conditions', 'currency']} label={tr("币种")}>
            <Select
              allowClear
              options={CURRENCY_CODES.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="range" label={tr("指定时间范围")}>
            <DatePicker.RangePicker showTime format="YYYY-MM-DD HH:mm:ss" />
          </Form.Item>
          <h3>{tr("建议动作（仅填写空白字段）")}</h3>
          {conditionType !== 'Transfer' && (
            <Form.Item name={['actions', 'categoryId']} label={tr("二级或三级分类")}>
              <CategorySelector
                kind={conditionType === 'Income' ? 'Income' : 'Expense'}
              />
            </Form.Item>
          )}
          <Form.Item
            name={['actions', 'merchant']}
            label={tr("设置商户")}
            rules={[{ max: 200 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name={['actions', 'tagIds']} label={tr("添加标签")}>
            <PlanningDirectorySelector kind="tags" multiple />
          </Form.Item>
          <Form.Item name={['actions', 'projectId']} label={tr("关联项目")}>
            <PlanningDirectorySelector kind="projects" />
          </Form.Item>
          <Form.Item
            name={['actions', 'note']}
            label={tr("填写备注")}
            rules={[{ max: 2000 }]}
          >
            <Input.TextArea />
          </Form.Item>
          <Form.Item name={['actions', 'templateId']} label={tr("推荐模板")}>
            <PlanningDirectorySelector kind="templates" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {tr("保存规则")}</Button>
        </Form>
      </Drawer>
      <Drawer
        title={tr("应用前预览")}
        open={!!preview}
        onClose={() => !apply.isPending && setPreview(undefined)}
        width="min(800px, 100vw)"
      >
        <Alert message={preview?.policy} type="info" className="mb16" />
        <Table
          rowKey="id"
          dataSource={preview?.items}
          pagination={false}
          scroll={{ x: 700 }}
          columns={[
            {
              title: tr("原商户 → 建议商户"),
              render: (_, r) =>
                `${r.before.merchant || '—'} → ${r.after.merchant || '—'}`,
            },
            { title: tr("命中规则"), render: (_, r) => r.hitRules.length },
            { title: tr("建议字段"), render: (_, r) => labels(r.changedFields) },
            {
              title: tr("受保护字段"),
              render: (_, r) => labels(r.protectedFields),
            },
            {
              title: tr("冲突（按优先级处理）"),
              render: (_, r) => labels(r.conflicts),
            },
            { title: tr("推荐模板"), render: (_, r) => r.templateIds.length },
          ]}
        />
        <Button
          className="mt20"
          type="primary"
          loading={apply.isPending}
          disabled={!preview}
          onClick={() => {
            key.current = crypto.randomUUID();
            modal.confirm({
              title: tr("应用到选中的待确认实例？"),
              content:
                tr("仅应用非预览规则的可修改字段，不产生实际交易。实例或规则变化时会拒绝并要求重新预览。"),
              onOk: () => apply.mutateAsync(preview!.previewToken),
            });
          }}
        >
          {tr("确认批量应用")}</Button>
      </Drawer>
    </>
  );
}
