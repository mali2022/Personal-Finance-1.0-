import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Space,
  Table,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { PageTitle } from '../components/PageTitle';
import { Money } from '../components/Money';
import { Sensitive } from '../components/Sensitive';
import { ErrorState } from '../components/Feedback';
import { apiClient } from '../api/client';
import { t as tr, useLocale } from '../i18n';
import { useUI } from '../stores/ui';
import type { ApiResponse } from '../types';

interface Override {
  sequence: number;
  principal?: string | null;
  interest?: string | null;
  overdueInterest?: string | null;
  paidDate?: string | null;
}
interface InputData {
  name: string;
  principal: string;
  borrowDate: string;
  firstDate: string;
  periods: number;
  annualRate: number;
  overdueDailyRate: number;
  mode: string;
  overrides: Override[];
  note: string;
}
interface Plan {
  id: string;
  version: string;
  input: InputData;
}
interface Row {
  sequence: number;
  date: string;
  principal: number;
  interest: number;
  overdueInterest: number;
  total: number;
  remainingPrincipal: number;
  paidDate?: string;
  overdueDays: number;
  status: string;
}
interface Values extends Omit<InputData, 'borrowDate' | 'firstDate'> {
  borrowDate: dayjs.Dayjs;
  firstDate: dayjs.Dayjs;
}

