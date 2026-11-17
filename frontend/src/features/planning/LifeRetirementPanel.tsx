import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  InputNumber,
  Row,
  Space,
  Statistic,
  Typography,
} from 'antd';
import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
import type { LifeInput, LifeResult } from '../../api/lifeSimulator';
import { useLocale } from '../../i18n';
import { lifeMessage } from './lifeLabels';
interface RetirementPlan {
  input: LifeInput;
  result: LifeResult;
  retirementDate: string;
  endExclusive: string;
  financialAssetsAtRetirement: number;
  targetRetirementAssets: number | null;
  additionalCapitalToday: number | null;
  additionalMonthlySaving: number | null;
  financialAssetsDepleted: string | null;
  limitations: string[];
}
export default function LifeRetirementPanel({
  input,
  onApply,
}: {
  input: LifeInput;
  onApply: (b: LifeInput) => void;
}) {
  const en = useLocale() === 'en';
  const l = (zh: string, english: string) => (en ? english : zh);
  const [values, setValues] = useState({
    currentAge: 45,
    retirementAge: 60,
    endAge: 85,
    monthlySpending: 5000,
    monthlyPension: 2000,
    pensionAge: 60,
    partTimeIncome: 0,
    annualMedicalCost: 0,
    drawdownFeeRate: 0,
  });
  const [plan, setPlan] = useState<RetirementPlan>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const [source, setSource] = useState('');
  const signature = JSON.stringify(input);
  const currentPlan = source === signature ? plan : undefined;
  const preview = async () => {
    if (abort.current) return;
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setError('');
    try {
      const x = await apiClient.post<ApiResponse<RetirementPlan>>(
        '/life-simulator/retirement-preview',
        { baseline: input, ...values },
        { signal: c.signal, timeout: 60000 },
      );
      setPlan(x.data.data);
      setSource(signature);
    } catch (e) {
      setError(
        e && typeof e === 'object' && 'message' in e
          ? String(e.message)
          : String(e),
      );
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };
  const amount = (v: number | null) =>
    v === null
      ? '—'
      : new Intl.NumberFormat(en ? 'en-US' : 'zh-CN', {
          style: 'currency',
          currency: input.currency,
        }).format(v);
  const fields: [keyof typeof values, string, string, number, number][] = [
    ['currentAge', '当前年龄', 'Current age', 0, 110],
    ['retirementAge', '退休年龄', 'Retirement age', 0, 119],
    ['endAge', '规划终点年龄', 'End age', 1, 120],
    [
      'monthlySpending',
      '退休每月生活支出',
      'Retirement monthly spending',
      0,
      1e12,
    ],
    [
      'monthlyPension',
      '预计月养老金（用户假设）',
      'Assumed monthly pension',
      0,
      1e12,
    ],
    ['pensionAge', '养老金起领年龄', 'Pension starting age', 0, 120],
    [
      'partTimeIncome',
      '退休后每月兼职税后收入',
      'Retirement monthly net part-time income',
      0,
      1e12,
    ],
    [
      'annualMedicalCost',
      '退休每年额外医疗费用',
      'Additional annual medical expense',
      0,
      1e12,
    ],
    [
      'drawdownFeeRate',
      '投资变现成本率（小数）',
      'Investment liquidation fee (decimal)',
      0,
      0.3,
    ],
  ];
  return (
    <Card title={l('退休年龄与资金规划', 'Retirement age and funding plan')}>
      <Row gutter={[16, 8]}>
        {fields.map(([key, zh, english, min, max]) => (
          <Col key={key} xs={24} sm={12} lg={8}>
            <label className="life-field">
              {l(zh, english)}
              <InputNumber
                aria-label={l(zh, english)}
                style={{ width: '100%' }}
                value={values[key]}
                min={min}
                max={max}
                step={key === 'drawdownFeeRate' ? 0.01 : 1}
                disabled={busy}
                onChange={(value) => {
                  setValues({ ...values, [key]: value ?? 0 });
                  setPlan(undefined);
                }}
              />
            </label>
          </Col>
        ))}
      </Row>
      <Space wrap>
        <Button disabled={busy} onClick={preview}>
          {l('预览退休规划', 'Preview retirement plan')}
        </Button>
        <Button disabled={!busy} onClick={() => abort.current?.abort()}>
          {l('取消退休测算', 'Cancel retirement calculation')}
        </Button>
      </Space>
      {error && <Alert type="error" message={error} />}
      {currentPlan && (
        <>
          <Typography.Paragraph>
            {currentPlan.retirementDate} → {currentPlan.endExclusive} ·{' '}
            {input.currency} · {l('名义金额', 'Nominal values')} ·{' '}
            {currentPlan.result.modelVersion}
          </Typography.Paragraph>
          <Row gutter={[16, 8]}>
            {[
              [
                l(
                  '退休时预计可用金融资产',
                  'Projected financial assets at retirement',
                ),
                amount(currentPlan.financialAssetsAtRetirement),
              ],
              [
                l(
                  '该确定性路径的退休资产目标',
                  'Funding target for this deterministic path',
                ),
                amount(currentPlan.targetRetirementAssets),
              ],
              [
                l('当前额外资金缺口', 'Additional capital needed today'),
                amount(currentPlan.additionalCapitalToday),
              ],
              [
                l(
                  '退休前所需额外月储蓄',
                  'Additional monthly saving before retirement',
                ),
                amount(currentPlan.additionalMonthlySaving),
              ],
              [
                l('首次现金缺口', 'First cash shortfall'),
                currentPlan.result.firstShortfall || '—',
              ],
              [
                l(
                  '金融资产首次耗尽期末',
                  'First financial depletion period end',
                ),
                currentPlan.financialAssetsDepleted || '—',
              ],
            ].map(([title, value]) => (
              <Col key={title} xs={24} sm={12} lg={8}>
                <Statistic title={title} value={value} />
              </Col>
            ))}
          </Row>
          <Alert
            type="warning"
            message={l(
              '资金目标只对明确假设下的路径有效；不是安全提款率或收益保证',
              'The funding target applies to these assumptions, not a safe withdrawal rate or return guarantee',
            )}
            description={currentPlan.limitations
              .map((x) => lifeMessage(x, en))
              .join(' · ')}
          />
          <Button onClick={() => onApply(currentPlan.input)}>
            {l(
              '应用退休计划到情景（审核后计算归档）',
              'Apply retirement plan (review, then calculate and archive)',
            )}
          </Button>
        </>
      )}
    </Card>
  );
}
