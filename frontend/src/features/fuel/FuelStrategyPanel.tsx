import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import { CURRENCY_CODES } from '../../constants/currencies';
import { strategyApi } from './strategy';
import type { FuelStrategy, FuelStrategyInput } from './strategy';
import FuelEconomyDetails from './FuelEconomyDetails';

const initial: FuelStrategyInput = {
  name: '',
  currency: 'CNY',
  litres: 40,
  baselinePrice: 8,
  alternativePrice: 7.5,
  coupon: 0,
  pointsValue: 0,
  extraDistance: 10,
  consumption: 8,
};
export default function FuelStrategyPanel({
  hidden,
  english,
  economy = false,
}: {
  hidden: boolean;
  english: boolean;
  economy?: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const [form] = Form.useForm<FuelStrategyInput>();
  const values = Form.useWatch([], form) as FuelStrategyInput | undefined;
  const [input, setInput] = useState<FuelStrategyInput>();
  const [editing, setEditing] = useState<FuelStrategy>();
  const [busy, setBusy] = useState(false);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const defaults = economy
    ? {
        ...initial,
        mode: 'Economy' as const,
        monthlyDistance: 1000,
        annualDistance: 12000,
        targetConsumption: 6,
        years: 5,
      }
    : initial;
  const list = useQuery({
    queryKey: ['fuel', 'strategies'],
    queryFn: strategyApi.list,
    enabled: !hidden,
  });
  useEffect(() => {
    const timer = setTimeout(() => setInput(values), 350);
    return () => clearTimeout(timer);
  }, [values]);
  const preview = useQuery({
    queryKey: ['fuel', 'strategy-preview', input],
    queryFn: () => strategyApi.preview(input!),
    enabled: !hidden && !!input?.name?.trim(),
    retry: false,
  });
  const current = !!input && JSON.stringify(values) === JSON.stringify(input);
  const scenarios = list.data?.filter(
    (s) => (s.input.mode === 'Economy') === economy,
  );
  async function save() {
    try {
      const fields = await form.validateFields();
      const body = economy ? { ...defaults, ...fields } : fields;
      setBusy(true);
      await strategyApi.save(body, editing);
      await cache.invalidateQueries({ queryKey: ['fuel', 'strategies'] });
      setEditing(undefined);
      form.resetFields();
      void message.success(tr('方案已保存', 'Scenario saved'));
    } catch (error) {
      if (error instanceof Error) void message.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  function load(item: FuelStrategy, copy = false) {
    setEditing(copy ? undefined : item);
    form.setFieldsValue({
      ...item.input,
      name: copy
        ? item.input.name.slice(0, 85) + tr(' 副本', ' copy')
        : item.input.name,
    });
  }
  function remove(item: FuelStrategy) {
    const confirmation = modal.confirm({
      title: tr('删除此模拟方案？', 'Delete this scenario?'),
      onOk: async () => {
        try {
          await strategyApi.remove(item);
          await cache.invalidateQueries({ queryKey: ['fuel', 'strategies'] });
          if (editing?.id === item.id) {
            setEditing(undefined);
            form.resetFields();
          }
        } catch (error) {
          if (error instanceof Error) void message.error(error.message);
          throw error;
        }
      },
    });
    void confirmation.then(
      () => undefined,
      () => undefined,
    );
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              kind: 'FuelStrategy',
              ruleVersion: '1.0',
              assumptions: economy
                ? 'Monthly and annual distances are independent; constant price and consumption; no inflation, discounting, maintenance or vehicle replacement'
                : 'Manual same-currency prices; extra round-trip km; excludes time, tolls and parking',
              scenarios: scenarios ?? [],
              mode: economy ? 'Economy' : 'Detour',
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = economy
      ? 'fuel-economy-scenarios.json'
      : 'fuel-strategies.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (hidden) return null;
  return (
    <Card
      title={
        economy
          ? tr('节油情景模拟', 'Fuel economy scenarios')
          : tr('加油绕行策略模拟', 'Refuelling detour simulator')
      }
      style={{ marginTop: 16 }}
    >
      <Form
        name={economy ? 'fuel-economy' : 'fuel-strategy'}
        form={form}
        layout="vertical"
        initialValues={defaults}
        disabled={busy}
        style={{ marginTop: 16 }}
      >
        {economy && (
          <Form.Item name="mode" hidden>
            <Input />
          </Form.Item>
        )}
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="name"
              label={tr('方案名称', 'Scenario name')}
              rules={[{ required: true, whitespace: true, max: 100 }]}
            >
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="currency"
              label={tr('方案币种', 'Scenario currency')}
              rules={[{ required: true }]}
            >
              <Select
                options={CURRENCY_CODES.map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
          </Col>
          {(
            [
              ['litres', tr('单次加油量 L', 'Fuel volume L'), 0.001, 10000, 3],
              [
                'baselinePrice',
                economy
                  ? tr('假设燃油单价 /L', 'Assumed fuel price /L')
                  : tr(
                      '原站优惠前单价 /L',
                      'Baseline price before discounts /L',
                    ),
                0.001,
                10000,
                3,
              ],
              [
                'alternativePrice',
                tr(
                  '备选站优惠前单价 /L',
                  'Alternative price before discounts /L',
                ),
                0.001,
                10000,
                3,
              ],
              [
                'coupon',
                tr('备选站优惠金额', 'Alternative coupon value'),
                0,
                100000000,
                2,
              ],
              [
                'pointsValue',
                tr('备选站积分抵扣金额', 'Alternative points redemption value'),
                0,
                100000000,
                2,
              ],
              [
                'extraDistance',
                tr('额外往返里程 km', 'Extra round-trip distance km'),
                0,
                10000,
                1,
              ],
              [
                'consumption',
                economy
                  ? tr('当前油耗 L/100km', 'Current consumption L/100km')
                  : tr('假设油耗 L/100km', 'Assumed consumption L/100km'),
                0.01,
                100,
                2,
              ],
            ] as const
          )
            .filter(
              ([name]) =>
                !economy || name === 'baselinePrice' || name === 'consumption',
            )
            .map(([name, label, min, max, precision]) => (
              <Col xs={24} sm={12} lg={8} key={name}>
                <Form.Item
                  name={name}
                  label={label}
                  rules={[{ required: true }]}
                >
                  <InputNumber
                    min={min}
                    max={max}
                    precision={precision}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            ))}
          {economy &&
            (
              [
                [
                  'monthlyDistance',
                  tr('每月行驶里程 km', 'Monthly distance km'),
                  0,
                  100000,
                  1,
                ],
                [
                  'annualDistance',
                  tr('每年行驶里程 km', 'Annual distance km'),
                  0,
                  1200000,
                  1,
                ],
                [
                  'targetConsumption',
                  tr('目标油耗 L/100km', 'Target consumption L/100km'),
                  0.01,
                  100,
                  2,
                ],
                ['years', tr('模拟年数', 'Simulation years'), 1, 50, 0],
              ] as const
            ).map(([name, label, min, max, precision]) => (
              <Col xs={24} sm={12} lg={8} key={name}>
                <Form.Item
                  name={name}
                  label={label}
                  rules={[{ required: true }]}
                >
                  <InputNumber
                    min={min}
                    max={max}
                    precision={precision}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            ))}
        </Row>
      </Form>
      {!input?.name?.trim() && (
        <Typography.Paragraph>
          {tr('填写名称后计算预览', 'Enter a name to preview')}
        </Typography.Paragraph>
      )}
      {preview.isError && current && (
        <Alert type="error" message={preview.error.message} />
      )}
      {economy && current && preview.data && (
        <FuelEconomyDetails
          result={preview.data}
          currency={input!.currency}
          english={english}
        />
      )}
      {!economy && current && preview.data && (
        <Alert
          type={preview.data.netSaving > 0 ? 'success' : 'warning'}
          message={tr(
            `预计净节省 ${preview.data.netSaving} ${input!.currency}`,
            `Estimated net saving ${preview.data.netSaving} ${input!.currency}`,
          )}
          description={
            <>
              <div>
                {tr('原站油费', 'Baseline fuel cost')}:{' '}
                {preview.data.baselineCost} ·{' '}
                {tr('备选站抵扣后油费', 'Alternative after discounts')}:{' '}
                {preview.data.alternativeCost}
              </div>
              <div>
                {tr('绕行耗油 / 成本', 'Detour litres / cost')}:{' '}
                {preview.data.detourLitres} L / {preview.data.detourCost}{' '}
                {input!.currency}
              </div>
              <div>
                {tr(
                  '净节省 = 加油量 × 原单价 − (加油量 × 备选单价 − 优惠 − 积分抵扣) − 额外里程 × 油耗 ÷ 100 × 备选单价。负数代表额外支出。',
                  'Net saving = volume × baseline price − (volume × alternative price − coupon − points) − extra km × consumption / 100 × alternative price. A negative result is extra spending.',
                )}
              </div>
            </>
          }
        />
      )}
      <Space wrap style={{ margin: '16px 0' }}>
        <Button
          type="primary"
          loading={busy}
          disabled={
            !current || !preview.data || preview.isFetching || preview.isError
          }
          onClick={() => void save()}
        >
          {editing
            ? tr('保存修改', 'Save changes')
            : tr('保存方案', 'Save scenario')}
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            setEditing(undefined);
            form.resetFields();
          }}
        >
          {tr('取消编辑 / 新方案', 'Cancel / new scenario')}
        </Button>
        <Button disabled={!scenarios?.length} onClick={download}>
          {tr('导出方案 JSON', 'Export scenarios JSON')}
        </Button>
      </Space>
      {list.isError && (
        <Alert
          type="error"
          message={list.error.message}
          action={
            <Button onClick={() => void list.refetch()}>
              {tr('重试', 'Retry')}
            </Button>
          }
        />
      )}
      <Table<FuelStrategy>
        size="small"
        rowKey="id"
        dataSource={scenarios}
        loading={list.isFetching}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 700 }}
        columns={[
          { title: tr('方案', 'Scenario'), render: (_, s) => s.input.name },
          { title: tr('币种', 'Currency'), render: (_, s) => s.input.currency },
          {
            title: economy
              ? tr('当前月油费', 'Current monthly cost')
              : tr('原站油费', 'Baseline cost'),
            render: (_, s) => s.result.baselineCost,
          },
          {
            title: economy
              ? tr('目标月油费', 'Target monthly cost')
              : tr('备选油费', 'Alternative cost'),
            render: (_, s) => s.result.alternativeCost,
          },
          {
            title: economy
              ? tr('年节省', 'Annual saving')
              : tr('绕行成本', 'Detour cost'),
            render: (_, s) =>
              economy ? s.result.economy?.annualSaving : s.result.detourCost,
          },
          {
            title: economy
              ? tr('月节省', 'Monthly saving')
              : tr('净节省', 'Net saving'),
            render: (_, s) => s.result.netSaving,
          },
          {
            title: tr('周期累计节省', 'Total period saving'),
            hidden: !economy,
            render: (_, s) => s.result.economy?.totalSaving,
          },
          {
            title: tr('操作', 'Actions'),
            render: (_, s) => (
              <Space wrap>
                <Button size="small" onClick={() => load(s)}>
                  {tr('编辑方案', 'Edit scenario')}
                </Button>
                <Button size="small" onClick={() => load(s, true)}>
                  {tr('复制方案', 'Copy scenario')}
                </Button>
                <Button size="small" danger onClick={() => remove(s)}>
                  {tr('删除方案', 'Delete scenario')}
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
