import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import { apiClient } from '../../api/client';
import { lifeApi } from '../../api/lifeSimulator';
import type { LifeSnapshot } from '../../api/lifeSimulator';
import { CURRENCY_CODES } from '../../constants/currencies';
interface Option {
  name: string;
  type: string;
  purchase: number;
  saleOld: number;
  sellsCurrent: boolean;
  annualDistance: number;
  energyPer100: number;
  unitPrice: number;
  otherMonthlyCost: number;
  terminalSale: number;
  include: boolean;
}
interface DecisionResult {
  snapshotId: string;
  modelVersion: string;
  results: {
    name: string;
    finalNetWorth: number;
    minimumCash: number;
    firstShortfall: string | null;
    totalExpense: number;
    warnings: string[];
  }[];
}
export default function VehicleDecisionsPanel({
  hidden,
  english,
}: {
  hidden: boolean;
  english: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const currency = Form.useWatch('currency', form) ?? 'CNY';
  const [baseline, setBaseline] = useState<{
    id: string;
    snapshot: LifeSnapshot;
  }>();
  const [result, setResult] = useState<DecisionResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [key, setKey] = useState(crypto.randomUUID());
  const [resultInput, setResultInput] = useState<string>();
  const options: Option[] = [
    ['Keep', tr('继续当前车辆', 'Keep current')],
    ['Fuel', tr('更换燃油车', 'Replace with fuel vehicle')],
    ['Electric', tr('更换新能源车', 'Replace with electric vehicle')],
    ['Reduce', tr('减少私家车使用', 'Reduce car use')],
    ['Transit', tr('部分改用公共交通', 'Use public transport')],
  ].map(([type, name]) => ({
    name,
    type,
    purchase: 0,
    saleOld: 0,
    sellsCurrent: type === 'Fuel' || type === 'Electric',
    annualDistance: type === 'Transit' ? 0 : 12000,
    energyPer100: type === 'Electric' ? 15 : type === 'Transit' ? 0 : 8,
    unitPrice: type === 'Electric' ? 1 : 8,
    otherMonthlyCost: 0,
    terminalSale: 0,
    include: type === 'Keep' || type === 'Reduce',
  }));
  async function snapshot() {
    setBusy(true);
    setError(undefined);
    try {
      setBaseline(await lifeApi.snapshot(currency));
      setResult(undefined);
      setKey(crypto.randomUUID());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function run(save = false) {
    try {
      const v = await form.validateFields();
      if (!baseline)
        throw new Error(tr('先建立财务基线', 'Create a baseline first'));
      if (!v.confirm)
        throw new Error(tr('请确认全部假设', 'Confirm all assumptions'));
      setBusy(true);
      setError(undefined);
      const body = {
        snapshotId: baseline.id,
        currency: v.currency,
        years: v.years,
        baselineMonthlyVehicleCost: v.baselineMonthlyVehicleCost,
        currentVehicleBookValue: v.currentVehicleBookValue,
        confirmAssumptions: true,
        options: (v.options as Option[])
          .filter((o) => o.include)
          .map(({ include: _, ...o }) => o),
      };
      const fingerprint = JSON.stringify(body);
      if (save && fingerprint !== resultInput)
        throw new Error(
          tr(
            '请先预览最新参数后再保存',
            'Preview current assumptions before saving',
          ),
        );
      const response = await apiClient.post<{ data: DecisionResult }>(
        save ? '/fuel/decisions/save' : '/fuel/decisions/preview',
        body,
        {
          headers: save ? { 'Idempotency-Key': key } : undefined,
          timeout: 60000,
        },
      );
      setResult(response.data.data);
      setResultInput(fingerprint);
      if (save)
        void message.success(
          tr(
            '已保存为原人生模拟器方案与运行，可在原页面编辑和比较',
            'Saved as native life scenarios/runs; edit and compare in the original simulator',
          ),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function exportResult() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              assumptions: resultInput ? JSON.parse(resultInput) : null,
              result,
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
    a.download = 'vehicle-life-comparison.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (hidden) return null;
  return (
    <Card
      title={tr(
        '车辆更换与出行长期决策（复用人生财务模拟器）',
        'Vehicle replacement and long-term transport decisions (native life simulator)',
      )}
      style={{ marginTop: 16 }}
    >
      <Alert
        type="warning"
        message={tr(
          '仅生成情景，不购车、不付款；全部价格与残值是用户假设',
          'Scenarios only: no vehicle purchase or payment; prices/residuals are user assumptions',
        )}
        description={tr(
          '同一财务基线比较2至5个方案。须明确从基线月支出中剔除的原车费用，避免重复。原车账面值只从受限资产重分类，不增加净资产；换车先卖旧再购新。统一假设期末出售车辆实现用户填的残值，不另加一次折旧。仅现金购车，不新建贷款；原基线的未建模债务仍保留。默认数字仅演示，请核实，未来油价/电价、残值、维护、通胀均不保证。',
          'Compare 2–5 options on one financial baseline. Explicitly remove the current vehicle cost already included in baseline expenses. Current book value is reclassified from restricted assets, not added. Replacement sells the old vehicle before buying. All plans dispose of the vehicle at the end at your assumed residual; depreciation is not added twice. Cash purchases only; existing unmodelled debt remains. Defaults are illustrative; future energy prices, residuals, maintenance and inflation are not guaranteed.',
        )}
      />
      <Form
        name="vehicle-decisions"
        form={form}
        layout="vertical"
        initialValues={{
          currency: 'CNY',
          years: 5,
          baselineMonthlyVehicleCost: 0,
          currentVehicleBookValue: 0,
          confirm: false,
          options,
        }}
        disabled={busy}
        onValuesChange={(changed) => {
          setResult(undefined);
          setResultInput(undefined);
          setKey(crypto.randomUUID());
          if ('currency' in changed) setBaseline(undefined);
        }}
      >
        <Space wrap style={{ marginTop: 12 }}>
          <Form.Item name="currency" label={tr('比较原币', 'Currency')}>
            <Select
              style={{ width: 100 }}
              options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item
            name="years"
            label={tr('模拟年数（1至40）', 'Years (1–40)')}
          >
            <InputNumber min={1} max={40} precision={0} />
          </Form.Item>
          <Form.Item
            name="baselineMonthlyVehicleCost"
            label={tr(
              '基线中已含的原车月费用',
              'Existing monthly car cost in baseline',
            )}
          >
            <InputNumber min={0} max={1000000000} precision={2} />
          </Form.Item>
          <Form.Item
            name="currentVehicleBookValue"
            label={tr(
              '基线受限资产内原车账面值',
              'Car book value within baseline restricted assets',
            )}
          >
            <InputNumber min={0} max={1000000000} precision={2} />
          </Form.Item>
        </Space>
        <Button disabled={busy} onClick={() => void snapshot()}>
          {tr(
            '建立 / 刷新原模拟器财务基线',
            'Create / refresh native financial baseline',
          )}
        </Button>
        {baseline && (
          <Typography.Paragraph>
            {tr(
              '基线月支出 / 可重分类受限资产：',
              'Baseline monthly expense / restricted assets: ',
            )}
            {baseline.snapshot.suggested.monthlyExpense} /{' '}
            {baseline.snapshot.suggested.restrictedAssets} {currency} ·{' '}
            {baseline.snapshot.capturedAt}
          </Typography.Paragraph>
        )}
        <Form.List name="options">
          {(fields) => (
            <>
              {fields.map((field) => (
                <Card
                  size="small"
                  key={field.key}
                  title={options[field.name]?.name}
                  style={{ marginTop: 12 }}
                >
                  <Form.Item
                    name={[field.name, 'include']}
                    valuePropName="checked"
                  >
                    <Checkbox>
                      {tr('纳入比较', 'Include in comparison')}
                    </Checkbox>
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'name']}
                    label={tr('方案名称', 'Option name')}
                    rules={[{ required: true }]}
                  >
                    <Input maxLength={80} />
                  </Form.Item>
                  <Form.Item name={[field.name, 'type']} hidden>
                    <Input />
                  </Form.Item>
                  <Space wrap>
                    {(
                      [
                        [
                          'purchase',
                          tr('新车购置款', 'Replacement purchase'),
                          2,
                        ],
                        ['saleOld', tr('出售原车收入', 'Old car proceeds'), 2],
                        ['annualDistance', tr('年里程 km', 'Annual km'), 1],
                        [
                          'energyPer100',
                          tr(
                            '百公里能耗 L或kWh',
                            'Energy per 100 km (L or kWh)',
                          ),
                          2,
                        ],
                        [
                          'unitPrice',
                          tr('燃油/电单价', 'Fuel/electric unit price'),
                          3,
                        ],
                        [
                          'otherMonthlyCost',
                          tr(
                            '其他月费用/公共交通费',
                            'Other monthly / public transport costs',
                          ),
                          2,
                        ],
                        [
                          'terminalSale',
                          tr('期末出售残值', 'Terminal sale residual'),
                          2,
                        ],
                      ] as const
                    ).map(([name, label, precision]) => (
                      <Form.Item
                        key={name}
                        name={[field.name, name]}
                        label={label}
                        rules={[{ required: true }]}
                      >
                        <InputNumber
                          min={0}
                          max={1000000000}
                          precision={precision}
                        />
                      </Form.Item>
                    ))}
                  </Space>
                  <Form.Item
                    name={[field.name, 'sellsCurrent']}
                    valuePropName="checked"
                  >
                    <Checkbox>
                      {tr(
                        '期初明确出售/处置原车',
                        'Sell/dispose of current car at start',
                      )}
                    </Checkbox>
                  </Form.Item>
                </Card>
              ))}
            </>
          )}
        </Form.List>
        <Form.Item name="confirm" valuePropName="checked">
          <Checkbox>
            {tr(
              '已核实基线、所有方案假设和期末出售口径',
              'I verified the baseline, assumptions and terminal disposal policy',
            )}
          </Checkbox>
        </Form.Item>
      </Form>
      {error && <Alert type="error" message={error} />}
      <Space wrap>
        <Button loading={busy} disabled={!baseline} onClick={() => void run()}>
          {tr('预览确定性比较', 'Preview deterministic comparison')}
        </Button>
        <Button
          loading={busy}
          disabled={!result}
          onClick={() => void run(true)}
        >
          {tr('保存到原人生模拟器', 'Save to native life simulator')}
        </Button>
        <Button disabled={!result} onClick={exportResult}>
          {tr('导出假设与结果', 'Export assumptions and results')}
        </Button>
        <Button href="/planning/life-simulator">
          {tr(
            '在原模拟器编辑/复制/运行',
            'Edit / copy / run in life simulator',
          )}
        </Button>
      </Space>
      {result && (
        <Table
          rowKey="name"
          size="small"
          pagination={false}
          scroll={{ x: 800 }}
          dataSource={result.results}
          columns={[
            { title: tr('方案', 'Option'), dataIndex: 'name' },
            {
              title: tr('期末净资产', 'Final net worth'),
              dataIndex: 'finalNetWorth',
            },
            { title: tr('最低现金', 'Minimum cash'), dataIndex: 'minimumCash' },
            {
              title: tr('首次现金缺口', 'First shortfall'),
              render: (_, r) =>
                r.firstShortfall ?? tr('模型内未出现', 'None within model'),
            },
            {
              title: tr('模型警告', 'Model warnings'),
              render: (_, r) => r.warnings.join(' · '),
            },
          ]}
        />
      )}
    </Card>
  );
}
