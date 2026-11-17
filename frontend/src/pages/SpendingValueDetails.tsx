import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  InputNumber,
  Select,
  Space,
  Typography,
} from 'antd';
import Chart from '../components/Chart';
import { apiClient } from '../api/client';
export type LabInput = {
  budget: number;
  availableCash: number | null;
  safetyFloor: number;
  availableHours: number | null;
  weights: number[];
  options: {
    type?: string;
    id: string;
    items: {
      name: string;
      amount: number;
      followUpCost: number;
      hours: number;
      uses: number | null;
    }[];
    scores: number[];
    scoresConfirmed: boolean;
  }[];
  minimumRemaining?: number;
  monthlySaving?: number;
  minimumScores?: number[];
};
export type LabReview = {
  optionId: string;
  transactionIds: string[];
  uses: number;
  satisfaction: number;
  notes: string;
  assetIds?: string[];
  timeIds?: string[];
};
type Analysis = {
  baseline: {
    id: string;
    totalCost: number;
    remaining: number;
    goalRecoveryMonths: number | null;
  }[];
  leaders: string[];
  variants: { dimension: number; factor: number; ranking: string[] }[];
};
export default function SpendingValueDetails({
  input,
  dimensions,
  currency,
  reviews,
  onInput,
  onReviews,
}: {
  input: LabInput;
  dimensions: string[];
  currency: string;
  reviews: LabReview[];
  onInput: (v: LabInput) => void;
  onReviews: (v: LabReview[]) => void;
}) {
  const [a, setA] = useState<Analysis>(),
    [error, setError] = useState(''),
    [choices, setChoices] = useState<{
      transactions: { id: string; note: string; amount: number }[];
      assets: { id: string; name: string }[];
      times: { id: string; name: string }[];
    }>();
  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Card title="约束、敏感性与真实关联 / Constraints, sensitivity and links">
      <Space direction="vertical" style={{ width: '100%' }}>
        {error && <Alert type="error" message={error} />}
        <Space wrap>
          <label>
            最低剩余 / Minimum remaining
            <InputNumber
              min={0}
              value={input.minimumRemaining}
              onChange={(v) => {
                setA(undefined);
                onInput({ ...input, minimumRemaining: v ?? undefined });
              }}
            />
          </label>
          <label>
            月净储蓄假设 / Monthly saving
            <InputNumber
              min={0}
              value={input.monthlySaving}
              onChange={(v) => {
                setA(undefined);
                onInput({ ...input, monthlySaving: v ?? undefined });
              }}
            />
          </label>
        </Space>
        <Space wrap>
          {dimensions.map((d, i) => (
            <label key={i}>
              {d} 最低分 / Minimum score
              <InputNumber
                min={0}
                max={10}
                value={input.minimumScores?.[i] ?? 0}
                onChange={(v) => {
                  const scores = dimensions.map(
                    (_, j) => input.minimumScores?.[j] ?? 0,
                  );
                  scores[i] = v ?? 0;
                  setA(undefined);
                  onInput({ ...input, minimumScores: scores });
                }}
              />
            </label>
          ))}
        </Space>
        <Button
          onClick={() =>
            run(async () => {
              setA(
                (await apiClient.post('/spending-value/sensitivity', input))
                  .data.data,
              );
            })
          }
        >
          权重敏感性 / Sensitivity
        </Button>
        {a && (
          <>
            <Typography.Paragraph>
              {a.leaders.length > 1
                ? '偏好并列，无法明确排序 / Tied preference'
                : a.leaders.length === 0
                  ? '数据不足或无可行方案 / No eligible ranking'
                  : '当前偏好第一 / Preference leader'}
              : {a.leaders.join(', ')}
            </Typography.Paragraph>
            {a.variants.map((v, i) => (
              <div key={i}>
                {dimensions[v.dimension]} × {v.factor}:{' '}
                {v.ranking.join(' → ') || '无可行评分 / No eligible scores'}
              </div>
            ))}
            <Chart
              option={{
                tooltip: { trigger: 'axis' },
                legend: {},
                xAxis: { type: 'category', data: a.baseline.map((r) => r.id) },
                yAxis: { type: 'value' },
                series: [
                  {
                    name: '成本 / Cost',
                    type: 'bar',
                    data: a.baseline.map((r) => r.totalCost),
                  },
                  {
                    name: '保留资金 / Retained funds',
                    type: 'bar',
                    data: a.baseline.map((r) => r.remaining),
                  },
                ],
              }}
            />
            {a.baseline.map((r) => (
              <div key={r.id}>
                {r.id} 储蓄恢复月数 / Recovery months:{' '}
                {r.goalRecoveryMonths ?? '数据不足 / N/A'}
              </div>
            ))}
          </>
        )}
        <Button
          onClick={() =>
            run(async () => {
              setChoices(
                (
                  await apiClient.get('/spending-value/choices', {
                    params: { currency },
                  })
                ).data.data,
              );
            })
          }
        >
          读取真实关联记录 / Load records
        </Button>
        {choices &&
          reviews.map((r, i) => (
            <Space key={i} wrap>
              <Typography.Text>{r.optionId}</Typography.Text>
              <Select
                style={{ width: 240, maxWidth: '100%' }}
                mode="multiple"
                placeholder="真实支出 / Expenses"
                value={r.transactionIds}
                options={choices.transactions.map((t) => ({
                  value: t.id,
                  label: `${t.note || t.id} (${t.amount})`,
                }))}
                onChange={(v) =>
                  onReviews(
                    reviews.map((x, j) =>
                      j === i ? { ...x, transactionIds: v } : x,
                    ),
                  )
                }
              />
              <Select
                style={{ width: 200, maxWidth: '100%' }}
                mode="multiple"
                placeholder="实物资产 / Assets"
                value={r.assetIds ?? []}
                options={choices.assets.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                onChange={(v) =>
                  onReviews(
                    reviews.map((x, j) =>
                      j === i ? { ...x, assetIds: v } : x,
                    ),
                  )
                }
              />
              <Select
                style={{ width: 200, maxWidth: '100%' }}
                mode="multiple"
                placeholder="时间记录 / Time records"
                value={r.timeIds ?? []}
                options={choices.times.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
                onChange={(v) =>
                  onReviews(
                    reviews.map((x, j) => (j === i ? { ...x, timeIds: v } : x)),
                  )
                }
              />
            </Space>
          ))}
      </Space>
    </Card>
  );
}
