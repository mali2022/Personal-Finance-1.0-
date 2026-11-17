import { useState } from 'react';
import { Button, Card, Descriptions, Form } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Select } from '../../components/TouchSelect';
import { ErrorState } from '../../components/Feedback';
import { Sensitive } from '../../components/Sensitive';
import { Fields, type Field } from './Forms';
import { payrollApi, type Page, type Slip } from './api';
import { usePayText } from './text';
export function WageScenario() {
  const t = usePayText();
  const [form] = Form.useForm();
  const [result, setResult] = useState<Record<string, unknown>>();
  const slips = useQuery({
    queryKey: ['payroll-center', 'scenario-slips'],
    queryFn: () => payrollApi.get<Page<Slip>>('/slips', { pageSize: 100 }),
  });
  const run = useMutation({
    mutationFn: (v: unknown) =>
      payrollApi.write<Record<string, unknown>>('/wage-scenarios', v),
    onSuccess: setResult,
  });
  const fields: Field[] = [
    {
      name: 'ruleId',
      label: ['税务规则版本', 'Tax rule version'],
      type: 'ref',
      ref: 'taxRules',
      required: true,
    },
    {
      name: 'policyId',
      label: ['模拟参保地区政策版本', 'Target-city contribution policy'],
      type: 'ref',
      ref: 'policies',
      required: true,
    },
    {
      name: 'grossChange',
      label: [
        '应发工资增减额（负数表示减少）',
        'Gross pay change (negative to decrease)',
      ],
      type: 'money',
      required: true,
    },
    {
      name: 'contributionBasis',
      label: [
        '模拟缴费基数（可能不同于当月工资）',
        'Simulated contribution base (may differ from current pay)',
      ],
      type: 'money',
      required: true,
    },
  ];
  const names: Record<string, [string, string]> = {
    simulatedGross: ['模拟应发', 'Simulated gross'],
    simulatedPersonalContribution: [
      '模拟个人社保公积金',
      'Personal contributions',
    ],
    simulatedEmployerContribution: [
      '模拟单位社保公积金',
      'Employer contributions',
    ],
    simulatedTax: ['模拟本期个税', 'Simulated withholding'],
    simulatedNet: ['模拟实发', 'Simulated net'],
    actualNet: ['基准工资条实发', 'Baseline net'],
    difference: ['实发变化', 'Net difference'],
  };
  return (
    <Card
      title={t('调薪与换参保城市情景', 'Pay change & insurance-city scenario')}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ grossChange: '0', contributionBasis: '0' }}
        onFinish={(v) => run.mutate(v)}
      >
        <Form.Item
          name="slipId"
          label={t(
            '选择基准工资条（最近100条中的已确认人民币工资）',
            'Baseline payslip (confirmed CNY within latest 100)',
          )}
          rules={[{ required: true }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            loading={slips.isPending}
            options={slips.data?.items
              .filter(
                (x) =>
                  x.currency === 'CNY' &&
                  ['Confirmed', 'Paid', 'Reconciled'].includes(x.state),
              )
              .map((x) => ({
                value: x.id,
                label: x.month + ' · ' + x.employer + ' · ' + x.net,
              }))}
          />
        </Form.Item>
        {slips.isError && <ErrorState error={slips.error} />}
        <Fields fields={fields} />
        {run.isError && <ErrorState error={run.error} />}
        <Button htmlType="submit" type="primary" loading={run.isPending}>
          {t(
            '比较情景（不修改正式记录）',
            'Compare scenario (records unchanged)',
          )}
        </Button>
      </Form>
      {result && (
        <>
          <p>
            {t('缴费地区／政策版本', 'Region / policy version')}:{' '}
            {String(result.policyRegion)} / {String(result.policyVersion)}
          </p>
          <Descriptions
            bordered
            column={{ xs: 1, sm: 2 }}
            items={Object.entries(names).map(([key, n]) => ({
              key,
              label: t(...n),
              children: <Sensitive>{String(result[key])}</Sensitive>,
            }))}
          />
        </>
      )}
    </Card>
  );
}
