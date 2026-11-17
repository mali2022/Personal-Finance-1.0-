import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Skeleton,
  Space,
  Table,
} from 'antd';
import dayjs from 'dayjs';
import { accountApi, categoryApi } from '../../api/finance';
import { costApi, vehicleCostCategories } from './costs';
import type { VehicleCostInput, VehicleCostRow } from './costs';
import type { FuelRow, Vehicle } from './api';
import { TransactionDrawer } from '../transactions/TransactionDrawer';
const Chart = lazy(() => import('../../components/Chart'));
export default function VehicleCostsPanel({
  vehicles,
  records,
  vehicleId,
  from,
  to,
  hidden,
  english,
  initialFuelRecordId,
}: {
  vehicles: Vehicle[];
  records: FuelRow[];
  vehicleId?: string;
  from: string;
  to: string;
  hidden: boolean;
  english: boolean;
  initialFuelRecordId?: string;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [key, setKey] = useState(crypto.randomUUID());
  const [keyword, setKeyword] = useState('');
  const [transactionId, setTransactionId] = useState<string>();
  const mode = Form.useWatch('mode', form) ?? 'link',
    selectedVehicle = Form.useWatch('vehicleId', form),
    fuelRecordId = Form.useWatch('fuelRecordId', form),
    kind = Form.useWatch('kind', form) ?? 'Expense';
  const report = useQuery({
    queryKey: ['fuel', 'costs', { vehicleId, from, to }],
    queryFn: () => costApi.report({ vehicleId, from, to }),
    enabled: !hidden,
  });
  const candidates = useQuery({
    queryKey: [
      'fuel',
      'cost-candidates',
      selectedVehicle,
      fuelRecordId,
      keyword,
    ],
    queryFn: () =>
      costApi.candidates({ vehicleId: selectedVehicle, fuelRecordId, keyword }),
    enabled: !hidden && open && !!selectedVehicle && mode === 'link',
  });
  const accounts = useQuery({
    queryKey: ['fuel', 'expense-accounts'],
    queryFn: accountApi.list,
    enabled: !hidden && open && mode === 'create',
  });
  const categories = useQuery({
    queryKey: ['fuel', 'expense-categories'],
    queryFn: categoryApi.list,
    enabled: !hidden && open && mode === 'create',
  });
  async function reload() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['fuel'] }),
      cache.invalidateQueries({ queryKey: ['transactions'] }),
      cache.invalidateQueries({ queryKey: ['accounts'] }),
      cache.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  }
  function start(id?: string) {
    const fill = records.find((r) => r.id === id);
    form.resetFields();
    form.setFieldsValue({
      vehicleId:
        fill?.vehicleId ??
        vehicleId ??
        vehicles.find((v) => v.status !== 'Archived')?.id,
      mode: 'link',
      kind: 'Expense',
      category: 'Fuel',
      date: fill ? dayjs(fill.date) : dayjs(),
      amount: fill?.amount,
      fuelRecordId: fill?.id,
      note: '',
      confirmNew: false,
    });
    setKey(crypto.randomUUID());
    setError(undefined);
    setOpen(true);
  }
  useEffect(() => {
    if (initialFuelRecordId) start(initialFuelRecordId);
  }, [initialFuelRecordId]);
  async function save() {
    try {
      const v = await form.validateFields();
      setBusy(true);
      setError(undefined);
      const input: VehicleCostInput = {
        vehicleId: v.vehicleId,
        transactionId: mode === 'link' ? v.transactionId : '',
        category: v.category,
        amount: Number(v.amount).toFixed(2),
        kind: mode === 'create' ? 'Expense' : v.kind,
        originalCostId:
          mode === 'link' && v.kind !== 'Expense'
            ? v.originalCostId
            : undefined,
        fuelRecordId: v.fuelRecordId || undefined,
        note: v.note ?? '',
      };
      if (mode === 'create') {
        if (!v.confirmNew)
          throw new Error(
            tr(
              '须确认不是已有交易',
              'Confirm this is not an existing transaction',
            ),
          );
        await costApi.create(
          input,
          {
            type: 'Expense',
            amount: input.amount,
            accountId: v.accountId,
            categoryId: v.categoryId,
            occurredAt: v.date.format('YYYY-MM-DD') + 'T12:00:00+08:00',
            note: input.note,
            merchant: v.merchant ?? '',
            fee: '0',
            tagIds: [],
            splits: [],
          },
          key,
        );
      } else await costApi.link(input, key);
      setOpen(false);
      void message.success(tr('车辆费用已关联', 'Vehicle cost linked'));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function unlink(row: VehicleCostRow) {
    const request = modal.confirm({
      title: tr('解除车辆费用关联？', 'Unlink vehicle cost?'),
      content: tr(
        '仅解除分摊，原财务交易保留。原费用有退款或报销分摊时须先解除这些分摊。',
        'Only the allocation is removed; the ledger transaction remains. Unlink child refund/reimbursement allocations first.',
      ),
      onOk: async () => {
        try {
          await costApi.unlink(row);
          await reload();
        } catch (e) {
          if (e instanceof Error) void message.error(e.message);
          throw e;
        }
      },
    });
    void request.then(
      () => undefined,
      () => undefined,
    );
  }
  if (hidden) return null;
  return (
    <>
      <Table
        rowKey={(r) => r.year + '-' + r.category + '-' + r.currency}
        size="small"
        dataSource={report.data?.annualCategories ?? []}
        pagination={{ pageSize: 5 }}
        scroll={{ x: 650 }}
        columns={[
          { title: tr('年度', 'Year'), dataIndex: 'year' },
          {
            title: tr(
              '保险、维修等年度分类成本',
              'Annual insurance, repair and other costs',
            ),
            render: (_, r) =>
              vehicleCostCategories.find((c) => c[0] === r.category)?.[
                english ? 2 : 1
              ] ?? r.category,
          },
          {
            title: tr('原币净支出', 'Original net cost'),
            render: (_, r) => `${r.amount} ${r.currency}`,
          },
        ]}
      />
      <Table
        rowKey={(r) => r.month + '-' + r.category + '-' + r.currency}
        size="small"
        dataSource={report.data?.maintenanceMonthly ?? []}
        pagination={{ pageSize: 5 }}
        scroll={{ x: 650 }}
        columns={[
          {
            title: tr('维修保养月份', 'Maintenance/repair month'),
            dataIndex: 'month',
          },
          {
            title: tr('分类', 'Category'),
            render: (_, r) =>
              vehicleCostCategories.find((c) => c[0] === r.category)?.[
                english ? 2 : 1
              ] ?? r.category,
          },
          {
            title: tr('期间趋势净额', 'Period trend net cost'),
            render: (_, r) => `${r.amount} ${r.currency}`,
          },
        ]}
      />
      <TransactionDrawer
        id={transactionId}
        onClose={() => setTransactionId(undefined)}
      />
      <Button
        type="primary"
        disabled={!vehicles.some((v) => v.status !== 'Archived')}
        onClick={() => start()}
      >
        {tr('添加或关联车辆费用', 'Add or link vehicle cost')}
      </Button>
      {report.isError && (
        <Alert
          type="error"
          message={report.error.message}
          action={
            <Button onClick={() => void report.refetch()}>
              {tr('重试', 'Retry')}
            </Button>
          }
        />
      )}
      <Space wrap style={{ margin: '16px 0' }}>
        {report.data?.summary.map((s) => (
          <Card size="small" key={s.currency} title={s.currency}>
            {tr(
              '已付 / 退款 / 报销 / 净支出',
              'Paid / refunded / reimbursed / net',
            )}
            : {s.paid} / {s.refunds} / {s.reimbursements} / {s.net}
          </Card>
        ))}
      </Space>
      <Space wrap>
        {report.data?.lifetimeSummary?.map((s) => (
          <Card
            size="small"
            key={s.currency}
            title={tr('累计已关联净支出', 'Lifetime linked net costs')}
          >
            {s.net} {s.currency}
          </Card>
        ))}
      </Space>
      <Table
        rowKey={(r) => r.year + '-' + r.currency}
        dataSource={report.data?.annual ?? []}
        size="small"
        pagination={{ pageSize: 5 }}
        columns={[
          { title: tr('年度', 'Year'), dataIndex: 'year' },
          { title: tr('原币', 'Currency'), dataIndex: 'currency' },
          {
            title: tr('年度已关联净成本', 'Annual linked net cost'),
            dataIndex: 'amount',
          },
        ]}
      />
      <Table
        rowKey={(r) => r.category + '-' + r.currency}
        dataSource={report.data?.categories ?? []}
        size="small"
        pagination={{ pageSize: 5 }}
        columns={[
          {
            title: tr('期间成本结构', 'Period cost composition'),
            render: (_, r) =>
              vehicleCostCategories.find((c) => c[0] === r.category)?.[
                english ? 2 : 1
              ] ?? r.category,
          },
          { title: tr('原币', 'Currency'), dataIndex: 'currency' },
          { title: tr('净支出', 'Net cost'), dataIndex: 'amount' },
        ]}
      />
      <Table
        rowKey={(r) => r.vehicleId + '-' + r.currency}
        dataSource={report.data?.vehicles ?? []}
        size="small"
        pagination={{ pageSize: 5 }}
        columns={[
          {
            title: tr('车辆比较', 'Vehicle comparison'),
            render: (_, r) =>
              vehicles.find((v) => v.id === r.vehicleId)?.name ?? r.vehicleId,
          },
          { title: tr('原币', 'Currency'), dataIndex: 'currency' },
          { title: tr('期间净支出', 'Period net cost'), dataIndex: 'amount' },
        ]}
      />
      <Alert
        type="warning"
        message={tr(
          '每公里成本受记录覆盖范围限制',
          'Per-km costs depend on record coverage',
        )}
        description={tr(
          '燃油成本使用同币种有效满箱区间内实际补油支出。已关联净现金/有效公里仅供参考：有效区间里程不等于全部行驶里程，未关联费用也未计入，不能当作完整用车TCO。',
          'Fuel costs use paid fills within same-currency valid full intervals. Linked net cash per valid km is a reference: valid-interval distance is not all driven distance, and unlinked costs are excluded. It is not full vehicle TCO.',
        )}
      />
      <Table
        rowKey={(r) => r.vehicleId + '-' + r.currency}
        dataSource={report.data?.distanceCosts ?? []}
        size="small"
        pagination={{ pageSize: 5 }}
        scroll={{ x: 750 }}
        columns={[
          {
            title: tr('车辆 / 原币', 'Vehicle / currency'),
            render: (_, r) =>
              `${vehicles.find((v) => v.id === r.vehicleId)?.name ?? r.vehicleId} / ${r.currency}`,
          },
          {
            title: tr('有效区间公里', 'Valid interval km'),
            dataIndex: 'validDistance',
          },
          {
            title: tr('燃油成本/公里', 'Fuel cost/km'),
            render: (_, r) => r.fuelCostPerKm ?? '—',
          },
          {
            title: tr(
              '已关联净现金/有效公里（参考）',
              'Linked cash/valid km (reference)',
            ),
            render: (_, r) => r.linkedCashPerValidKm ?? '—',
          },
        ]}
      />
      {!!report.data?.monthly.length && (
        <Card
          title={tr('月度已关联净现金支出', 'Monthly linked net cash spending')}
        >
          <Suspense fallback={<Skeleton />}>
            <Chart
              option={{
                tooltip: { trigger: 'axis' },
                legend: {},
                xAxis: {
                  type: 'category',
                  data: [
                    ...new Set(report.data.monthly.map((m) => m.month)),
                  ].sort(),
                },
                yAxis: { type: 'value' },
                series: [
                  ...new Set(report.data.monthly.map((m) => m.currency)),
                ].map((currency) => ({
                  name: currency,
                  type: 'bar',
                  data: [...new Set(report.data!.monthly.map((m) => m.month))]
                    .sort()
                    .map(
                      (month) =>
                        report.data!.monthly.find(
                          (m) => m.month === month && m.currency === currency,
                        )?.amount ?? 0,
                    ),
                })),
              }}
            />
          </Suspense>
        </Card>
      )}
      <Table<VehicleCostRow>
        rowKey="id"
        size="small"
        loading={report.isFetching}
        dataSource={report.data?.rows ?? []}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
        columns={[
          { title: tr('日期', 'Date'), dataIndex: 'date' },
          {
            title: tr('车辆', 'Vehicle'),
            render: (_, r) =>
              vehicles.find((v) => v.id === r.input.vehicleId)?.name ??
              r.input.vehicleId,
          },
          {
            title: tr('分类 / 类型', 'Category / kind'),
            render: (_, r) =>
              `${vehicleCostCategories.find((c) => c[0] === r.input.category)?.[english ? 2 : 1] ?? r.input.category} / ${r.input.kind}`,
          },
          {
            title: tr('原币净额', 'Original net amount'),
            render: (_, r) => `${r.signedAmount} ${r.currency}`,
          },
          {
            title: tr('原交易 / 商户', 'Transaction / merchant'),
            render: (_, r) => (
              <Button
                type="link"
                onClick={() => setTransactionId(r.input.transactionId)}
              >
                {r.input.transactionId} · {r.merchant ?? ''}
              </Button>
            ),
          },
          {
            title: tr('加油记录', 'Fuel log'),
            render: (_, r) => r.input.fuelRecordId ?? '—',
          },
          {
            title: tr('操作', 'Actions'),
            render: (_, r) => (
              <Button danger size="small" onClick={() => unlink(r)}>
                {tr('解除关联', 'Unlink')}
              </Button>
            ),
          },
        ]}
      />
      <Modal
        width={850}
        title={tr('车辆费用记账与关联', 'Vehicle cost bookkeeping and linking')}
        open={open && !hidden}
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
        onOk={() => void save()}
        okText={tr('确认保存关联', 'Confirm allocation')}
        confirmLoading={busy}
        maskClosable={!busy}
        cancelButtonProps={{ disabled: busy }}
      >
        {error && <Alert type="error" message={error} />}
        <Form
          name="vehicle-cost"
          form={form}
          layout="vertical"
          disabled={busy}
          onValuesChange={(changed) => {
            if (
              'mode' in changed ||
              'vehicleId' in changed ||
              'kind' in changed
            )
              form.setFieldsValue({
                transactionId: undefined,
                originalCostId: undefined,
                fuelRecordId: undefined,
              });
          }}
        >
          <Form.Item name="mode" label={tr('处理方式', 'Mode')}>
            <Radio.Group
              options={[
                {
                  value: 'link',
                  label: tr(
                    '关联已有交易（不重复记账）',
                    'Link existing transaction',
                  ),
                },
                {
                  value: 'create',
                  label: tr('明确新增一笔支出', 'Create a new expense'),
                },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="vehicleId"
            label={tr('费用所属车辆', 'Cost vehicle')}
            rules={[{ required: true }]}
          >
            <Select
              options={vehicles.map((v) => ({
                value: v.id,
                label: v.name,
                disabled: v.status === 'Archived',
              }))}
            />
          </Form.Item>
          {mode === 'link' && (
            <>
              <Form.Item name="kind" label={tr('费用性质', 'Cost kind')}>
                <Select
                  options={[
                    { value: 'Expense', label: tr('支出', 'Expense') },
                    { value: 'Refund', label: tr('退款', 'Refund') },
                    {
                      value: 'Reimbursement',
                      label: tr('报销收款', 'Reimbursement receipt'),
                    },
                  ]}
                />
              </Form.Item>
              <Input.Search
                aria-label={tr('搜索原交易', 'Search original transactions')}
                placeholder={tr('商户、备注或交易ID', 'Merchant, note or ID')}
                onSearch={setKeyword}
              />
              {candidates.isError && (
                <Alert type="error" message={candidates.error.message} />
              )}
              <Form.Item
                name="transactionId"
                label={tr(
                  '确认选择原交易（最近50条候选）',
                  'Select original transaction (up to 50 candidates)',
                )}
                rules={[{ required: true }]}
              >
                <Select
                  loading={candidates.isFetching}
                  options={candidates.data
                    ?.filter(
                      (t) =>
                        t.type ===
                        (kind === 'Expense'
                          ? 'Expense'
                          : kind === 'Refund'
                            ? 'Refund'
                            : 'Income'),
                    )
                    .map((t) => ({
                      value: t.id,
                      label: `${t.occurredAt.slice(0, 10)} · ${t.amount} ${t.currency} · ${t.merchant ?? ''} · ${t.id} (${t.allocated} allocations)`,
                    }))}
                />
              </Form.Item>
              {kind !== 'Expense' && (
                <Form.Item
                  name="originalCostId"
                  label={tr('对应原车辆费用', 'Original vehicle cost')}
                  rules={[{ required: true }]}
                >
                  <Select
                    options={report.data?.originalExpenses
                      .filter((r) => r.input.vehicleId === selectedVehicle)
                      .map((r) => ({
                        value: r.id,
                        label: `${r.date} · ${r.input.category} · ${r.signedAmount} ${r.currency} · ${r.id}`,
                      }))}
                  />
                </Form.Item>
              )}
            </>
          )}
          <Form.Item
            name="category"
            label={tr('车辆成本分类', 'Vehicle cost category')}
            rules={[{ required: true }]}
          >
            <Select
              options={vehicleCostCategories.map(([value, zh, en]) => ({
                value,
                label: english ? en : zh,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="fuelRecordId"
            label={tr(
              '关联加油记录（仅燃油支出，可留空）',
              'Fuel log (fuel expenses only, optional)',
            )}
          >
            <Select
              allowClear
              options={records
                .filter((r) => r.vehicleId === selectedVehicle)
                .map((r) => ({
                  value: r.id,
                  label: `${r.date} · ${r.amount} ${r.currency} · ${r.station}`,
                }))}
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={tr(
              '本次分摊金额（原币）',
              'Allocation amount (original currency)',
            )}
            rules={[{ required: true }]}
          >
            <InputNumber
              min={0.01}
              max={100000000}
              precision={2}
              style={{ width: '100%' }}
            />
          </Form.Item>
          {mode === 'create' && (
            <>
              {(accounts.isError || categories.isError) && (
                <Alert
                  type="error"
                  message={(accounts.error ?? categories.error)?.message}
                />
              )}
              <Form.Item
                name="accountId"
                label={tr(
                  '付款账户（决定原币）',
                  'Payment account (determines currency)',
                )}
                rules={[{ required: true }]}
              >
                <Select
                  options={accounts.data
                    ?.filter((a) => a.status === 'Active')
                    .map((a) => ({
                      value: a.id,
                      label: `${a.name} ${a.currency}`,
                    }))}
                />
              </Form.Item>
              <Form.Item
                name="categoryId"
                label={tr('账本消费分类', 'Ledger expense category')}
                rules={[{ required: true }]}
              >
                <Select
                  options={categories.data
                    ?.filter(
                      (c) =>
                        c.kind === 'Expense' &&
                        c.status === 'Active' &&
                        !!c.parentId,
                    )
                    .map((c) => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
              <Form.Item
                name="date"
                label={tr('支出日期', 'Expense date')}
                rules={[{ required: true }]}
              >
                <DatePicker />
              </Form.Item>
              <Form.Item name="merchant" label={tr('商户', 'Merchant')}>
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="confirmNew" valuePropName="checked">
                <Checkbox>
                  {tr(
                    '已核对账本，这是尚未入账的新支出',
                    'I checked the ledger: this is a new unposted expense',
                  )}
                </Checkbox>
              </Form.Item>
            </>
          )}
          <Form.Item name="note" label={tr('分摊备注', 'Allocation note')}>
            <Input.TextArea maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
