import { CURRENCY_CODES } from '../../constants/currencies';
import { PayrollDeleteButton } from './DeleteButton';
import { useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Row as GridRow,
  Space,
  Switch,
  Table,
} from 'antd';
import { Select } from '../../components/TouchSelect';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/Feedback';
import { Sensitive } from '../../components/Sensitive';
import { payrollApi, type Row, type Page } from './api';
import { usePayMobile, usePayLabel, usePayText } from './text';
import { usePayrollCatalog } from './catalog';
export interface Field {
  name: string;
  label: [string, string];
  type?:
    | 'date'
    | 'month'
    | 'money'
    | 'int'
    | 'boolean'
    | 'textarea'
    | 'select'
    | 'ref'
    | 'list';
  options?: string[];
  ref?:
    | 'employers'
    | 'employments'
    | 'plans'
    | 'policies'
    | 'funds'
    | 'taxRules'
    | 'accounts';
  required?: boolean;
  fields?: Field[];
  defaults?: Record<string, unknown>;
}
const textField = (
  name: string,
  zh: string,
  en: string,
  type?: Field['type'],
  required = true,
): Field => ({ name, label: [zh, en], type, required });
const refField = (
  name: string,
  zh: string,
  en: string,
  ref: Field['ref'],
  required = false,
): Field => ({ name, label: [zh, en], type: 'ref', ref, required });
const options = (
  name: string,
  zh: string,
  en: string,
  values: string[],
): Field => ({ ...textField(name, zh, en, 'select'), options: values });
export const itemFields: Field[] = [
  textField('name', '项目名称', 'Name'),
  textField('code', '项目编码', 'Code'),
  options('kind', '收发类型', 'Type', ['Earning', 'Deduction', 'Adjustment']),
  options('category', '项目分类', 'Category', [
    'Base',
    'Performance',
    'Commission',
    'AnnualBonus',
    'QuarterlyBonus',
    'Overtime',
    'BackPay',
    'Allowance',
    'Other',
    'Pension',
    'Medical',
    'Unemployment',
    'HousingFund',
    'Tax',
    'OtherDeduction',
  ]),
  textField('amount', '项目金额', 'Amount', 'money'),
  options('taxTreatment', '计税属性', 'Tax treatment', [
    'Taxable',
    'Exempt',
    'NotApplicable',
    'Unspecified',
  ]),
  textField('quantity', '数量／工时', 'Units / hours', 'money'),
  textField('unitRate', '单价／费率金额', 'Unit amount', 'money'),
  textField(
    'insuranceBasis',
    '计入社保基数',
    'Insurance basis',
    'boolean',
    false,
  ),
  textField(
    'housingBasis',
    '计入公积金基数',
    'Housing basis',
    'boolean',
    false,
  ),
  textField('sortOrder', '排序', 'Order', 'int'),
  options('status', '状态', 'Status', ['Active', 'Inactive']),
];
export const defaultItem = {
  name: '',
  code: '',
  kind: 'Earning',
  category: 'Base',
  amount: '0',
  taxTreatment: 'Taxable',
  quantity: '1',
  unitRate: '0',
  insuranceBasis: true,
  housingBasis: true,
  sortOrder: 0,
  status: 'Active',
};
export const itemsField: Field = {
  name: 'items',
  label: ['工资项目', 'Pay items'],
  type: 'list',
  fields: itemFields,
  defaults: defaultItem,
};
export function Fields({
  fields,
  prefix = [],
}: {
  fields: Field[];
  prefix?: (string | number)[];
}) {
  const t = usePayText();
  const label = usePayLabel();
  const catalog = usePayrollCatalog();
  const control = (f: Field) => {
    if (f.type === 'list')
      return (
        <Form.List name={[...prefix, f.name]}>
          {(rows, { add, remove }) => (
            <div className="payroll-items">
              {rows.map((row) => (
                <Card
                  size="small"
                  key={row.key}
                  title={t('项目', 'Item') + ' ' + (row.name + 1)}
                  extra={
                    <Button danger type="text" onClick={() => remove(row.name)}>
                      {t('移除', 'Remove')}
                    </Button>
                  }
                >
                  <Fields fields={f.fields || []} prefix={[row.name]} />
                </Card>
              ))}
              <Button onClick={() => add({ ...f.defaults })}>
                {t('添加项目', 'Add item')}
              </Button>
            </div>
          )}
        </Form.List>
      );
    if (f.type === 'ref') {
      const ref = catalog[f.ref!];
      const rows = (ref.data || []) as unknown as Record<string, unknown>[];
      return (
        <Select
          showSearch
          allowClear
          optionFilterProp="label"
          loading={ref.isPending}
          options={rows.map((x) => ({
            value: String(x.id),
            label: [
              x.name,
              x.employerName,
              x.position,
              x.policyVersion,
              x.revision ? `v${x.revision}` : '',
              x.currency,
            ]
              .filter(Boolean)
              .join(' · '),
          }))}
        />
      );
    }
    if (f.type === 'select')
      return (
        <Select
          options={(f.options || []).map((x) => ({
            value: x,
            label: x ? label(x) : t('独立征缴', 'Separate collection'),
          }))}
        />
      );
    if (f.type === 'boolean') return <Switch />;
    if (f.type === 'textarea')
      return <Input.TextArea rows={3} maxLength={4000} showCount />;
    if (f.type === 'int')
      return <InputNumber precision={0} style={{ width: '100%' }} />;
    if (f.type === 'date' || f.type === 'month') return <Input type={f.type} />;
    return (
      <Input
        inputMode={f.type === 'money' ? 'decimal' : undefined}
        maxLength={f.type === 'money' ? 24 : 200}
      />
    );
  };
  return (
    <GridRow gutter={16}>
      {fields.map((f) => (
        <Col
          key={f.name}
          span={24}
          md={f.type === 'list' || f.type === 'textarea' ? 24 : 12}
        >
          {f.type === 'list' ? (
            <div>
              <h4>{t(...f.label)}</h4>
              {control(f)}
            </div>
          ) : (
            <Form.Item
              name={[...prefix, f.name]}
              label={t(...f.label)}
              valuePropName={f.type === 'boolean' ? 'checked' : 'value'}
              rules={
                f.required
                  ? [
                      {
                        required: true,
                        message: t('请填写此项', 'Please complete this field'),
                      },
                    ]
                  : undefined
              }
            >
              {control(f)}
            </Form.Item>
          )}
        </Col>
      ))}
    </GridRow>
  );
}
export interface Model {
  params?: Record<string, string>;
  resource: string;
  fields: Field[];
  defaults: Record<string, unknown>;
  mutable?: boolean;
  columns: string[];
  description: [string, string];
}
export const models: Record<string, Model> = {
  employers: {
    resource: 'employers',
    mutable: true,
    columns: ['name', 'type', 'city', 'status'],
    description: [
      '支持多家单位；工作经历可同时在职。',
      'Manage multiple employers, including overlapping employment.',
    ],
    defaults: { type: 'Enterprise', status: 'Active', city: '', note: '' },
    fields: [
      textField('name', '单位名称', 'Employer name'),
      options('type', '单位类型', 'Employer type', [
        'Enterprise',
        'PublicInstitution',
        'Government',
        'OtherEmployer',
      ]),
      textField('city', '所属城市', 'City', undefined, false),
      options('status', '状态', 'Status', ['Active', 'Archived']),
      textField('note', '备注', 'Notes', 'textarea', false),
    ],
  },
  employments: {
    resource: 'employments',
    mutable: true,
    columns: ['employerName', 'position', 'startDate', 'endDate', 'status'],
    description: [
      '保留多段工作经历，不限制同一时间只有一份工作；发薪日遇短月按月末展示。',
      'Keep multiple employment periods. Concurrent jobs are allowed; planned paydays clamp to month end.',
    ],
    defaults: {
      workplace: '',
      position: '',
      department: '',
      employeeNumber: '',
      payCycle: 'Monthly',
      payDay: 15,
      accountId: null,
      insuranceCity: '',
      housingCity: '',
      endDate: null,
      status: 'Active',
    },
    fields: [
      refField('employerId', '就业单位', 'Employer', 'employers', true),
      textField('workplace', '工作地点', 'Workplace', undefined, false),
      textField('startDate', '入职日期', 'Start date', 'date'),
      textField('endDate', '离职日期', 'End date', 'date', false),
      textField('position', '岗位', 'Position', undefined, false),
      textField('department', '部门', 'Department', undefined, false),
      textField(
        'employeeNumber',
        '员工编号',
        'Employee number',
        undefined,
        false,
      ),
      options('payCycle', '发薪周期', 'Pay cycle', [
        'Monthly',
        'Weekly',
        'Biweekly',
        'AdHoc',
      ]),
      textField('payDay', '默认发薪日（1–31）', 'Default payday (1–31)', 'int'),
      refField('accountId', '默认到账账户', 'Default bank account', 'accounts'),
      textField(
        'insuranceCity',
        '社保参保城市',
        'Insurance city',
        undefined,
        false,
      ),
      textField(
        'housingCity',
        '公积金缴存城市',
        'Housing fund city',
        undefined,
        false,
      ),
      options('status', '在职状态', 'Employment status', [
        'Active',
        'Left',
        'Paused',
      ]),
    ],
  },
  plans: {
    resource: 'plans',
    columns: [
      'name',
      'payBasis',
      'currency',
      'effectiveFrom',
      'effectiveTo',
      'revision',
    ],
    description: [
      '每次修订新增不可变版本。时薪、日薪与计件方案记录数量和单价，生成后请核对实际项目金额；税务性质由属性决定。',
      'Revisions create immutable versions. Hourly, daily and piecework plans retain units and rates; review actual amounts after generation. Tax treatment is explicit.',
    ],
    defaults: {
      payBasis: 'Monthly',
      currency: 'CNY',
      effectiveTo: null,
      items: [{ ...defaultItem, name: '基本工资', code: 'BASE' }],
    },
    fields: [
      refField('employmentId', '工作经历', 'Employment', 'employments', true),
      textField('name', '方案名称', 'Plan name'),
      options('payBasis', '工资基准', 'Pay basis', [
        'Monthly',
        'Hourly',
        'Daily',
        'Piecework',
      ]),
      options('currency', '原始币种', 'Currency', CURRENCY_CODES),
      textField('effectiveFrom', '生效日期', 'Effective from', 'date'),
      textField('effectiveTo', '终止日期', 'Effective to', 'date', false),
      itemsField,
    ],
  },
  insurance: {
    resource: 'contributions',
    mutable: true,
    columns: [
      'month',
      'kind',
      'region',
      'personalAmount',
      'employerAmount',
      'expectedPersonal',
      'expectedEmployer',
      'personalDifference',
      'employerDifference',
      'paymentStatus',
      'state',
      'sourceEvidence',
    ],
    description: [
      '自动添加工资条中的养老、医疗、失业个人扣款，标为待核对；日期取发薪日期，单位缴费及基数需补充。手动核对后不再自动覆盖，删除后不自动重建。记录不产生银行收入或资产。',
      'Pension, medical and unemployment deductions are added from payslips as pending, using the pay date. Add employer amounts and contribution bases after review. Manual edits are preserved and deleted records stay excluded. No cash or assets are created.',
    ],
    defaults: {
      currency: 'CNY',
      kind: 'Pension',
      basis: '0',
      personalAmount: '0',
      employerAmount: '0',
      state: 'Pending',
      paymentStatus: 'Normal',
      employmentId: null,
      policyId: null,
      fundAccountId: null,
      payrollId: null,
      sourceEvidence: '',
      note: '',
    },
    fields: [
      textField('month', '缴费归属月', 'Contribution month', 'month'),
      textField('paidDate', '缴费／计划日期', 'Paid / planned date', 'date'),
      textField('region', '参保地区', 'Region'),
      options('kind', '险种', 'Insurance', [
        'Pension',
        'Medical',
        'Unemployment',
        'WorkInjury',
        'Maternity',
        'HousingFund',
      ]),
      options('currency', '币种', 'Currency', CURRENCY_CODES),
      textField('basis', '缴费基数', 'Contribution base', 'money'),
      textField(
        'personalAmount',
        '个人实际／预计缴费',
        'Personal actual / expected',
        'money',
      ),
      textField(
        'employerAmount',
        '单位实际／预计缴费',
        'Employer actual / expected',
        'money',
      ),
      refField('employmentId', '工作经历', 'Employment', 'employments'),
      refField('policyId', '政策版本', 'Policy version', 'policies'),
      refField(
        'fundAccountId',
        '公积金账户（公积金项目）',
        'Fund account (housing only)',
        'funds',
      ),
      options('paymentStatus', '缴费性质', 'Payment nature', [
        'Normal',
        'Supplementary',
        'Arrears',
        'Adjustment',
      ]),
      options('state', '确认状态', 'Record status', [
        'Pending',
        'Confirmed',
        'Cancelled',
      ]),
      textField(
        'sourceEvidence',
        '来源依据',
        'Source evidence',
        'textarea',
        false,
      ),
      textField('note', '备注', 'Notes', 'textarea', false),
    ],
  },
  housing: {
    resource: 'fund-accounts',
    mutable: true,
    columns: [
      'name',
      'city',
      'reportedBalance',
      'balanceDate',
      'balanceSource',
      'status',
    ],
    description: [
      '实际余额以有依据的账户记录为准。关联既有资产账户后不另加净资产，预计缴存不会自动推算余额。',
      'Balances come from evidenced statements. Linking an existing asset account does not add net worth; expected deposits never infer the actual balance.',
    ],
    defaults: {
      currency: 'CNY',
      reportedBalance: '0',
      balanceSource: 'ManualStatement',
      employmentId: null,
      accountId: null,
      loanBusinessId: null,
      status: 'Active',
    },
    fields: [
      textField('name', '公积金账户名称', 'Fund account name'),
      textField('city', '缴存城市', 'City'),
      options('currency', '币种', 'Currency', CURRENCY_CODES),
      refField(
        'employmentId',
        '缴存单位／工作经历',
        'Employment',
        'employments',
      ),
      refField(
        'accountId',
        '关联已有资产账户',
        'Existing asset account',
        'accounts',
      ),
      textField(
        'loanBusinessId',
        '已有公积金贷款业务编号（可选）',
        'Existing housing loan business ID',
        undefined,
        false,
      ),
      textField('reportedBalance', '实际账户余额', 'Reported balance', 'money'),
      textField('balanceDate', '余额核对日期', 'Balance as of', 'date'),
      options('balanceSource', '余额来源', 'Balance source', [
        'ManualStatement',
        'ProviderStatement',
      ]),
      textField('evidence', '来源依据', 'Evidence', 'textarea'),
      options('status', '状态', 'Status', ['Active', 'Transferred', 'Closed']),
    ],
  },
  'fund-events': {
    resource: 'fund-events',
    columns: ['month', 'kind', 'amount', 'status', 'businessDate'],
    description: [
      '预计与到账分别记录；提取、结息与转移只做明细跟踪，关联交易不会重复过账，也不会改变核对余额。',
      'Track expected and received events separately. Withdrawals, interest and transfers never repost linked transactions or alter reported balances.',
    ],
    defaults: {
      kind: 'Deposit',
      amount: '0',
      currency: 'CNY',
      status: 'Expected',
      transactionId: null,
    },
    fields: [
      refField('fundAccountId', '公积金账户', 'Fund account', 'funds', true),
      options('kind', '业务类型', 'Event type', [
        'Deposit',
        'Supplementary',
        'Withdrawal',
        'Interest',
        'TransferIn',
        'TransferOut',
      ]),
      textField('month', '归属月份', 'Month', 'month'),
      textField('businessDate', '业务日期', 'Business date', 'date'),
      textField('amount', '金额', 'Amount', 'money'),
      options('currency', '币种', 'Currency', CURRENCY_CODES),
      options('status', '到账状态', 'Arrival status', [
        'Expected',
        'Received',
        'Cancelled',
      ]),
      textField(
        'transactionId',
        '关联既有交易编号（可选）',
        'Existing transaction ID',
        undefined,
        false,
      ),
      textField('evidence', '来源依据', 'Evidence', 'textarea'),
    ],
  },
};
const columnLabels: Record<string, [string, string]> = {
  expectedPersonal: ['预计个人缴费', 'Expected personal'],
  expectedEmployer: ['预计单位缴费', 'Expected employer'],
  personalDifference: ['个人差额', 'Personal difference'],
  employerDifference: ['单位差额', 'Employer difference'],
  policyVersion: ['政策版本', 'Policy version'],
  year: ['年度', 'Year'],
  verified: ['来源核验', 'Verified'],
  name: ['名称', 'Name'],
  type: ['类型', 'Type'],
  city: ['城市', 'City'],
  status: ['状态', 'Status'],
  state: ['状态', 'Status'],
  employerName: ['单位', 'Employer'],
  position: ['岗位', 'Position'],
  startDate: ['入职日期', 'Start date'],
  endDate: ['离职日期', 'End date'],
  payBasis: ['工资基准', 'Pay basis'],
  currency: ['币种', 'Currency'],
  effectiveFrom: ['生效日期', 'Effective from'],
  effectiveTo: ['终止日期', 'Effective to'],
  revision: ['历史版本', 'Revision'],
  month: ['归属月份', 'Month'],
  kind: ['项目', 'Kind'],
  region: ['地区', 'Region'],
  personalAmount: ['个人缴费', 'Personal'],
  employerAmount: ['单位缴费', 'Employer'],
  paymentStatus: ['缴费性质', 'Nature'],
  sourceEvidence: ['来源／依据', 'Source / evidence'],
  reportedBalance: ['实际余额', 'Reported balance'],
  balanceDate: ['余额日期', 'Balance date'],
  balanceSource: ['余额来源', 'Source'],
  amount: ['金额', 'Amount'],
  businessDate: ['业务日期', 'Date'],
};
export function RecordManager({ model }: { model: Model }) {
  const mobile = usePayMobile();
  const t = usePayText();
  const label = usePayLabel();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>();
  const [form] = Form.useForm();
  const cache = useQueryClient();
  const { message } = App.useApp();
  const sync = useQuery({
    queryKey: ['payroll-contribution-sync', model.resource],
    queryFn: () => payrollApi.write('/contributions/sync', {}),
    enabled: model.resource === 'contributions',
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const query = useQuery({
    queryKey: [
      'payroll-center',
      model.resource,
      model.params,
      page,
      model.resource === 'contributions' ? sync.dataUpdatedAt : 0,
    ],
    enabled: model.resource !== 'contributions' || sync.isSuccess,
    queryFn: () =>
      payrollApi.get<Row[] | Page<Row>>('/' + model.resource, {
        page,
        pageSize: 15,
        ...model.params,
      }),
  });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      const payload = { ...body };
      for (const [key, v] of Object.entries(payload))
        if (v === '' && /Id$|Date$|effectiveTo/.test(key)) payload[key] = null;
      return payrollApi.write(
        '/' +
          model.resource +
          (editing && model.mutable ? '/' + editing.id : ''),
        payload,
        editing && model.mutable ? editing.version : undefined,
        editing && model.mutable ? 'put' : 'post',
      );
    },
    onSuccess: () => {
      setEditing(undefined);
      void cache.invalidateQueries({ queryKey: ['payroll-center'] });
      message.success(t('已保存', 'Saved'));
    },
  });
  const open = (row: Row | null) => {
    save.reset();
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      ...model.defaults,
      ...row,
      ...(row?.sourceEvidence === 'PayrollDeduction'
        ? {
            sourceEvidence: t(
              '工资条个人社保扣款（已手动核对）',
              'Payslip personal deductions (manually reviewed)',
            ),
          }
        : {}),
      ...(!model.mutable && row ? { previousId: row.id } : {}),
    });
  };
  const data = Array.isArray(query.data) ? query.data : query.data?.items || [];
  return (
    <>
      <Card
        extra={
          <Space>
            <Button
              onClick={() =>
                model.resource === 'contributions'
                  ? void sync.refetch()
                  : void query.refetch()
              }
            >
              {t('刷新', 'Refresh')}
            </Button>
            <Button type="primary" onClick={() => open(null)}>
              {t('新增记录', 'New record')}
            </Button>
          </Space>
        }
      >
        {sync.isError && model.resource === 'contributions' ? (
          <ErrorState error={sync.error} retry={() => void sync.refetch()} />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          <Table
            rowKey="id"
            loading={query.isPending}
            dataSource={data}
            scroll={{ x: 760 }}
            pagination={
              Array.isArray(query.data)
                ? { pageSize: 15 }
                : {
                    current: page,
                    pageSize: 15,
                    total: query.data?.total || 0,
                    onChange: setPage,
                    showSizeChanger: false,
                  }
            }
            columns={[
              ...model.columns.map((key) => ({
                title: columnLabels[key] ? t(...columnLabels[key]) : label(key),
                dataIndex: key,
                render: (v: unknown) =>
                  /Amount|Balance|Difference|^amount$|^expected/.test(key) ? (
                    <Sensitive>
                      <span className="payroll-money">{String(v ?? '—')}</span>
                    </Sensitive>
                  ) : (
                    <span>
                      {typeof v === 'boolean'
                        ? v
                          ? t('是', 'Yes')
                          : t('否', 'No')
                        : label(String(v ?? '—'))}
                    </span>
                  ),
              })),
              {
                title: t('操作', 'Actions'),
                key: 'actions',
                render: (_: unknown, row: Row) => (
                  <Space wrap>
                    <Button onClick={() => open(row)}>
                      {model.mutable
                        ? t('编辑', 'Edit')
                        : t('修订为新版本', 'Create revision')}
                    </Button>
                    {(model.resource === 'plans' ||
                      model.resource === 'contributions') && (
                      <PayrollDeleteButton
                        resource={model.resource}
                        row={row}
                        onDeleted={() => {
                          if (editing?.id === row.id) setEditing(undefined);
                        }}
                      />
                    )}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Drawer
        placement={mobile ? 'bottom' : 'right'}
        height={mobile ? '92vh' : undefined}
        title={
          editing
            ? model.mutable
              ? t('编辑记录', 'Edit record')
              : t('新增历史版本', 'New revision')
            : t('新增记录', 'New record')
        }
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        width={800}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="previousId" hidden>
            <Input />
          </Form.Item>
          <Fields fields={model.fields} />
          {save.isError && <ErrorState error={save.error} />}
          <Space>
            <Button onClick={() => setEditing(undefined)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button type="primary" htmlType="submit" loading={save.isPending}>
              {t('保存', 'Save')}
            </Button>
          </Space>
        </Form>
      </Drawer>
    </>
  );
}
