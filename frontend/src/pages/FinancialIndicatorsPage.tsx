import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { planningLabel } from '../utils/planningLabels';
import { useState } from 'react';
import { Alert, App, Button, Card, Checkbox, Drawer, Form, Input, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  goalApi,
  indicatorApi,
  type EssentialPolicy,
} from '../api/financialPlanning';
import { categoryApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { useUI } from '../stores/ui';
export default function FinancialIndicatorsPage() {
  useLocale();
  const [currency, setCurrency] = useCurrencyState();
  const [months, setMonths] = useState(3);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [goalPage, setGoalPage] = useState(1);
  const [page, setPage] = useState(1);
  const [policyPage, setPolicyPage] = useState(1);
  const [editing, setEditing] = useState<{ version: string; key: string }>();
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<EssentialPolicy>();
  const hidden = useUI((s) => s.hidden);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const range = months === 0 ? { start, end } : { months };
  const valid = months !== 0 || (!!start && !!end);
  const goals = useQuery({
    queryKey: ['savingsGoals', currency, goalPage],
    queryFn: () => goalApi.list(currency, goalPage),
  });
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const policies = useQuery({
    queryKey: ['essentialPolicies', policyPage],
    queryFn: () => indicatorApi.policies(policyPage),
  });
  const params = { currency, ...range, page, pageSize: 20 };
  const emergency = useQuery({
    queryKey: ['financialIndicators', 'emergency', params, goalIds],
    queryFn: () =>
      indicatorApi.emergency({ ...params, goalIds: goalIds.join(',') }),
    enabled: goalIds.length > 0 && valid,
  });
  const savings = useQuery({
    queryKey: ['financialIndicators', 'savings', params],
    queryFn: () => indicatorApi.savings(params),
    enabled: valid,
  });
  const edit = (p?: EssentialPolicy) => {
    form.resetFields();
    form.setFieldsValue(
      p || {
        necessity: 'Essential',
        essentialRate: '100.00',
        excluded: false,
        note: '',
      },
    );
    setEditing({ version: p?.version || '0', key: crypto.randomUUID() });
  };
  const save = async () => {
    if (busy || !editing) return;
    setBusy(true);
    try {
      const body = await form.validateFields();
      await indicatorApi.savePolicy(body, editing.version, editing.key);
      setEditing(undefined);
      await Promise.all(
        ['essentialPolicies', 'financialIndicators', 'financialSummary'].map(
          (key) => cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      message.success(tr("必要支出规则已保存"));
    } catch (e) {
      message.error(
        e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : tr("保存失败"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr("应急储备与储蓄率")}</PageTitle>
        </div>
        <Space wrap>
          <Select
            value={currency}
            onChange={(v) => {
              setCurrency(v);
              setGoalIds([]);
              setPage(1);
            }}
            options={CURRENCY_CODES.map((value) => ({ value }))}
          />
          <Select
            aria-label={tr("必要支出范围")}
            value={months}
            onChange={(v) => {
              setMonths(v);
              setPage(1);
            }}
            options={[
              { value: 3, label: tr("最近3个完整月") },
              { value: 6, label: tr("最近6个完整月") },
              { value: 12, label: tr("最近12个完整月") },
              { value: 0, label: tr("自定义日期") },
            ]}
          />
          {months === 0 && (
            <>
              <DateInput
                type="date"
                aria-label={tr("分析开始日期")}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <DateInput
                type="date"
                aria-label={tr("分析结束日期")}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </>
          )}
        </Space>
      </div>
      <Card title={tr("选择应急目标")} className="mb16">
        <Select
          mode="multiple"
          aria-label={tr("应急储备目标")}
          style={{ width: '100%' }}
          value={goalIds}
          onChange={(v) => {
            setGoalIds(v);
            setPage(1);
          }}
          options={goals.data?.items
            .filter((g) => g.type === 'Emergency' && g.state !== 'Cancelled')
            .map((g) => ({ value: g.id, label: hidden ? tr("应急目标") : g.name }))}
        />
        <Space>
          <Button
            disabled={goalPage === 1}
            onClick={() => setGoalPage((p) => p - 1)}
          >
            {tr("上一页目标")}</Button>
          <Button
            disabled={goalPage * 12 >= (goals.data?.total || 0)}
            onClick={() => setGoalPage((p) => p + 1)}
          >
            {tr("下一页目标")}</Button>
        </Space>
      </Card>
      {emergency.isError ? (
        <ErrorState error={emergency.error} retry={() => emergency.refetch()} />
      ) : (
        <Card
          title={tr("应急金覆盖")}
          className="mb16"
          loading={emergency.isFetching}
        >
          {goalIds.length === 0 ? (
            <Alert message={tr("请先明确选择应急目标")} />
          ) : (
            emergency.data && (
              <>
                <div className="summary-grid">
                  {[
                    ['可用应急储备', emergency.data.availableReserve],
                    ['平均必要月支出', emergency.data.averageMonthly],
                    ['储备不足', emergency.data.shortage],
                  ].map(([label, value]) => (
                    <div key={label}>
                      {label}
                      <div className="stat-value">
                        <Money value={value} currency={currency} />
                      </div>
                    </div>
                  ))}
                  <div>
                    {tr("覆盖月数")}<div className="stat-value">
                      {hidden
                        ? '••••'
                        : emergency.data.coverageMonths || tr("不适用")}
                    </div>
                  </div>
                </div>
                <p>{emergency.data.assumptions}</p>
                <p>
                  {tr("未指定必要性的费用")}{' '}
                  <Money
                    value={emergency.data.unspecifiedExpense}
                    currency={currency}
                  />{' '}
                  {tr("· 排除异常费用")}{' '}
                  <Money
                    value={emergency.data.excludedExpense}
                    currency={currency}
                  />
                </p>
                <Table
                  rowKey={(r) => `${r.transactionId}:${r.categoryId}`}
                  scroll={{ x: 550 }}
                  dataSource={emergency.data.details.items}
                  pagination={{
                    current: page,
                    pageSize: 20,
                    total: emergency.data.details.total,
                    onChange: setPage,
                  }}
                  columns={[
                    {
                      title: tr("原消费"),
                      dataIndex: 'transactionId',
                      render: (v) => (hidden ? '••••' : v),
                    },
                    {
                      title: tr("分类"),
                      render: (_, r) =>
                        cats.data?.find((c) => c.id === r.categoryId)?.name,
                    },
                    {
                      title: tr("净费用"),
                      dataIndex: 'amount',
                      render: (v) => <Money value={v} currency={currency} />,
                    },
                    {
                      title: tr("必要部分"),
                      dataIndex: 'necessary',
                      render: (v) => <Money value={v} currency={currency} />,
                    },
                  ]}
                />
              </>
            )
          )}
        </Card>
      )}
      {savings.isError ? (
        <ErrorState error={savings.error} retry={() => savings.refetch()} />
      ) : (
        <Card title={tr("储蓄率")} className="mb16" loading={savings.isFetching}>
          <div className="summary-grid">
            <div>
              {tr("收入")}{' '}
              <Money
                value={savings.data?.income || '0.00'}
                currency={currency}
              />
            </div>
            <div>
              {tr("支出")}{' '}
              <Money
                value={savings.data?.expense || '0.00'}
                currency={currency}
              />
            </div>
            <div>
              {tr("储蓄率")}{' '}
              {hidden
                ? '••••'
                : savings.data?.savingsRate
                  ? `${savings.data.savingsRate}%`
                  : tr("不适用")}
            </div>
          </div>
          <p>{savings.data?.formula}</p>
          <p>
            {tr("费用：")}{savings.data?.includeFees ? tr("包含手续费") : tr("排除手续费")} ·{' '}
            {savings.data?.includeAssetLoss ? tr("包含资产损失") : tr("排除资产损失")} ·{' '}
            {savings.data?.includeDecreasingAdjustments
              ? tr("包含减值调整")
              : tr("排除减值调整")}
          </p>
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="id"
            dataSource={savings.data?.details.items}
            pagination={{
              current: page,
              pageSize: 20,
              total: savings.data?.details.total,
              onChange: setPage,
            }}
            columns={[
              {
                title: tr("交易"),
                dataIndex: 'id',
                render: (v) => (hidden ? '••••' : v),
              },
              { title: tr("类型"), dataIndex: 'type', render: planningLabel },
              {
                title: tr("时间"),
                dataIndex: 'occurredAt',
                render: (v) => new Date(v).toLocaleString(),
              },
            ]}
          />
        </Card>
      )}
      <Card
        title={tr("必要性规则")}
        extra={<Button onClick={() => edit()}>{tr("新增规则")}</Button>}
      >
        <Table
          rowKey="id"
          scroll={{ x: 550 }}
          dataSource={policies.data?.items}
          pagination={{
            current: policyPage,
            pageSize: 20,
            total: policies.data?.total,
            onChange: setPolicyPage,
          }}
          columns={[
            {
              title: tr("范围"),
              render: (_, r) =>
                r.transactionId
                  ? hidden
                    ? '交易覆盖'
                    : r.transactionId
                  : cats.data?.find((c) => c.id === r.categoryId)?.name,
            },
            {
              title: tr("必要比例"),
              dataIndex: 'essentialRate',
              render: (v) => (hidden ? '••••' : `${v}%`),
            },
            {
              title: tr("异常排除"),
              dataIndex: 'excluded',
              render: (v) => (v ? '是' : '否'),
            },
            {
              title: tr("操作"),
              render: (_, r) => <Button onClick={() => edit(r)}>{tr("编辑")}</Button>,
            },
          ]}
        />
      </Card>
      <Drawer
        rootClassName="planning-drawer"
        title={tr("必要支出规则")}
        width={520}
        open={!!editing}
        onClose={() => !busy && setEditing(undefined)}
        extra={
          <Button loading={busy} onClick={save}>
            {tr("保存规则")}</Button>
        }
      >
        <Form form={form} layout="vertical" disabled={busy}>
          <Form.Item name="id" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="categoryId" label={tr("二级或三级分类")}>
            <Select
              allowClear
              options={cats.data
                ?.filter(
                  (c) =>
                    c.kind === 'Expense' && c.parentId && c.status === 'Active',
                )
                .map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
          <Form.Item name="transactionId" label={tr("原消费交易 ID（覆盖分类规则）")}>
            <Input />
          </Form.Item>
          <Form.Item name="necessity" label={tr("性质")}>
            <Select
              options={[
                { value: 'Essential', label: tr("必要支出") },
                { value: 'Adjustable', label: tr("可调整支出") },
                { value: 'Optional', label: tr("非必要支出（比例设为0）") },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="essentialRate"
            label={tr("必要支出占比百分数")}
            rules={[{ required: true }]}
          >
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name="excluded" valuePropName="checked">
            <Checkbox>{tr("排除异常一次性支出及其退款")}</Checkbox>
          </Form.Item>
          <Form.Item name="note" label={tr("说明")}>
            <Input.TextArea maxLength={2000} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
