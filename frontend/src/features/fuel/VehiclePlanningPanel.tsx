import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { CURRENCY_CODES } from '../../constants/currencies';
import { vehiclePlanningApi } from './planning';
import type { VehicleBudget } from './planning';
import type { Vehicle } from './api';
export default function VehiclePlanningPanel({
  vehicles,
  vehicleId,
  from,
  to,
  hidden,
  english,
}: {
  vehicles: Vehicle[];
  vehicleId?: string;
  from: string;
  to: string;
  hidden: boolean;
  english: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [local, setLocal] = useState<string>();
  const selected = vehicleId ?? local ?? vehicles[0]?.id;
  const [assetDraft, setAssetDraft] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editor, setEditor] = useState<{
    type: 'budget' | 'rule';
    item?: VehicleBudget;
    key: string;
    assetVersion?: string;
  }>();
  const [form] = Form.useForm();
  const method = Form.useWatch('method', form);
  const query = useQuery({
    queryKey: ['fuel', 'planning', selected, from, to],
    queryFn: () => vehiclePlanningApi.report(selected!, from, to),
    enabled: !hidden && !!selected,
  });
  const data = query.data;
  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['fuel'] }),
      cache.invalidateQueries({ queryKey: ['physical-assets'] }),
      cache.invalidateQueries({ queryKey: ['assets'] }),
    ]);
  }
  function editBudget(item?: VehicleBudget) {
    form.resetFields();
    form.setFieldsValue(
      item
        ? { ...item.input, amount: Number(item.input.amount) }
        : {
            period: dayjs().format('YYYY-MM'),
            category: 'Fuel',
            currency: 'CNY',
            amount: undefined,
          },
    );
    setError(undefined);
    setEditor({ type: 'budget', item, key: crypto.randomUUID() });
  }
  function editRule() {
    if (!data?.asset) return;
    form.resetFields();
    form.setFieldsValue({
      date: dayjs(),
      method: 'StraightLine',
      source: tr('用户模型估计', 'User model estimate'),
      lifeMonths: 60,
      residual: 0,
      annualRate: 20,
    });
    setError(undefined);
    setEditor({
      type: 'rule',
      key: crypto.randomUUID(),
      assetVersion: data.asset.version,
    });
  }
  async function save() {
    try {
      const v = await form.validateFields();
      setBusy(true);
      if (editor?.type === 'budget')
        await vehiclePlanningApi.budget(
          {
            vehicleId: selected!,
            period: v.period,
            category: v.category,
            currency: v.currency,
            amount: Number(v.amount).toFixed(2),
          },
          editor.key,
          editor.item,
        );
      else
        await vehiclePlanningApi.rule(selected!, editor!.assetVersion!, {
          date: v.date.format('YYYY-MM-DD'),
          method: v.method,
          source: v.source,
          lifeMonths: v.lifeMonths ?? 60,
          residual: v.residual ?? 0,
          annualRate: v.annualRate ?? 20,
          amount: v.method === 'Manual' ? v.amount : null,
        });
      setEditor(undefined);
      await refresh();
      void message.success(tr('已保存', 'Saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function link() {
    if (!selected) return;
    setBusy(true);
    try {
      await vehiclePlanningApi.asset(
        selected,
        assetDraft === undefined
          ? (data?.link?.assetId ?? null)
          : assetDraft || null,
        data?.link?.version,
      );
      setAssetDraft(undefined);
      await refresh();
      void message.success(
        tr(
          '资产关联已更新，没有新建资产',
          'Asset link updated; no asset was created',
        ),
      );
    } catch (e) {
      void message.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function remove(item: VehicleBudget) {
    const request = modal.confirm({
      title: tr('删除车辆预算？', 'Delete vehicle budget?'),
      content: tr(
        '只删除预算计划，不删除实际交易。',
        'Only the budget is removed; transactions remain.',
      ),
      onOk: async () => {
        await vehiclePlanningApi.removeBudget(item);
        await refresh();
      },
    });
    void request.then(
      () => undefined,
      () => undefined,
    );
  }
  if (hidden) return null;
  return (
    <Card
      title={tr(
        '车辆预算、资产与经济成本',
        'Vehicle budgets, asset and economic costs',
      )}
      style={{ marginTop: 16 }}
    >
      {!vehicleId && (
        <Select
          aria-label={tr('预算资产所属车辆', 'Planning vehicle')}
          value={selected}
          onChange={(id) => {
            setLocal(id);
            setAssetDraft(undefined);
            setEditor(undefined);
          }}
          options={vehicles.map((v) => ({ value: v.id, label: v.name }))}
          style={{ width: 220 }}
        />
      )}
      {!selected ? (
        <Alert
          type="info"
          message={tr('请先创建车辆档案', 'Create a vehicle profile first')}
        />
      ) : (
        <>
          {query.isError && (
            <Alert
              type="error"
              message={query.error.message}
              action={
                <Button onClick={() => void query.refetch()}>
                  {tr('重试', 'Retry')}
                </Button>
              }
            />
          )}
          <Space wrap style={{ marginTop: 12 }}>
            <Select
              aria-label={tr('关联现有车辆资产', 'Link existing vehicle asset')}
              allowClear
              style={{ width: 300, maxWidth: '100%' }}
              value={
                assetDraft === undefined
                  ? (data?.link?.assetId ?? undefined)
                  : assetDraft || undefined
              }
              onChange={(value) => setAssetDraft(value ?? '')}
              options={data?.choices.map((a) => ({
                value: a.id,
                label: `${a.name} ${a.currency}`,
              }))}
            />
            <Button disabled={busy || !data} onClick={() => void link()}>
              {tr('确认资产关联', 'Confirm asset link')}
            </Button>
            <Button href="/physical-assets">
              {tr('管理原实物资产', 'Manage physical assets')}
            </Button>
            <Button disabled={!data?.asset || busy} onClick={editRule}>
              {tr(
                '设置现有资产估值 / 折旧模型',
                'Set existing asset valuation / depreciation',
              )}
            </Button>
          </Space>
          {data?.asset && (
            <Typography.Paragraph>
              {data.asset.name} ·{' '}
              {tr('期初 / 期末账面值', 'Opening / closing book value')}:{' '}
              {data.opening?.bookValue ?? '—'} /{' '}
              {data.closing?.bookValue ?? '—'} {data.asset.currency} ·{' '}
              {tr('当前期末估值及来源', 'Closing valuation and source')}:{' '}
              {data.closing?.value ?? '—'} ({data.closing?.source ?? '—'} /{' '}
              {data.closing?.method ?? '—'})
            </Typography.Paragraph>
          )}
          {data?.economicEstimate ? (
            <Alert
              type="warning"
              message={`${tr('经济成本估算', 'Economic cost estimate')}: ${data.economicEstimate.total} ${data.economicEstimate.currency}`}
              description={`${tr('净现金支出 / 模型账面消耗', 'Net cash / model consumption')}: ${data.economicEstimate.cashNet} / ${data.economicEstimate.modelConsumption}`}
            />
          ) : (
            <Typography.Paragraph type="secondary">
              {tr(
                '缺少可靠资产模型或期间数据，不生成经济成本估算。',
                'No economic cost estimate without a reliable asset model and period data.',
              )}
            </Typography.Paragraph>
          )}
          {!!data?.rules.length && (
            <Table
              size="small"
              rowKey="id"
              dataSource={data.rules}
              pagination={{ pageSize: 5 }}
              scroll={{ x: 600 }}
              columns={[
                { title: tr('规则日期', 'Rule date'), dataIndex: 'date' },
                { title: tr('模型', 'Method'), dataIndex: 'method' },
                {
                  title: tr(
                    '来源（非实时成交价）',
                    'Source (not live transaction price)',
                  ),
                  dataIndex: 'source',
                },
                { title: tr('手动金额', 'Manual amount'), dataIndex: 'amount' },
              ]}
            />
          )}
          {!!data?.valuations.length && (
            <Table
              size="small"
              rowKey="id"
              dataSource={data.valuations}
              pagination={{ pageSize: 5 }}
              columns={[
                {
                  title: tr('估值观察日期', 'Valuation date'),
                  dataIndex: 'date',
                },
                { title: tr('金额', 'Amount'), dataIndex: 'amount' },
                { title: tr('来源', 'Source'), dataIndex: 'source' },
              ]}
            />
          )}
          <Button onClick={() => editBudget()} disabled={busy}>
            {tr('添加车辆预算', 'Add vehicle budget')}
          </Button>
          <Table<VehicleBudget>
            size="small"
            rowKey="id"
            dataSource={data?.budgets ?? []}
            loading={query.isFetching}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 800 }}
            columns={[
              { title: tr('期间', 'Period'), render: (_, r) => r.input.period },
              {
                title: tr('范围', 'Scope'),
                render: (_, r) => r.input.category,
              },
              {
                title: tr('预算原币', 'Original budget'),
                render: (_, r) => `${r.input.amount} ${r.input.currency}`,
              },
              {
                title: tr('实际 / 剩余', 'Actual / remaining'),
                render: (_, r) => `${r.actual} / ${r.remaining}`,
              },
              {
                title: tr('使用率', 'Usage'),
                render: (_, r) => (
                  <Typography.Text
                    type={r.usedPercent > 100 ? 'danger' : undefined}
                  >
                    {r.usedPercent}%
                  </Typography.Text>
                ),
              },
              {
                title: tr('操作', 'Actions'),
                render: (_, r) => (
                  <Space>
                    <Button size="small" onClick={() => editBudget(r)}>
                      {tr('编辑预算', 'Edit budget')}
                    </Button>
                    <Button size="small" danger onClick={() => remove(r)}>
                      {tr('删除预算', 'Delete budget')}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </>
      )}
      <Modal
        open={!!editor && !hidden}
        title={
          editor?.type === 'budget'
            ? tr('车辆预算', 'Vehicle budget')
            : tr(
                '更新现有资产估值模型',
                'Update existing asset valuation model',
              )
        }
        onCancel={() => {
          if (!busy) setEditor(undefined);
        }}
        onOk={() => void save()}
        confirmLoading={busy}
        okText={tr('确认保存', 'Confirm save')}
        maskClosable={!busy}
        cancelButtonProps={{ disabled: busy }}
      >
        {error && <Alert type="error" message={error} />}
        <Form
          name="vehicle-planning"
          form={form}
          layout="vertical"
          disabled={busy}
        >
          {editor?.type === 'budget' ? (
            <>
              <Form.Item
                name="period"
                label={tr('期间 YYYY-MM 或 YYYY', 'Period YYYY-MM or YYYY')}
                rules={[{ required: true }]}
              >
                <Input maxLength={7} />
              </Form.Item>
              <Form.Item name="category" label={tr('范围', 'Scope')}>
                <Select
                  options={[
                    { value: 'Fuel', label: tr('燃油', 'Fuel') },
                    {
                      value: 'All',
                      label: tr('全部用车费用', 'All vehicle costs'),
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item name="currency" label={tr('原币', 'Currency')}>
                <Select
                  options={CURRENCY_CODES.map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="amount"
                label={tr('预算金额', 'Budget amount')}
                rules={[{ required: true }]}
              >
                <InputNumber min={0.01} max={100000000} precision={2} />
              </Form.Item>
            </>
          ) : (
            <>
              <Alert
                type="warning"
                message={tr(
                  '将更新已关联实物资产的估值规则，不创建另一份车辆资产。参数为用户估计。',
                  'Updates the linked physical asset rule; no second asset is created. Inputs are user estimates.',
                )}
              />
              <Form.Item
                name="date"
                label={tr('生效日期', 'Effective date')}
                rules={[{ required: true }]}
              >
                <DatePicker />
              </Form.Item>
              <Form.Item
                name="method"
                label={tr('估值模型', 'Valuation method')}
              >
                <Select
                  options={[
                    {
                      value: 'Manual',
                      label: tr('手动估值', 'Manual estimate'),
                    },
                    {
                      value: 'StraightLine',
                      label: tr('直线折旧', 'Straight-line depreciation'),
                    },
                    {
                      value: 'DecliningBalance',
                      label: tr('余额递减', 'Declining balance'),
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="source"
                label={tr('估值依据 / 来源', 'Estimate basis / source')}
                rules={[{ required: true }]}
              >
                <Input maxLength={1000} />
              </Form.Item>
              {method === 'Manual' ? (
                <Form.Item
                  name="amount"
                  label={tr(
                    '用户估计价值（资产原币）',
                    'Estimated value (asset currency)',
                  )}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={0} max={1000000000} precision={2} />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    name="lifeMonths"
                    label={tr('使用寿命（月）', 'Useful life (months)')}
                  >
                    <InputNumber min={1} max={1200} precision={0} />
                  </Form.Item>
                  <Form.Item
                    name="residual"
                    label={tr(
                      '残值（资产原币）',
                      'Residual value (asset currency)',
                    )}
                  >
                    <InputNumber min={0} max={1000000000} precision={2} />
                  </Form.Item>
                  {method === 'DecliningBalance' && (
                    <Form.Item
                      name="annualRate"
                      label={tr('年递减率 %', 'Annual rate %')}
                    >
                      <InputNumber min={0} max={100} precision={2} />
                    </Form.Item>
                  )}
                </>
              )}
            </>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
