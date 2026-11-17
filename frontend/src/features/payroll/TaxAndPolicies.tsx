import { WageScenario } from './WageScenario';
import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Descriptions,
  Drawer,
  Form,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/Feedback';
import { Sensitive } from '../../components/Sensitive';
import { Fields, RecordManager, type Field, type Model } from './Forms';
import { usePayrollCatalog } from './catalog';
import { payrollApi, value, type Row } from './api';
import { usePayMobile, usePayLabel, usePayText } from './text';
const insuranceFields: Field[] = [
  {
    name: 'kind',
    label: ['险种', 'Insurance'],
    type: 'select',
    options: [
      'Pension',
      'Medical',
      'Unemployment',
      'WorkInjury',
      'Maternity',
      'HousingFund',
    ],
    required: true,
  },
  { name: 'applicable', label: ['适用', 'Applicable'], type: 'boolean' },
  {
    name: 'lower',
    label: ['基数下限', 'Lower base'],
    type: 'money',
    required: true,
  },
  {
    name: 'upper',
    label: ['基数上限', 'Upper base'],
    type: 'money',
    required: true,
  },
  {
    name: 'personalRate',
    label: ['个人比例（0至1）', 'Personal rate (0–1)'],
    type: 'money',
    required: true,
  },
  {
    name: 'employerRate',
    label: ['单位比例（0至1）', 'Employer rate (0–1)'],
    type: 'money',
    required: true,
  },
  {
    name: 'collectedWith',
    label: [
      '合并征缴至（留空为独立征缴）',
      'Collected with (blank = separate)',
    ],
    type: 'select',
    options: [
      '',
      'Pension',
      'Medical',
      'Unemployment',
      'WorkInjury',
      'Maternity',
      'HousingFund',
    ],
  },
];
export const policyModel: Model = {
  resource: 'policies',
  columns: [
    'name',
    'region',
    'year',
    'policyVersion',
    'effectiveFrom',
    'effectiveTo',
    'verified',
  ],
  description: [
    '政策版本保存后不可覆盖。请按参保地区的有效文件配置基数、比例及合并征缴，保留来源；不预置未经核验的地方缴费率。',
    'Policy versions are immutable. Configure local bases, rates and merged collection from current evidence; unverified local rates are not supplied.',
  ],
  defaults: {
    year: 2026,
    verified: false,
    rates: [
      'Pension',
      'Medical',
      'Unemployment',
      'WorkInjury',
      'Maternity',
    ].map((kind) => ({
      kind,
      lower: '0',
      upper: '0',
      personalRate: '0',
      employerRate: '0',
      applicable: true,
      collectedWith: '',
    })),
  },
  fields: [
    { name: 'name', label: ['政策名称', 'Policy name'], required: true },
    { name: 'region', label: ['适用地区', 'Region'], required: true },
    { name: 'year', label: ['缴费年度', 'Year'], type: 'int', required: true },
    {
      name: 'policyVersion',
      label: ['政策版本（唯一）', 'Policy version (unique)'],
      required: true,
    },
    {
      name: 'effectiveFrom',
      label: ['生效日期', 'Effective from'],
      type: 'date',
      required: true,
    },
    {
      name: 'effectiveTo',
      label: ['终止日期', 'Effective to'],
      type: 'date',
      required: true,
    },
    {
      name: 'source',
      label: [
        '来源文件／网址与核验依据',
        'Source document / URL & verification',
      ],
      type: 'textarea',
      required: true,
    },
    {
      name: 'verified',
      label: ['已核验政策来源', 'Source verified'],
      type: 'boolean',
    },
    {
      name: 'rates',
      label: ['分险种配置', 'Insurance rates'],
      type: 'list',
      fields: insuranceFields,
      defaults: {
        kind: 'HousingFund',
        lower: '0',
        upper: '0',
        personalRate: '0',
        employerRate: '0',
        applicable: true,
        collectedWith: '',
      },
    },
  ],
};
const bracketFields: Field[] = [
  {
    name: 'upper',
    label: ['级距上限', 'Upper threshold'],
    type: 'money',
    required: true,
  },
  {
    name: 'rate',
    label: ['税率（0至1）', 'Rate (0–1)'],
    type: 'money',
    required: true,
  },
  {
    name: 'quick',
    label: ['速算扣除数', 'Quick deduction'],
    type: 'money',
    required: true,
  },
];
const deductionFields: Field[] = [
  {
    name: 'kind',
    label: ['扣除类别', 'Category'],
    required: true,
    type: 'select',
    options: [
      'ChildEducation',
      'InfantCare',
      'ContinuingEducation',
      'ProfessionalEducation',
      'SeriousIllness',
      'MortgageInterest',
      'HousingRent',
      'ElderCare',
    ],
  },
  {
    name: 'monthlyLimit',
    label: ['月度／年度限额', 'Monthly / annual limit'],
    type: 'money',
    required: true,
  },
  {
    name: 'annualOnly',
    label: ['仅年度情景适用', 'Annual scenario only'],
    type: 'boolean',
  },
  {
    name: 'conditions',
    label: ['资格条件及核对要求', 'Eligibility & review criteria'],
    type: 'textarea',
    required: true,
  },
];
export function PayrollPolicies() {
  const mobile = usePayMobile();
  const t = usePayText();
  const catalog = usePayrollCatalog();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const template = useQuery({
    queryKey: ['payroll-center', 'tax-template'],
    queryFn: () => payrollApi.get<Record<string, unknown>>('/tax-template'),
  });
  const save = useMutation({
    mutationFn: (v: unknown) => payrollApi.write('/tax-rules', v),
    onSuccess: () => {
      setOpen(false);
      void cache.invalidateQueries({ queryKey: ['payroll-center'] });
      message.success(t('规则版本已保存', 'Rule version saved'));
    },
  });
  const sources = (s: string) =>
    s.split('\n').map((x, i) =>
      x.startsWith('https://') ? (
        <p key={i}>
          <a href={x} target="_blank" rel="noreferrer">
            {x}
          </a>
        </p>
      ) : (
        <p key={i}>{x}</p>
      ),
    );
  return (
    <>
      <Tabs
        items={[
          {
            key: 'insurance',
            label: t('社保与公积金政策', 'Insurance & fund policies'),
            children: <RecordManager model={policyModel} />,
          },
          {
            key: 'tax',
            label: t('税务规则版本', 'Tax rule versions'),
            children: (
              <div className="payroll-stack">
                <Card
                  extra={
                    <Button
                      type="primary"
                      loading={template.isPending}
                      disabled={!template.data}
                      onClick={() => {
                        form.resetFields();
                        form.setFieldsValue(template.data);
                        save.reset();
                        setOpen(true);
                      }}
                    >
                      {t(
                        '使用参考规则建立版本',
                        'Create version from reference',
                      )}
                    </Button>
                  }
                >
                  {template.isError && <ErrorState error={template.error} />}
                  <Collapse
                    items={(catalog.taxRules.data || []).map((x) => ({
                      key: x.id,
                      label: (
                        <Space wrap>
                          {value(x, 'name')}
                          <Tag>{value(x, 'policyVersion')}</Tag>
                          {value(x, 'effectiveFrom')} →{' '}
                          {value(x, 'effectiveTo')}
                        </Space>
                      ),
                      children: (
                        <div>
                          <p>
                            {value(x, 'verified') === 'true'
                              ? t('来源已核验', 'Source verified')
                              : t(
                                  '未核验，不用于税额模拟',
                                  'Unverified; simulation disabled',
                                )}
                          </p>
                          {sources(value(x, 'source'))}
                          <RuleDetails
                            rule={x.rules as Record<string, unknown>}
                          />
                        </div>
                      ),
                    }))}
                  />
                  {!catalog.taxRules.data?.length && (
                    <p>
                      {t(
                        '尚未启用税务规则。请先核对参考来源并建立版本。',
                        'No tax rules enabled. Review sources and create a version first.',
                      )}
                    </p>
                  )}
                </Card>
              </div>
            ),
          },
        ]}
      />
      <Drawer
        placement={mobile ? 'bottom' : 'right'}
        height={mobile ? '92vh' : undefined}
        title={t('建立税务规则版本', 'Create tax rule version')}
        open={open}
        onClose={() => setOpen(false)}
        width={950}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Fields
            fields={[
              {
                name: 'name',
                label: ['规则名称', 'Rule name'],
                required: true,
              },
              {
                name: 'policyVersion',
                label: ['唯一版本号', 'Unique version'],
                required: true,
              },
              {
                name: 'effectiveFrom',
                label: ['生效日期', 'Effective from'],
                type: 'date',
                required: true,
              },
              {
                name: 'effectiveTo',
                label: ['终止日期', 'Effective to'],
                type: 'date',
                required: true,
              },
              {
                name: 'source',
                label: ['来源依据', 'Sources'],
                type: 'textarea',
                required: true,
              },
              {
                name: 'verified',
                label: [
                  '已核验来源及适用性',
                  'Sources & applicability verified',
                ],
                type: 'boolean',
              },
            ]}
          />
          <Fields
            prefix={['rules']}
            fields={[
              {
                name: 'scope',
                label: ['适用范围', 'Scope'],
                type: 'select',
                options: ['CNResidentSalary'],
                required: true,
              },
              {
                name: 'monthlyExpense',
                label: ['每月费用减除', 'Monthly expense deduction'],
                type: 'money',
                required: true,
              },
              {
                name: 'bonusUntil',
                label: ['奖金单独计税截止日', 'Separate bonus policy end'],
                type: 'date',
                required: true,
              },
              {
                name: 'annualBrackets',
                label: ['累计税率表', 'Cumulative tax bands'],
                type: 'list',
                fields: bracketFields,
                defaults: { upper: '0', rate: '0', quick: '0' },
              },
              {
                name: 'bonusBrackets',
                label: ['奖金月度换算税率表', 'Bonus monthly tax bands'],
                type: 'list',
                fields: bracketFields,
                defaults: { upper: '0', rate: '0', quick: '0' },
              },
              {
                name: 'deductions',
                label: ['专项附加扣除规则', 'Additional deduction rules'],
                type: 'list',
                fields: deductionFields,
                defaults: {
                  kind: 'ChildEducation',
                  monthlyLimit: '0',
                  annualOnly: false,
                  conditions: '',
                },
              },
            ]}
          />
          {save.isError && <ErrorState error={save.error} />}
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {t('保存新版本', 'Save new version')}
          </Button>
        </Form>
      </Drawer>
    </>
  );
}
function RuleDetails({ rule }: { rule: Record<string, unknown> }) {
  const t = usePayText();
  const label = usePayLabel();
  return (
    <>
      <Descriptions
        items={[
          {
            key: 'expense',
            label: t('每月费用减除', 'Monthly expense deduction'),
            children: String(rule.monthlyExpense),
          },
          {
            key: 'bonus',
            label: t('年终奖政策截止', 'Bonus policy end'),
            children: String(rule.bonusUntil),
          },
        ]}
      />
      <Table
        size="small"
        pagination={false}
        rowKey="upper"
        dataSource={rule.annualBrackets as Record<string, unknown>[]}
        columns={['upper', 'rate', 'quick'].map((x, i) => ({
          title: [
            t('级距上限', 'Upper'),
            t('税率', 'Rate'),
            t('速算扣除数', 'Quick deduction'),
          ][i],
          dataIndex: x,
        }))}
      />
      <ListRules
        rows={rule.deductions as Record<string, unknown>[]}
        label={label}
      />
    </>
  );
}
function ListRules({
  rows,
  label,
}: {
  rows: Record<string, unknown>[];
  label: (v: string) => string;
}) {
  return (
    <ul>
      {rows.map((d, i) => (
        <li key={i}>
          <strong>{label(String(d.kind))}</strong>: {String(d.monthlyLimit)} ·{' '}
          {String(d.conditions)}
        </li>
      ))}
    </ul>
  );
}
export function PayrollDeductions() {
  const mobile = usePayMobile();
  const t = usePayText();
  const label = usePayLabel();
  const catalog = usePayrollCatalog();
  const cache = useQueryClient();
  const [open, setOpen] = useState<Row | null>();
  const [form] = Form.useForm();
  const ruleId = Form.useWatch('ruleId', form) as string | undefined;
  const rules = catalog.taxRules.data?.find((x) => x.id === ruleId)?.rules as
    { deductions?: Record<string, unknown>[] } | undefined;
  const q = useQuery({
    queryKey: ['payroll-center', 'declarations'],
    queryFn: () => payrollApi.get<Row[]>('/declarations'),
  });
  const save = useMutation({
    mutationFn: (v: unknown) =>
      payrollApi.write(
        '/declarations' + (open ? '/' + open.id : ''),
        v,
        open?.version,
        open ? 'put' : 'post',
      ),
    onSuccess: () => {
      setOpen(undefined);
      void cache.invalidateQueries({ queryKey: ['payroll-center'] });
    },
  });
  const edit = (x: Row | null) => {
    save.reset();
    setOpen(x);
    form.resetFields();
    form.setFieldsValue({
      year: 2026,
      startMonth: 1,
      endMonth: 12,
      kind: 'ChildEducation',
      claimedAmount: '0',
      status: 'Pending',
      evidence: '',
      eligibility: {
        qualifies: false,
        units: 1,
        share: 1,
        onlyChild: false,
        housingExclusive: false,
      },
      ...x,
    });
  };
  return (
    <div className="payroll-stack">
      <Alert
        showIcon
        type="warning"
        message={t(
          '填报不等于依法可扣除。只有核验规则、资格自查、来源依据及限额检查通过的“已自查核对”记录才纳入模拟；这不等于税务机关审核。大病医疗仅用于年度情景。',
          'A claim is not a legal entitlement. Only self-reviewed declarations with verified rules, eligibility, evidence and checked limits enter simulations. This is not tax authority approval. Major medical is annual-only.',
        )}
      />
      <Card
        extra={
          <Button type="primary" onClick={() => edit(null)}>
            {t('新增扣除申报', 'New declaration')}
          </Button>
        }
      >
        {q.isError ? (
          <ErrorState error={q.error} />
        ) : (
          <Table
            rowKey="id"
            loading={q.isPending}
            dataSource={q.data || []}
            scroll={{ x: 750 }}
            columns={[
              { title: t('年度', 'Year'), dataIndex: 'year' },
              {
                title: t('类别', 'Category'),
                dataIndex: 'kind',
                render: label,
              },
              {
                title: t('申报金额', 'Claimed'),
                dataIndex: 'claimedAmount',
                render: (v: string) => <Sensitive>{v}</Sensitive>,
              },
              {
                title: t('纳入模拟金额', 'Accepted for simulation'),
                dataIndex: 'approvedAmount',
                render: (v: string) => <Sensitive>{v}</Sensitive>,
              },
              {
                title: t('状态', 'Status'),
                dataIndex: 'status',
                render: label,
              },
              {
                title: t('操作', 'Actions'),
                render: (_: unknown, x: Row) => (
                  <Button onClick={() => edit(x)}>{t('核对', 'Review')}</Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Drawer
        placement={mobile ? 'bottom' : 'right'}
        height={mobile ? '92vh' : undefined}
        title={t('专项附加扣除核对', 'Review additional deduction')}
        open={open !== undefined}
        onClose={() => setOpen(undefined)}
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Fields
            fields={[
              {
                name: 'employmentId',
                label: ['享受扣除的工作单位', 'Employment claiming deduction'],
                type: 'ref',
                ref: 'employments',
                required: true,
              },
              {
                name: 'ruleId',
                label: ['税务规则版本', 'Tax rule version'],
                type: 'ref',
                ref: 'taxRules',
                required: true,
              },
              {
                name: 'kind',
                label: ['扣除项目', 'Deduction category'],
                type: 'select',
                options: [
                  'ChildEducation',
                  'InfantCare',
                  'ContinuingEducation',
                  'ProfessionalEducation',
                  'SeriousIllness',
                  'MortgageInterest',
                  'HousingRent',
                  'ElderCare',
                ],
                required: true,
              },
              {
                name: 'year',
                label: ['适用年度', 'Year'],
                type: 'int',
                required: true,
              },
              {
                name: 'startMonth',
                label: ['开始月份（1–12）', 'Start month (1–12)'],
                type: 'int',
                required: true,
              },
              {
                name: 'endMonth',
                label: ['结束月份（1–12）', 'End month (1–12)'],
                type: 'int',
                required: true,
              },
              {
                name: 'claimedAmount',
                label: [
                  '每月申报金额（年度项目为全年额）',
                  'Monthly claim (annual-only items: annual amount)',
                ],
                type: 'money',
                required: true,
              },
              {
                name: 'evidence',
                label: [
                  '资格与额度核对依据（勿填写完整证件号）',
                  'Eligibility & amount evidence (omit full ID numbers)',
                ],
                type: 'textarea',
              },
              {
                name: 'status',
                label: ['核对状态', 'Review status'],
                type: 'select',
                options: ['Pending', 'Reviewed', 'Rejected'],
                required: true,
              },
            ]}
          />
          <Collapse
            items={[
              {
                key: 'conditions',
                label: t('查看该版本资格条件', 'View eligibility conditions'),
                children: (
                  <ListRules rows={rules?.deductions || []} label={label} />
                ),
              },
            ]}
            style={{ marginBottom: 20 }}
          />
          <Fields
            prefix={['eligibility']}
            fields={[
              {
                name: 'qualifies',
                label: [
                  '已逐项核对资格、有效月份与不重复享受条件',
                  'Eligibility, months & non-duplication reviewed',
                ],
                type: 'boolean',
              },
              {
                name: 'units',
                label: [
                  '符合条件的子女／婴幼儿人数',
                  'Eligible children / infants',
                ],
                type: 'int',
              },
              {
                name: 'share',
                label: ['本人分摊比例（0至1）', 'Personal share (0–1)'],
                type: 'money',
              },
              {
                name: 'onlyChild',
                label: ['赡养老人：本人为独生子女', 'Elder care: only child'],
                type: 'boolean',
              },
              {
                name: 'housingExclusive',
                label: [
                  '已核对夫妻住房租金与贷款利息年度互斥',
                  'Annual spouse rent / mortgage exclusivity reviewed',
                ],
                type: 'boolean',
              },
            ]}
          />
          {save.isError && <ErrorState error={save.error} />}
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            {t('保存核对结果', 'Save review')}
          </Button>
        </Form>
      </Drawer>
    </div>
  );
}
export function PayrollTax() {
  const t = usePayText();
  const label = usePayLabel();
  const [form] = Form.useForm();
  const cache = useQueryClient();
  const [result, setResult] = useState<Record<string, unknown>>();
  const history = useQuery({
    queryKey: ['payroll-center', 'tax-calculations'],
    queryFn: () => payrollApi.get<Row[]>('/tax-calculations'),
  });
  const simulate = useMutation({
    mutationFn: (v: unknown) =>
      payrollApi.write<{ id: string; result: Record<string, unknown> }>(
        '/tax-simulations',
        v,
      ),
    onSuccess: (d) => {
      setResult(d.result);
      void cache.invalidateQueries({
        queryKey: ['payroll-center', 'tax-calculations'],
      });
    },
  });
  const loadContext = useMutation({
    mutationFn: () =>
      payrollApi.get<Record<string, unknown>>('/tax-context', {
        employmentId: form.getFieldValue('employmentId'),
        month: form.getFieldValue('month'),
      }),
    onSuccess: (v) => form.setFieldsValue(v),
  });
  const fields: Field[] = [
    {
      name: 'employmentId',
      label: ['扣缴单位／工作经历', 'Withholding employment'],
      type: 'ref',
      ref: 'employments',
      required: true,
    },
    {
      name: 'ruleId',
      label: ['已核验规则版本', 'Verified rule version'],
      type: 'ref',
      ref: 'taxRules',
      required: true,
    },
    {
      name: 'month',
      label: [
        '实际发薪年月（不是归属月）',
        'Payment year/month (not earning month)',
      ],
      type: 'month',
      required: true,
    },
    {
      name: 'expenseMonths',
      label: [
        '本单位当年费用减除月份数',
        'Expense deduction months for this employer',
      ],
      type: 'int',
      required: true,
    },
    {
      name: 'scenario',
      label: ['模拟情景', 'Scenario'],
      type: 'select',
      options: ['Cumulative', 'Annual', 'BonusSeparate', 'BonusCombined'],
      required: true,
    },
    {
      name: 'taxableIncome',
      label: [
        '累计收入（不含另填的年终奖）',
        'Cumulative income (excluding separate bonus input)',
      ],
      type: 'money',
      required: true,
    },
    {
      name: 'exemptIncome',
      label: ['累计免税收入（已核对）', 'Cumulative exempt income (reviewed)'],
      type: 'money',
      required: true,
    },
    {
      name: 'specialDeductions',
      label: [
        '累计合法专项扣除（个人社保公积金）',
        'Cumulative eligible social / fund deductions',
      ],
      type: 'money',
      required: true,
    },
    {
      name: 'otherDeductions',
      label: [
        '累计其他依法扣除（已核对）',
        'Other cumulative lawful deductions (reviewed)',
      ],
      type: 'money',
      required: true,
    },
    {
      name: 'taxRelief',
      label: [
        '累计减免税额（已核对）',
        'Cumulative lawful tax relief (reviewed)',
      ],
      type: 'money',
      required: true,
    },
    {
      name: 'alreadyWithheld',
      label: [
        '累计已预扣税款（不含本期）',
        'Tax previously withheld (excluding current period)',
      ],
      type: 'money',
      required: true,
    },
    {
      name: 'actualTax',
      label: ['工资条实际本期个税', 'Actual current payslip tax'],
      type: 'money',
      required: true,
    },
    {
      name: 'bonus',
      label: ['年终奖情景金额', 'Annual bonus scenario amount'],
      type: 'money',
      required: true,
    },
    {
      name: 'bonusEligible',
      label: [
        '已核对全年一次性奖金资格且本年度未重复使用',
        'Eligible annual bonus and not already used this year',
      ],
      type: 'boolean',
    },
    {
      name: 'resident',
      label: ['中国大陆居民个人', 'Mainland China tax resident'],
      type: 'boolean',
    },
    {
      name: 'crossBorder',
      label: ['含跨境收入（首期不支持）', 'Cross-border income (unsupported)'],
      type: 'boolean',
    },
  ];
  const resultLabels: Record<string, [string, string]> = {
    taxableBasis: ['累计应税所得额', 'Cumulative taxable basis'],
    expenseDeduction: ['费用减除', 'Expense deduction'],
    additionalDeduction: [
      '核对后专项附加扣除',
      'Reviewed additional deductions',
    ],
    annualTax: ['累计工资税额', 'Cumulative salary tax'],
    bonusTax: ['单独奖金税额', 'Separate bonus tax'],
    totalTax: ['累计情景税额', 'Total scenario tax'],
    currentWithholding: ['本期模拟预扣', 'Simulated current withholding'],
    actualTax: ['实际本期个税', 'Actual current tax'],
    difference: ['实际减模拟差异', 'Actual minus simulated'],
    potentialAnnualRefund: [
      '超预扣额（仅年度核对）',
      'Over-withholding (annual review only)',
    ],
  };
  return (
    <div className="payroll-stack">
      <Card
        title={t(
          '累计预扣与奖金情景',
          'Cumulative withholding & bonus scenarios',
        )}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            expenseMonths: 1,
            scenario: 'Cumulative',
            taxableIncome: '0',
            exemptIncome: '0',
            specialDeductions: '0',
            otherDeductions: '0',
            taxRelief: '0',
            alreadyWithheld: '0',
            actualTax: '0',
            bonus: '0',
            bonusEligible: false,
            resident: true,
            crossBorder: false,
          }}
          onFinish={(v) => simulate.mutate(v)}
        >
          <Fields fields={fields} />
          <Button
            style={{ marginBottom: 16 }}
            loading={loadContext.isPending}
            onClick={() => loadContext.mutate()}
          >
            {t(
              '读取已确认工资的本单位累计数据（仍须核对）',
              'Load confirmed employer YTD data (review required)',
            )}
          </Button>
          {loadContext.isError && <ErrorState error={loadContext.error} />}{' '}
          {simulate.isError && <ErrorState error={simulate.error} />}
          <Button type="primary" htmlType="submit" loading={simulate.isPending}>
            {t('运行并保存模拟', 'Run & save simulation')}
          </Button>
        </Form>
      </Card>
      {result && (
        <Card title={t('模拟结果与税务差异', 'Simulation & tax variance')}>
          <Descriptions
            bordered
            column={{ xs: 1, sm: 2 }}
            items={Object.entries(resultLabels).map(([key, names]) => ({
              key,
              label: t(...names),
              children: <Sensitive>{String(result[key] ?? '—')}</Sensitive>,
            }))}
          />
          <p>
            {t('规则版本', 'Rule version')}: {String(result.ruleVersion)} ·{' '}
            {label(String(result.scenario))}
          </p>
        </Card>
      )}
      <WageScenario />
      <Card
        title={t(
          '模拟历史（保留规则和输入快照）',
          'Simulation history (rule & input snapshots)',
        )}
      >
        <Table
          rowKey="id"
          dataSource={history.data || []}
          loading={history.isPending}
          scroll={{ x: 650 }}
          columns={[
            { title: t('发薪月份', 'Payment month'), dataIndex: 'month' },
            {
              title: t('情景', 'Scenario'),
              render: (_: unknown, x: Row) =>
                label(value(x.result as Record<string, unknown>, 'scenario')),
            },
            {
              title: t('规则版本', 'Rule version'),
              render: (_: unknown, x: Row) =>
                value(x.result as Record<string, unknown>, 'ruleVersion'),
            },
            {
              title: t('模拟预扣', 'Withholding'),
              render: (_: unknown, x: Row) => (
                <Sensitive>
                  {value(
                    x.result as Record<string, unknown>,
                    'currentWithholding',
                  )}
                </Sensitive>
              ),
            },
            {
              title: t('查看', 'Review'),
              render: (_: unknown, x: Row) => (
                <Button
                  onClick={() => {
                    form.setFieldsValue(x.inputs);
                    setResult(x.result as Record<string, unknown>);
                  }}
                >
                  {t('查看／复用输入', 'Review / reuse inputs')}
                </Button>
              ),
            },
          ]}
        />
        {history.isError && <ErrorState error={history.error} />}
      </Card>
    </div>
  );
}
