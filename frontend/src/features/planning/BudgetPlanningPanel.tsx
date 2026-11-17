import { DateInput } from '../../components/ResponsiveDatePicker';
import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { planningLabel } from '../../utils/planningLabels';
import { useState } from 'react';
import { Alert, App, Button, Card, Drawer, Checkbox, Form, Input, Space, Table, Tabs } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  budgetPlanningApi as service,
  type CarryInput,
  type CarryPreview,
} from '../../api/financialPlanning';
import { budgetApi, categoryApi } from '../../api/finance';
import type { Budget, SaveBudgetRequest } from '../../types';
import { Money } from '../../components/Money';
import { useUI } from '../../stores/ui';
import BudgetHistorySnapshot from './BudgetHistorySnapshot';
export default function BudgetPlanningPanel({
  month,
  budget,
}: {
  month: string;
  budget: Budget;
}) {
  useLocale();
  const [form] = Form.useForm<CarryInput>();
  const [carry, setCarry] = useState<{
    body: CarryInput;
    preview: CarryPreview;
    key: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [historyId, setHistoryId] = useState<string>();
  const [changePage, setChangePage] = useState(1);
  const [correcting, setCorrecting] = useState<{
    id: string;
    version: string;
  }>();
  const [historyPage, setHistoryPage] = useState(1);
  const [templatePage, setTemplatePage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string>();
  const [copySource, setCopySource] = useState(
    dayjs(month).subtract(1, 'month').format('YYYY-MM'),
  );
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState<{
    before: Budget;
    draft: SaveBudgetRequest;
    key: string;
    sourceVersion?: string;
    sourceMonth?: string;
    templateVersion?: string;
    templateId?: string;
  }>();
  const [thresholds, setThresholds] = useState('70,90,100');
  const [enabled, setEnabled] = useState(true);
  const [silent, setSilent] = useState(false);
  const cache = useQueryClient();
  const { message } = App.useApp();
  const hidden = useUI((s) => s.hidden);
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const history = useQuery({
    queryKey: ['carryovers', historyPage],
    queryFn: () => service.history(historyPage),
  });
  const templates = useQuery({
    queryKey: ['budgetTemplates', templatePage],
    queryFn: () => service.templates(templatePage),
  });
  const settings = useQuery({
    queryKey: ['budgetAlertSettings'],
    queryFn: service.settings,
  });
  const alerts = useQuery({
    queryKey: ['budgetAlerts', alertPage],
    queryFn: () => service.alerts(alertPage),
  });
  const changes = useQuery({
    queryKey: ['budgetPlanningHistory', historyId, changePage],
    queryFn: () => service.changes(historyId!, changePage),
    enabled: !!historyId,
  });
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      message.error(
        e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : tr("操作失败"),
      );
    } finally {
      setBusy(false);
    }
  };
  const refresh = () =>
    Promise.all(
      [
        'budgets',
        'dashboard',
        'carryovers',
        'budgetTemplates',
        'budgetAlerts',
        'budgetAlertSettings',
      ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
    );
  const previewCarry = () =>
    run(async () => {
      const values = await form.validateFields();
      const body = {
        ...values,
        targetMonth: month,
        targetVersion: budget.version,
        categoryId: values.categoryId || null,
        cap: values.cap || null,
        carryOverspend: values.carryOverspend || false,
      };
      setCarry({
        body,
        preview: await service.preview(body),
        key: crypto.randomUUID(),
      });
    });
  const previewDraft = (copy: boolean) =>
    run(async () => {
      if (!reason.trim()) throw new Error('请填写应用原因');
      if (copy) {
        const source = await budgetApi.get(copySource);
        const body = {
          sourceMonth: copySource,
          sourceVersion: source.version,
          targetMonth: month,
          targetVersion: budget.version,
          reason,
        };
        const result = await service.copyPreview(body);
        setDraft({
          ...result,
          sourceMonth: copySource,
          sourceVersion: source.version,
          key: crypto.randomUUID(),
        });
      } else {
        const t = templates.data?.items.find((t) => t.id === templateId);
        if (!t) throw new Error('请选择模板');
        const result = await service.templatePreview(t.id, {
          month,
          templateVersion: t.version,
          monthlyVersion: budget.version,
          reason,
        });
        setDraft({
          ...result,
          templateId: t.id,
          templateVersion: t.version,
          key: crypto.randomUUID(),
        });
      }
    });
  return (
    <Card
      title={tr("结转、模板与预警")}
      className="mb16"
      extra={
        <Button
          disabled={budget.version === '0'}
          onClick={() => {
            setHistoryId(budget.id);
            setChangePage(1);
          }}
        >
          {tr("基础预算调整历史")}</Button>
      }
    >
      <Tabs
        items={[
          {
            key: 'carry',
            label: tr("预算结转"),
            children: (
              <>
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={{
                    sourceMonth: dayjs(month)
                      .subtract(1, 'month')
                      .format('YYYY-MM'),
                    rule: 'Full',
                    parameter: '0.00',
                    carryOverspend: false,
                  }}
                  onValuesChange={() => setCarry(undefined)}
                  disabled={busy}
                >
                  <Form.Item
                    name="sourceMonth"
                    label={tr("来源月份")}
                    rules={[{ required: true }]}
                  >
                    <DateInput type="month" />
                  </Form.Item>
                  <Form.Item name="categoryId" label={tr("结转分类（留空为总额）")}>
                    <Select
                      allowClear
                      options={cats.data
                        ?.filter((c) => c.kind === 'Expense')
                        .map((c) => ({ value: c.id, label: c.name }))}
                    />
                  </Form.Item>
                  <Form.Item name="rule" label={tr("规则")}>
                    <Select
                      options={[
                        { value: 'None', label: tr("不结转") },
                        { value: 'Full', label: tr("全额") },
                        { value: 'Fixed', label: tr("固定金额") },
                        { value: 'Percent', label: tr("比例") },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="parameter" label={tr("固定金额或比例百分比")}>
                    <Input inputMode="decimal" />
                  </Form.Item>
                  <Form.Item name="cap" label={tr("最大结转额（可留空）")}>
                    <Input inputMode="decimal" />
                  </Form.Item>
                  <Form.Item name="carryOverspend" valuePropName="checked">
                    <Checkbox>{tr("将超支作为负向调整")}</Checkbox>
                  </Form.Item>
                  <Form.Item
                    name="reason"
                    label={tr("原因")}
                    rules={[{ required: true }]}
                  >
                    <Input maxLength={2000} />
                  </Form.Item>
                  <Space>
                    <Button onClick={previewCarry} loading={busy}>
                      {tr("预览结转")}</Button>
                    <Button
                      disabled={!carry || busy}
                      onClick={() =>
                        run(async () => {
                          if (!carry) return;
                          const body = {
                            ...carry.body,
                            fingerprint: carry.preview.fingerprint,
                            targetVersion: carry.preview.target.version,
                          };
                          if (correcting)
                            await service.correct(
                              correcting.id,
                              correcting.version,
                              body,
                              carry.key,
                            );
                          else await service.apply(body, carry.key);
                          setCarry(undefined);
                          setCorrecting(undefined);
                          await refresh();
                          message.success(tr("结转已确认"));
                        })
                      }
                    >
                      {tr("确认结转至")}{month}
                    </Button>
                  </Space>
                </Form>
                {carry && (
                  <Alert
                    className="mb16"
                    message={
                      <>
                        <p>
                          {tr("来源剩余")}<Money value={carry.preview.remaining} /> {tr("·\r\n                          本次结转")}<Money value={carry.preview.amount} />
                        </p>
                        {carry.preview.scope}
                      </>
                    }
                  />
                )}
                <Table
                  rowKey="id"
                  scroll={{ x: 600 }}
                  dataSource={history.data?.items}
                  pagination={{
                    current: historyPage,
                    pageSize: 10,
                    total: history.data?.total,
                    onChange: setHistoryPage,
                  }}
                  columns={[
                    { title: tr("来源"), dataIndex: 'sourceMonth' },
                    { title: tr("目标"), dataIndex: 'targetMonth' },
                    {
                      title: tr("金额"),
                      dataIndex: 'amount',
                      render: (v) => <Money value={v} />,
                    },
                    {
                      title: tr("状态"),
                      dataIndex: 'state',
                      render: planningLabel,
                    },
                    {
                      title: tr("操作"),
                      render: (_, r) => (
                        <Space>
                          <Button
                            onClick={() => {
                              setHistoryId(r.id);
                              setChangePage(1);
                            }}
                          >
                            {tr("查看历史")}</Button>
                          <Button
                            disabled={
                              busy ||
                              r.targetMonth !== month ||
                              r.state === 'Cancelled'
                            }
                            onClick={() => {
                              setCorrecting({ id: r.id, version: r.version });
                              setCarry(undefined);
                              form.setFieldsValue({
                                sourceMonth: r.sourceMonth,
                                categoryId: r.categoryId,
                                rule: r.rule,
                                parameter: r.parameter,
                                cap: r.cap,
                                carryOverspend: r.carryOverspend,
                                reason: '人工重新确认或更正结转',
                              });
                            }}
                          >
                            {tr("重新预览并更正")}</Button>
                          <Button
                            disabled={
                              busy ||
                              !['Confirmed', 'Scheduled'].includes(r.state)
                            }
                            onClick={() =>
                              run(async () => {
                                await service.cancel(
                                  r.id,
                                  r.version,
                                  '人工取消尚未生效结转',
                                  crypto.randomUUID(),
                                );
                                await refresh();
                              })
                            }
                          >
                            {tr("取消")}</Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'template',
            label: tr("模板与复制"),
            children: (
              <>
                <Space wrap className="mb16">
                  <Input
                    aria-label={tr("预算模板名称")}
                    placeholder={tr("模板名称")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Button
                    disabled={busy || budget.version === '0' || !name.trim()}
                    onClick={() =>
                      run(async () => {
                        await service.saveTemplate(
                          name,
                          {
                            total: budget.baseTotal ?? budget.total,
                            items: budget.items.map((x) => ({
                              categoryId: x.categoryId,
                              limit: x.baseLimit ?? x.limit,
                            })),
                          },
                          crypto.randomUUID(),
                        );
                        await refresh();
                        message.success(tr("已保存个人模板"));
                      })
                    }
                  >
                    {tr("将本月基础预算存为模板")}</Button>
                </Space>
                <Space wrap className="mb16">
                  <DateInput
                    aria-label={tr("复制来源月份")}
                    type="month"
                    value={copySource}
                    onChange={(e) => {
                      setCopySource(e.target.value);
                      setDraft(undefined);
                    }}
                  />
                  <Button
                    onClick={() => {
                      setCopySource(
                        dayjs(month).subtract(1, 'month').format('YYYY-MM'),
                      );
                      setDraft(undefined);
                    }}
                  >
                    {tr("上月")}</Button>
                  <Button
                    onClick={() => {
                      setCopySource(
                        dayjs(month).subtract(1, 'year').format('YYYY-MM'),
                      );
                      setDraft(undefined);
                    }}
                  >
                    {tr("去年同期")}</Button>
                  <Button disabled={busy} onClick={() => previewDraft(true)}>
                    {tr("预览复制")}</Button>
                </Space>
                <Space wrap className="mb16">
                  <Select
                    aria-label={tr("预算模板")}
                    style={{ width: 220 }}
                    value={templateId}
                    onChange={(v) => {
                      setTemplateId(v);
                      setDraft(undefined);
                    }}
                    options={templates.data?.items
                      .filter((t) => t.state === 'Active')
                      .map((t) => ({ value: t.id, label: t.name }))}
                  />
                  <Button disabled={busy} onClick={() => previewDraft(false)}>
                    {tr("预览模板")}</Button>
                  <Button
                    disabled={templatePage === 1}
                    onClick={() => setTemplatePage((p) => p - 1)}
                  >
                    {tr("上一页模板")}</Button>
                  <Button
                    disabled={templatePage * 20 >= (templates.data?.total || 0)}
                    onClick={() => setTemplatePage((p) => p + 1)}
                  >
                    {tr("下一页模板")}</Button>
                </Space>
                <Input
                  aria-label={tr("预算应用原因")}
                  placeholder={tr("应用原因")}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setDraft(undefined);
                  }}
                />
                {draft && (
                  <Alert
                    className="mb16"
                    message={
                      <>
                        <p>
                          {tr("当前基础额度")}{' '}
                          <Money
                            value={draft.before.baseTotal ?? draft.before.total}
                          />{' '}
                          {tr("→ 草稿")}<Money value={draft.draft.total} />
                        </p>
                        <Table
                          rowKey="categoryId"
                          pagination={false}
                          dataSource={draft.draft.items}
                          columns={[
                            {
                              title: tr("分类"),
                              render: (_, r) =>
                                cats.data?.find((c) => c.id === r.categoryId)
                                  ?.name,
                            },
                            {
                              title: tr("草稿额度"),
                              dataIndex: 'limit',
                              render: (v) => <Money value={v} />,
                            },
                          ]}
                        />
                        <Button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              if (draft.templateId && draft.templateVersion)
                                await service.templateApply(
                                  draft.templateId,
                                  {
                                    month,
                                    templateVersion: draft.templateVersion,
                                    monthlyVersion: draft.before.version,
                                    reason,
                                  },
                                  draft.key,
                                );
                              else
                                await service.copyApply(
                                  {
                                    sourceMonth: draft.sourceMonth!,
                                    sourceVersion: draft.sourceVersion!,
                                    targetMonth: month,
                                    targetVersion: draft.before.version,
                                    reason,
                                  },
                                  draft.key,
                                );
                              setDraft(undefined);
                              await refresh();
                              message.success(tr("草稿已人工确认应用"));
                            })
                          }
                        >
                          {tr("确认替换基础预算")}</Button>
                      </>
                    }
                  />
                )}
              </>
            ),
          },
          {
            key: 'alerts',
            label: tr("预算预警"),
            children: (
              <>
                <p>
                  {tr("当前设置：")}{hidden ? '••••' : settings.data?.thresholds.join('%、')}% ·{' '}
                  {settings.data?.enabled ? tr("开启") : tr("关闭")}
                </p>
                <Space wrap className="mb16">
                  <Input
                    aria-label={tr("预算预警阈值")}
                    value={thresholds}
                    onChange={(e) => setThresholds(e.target.value)}
                  />
                  <Checkbox
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  >
                    {tr("启用")}</Checkbox>
                  <Checkbox
                    checked={silent}
                    onChange={(e) => setSilent(e.target.checked)}
                  >
                    {tr("静默")}</Checkbox>
                  <Button
                    disabled={busy || !settings.data}
                    onClick={() =>
                      run(async () => {
                        await service.saveSettings(
                          {
                            thresholds: thresholds
                              .split(',')
                              .map((v) => Number(v.trim())),
                            enabled,
                            silent,
                          },
                          settings.data!.version,
                          crypto.randomUUID(),
                        );
                        await refresh();
                      })
                    }
                  >
                    {tr("保存预警设置")}</Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await service.evaluate(month, crypto.randomUUID());
                        await refresh();
                      })
                    }
                  >
                    {tr("检查本月阈值")}</Button>
                </Space>
                <Table
                  rowKey="id"
                  dataSource={alerts.data?.items}
                  pagination={{
                    current: alertPage,
                    pageSize: 10,
                    total: alerts.data?.total,
                    onChange: setAlertPage,
                  }}
                  columns={[
                    { title: tr("月份"), dataIndex: 'month' },
                    {
                      title: tr("阈值"),
                      dataIndex: 'threshold',
                      render: (v) => (hidden ? '••••' : `${v}%`),
                    },
                    {
                      title: tr("方式"),
                      render: (_, r) => (r.silent ? '静默' : '应用内'),
                    },
                    {
                      title: tr("状态"),
                      render: (_, r) =>
                        r.dismissed ? (
                          '已关闭'
                        ) : (
                          <Button
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await service.dismiss(
                                  r.id,
                                  r.version,
                                  crypto.randomUUID(),
                                );
                                await refresh();
                              })
                            }
                          >
                            {tr("关闭此提醒")}</Button>
                        ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <Drawer
        rootClassName="planning-drawer"
        title={tr("预算调整历史")}
        width={650}
        open={!!historyId}
        onClose={() => setHistoryId(undefined)}
      >
        <Table
          rowKey="id"
          scroll={{ x: 580 }}
          dataSource={changes.data?.items}
          pagination={{
            current: changePage,
            pageSize: 10,
            total: changes.data?.total,
            onChange: setChangePage,
          }}
          columns={[
            {
              title: tr("时间"),
              dataIndex: 'createdAt',
              render: (v) => new Date(v).toLocaleString(),
            },
            {
              title: tr("原因"),
              dataIndex: 'reason',
              render: (v) => (hidden ? '••••' : v),
            },
            {
              title: tr("版本"),
              render: (_, r) => `${r.beforeVersion} → ${r.afterVersion}`,
            },
          ]}
          expandable={{
            expandedRowRender: (r) =>
              hidden ? (
                '••••'
              ) : (
                <Space direction="vertical" style={{ maxWidth: '100%' }}>
                  <strong>{tr("修改前")}</strong>
                  <BudgetHistorySnapshot
                    value={r.beforeJson}
                    categoryName={(id) =>
                      cats.data?.find((c) => c.id === id)?.name || '历史分类'
                    }
                  />
                  <strong>{tr("修改后")}</strong>
                  <BudgetHistorySnapshot
                    value={r.afterJson}
                    categoryName={(id) =>
                      cats.data?.find((c) => c.id === id)?.name || '历史分类'
                    }
                  />
                </Space>
              ),
          }}
        />
      </Drawer>
    </Card>
  );
}
