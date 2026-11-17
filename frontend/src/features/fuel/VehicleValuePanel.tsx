import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { apiClient } from '../../api/client';
import { CURRENCY_CODES } from '../../constants/currencies';
import type { Vehicle } from './api';
interface ValueResult {
  id: string;
  totalCost: number;
  hours: number;
  remaining: number;
  preferenceScore: number | null;
  feasible: boolean;
  reasons: string[];
}
export default function VehicleValuePanel({
  hidden,
  english,
  vehicles,
  vehicleId,
}: {
  hidden: boolean;
  english: boolean;
  vehicles: Vehicle[];
  vehicleId?: string;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const [form] = Form.useForm();
  const [approval] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [rows, setRows] = useState<ValueResult[]>();
  const [saved, setSaved] = useState<string>();
  const [draft, setDraft] = useState<string>();
  const [key, setKey] = useState(crypto.randomUUID());
  const [approvalKey] = useState(crypto.randomUUID());
  async function compare(save: boolean) {
    try {
      const v = await form.validateFields();
      if (!v.confirm)
        throw new Error(
          tr(
            '请先核实假设和主观评分',
            'Review assumptions and subjective scores first',
          ),
        );
      setBusy(true);
      setError(undefined);
      const input = {
        budget: v.budget,
        availableCash: null,
        safetyFloor: 0,
        availableHours: v.hours ?? null,
        weights: [1, 1],
        options: v.options.map(
          (
            o: {
              name: string;
              cost: number;
              hours: number;
              comfort: number;
              flexibility: number;
            },
            i: number,
          ) => ({
            id: String(i + 1),
            items: [
              {
                name: o.name,
                amount: o.cost,
                followUpCost: 0,
                hours: o.hours,
                uses: null,
              },
            ],
            scores: [o.comfort, o.flexibility],
            scoresConfirmed: true,
            type: 'Other',
          }),
        ),
      };
      const response = await apiClient.post<{ data: ValueResult[] }>(
        '/spending-value/compare',
        input,
      );
      setRows(response.data.data);
      if (save) {
        const result = await apiClient.post<{ data: { id: string } }>(
          '/spending-value',
          {
            name: v.name,
            currency: v.currency,
            start: v.period[0].format('YYYY-MM-DD'),
            end: v.period[1].format('YYYY-MM-DD'),
            dimensions: [tr('舒适度', 'Comfort'), tr('灵活性', 'Flexibility')],
            input,
            reviews: [],
          },
          { headers: { 'Idempotency-Key': key, 'If-Match': '0' } },
        );
        setSaved(result.data.data.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function createApproval() {
    try {
      const v = await approval.validateFields();
      setBusy(true);
      setError(undefined);
      const r = await apiClient.post<{ data: { id: string } }>(
        `/fuel/vehicles/${v.vehicleId}/approval`,
        {
          name: v.name,
          amount: v.amount,
          currency: v.currency,
          reason: v.reason,
        },
        { headers: { 'Idempotency-Key': approvalKey } },
      );
      setDraft(r.data.data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (hidden) return null;
  return (
    <Card
      title={tr(
        '出行价值比较与费用审批',
        'Transport value comparison and expense approval',
      )}
      style={{ marginTop: 16 }}
    >
      <Form
        name="vehicle-value"
        form={form}
        layout="vertical"
        disabled={busy || !!saved}
        initialValues={{
          name: tr('出行方式比较', 'Transport comparison'),
          currency: 'CNY',
          period: [dayjs().startOf('year'), dayjs().endOf('year')],
          budget: 10000,
          options: [
            {
              name: tr('私家车', 'Private car'),
              cost: 0,
              hours: 0,
              comfort: 5,
              flexibility: 5,
            },
            {
              name: tr('公共交通', 'Public transport'),
              cost: 0,
              hours: 0,
              comfort: 5,
              flexibility: 5,
            },
            {
              name: tr('混合出行', 'Mixed transport'),
              cost: 0,
              hours: 0,
              comfort: 5,
              flexibility: 5,
            },
          ],
          confirm: false,
        }}
        onValuesChange={() => {
          setRows(undefined);
          setKey(crypto.randomUUID());
        }}
      >
        <Space wrap>
          <Form.Item
            name="name"
            label={tr('比较名称', 'Comparison name')}
            rules={[{ required: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="currency" label={tr('原币', 'Currency')}>
            <Select
              style={{ width: 100 }}
              options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item
            name="period"
            label={tr('统一比较期间', 'Shared comparison period')}
            rules={[{ required: true }]}
          >
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item
            name="budget"
            label={tr('期间费用上限', 'Period budget')}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={100000000} precision={2} />
          </Form.Item>
          <Form.Item
            name="hours"
            label={tr('期间可用小时（可不填）', 'Available hours (optional)')}
          >
            <InputNumber min={0} max={1000000} />
          </Form.Item>
        </Space>
        <Form.List name="options">
          {(fields) =>
            fields.map((f) => (
              <Card key={f.key} size="small">
                <Space wrap>
                  <Form.Item
                    name={[f.name, 'name']}
                    label={tr('出行方式', 'Transport mode')}
                    rules={[{ required: true }]}
                  >
                    <Input maxLength={100} />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'cost']}
                    label={tr('期间总费用', 'Total period cost')}
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} max={100000000} precision={2} />
                  </Form.Item>
                  <Form.Item
                    name={[f.name, 'hours']}
                    label={tr('期间总小时', 'Total period hours')}
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={0} max={1000000} />
                  </Form.Item>
                  {(['comfort', 'flexibility'] as const).map((name) => (
                    <Form.Item
                      key={name}
                      name={[f.name, name]}
                      label={
                        name === 'comfort'
                          ? tr('舒适度0至10', 'Comfort 0–10')
                          : tr('灵活性0至10', 'Flexibility 0–10')
                      }
                      rules={[{ required: true }]}
                    >
                      <InputNumber min={0} max={10} />
                    </Form.Item>
                  ))}
                </Space>
              </Card>
            ))
          }
        </Form.List>
        <Form.Item name="confirm" valuePropName="checked">
          <Checkbox>
            {tr(
              '已核实全部期间费用和评分，默认数字不是推荐值',
              'I reviewed all period costs and scores; defaults are not recommendations',
            )}
          </Checkbox>
        </Form.Item>
        <Space>
          <Button
            onClick={() => void compare(false)}
            disabled={busy || !!saved}
          >
            {tr('比较方案', 'Compare options')}
          </Button>
          <Button onClick={() => void compare(true)} disabled={busy || !!saved}>
            {tr('保存到消费价值实验室', 'Save to spending value lab')}
          </Button>
        </Space>
      </Form>
      {rows && (
        <Table<ValueResult>
          rowKey="id"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 600 }}
          columns={[
            { title: tr('方案序号', 'Option'), dataIndex: 'id' },
            { title: tr('期间费用', 'Period cost'), dataIndex: 'totalCost' },
            { title: tr('小时', 'Hours'), dataIndex: 'hours' },
            {
              title: tr('主观加权分', 'Subjective score'),
              dataIndex: 'preferenceScore',
            },
            {
              title: tr('约束结果', 'Constraints'),
              render: (_, r) =>
                r.feasible
                  ? tr('符合所填约束', 'Meets supplied constraints')
                  : r.reasons.join(' · '),
            },
          ]}
        />
      )}
      {saved && (
        <Alert
          type="success"
          message={`${tr('已保存方案', 'Saved decision')}: ${saved}`}
        />
      )}
      <Typography.Link href="/planning/spending-value">
        {tr(
          '打开消费价值实验室编辑和复盘',
          'Open spending value lab to edit and review',
        )}
      </Typography.Link>
      <Form
        name="vehicle-approval"
        form={approval}
        layout="vertical"
        disabled={busy || !!draft}
        initialValues={{ vehicleId, currency: 'CNY' }}
        style={{ marginTop: 20 }}
      >
        <Space wrap>
          <Form.Item
            name="vehicleId"
            label={tr('审批所属车辆', 'Approval vehicle')}
            rules={[{ required: true }]}
          >
            <Select
              style={{ width: 180 }}
              options={vehicles.map((v) => ({ value: v.id, label: v.name }))}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label={tr('维修、保养或改装事项', 'Repair, maintenance or upgrade')}
            rules={[{ required: true }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="amount"
            label={tr('申请金额', 'Requested amount')}
            rules={[{ required: true }]}
          >
            <InputNumber min={0.01} max={100000000} precision={2} />
          </Form.Item>
          <Form.Item name="currency" label={tr('申请原币', 'Request currency')}>
            <Select
              style={{ width: 100 }}
              options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
        </Space>
        <Form.Item
          name="reason"
          label={tr('依据与必要性', 'Evidence and necessity')}
          rules={[{ required: true }]}
        >
          <Input.TextArea maxLength={2000} />
        </Form.Item>
        <Button
          loading={busy}
          disabled={!!draft}
          onClick={() => void createApproval()}
        >
          {tr('创建消费审批草稿', 'Create spending approval draft')}
        </Button>
      </Form>
      {draft && (
        <Alert
          type="success"
          message={`${tr('已创建审批草稿', 'Approval draft created')}: ${draft}`}
        />
      )}
      <Typography.Link href="/spending-approvals">
        {tr('打开消费审批中心处理', 'Open spending approval center')}
      </Typography.Link>
      {error && <Alert type="error" message={error} />}
    </Card>
  );
}