export default function LoanSchedulesPage() {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [editing, setEditing] = useState<{ id?: string; version: string }>();
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [rowForm] = Form.useForm<Override & { paidDateValue?: dayjs.Dayjs }>();
  const [rowEdit, setRowEdit] = useState<Row>();
  const q = useQuery({
    queryKey: ['loan-schedules'],
    queryFn: () =>
      apiClient
        .get<ApiResponse<Plan[]>>('/loan-schedules')
        .then((r) => r.data.data),
  });
  const error = (e: unknown) =>
    message.error(
      e && typeof e === 'object' && 'message' in e
        ? String(e.message)
        : tr('操作失败'),
    );
  async function open(plan?: Plan) {
    if (hidden) return;
    form.resetFields();
    setRows([]);
    setOverrides([]);
    setDirty(false);
    form.setFieldsValue(
      plan
        ? {
            ...plan.input,
            borrowDate: dayjs(plan.input.borrowDate),
            firstDate: dayjs(plan.input.firstDate),
          }
        : {
            name: '',
            principal: '',
            borrowDate: dayjs(),
            firstDate: dayjs().add(1, 'month'),
            periods: 12,
            annualRate: 0,
            overdueDailyRate: 0,
            mode: 'EqualPayment',
            note: '',
          },
    );
    setEditing({ id: plan?.id, version: plan?.version || '0' });
    if (plan) {
      setBusy(true);
      setOverrides(plan.input.overrides);
      try {
        const r = await apiClient.get<ApiResponse<Plan & { schedule: Row[] }>>(
          `/loan-schedules/${plan.id}`,
        );
        form.setFieldsValue({
          ...r.data.data.input,
          borrowDate: dayjs(r.data.data.input.borrowDate),
          firstDate: dayjs(r.data.data.input.firstDate),
        });
        setEditing({ id: plan.id, version: r.data.data.version });
        setOverrides(r.data.data.input.overrides);
        setRows(r.data.data.schedule);
      } catch (e) {
        error(e);
        setEditing(undefined);
      } finally {
        setBusy(false);
      }
    }
  }
  async function body(next = overrides): Promise<InputData> {
    const v = await form.validateFields();
    return {
      ...v,
      principal: String(v.principal),
      borrowDate: v.borrowDate.format('YYYY-MM-DD'),
      firstDate: v.firstDate.format('YYYY-MM-DD'),
      overrides: next,
      note: v.note || '',
    };
  }
  async function preview(next = overrides) {
    const r = await apiClient.post<ApiResponse<Row[]>>(
      '/loan-schedules/preview',
      await body(next),
    );
    setRows(r.data.data);
    setDirty(false);
  }
  async function save() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      const data = await body();
      await apiClient.request({
        method: editing.id ? 'put' : 'post',
        url: `/loan-schedules${editing.id ? '/' + editing.id : ''}`,
        data,
        headers: {
          'If-Match': editing.version,
          'Idempotency-Key': crypto.randomUUID(),
        },
      });
      await cache.invalidateQueries({ queryKey: ['loan-schedules'] });
      setEditing(undefined);
      message.success(tr('计划已保存，真实资金不变'));
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  }
  const money = (value: number) => (
    <Money value={value.toFixed(2)} currency="CNY" />
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('借款还款计划')}</PageTitle>
        </div>
        <Button type="primary" disabled={hidden} onClick={() => void open()}>
          {tr('新增计划')}
        </Button>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Card>
          <Table<Plan>
            rowKey="id"
            loading={q.isPending}
            dataSource={q.data}
            scroll={{ x: 700 }}
            columns={[
              {
                title: tr('计划名称'),
                render: (_, p) => <Sensitive>{p.input.name}</Sensitive>,
              },
              {
                title: tr('借款本金'),
                render: (_, p) => (
                  <Money value={p.input.principal} currency="CNY" />
                ),
              },
              { title: tr('期数'), render: (_, p) => p.input.periods },
              { title: tr('首期还款日'), render: (_, p) => p.input.firstDate },
              {
                title: tr('操作'),
                render: (_, p) => (
                  <Button
                    type="link"
                    disabled={hidden}
                    onClick={() => void open(p)}
                  >
                    {tr('查看 / 修改')}
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}
      <Drawer
        title={tr('借款还款计划')}
        width="min(1200px, 100vw)"
        open={!!editing && !hidden}
        onClose={() => !busy && setEditing(undefined)}
        extra={
          <Button type="primary" loading={busy} onClick={() => void save()}>
            {tr('保存计划')}
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          disabled={busy}
          onValuesChange={() => setDirty(true)}
        >
          <Space wrap align="start">
            <Form.Item
              name="name"
              label={tr('计划名称')}
              rules={[{ required: true, whitespace: true }]}
            >
              <Input maxLength={150} />
            </Form.Item>
            <Form.Item
              name="principal"
              label={tr('借款本金（元）')}
              rules={[{ required: true }]}
            >
              <Input inputMode="decimal" />
            </Form.Item>
            <Form.Item
              name="borrowDate"
              label={tr('借款日期')}
              rules={[{ required: true }]}
            >
              <DatePicker />
            </Form.Item>
            <Form.Item
              name="firstDate"
              label={tr('首期还款日')}
              rules={[{ required: true }]}
            >
              <DatePicker />
            </Form.Item>
            <Form.Item
              name="periods"
              label={tr('还款期数')}
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={600} precision={0} />
            </Form.Item>
            <Form.Item
              name="annualRate"
              label={tr('年利率（%）')}
              rules={[{ required: true }]}
            >
              <InputNumber min={0} max={100} precision={6} />
            </Form.Item>
            <Form.Item
              name="overdueDailyRate"
              label={tr('逾期日利率（%）')}
              rules={[{ required: true }]}
            >
              <InputNumber min={0} max={100} precision={6} />
            </Form.Item>
            <Form.Item
              name="mode"
              label={tr('还款方式')}
              rules={[{ required: true }]}
            >
              <Select
                style={{ width: 160 }}
                options={[
                  { value: 'EqualPayment', label: tr('等额本息') },
                  { value: 'EqualPrincipal', label: tr('等额本金') },
                  { value: 'InterestOnly', label: tr('先息后本') },
                ]}
              />
            </Form.Item>
          </Space>
          <Form.Item name="note" label={tr('备注')}>
            <Input.TextArea maxLength={2000} rows={2} />
          </Form.Item>
        </Form>
        <Space wrap className="mb16">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await preview();
              } catch (e) {
                error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr('生成 / 刷新期表')}
          </Button>
          <Button
            disabled={busy || !overrides.length}
            onClick={async () => {
              setBusy(true);
              try {
                await preview([]);
                setOverrides([]);
              } catch (e) {
                error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr('清除逐期修改并重新计算')}
          </Button>
        </Space>
        {dirty && (
          <Alert
            className="mb16"
            type="warning"
            message={tr(
              '参数已修改，请刷新期表后核对。保存时也会重新计算；已有逐期修改会保留。',
            )}
          />
        )}
        {rows.length > 0 && (
          <>
            <Space wrap className="mb16">
              {(
                ['principal', 'interest', 'overdueInterest', 'total'] as const
              ).map((key, i) => (
                <span key={key}>
                  {tr(['本金合计', '利息合计', '逾期利息合计', '应还合计'][i])}
                  ：{money(rows.reduce((sum, r) => sum + r[key], 0))}
                </span>
              ))}
            </Space>
            <Table<Row>
              rowKey="sequence"
              dataSource={rows}
              scroll={{ x: 1150 }}
              pagination={{ defaultPageSize: 12, showSizeChanger: true }}
              columns={[
                { title: tr('期数'), dataIndex: 'sequence' },
                { title: tr('应还日期'), dataIndex: 'date' },
                ...(
                  [
                    'principal',
                    'interest',
                    'overdueInterest',
                    'total',
                    'remainingPrincipal',
                  ] as const
                ).map((key, i) => ({
                  title: tr(
                    ['本金', '利息', '逾期利息', '应还合计', '剩余本金'][i],
                  ),
                  render: (_: unknown, r: Row) => money(r[key]),
                })),
                { title: tr('实还日期'), render: (_, r) => r.paidDate || '—' },
                { title: tr('逾期天数'), dataIndex: 'overdueDays' },
                {
                  title: tr('状态'),
                  render: (_, r) => (
                    <Tag color={r.status === '逾期' ? 'red' : undefined}>
                      {tr(r.status)}
                    </Tag>
                  ),
                },
                {
                  title: tr('操作'),
                  render: (_, r) => (
                    <Button
                      type="link"
                      disabled={busy || dirty}
                      onClick={() => {
                        const o = overrides.find(
                          (x) => x.sequence === r.sequence,
                        );
                        rowForm.resetFields();
                        rowForm.setFieldsValue({
                          ...o,
                          paidDateValue: o?.paidDate
                            ? dayjs(o.paidDate)
                            : undefined,
                        });
                        setRowEdit(r);
                      }}
                    >
                      {tr('修改金额')}
                    </Button>
                  ),
                },
              ]}
            />
          </>
        )}
      </Drawer>
      <Drawer
        title={`${tr('修改第')} ${rowEdit?.sequence || ''} ${tr('期')}`}
        width="min(440px, 100vw)"
        open={!!rowEdit && !hidden}
        onClose={() => !busy && setRowEdit(undefined)}
        extra={
          <Button
            type="primary"
            loading={busy}
            onClick={async () => {
              if (!rowEdit || busy) return;
              setBusy(true);
              try {
                const v = await rowForm.validateFields();
                const next = [
                  ...overrides.filter((x) => x.sequence !== rowEdit.sequence),
                  {
                    sequence: rowEdit.sequence,
                    principal: v.principal || null,
                    interest: v.interest || null,
                    overdueInterest: v.overdueInterest || null,
                    paidDate: v.paidDateValue?.format('YYYY-MM-DD') || null,
                  },
                ];
                await preview(next);
                setOverrides(next);
                setRowEdit(undefined);
              } catch (e) {
                error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr('应用修改')}
          </Button>
        }
      >
        <Form form={rowForm} layout="vertical">
          {(['principal', 'interest', 'overdueInterest'] as const).map(
            (key, i) => (
              <Form.Item
                key={key}
                name={key}
                label={tr(['本金（元）', '利息（元）', '逾期利息（元）'][i])}
                rules={[
                  {
                    pattern: /^\d{1,12}(\.\d{1,2})?$/,
                    message: tr('请输入非负金额，最多两位小数'),
                  },
                ]}
              >
                <Input
                  inputMode="decimal"
                  placeholder={rowEdit ? rowEdit[key].toFixed(2) : ''}
                />
              </Form.Item>
            ),
          )}
          <Form.Item name="paidDateValue" label={tr('实还日期')}>
            <DatePicker disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
