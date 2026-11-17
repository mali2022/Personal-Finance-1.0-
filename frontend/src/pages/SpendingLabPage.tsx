import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Grid,
  DatePicker,
  Input,
  InputNumber,
  Pagination,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import dayjs from 'dayjs';
import { apiClient } from '../api/client';
import { useLocale } from '../i18n';
import Chart from '../components/Chart';
import Manual from './SpendingValuePage';
import './spendingLab.css';
import type {
  ValueLevel,
  ValueProblem,
  ValueRun,
  ValuePlan,
  ValueFeedback,
  ValuePreferences,
  PreferenceView,
  DesignerDraft,
} from '../api/spendingIntelligence';
const now = () => dayjs().format('YYYY-MM-DD');
const initial = (): ValueProblem => ({
  budget: 1000,
  availableCash: null,
  safetyFloor: 0,
  minimumRemaining: 0,
  maxSpend: 1000,
  maxHours: null,
  maxEnergy: null,
  currency: 'CNY',
  start: now(),
  end: dayjs().add(1, 'year').format('YYYY-MM-DD'),
  dimensions: [
    '成长 / Growth',
    '体验 / Experience',
    '便利 / Convenience',
    '健康 / Health',
    '家庭 / Family',
    '意义 / Meaning',
  ],
  weights: [1, 1, 1, 1, 1, 1],
  minimumScores: [0, 0, 0, 0, 0, 0],
  baselineScores: [0, 0, 0, 0, 0, 0],
  candidates: [],
  discounts: [],
  annualOpportunityRate: null,
});
const numeric = (n: number | null | undefined) =>
  n == null ? '—' : Number(n.toFixed(2));
const write = async <T,>(
  method: string,
  url: string,
  data: unknown,
  version = '0',
) =>
  (
    await apiClient.request<{ data: T }>({
      method,
      url,
      data,
      headers: { 'If-Match': version, 'Idempotency-Key': crypto.randomUUID() },
    })
  ).data.data;
export default function SpendingLabPage() {
  const language = useLocale();
  const compact = !Grid.useBreakpoint().md;
  const { token } = theme.useToken();
  const L = (zh: string, en: string) => (language === 'en' ? en : zh);
  const [p, setP] = useState<ValueProblem>(initial),
    [run, setRun] = useState<{ id: string; run: ValueRun }>(),
    [selected, setSelected] = useState<string>(),
    [tab, setTab] = useState('generate'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [history, setHistory] = useState<{ id: string; createdAt: string }[]>([]),
    [prefs, setPrefs] = useState<PreferenceView>(),
    [draft, setDraft] = useState<DesignerDraft>(),
    [prompt, setPrompt] = useState(''),
    [send, setSend] = useState(false),
    [snapshotId, setSnapshotId] = useState<string>(),
    [sendSnapshot, setSendSnapshot] = useState(false),
    [aiTrace, setAiTrace] = useState<{
      trace?: { traceId: string };
      modelVersion: string;
      generatedAt: string;
      requestHash: string;
    }>(),
    [uncertainty, setUncertainty] = useState<{
      parameter: string;
      cells: { factor: number; ranking: string[]; plans: ValuePlan[] }[];
      thresholds: {
        id: string;
        minimumBudget: number;
        minimumAvailableCash: number;
        minimumHours: number;
        minimumEnergy: number;
      }[];
      robustPlanIds: string[];
      rankingChanges: number[];
      weightThresholds: {
        first: string;
        second: string;
        dimension: number;
        criticalWeight: number;
      }[];
      scope: string;
    }>(),
    [parameter, setParameter] = useState('Budget'),
    [factors, setFactors] = useState([0.8, 1, 1.2]),
    [feedback, setFeedback] = useState<ValueFeedback>(),
    [review, setReview] = useState<{
      id: string;
      version: string;
      actualCost: number | null;
      actualAdditionalCost: number | null;
      actualCostPerUse: number | null;
      costDeviation: number | null;
      budgetDeviation: number | null;
      subjectiveDeviations?: (number | null)[] | null;
      usageDeviation?: number | null;
      missing: string[];
    }>(),
    [feedbackId, setFeedbackId] = useState<string>(),
    [feedbackVersion, setFeedbackVersion] = useState('0'),
    [tx, setTx] = useState<{ id: string; note: string; amount: number }[]>([]),
    [keyword, setKeyword] = useState('');
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      const a = e as {
        response?: {
          data?: { message?: string; error?: { message?: string } };
        };
        message?: string;
      };
      setError(
        a.response?.data?.message ||
          a.response?.data?.error?.message ||
          a.message ||
          String(e),
      );
    } finally {
      setBusy(false);
    }
  };
  const change = (fn: (d: ValueProblem) => void) => {
    const d = structuredClone(p);
    fn(d);
    setP(d);
    setUncertainty(undefined);
  };
  const level = (): ValueLevel => ({
    id: crypto.randomUUID(),
    amount: 0,
    followUpCost: 0,
    hours: 0,
    energy: 0,
    scores: p.dimensions.map(() => 0),
    confirmed: false,
    quantity: 1,
    uses: null,
    lifeMonths: null,
    priceSource: null,
    priceCheckedAt: null,
  });
  const newCandidate = (name: string, ideaTraceId?: string) =>
    change((d) => {
      d.candidates.push({
        id: crypto.randomUUID(),
        name,
        kind: 'Fixed',
        unitPrice: 0,
        maxQuantity: 1,
        required: false,
        excluded: false,
        exclusiveGroup: null,
        dependencies: [],
        levels: [level()],
        ideaTraceId: ideaTraceId ?? null,
      });
    });
  const solve = () =>
    act(async () => {
      const result = await write<{ id: string; run: ValueRun }>(
        'post',
        run
          ? `/spending-value/runs/${run.id}/reevaluate`
          : '/spending-value/optimize',
        { problem: p, sourceRunId: run?.id },
      );
      setRun(result);
      setSelected(result.run.solution.plans.find((x) => x.feasible)?.id);
      setTab('compare');
      setFeedback(undefined);
      setFeedbackId(undefined);
      setReview(undefined);
    });
  const preferenceLoad = async () =>
    setPrefs((await apiClient.get('/spending-value/preferences')).data.data);
  const [budgetMentions, setBudgetMentions] = useState<number[]>([]);
  const [sendAnalysis, setSendAnalysis] = useState(false),
    [narrative, setNarrative] = useState<{
      observations: string[];
      tradeoffs: string[];
      questions: string[];
    }>();
  const plans = run?.run.solution.plans ?? [];
  const chosen = plans.find((x) => x.id === selected);
  const startFeedback = () => {
    if (!run || !chosen?.feasible) return;
    setFeedback({
      runId: run.id,
      planId: chosen.id,
      purchaseTransactionIds: [],
      additionalTransactionIds: [],
      actualUses: null,
      actualHours: null,
      satisfaction: null,
      worthIt: null,
      wouldRepeat: null,
      goalProgress: '',
      notes: '',
      useForLearning: false,
      explicitPreferenceWeights: null,
    });
    setFeedbackId(undefined);
    setFeedbackVersion('0');
    setReview(undefined);
    setTab('review');
  };
  const itemOptions = p.candidates.map((c) => ({
    value: c.id,
    label: c.name || c.id,
  }));
  const [historyPage, setHistoryPage] = useState(1),
    [historyTotal, setHistoryTotal] = useState(0);
  const loadHistory = async (page: number) => {
    const result = (
      await apiClient.get('/spending-value/runs', {
        params: { page, pageSize: 20 },
      })
    ).data.data;
    setHistory(result.items);
    setHistoryPage(page);
    setHistoryTotal(result.total);
  };
  const numberInput = (
    label: string,
    key:
      | 'budget'
      | 'availableCash'
      | 'safetyFloor'
      | 'minimumRemaining'
      | 'maxSpend'
      | 'maxHours'
      | 'maxEnergy'
      | 'annualOpportunityRate',
  ) => (
    <label key={key}>
      {label}
      <InputNumber
        aria-label={label}
        min={0}
        max={key === 'annualOpportunityRate' ? 1 : undefined}
        value={p[key]}
        onChange={(v) =>
          change((d) => {
            if (
              key === 'budget' ||
              key === 'safetyFloor' ||
              key === 'minimumRemaining' ||
              key === 'maxSpend'
            )
              d[key] = v ?? 0;
            else d[key] = v;
          })
        }
      />
    </label>
  );
  const generate = (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Card title={L('预算与财务约束', 'Budget and constraints')}>
        <Space wrap>
          {numberInput(L('预算', 'Budget'), 'budget')}
          {numberInput(
            L('可用现金（未知则留空）', 'Available cash (blank if unknown)'),
            'availableCash',
          )}
          {numberInput(L('资金安全底线', 'Safety floor'), 'safetyFloor')}
          {numberInput(
            L('预算最低保留', 'Minimum retained budget'),
            'minimumRemaining',
          )}
          {numberInput(
            L('最大总拥有成本', 'Maximum ownership cost'),
            'maxSpend',
          )}
          {numberInput(L('最大小时', 'Maximum hours'), 'maxHours')}
          {numberInput(L('最大精力单位', 'Maximum energy units'), 'maxEnergy')}
          {numberInput(
            L(
              '年机会成本率假设（0–1，可留空）',
              'Annual opportunity rate assumption (0–1, optional)',
            ),
            'annualOpportunityRate',
          )}
          <Input
            aria-label={L('币种', 'Currency')}
            value={p.currency}
            style={{ width: 100 }}
            onChange={(e) =>
              change((d) => {
                d.currency = e.target.value;
                setSnapshotId(undefined);
              })
            }
          />
          <label>
            {L('开始日期', 'Start')}
            <DatePicker
              value={dayjs(p.start)}
              onChange={(v) =>
                v &&
                change((d) => {
                  d.start = v.format('YYYY-MM-DD');
                })
              }
            />
          </label>
          <label>
            {L('结束日期', 'End')}
            <DatePicker
              value={dayjs(p.end)}
              onChange={(v) =>
                v &&
                change((d) => {
                  d.end = v.format('YYYY-MM-DD');
                })
              }
            />
          </label>
          <Button
            onClick={() =>
              act(async () => {
                const v = await write<{
                  id: string;
                  snapshot: { suggested: { cash: number } };
                }>('post', '/life-simulator/snapshots', {
                  currency: p.currency,
                });
                setSnapshotId(v.id);
                change((d) => {
                  d.availableCash = v.snapshot.suggested.cash;
                });
              })
            }
          >
            {L('读取财务摘要后复核', 'Read financial snapshot for review')}
          </Button>
        </Space>
      </Card>
      <Card
        title={L(
          '价值维度、权重与不可妥协目标',
          'Dimensions, weights and non-negotiable goals',
        )}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {p.dimensions.map((name, i) => (
            <Space wrap key={i}>
              <Input
                aria-label={`dimension-${i}`}
                value={name}
                onChange={(e) =>
                  change((d) => {
                    d.dimensions[i] = e.target.value;
                  })
                }
              />
              <label>
                {L('权重', 'Weight')}
                <InputNumber
                  min={0}
                  value={p.weights[i]}
                  onChange={(v) =>
                    change((d) => {
                      d.weights[i] = v ?? 0;
                    })
                  }
                />
              </label>
              <label>
                {L('最低价值分', 'Minimum value')}
                <InputNumber
                  min={0}
                  max={10}
                  value={p.minimumScores[i]}
                  onChange={(v) =>
                    change((d) => {
                      d.minimumScores[i] = v ?? 0;
                    })
                  }
                />
              </label>
              <label>
                {L('不消费基准分', 'Keep-cash baseline score')}
                <InputNumber
                  min={0}
                  max={10}
                  value={p.baselineScores[i]}
                  onChange={(v) =>
                    change((d) => {
                      d.baselineScores[i] = v ?? 0;
                    })
                  }
                />
              </label>
            </Space>
          ))}
          <Button
            disabled={p.dimensions.length >= 12}
            onClick={() =>
              change((d) => {
                d.dimensions.push('Custom ' + (d.dimensions.length + 1));
                d.weights.push(1);
                d.minimumScores.push(0);
                d.baselineScores.push(0);
                d.candidates.forEach((c) =>
                  c.levels.forEach((l) => {
                    l.scores.push(0);
                    l.confirmed = false;
                  }),
                );
              })
            }
          >
            {L('添加自定义维度', 'Add custom dimension')}
          </Button>
        </Space>
      </Card>
      {p.candidates.map((c, i) => (
        <Card
          key={c.id}
          title={`${i + 1}. ${c.name}`}
          extra={
            <Button
              onClick={() =>
                change((d) => {
                  d.candidates.splice(i, 1);
                  d.candidates.forEach((x) => {
                    x.dependencies = x.dependencies.filter((id) => id !== c.id);
                  });
                  d.discounts = d.discounts.filter(
                    (x) => !x.candidateIds.includes(c.id),
                  );
                })
              }
            >
              {L('删除项目', 'Remove item')}
            </Button>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space wrap>
              <Input
                aria-label={`candidate-name-${i}`}
                value={c.name}
                onChange={(e) =>
                  change((d) => {
                    d.candidates[i].name = e.target.value;
                  })
                }
              />
              <Select
                aria-label={`candidate-kind-${i}`}
                value={c.kind}
                style={{ width: 150 }}
                options={[
                  { value: 'Fixed', label: L('固定单价', 'Fixed unit price') },
                  { value: 'Tiered', label: L('分档', 'Tiered') },
                  {
                    value: 'Allocation',
                    label: L('可分配金额档位', 'Allocation levels'),
                  },
                ]}
                onChange={(v) =>
                  change((d) => {
                    d.candidates[i].kind = v;
                    d.candidates[i].levels.forEach((l) => {
                      l.confirmed = false;
                      if (v === 'Fixed')
                        l.amount = (c.unitPrice ?? 0) * l.quantity;
                    });
                  })
                }
              />
              <label>
                {L('固定单价', 'Unit price')}
                <InputNumber
                  aria-label={`unit-price-${i}`}
                  disabled={c.kind !== 'Fixed'}
                  min={0}
                  value={c.unitPrice}
                  onChange={(v) =>
                    change((d) => {
                      d.candidates[i].unitPrice = v;
                      d.candidates[i].levels.forEach((l) => {
                        l.amount = (v ?? 0) * l.quantity;
                        l.confirmed = false;
                      });
                    })
                  }
                />
              </label>
              <label>
                {L('数量上限', 'Quantity limit')}
                <InputNumber
                  min={1}
                  max={20}
                  value={c.maxQuantity}
                  onChange={(v) =>
                    change((d) => {
                      d.candidates[i].maxQuantity = v ?? 1;
                    })
                  }
                />
              </label>
              <Checkbox
                checked={c.required}
                onChange={(e) =>
                  change((d) => {
                    d.candidates[i].required = e.target.checked;
                  })
                }
              >
                {L('必选', 'Required')}
              </Checkbox>
              <Checkbox
                checked={c.excluded}
                onChange={(e) =>
                  change((d) => {
                    d.candidates[i].excluded = e.target.checked;
                  })
                }
              >
                {L('排除', 'Excluded')}
              </Checkbox>
              <Input
                aria-label={`exclusive-${i}`}
                placeholder={L(
                  '互斥组名（可空）',
                  'Exclusive group (optional)',
                )}
                value={c.exclusiveGroup ?? ''}
                onChange={(e) =>
                  change((d) => {
                    d.candidates[i].exclusiveGroup = e.target.value || null;
                  })
                }
              />
              <Select
                mode="multiple"
                aria-label={`dependencies-${i}`}
                style={{ width: 220, maxWidth: '100%' }}
                placeholder={L('前置依赖', 'Dependencies')}
                options={itemOptions.filter((x) => x.value !== c.id)}
                value={c.dependencies}
                onChange={(v) =>
                  change((d) => {
                    d.candidates[i].dependencies = v;
                  })
                }
              />
            </Space>
            {c.levels.map((l, j) => (
              <Card
                size="small"
                key={l.id}
                title={
                  L('明确价格与效用档位', 'Explicit price and utility level') +
                  ' ' +
                  (j + 1)
                }
              >
                <Space direction="vertical">
                  <Space wrap>
                    <label>
                      {L('数量', 'Quantity')}
                      <InputNumber
                        min={1}
                        max={c.maxQuantity}
                        value={l.quantity}
                        onChange={(v) =>
                          change((d) => {
                            const q = d.candidates[i].levels[j];
                            q.quantity = v ?? 1;
                            if (c.kind === 'Fixed')
                              q.amount = (c.unitPrice ?? 0) * q.quantity;
                            q.confirmed = false;
                          })
                        }
                      />
                    </label>
                    {(
                      [
                        'amount',
                        'followUpCost',
                        'hours',
                        'energy',
                        'uses',
                        'lifeMonths',
                      ] as const
                    ).map((k, n) => (
                      <label key={k}>
                        {
                          [
                            L('价格', 'Price'),
                            L('未来附加费用', 'Future additional cost'),
                            L('小时', 'Hours'),
                            L('精力', 'Energy'),
                            L('预计次数', 'Expected uses'),
                            L('寿命（月）', 'Life (months)'),
                          ][n]
                        }
                        <InputNumber
                          aria-label={`${k}-${i}-${j}`}
                          disabled={k === 'amount' && c.kind === 'Fixed'}
                          min={k === 'uses' || k === 'lifeMonths' ? 1 : 0}
                          value={l[k]}
                          onChange={(v) =>
                            change((d) => {
                              const q = d.candidates[i].levels[j];
                              if (k === 'uses' || k === 'lifeMonths') q[k] = v;
                              else q[k] = v ?? 0;
                              q.confirmed = false;
                            })
                          }
                        />
                      </label>
                    ))}
                  </Space>
                  <Space wrap>
                    {p.dimensions.map((name, k) => (
                      <label key={k}>
                        {name}
                        <InputNumber
                          aria-label={`score-${i}-${j}-${k}`}
                          min={0}
                          max={10}
                          value={l.scores[k]}
                          onChange={(v) =>
                            change((d) => {
                              d.candidates[i].levels[j].scores[k] = v ?? 0;
                              d.candidates[i].levels[j].confirmed = false;
                            })
                          }
                        />
                      </label>
                    ))}
                  </Space>
                  <Space wrap>
                    <Input
                      aria-label={`source-${i}-${j}`}
                      placeholder={L(
                        '外部价格来源（可空）',
                        'External price source (optional)',
                      )}
                      value={l.priceSource ?? ''}
                      onChange={(e) =>
                        change((d) => {
                          d.candidates[i].levels[j].priceSource =
                            e.target.value || null;
                          d.candidates[i].levels[j].priceCheckedAt = e.target
                            .value
                            ? new Date().toISOString()
                            : null;
                          d.candidates[i].levels[j].confirmed = false;
                        })
                      }
                    />
                    <Checkbox
                      aria-label={`confirm-${i}-${j}`}
                      checked={l.confirmed}
                      onChange={(e) =>
                        change((d) => {
                          d.candidates[i].levels[j].confirmed =
                            e.target.checked;
                        })
                      }
                    >
                      {L(
                        '我确认价格、期限和主观评分',
                        'I confirm price, horizon and subjective scores',
                      )}
                    </Checkbox>
                    <Button
                      disabled={c.levels.length <= 1}
                      onClick={() =>
                        change((d) => {
                          d.candidates[i].levels.splice(j, 1);
                        })
                      }
                    >
                      {L('移除档位', 'Remove level')}
                    </Button>
                  </Space>
                </Space>
              </Card>
            ))}
            <Button
              disabled={c.levels.length >= 8}
              onClick={() =>
                change((d) => {
                  const q = level();
                  q.amount = c.kind === 'Fixed' ? (c.unitPrice ?? 0) : 0;
                  d.candidates[i].levels.push(q);
                })
              }
            >
              {L('添加独立效用档位', 'Add explicit utility level')}
            </Button>
          </Space>
        </Card>
      ))}
      <Button
        disabled={p.candidates.length >= 100}
        onClick={() => newCandidate(L('新候选', 'New candidate'))}
      >
        {L('添加候选项目', 'Add candidate')}
      </Button>
      <Card
        title={L(
          '组合优惠（叠加并以购买总额为上限）',
          'Combination discounts (stacked, capped at purchase total)',
        )}
      >
        <Space direction="vertical">
          {p.discounts.map((d, i) => (
            <Space wrap key={i}>
              <Select
                mode="multiple"
                style={{ width: 240, maxWidth: '100%' }}
                options={itemOptions}
                value={d.candidateIds}
                onChange={(v) =>
                  change((x) => {
                    x.discounts[i].candidateIds = v;
                  })
                }
              />
              <InputNumber
                min={0}
                value={d.amount}
                onChange={(v) =>
                  change((x) => {
                    x.discounts[i].amount = v ?? 0;
                  })
                }
              />
              <Button
                onClick={() =>
                  change((x) => {
                    x.discounts.splice(i, 1);
                  })
                }
              >
                {L('删除', 'Remove')}
              </Button>
            </Space>
          ))}
          <Button
            disabled={p.discounts.length >= 30}
            onClick={() =>
              change((d) => {
                d.discounts.push({ candidateIds: [], amount: 0 });
              })
            }
          >
            {L('添加优惠', 'Add discount')}
          </Button>
        </Space>
      </Card>
      <Button type="primary" loading={busy} onClick={solve}>
        {L('生成组合并保存分析快照', 'Generate and save analysis snapshot')}
      </Button>
    </Space>
  );
  const compare = (
    <Space direction="vertical" style={{ width: '100%' }}>
      {run ? (
        <>
          <Alert
            type="info"
            message={`${run.run.solution.method}; ${run.run.solution.exact ? L('完整枚举', 'Exhaustive') : L('近似，不能保证全局最优', 'Approximate; no global optimum guarantee')}`}
            description={run.run.solution.warnings
              .concat(run.run.solution.missing)
              .join('; ')}
          />
          <Chart
            option={{
              tooltip: { trigger: 'axis' },
              legend: {},
              xAxis: {
                type: 'category',
                data: plans.map((x) => x.id.slice(0, 6)),
              },
              yAxis: { type: 'value' },
              series: [
                {
                  name: L('总拥有成本', 'Ownership cost'),
                  type: 'bar',
                  stack: 'budget',
                  data: plans.map((x) => x.totalCost),
                },
                {
                  name: L('保留现金', 'Retained cash'),
                  type: 'bar',
                  stack: 'budget',
                  data: plans.map((x) => x.retainedCash),
                },
              ],
            }}
          />
          <Table
            rowKey="id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1400 }}
            dataSource={plans}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: selected ? [selected] : [],
              onChange: (keys) => setSelected(String(keys[0])),
            }}
            columns={[
              {
                title: L('方案/取舍', 'Alternative / tradeoffs'),
                render: (_, x) => (
                  <Space direction="vertical">
                    <Typography.Text>{x.id.slice(0, 8)}</Typography.Text>
                    <span>{x.profiles.join(', ')}</span>
                    <span>
                      {x.allocations.map((a) => a.name).join(' + ') ||
                        L('不消费', 'Keep cash')}
                    </span>
                  </Space>
                ),
              },
              {
                title: L('购买金额', 'Purchase'),
                dataIndex: 'spending',
                render: numeric,
              },
              {
                title: L('优惠', 'Discount'),
                dataIndex: 'discount',
                render: numeric,
              },
              {
                title: L('未来附加', 'Future cost'),
                dataIndex: 'futureCost',
                render: numeric,
              },
              {
                title: L('总拥有成本', 'Ownership cost'),
                dataIndex: 'totalCost',
                render: numeric,
              },
              {
                title: L('剩余现金', 'Retained'),
                dataIndex: 'retainedCash',
                render: numeric,
              },
              {
                title: L('支付后可用现金', 'Cash after'),
                dataIndex: 'cashAfter',
                render: numeric,
              },
              {
                title: L('小时/精力', 'Hours / energy'),
                render: (_, x) => `${numeric(x.hours)} / ${numeric(x.energy)}`,
              },
              {
                title: L('主观偏好', 'Subjective preference'),
                dataIndex: 'preference',
                render: numeric,
              },
              {
                title: L('财务机会成本（假设）', 'Opportunity cost (assumed)'),
                dataIndex: 'opportunityCost',
                render: numeric,
              },
              {
                title: L('约束/支配', 'Constraints / dominance'),
                render: (_, x) => (
                  <Space direction="vertical">
                    <Tag color={x.feasible ? 'green' : 'red'}>
                      {x.feasible
                        ? L('可行', 'Feasible')
                        : L('不可行参考', 'Infeasible reference')}
                    </Tag>
                    <span>{x.reasons.join('; ')}</span>
                    <span>
                      {x.nonDominated
                        ? L('非劣解', 'Pareto')
                        : L('被支配或不可行', 'Dominated or infeasible')}
                    </span>
                    <span>
                      {x.dominatedBy.map((id) => id.slice(0, 8)).join(', ')}
                    </span>
                  </Space>
                ),
              },
            ]}
          />
          {plans.filter((x) => x.feasible).length < 3 && (
            <Alert
              type="warning"
              message={L(
                '找到的不同可行方案不足三个，如实展示；不制造重复建议。',
                'Fewer than three distinct feasible alternatives were found; no duplicate suggestions are fabricated.',
              )}
            />
          )}
          {chosen && (
            <Card
              title={L(
                '当前方案分配与假设',
                'Selected allocation and assumptions',
              )}
            >
              <Typography.Paragraph>
                {L('取舍说明：本方案总成本', 'Tradeoff: total cost')}{' '}
                {numeric(chosen.totalCost)} {run.run.problem.currency}；
                {L('保留资金', 'retained funds')} {numeric(chosen.retainedCash)}
                ；{L('需投入小时/精力', 'hours / energy required')}{' '}
                {numeric(chosen.hours)} / {numeric(chosen.energy)}。
                {L('主观价值较高的维度', 'Higher subjective dimensions')}:{' '}
                {chosen.scores
                  .map((value, i) => ({
                    value,
                    name: run.run.problem.dimensions[i],
                  }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 2)
                  .map((x) => x.name)
                  .join(', ')}
                。
              </Typography.Paragraph>
              <Table
                rowKey="candidateId"
                pagination={false}
                scroll={{ x: 800 }}
                dataSource={chosen.allocations}
                columns={[
                  { title: L('项目', 'Item'), dataIndex: 'name' },
                  { title: L('数量', 'Quantity'), dataIndex: 'quantity' },
                  {
                    title: L('金额', 'Amount'),
                    dataIndex: 'amount',
                    render: numeric,
                  },
                  {
                    title: L('附加', 'Additional'),
                    dataIndex: 'followUpCost',
                    render: numeric,
                  },
                  {
                    title: L('预计次数', 'Uses'),
                    dataIndex: 'uses',
                    render: numeric,
                  },
                  {
                    title: L('优惠前每次成本', 'Per use before discount'),
                    dataIndex: 'costPerUse',
                    render: numeric,
                  },
                  {
                    title: L('寿命月数', 'Life months'),
                    dataIndex: 'lifeMonths',
                    render: numeric,
                  },
                  {
                    title: L('价格来源/时间', 'Price source / time'),
                    render: (_, a) =>
                      `${a.priceSource ?? L('用户输入', 'User supplied')} ${a.priceCheckedAt ?? ''}`,
                  },
                ]}
              />
              <Button disabled={!chosen.feasible} onClick={startFeedback}>
                {L(
                  '执行此方案并开始复盘（不记账）',
                  'Select for review (does not post transactions)',
                )}
              </Button>
            </Card>
          )}
          <Checkbox
            checked={sendAnalysis}
            onChange={(e) => setSendAnalysis(e.target.checked)}
          >
            {L(
              '确认发送当前已保存方案摘要至AI',
              'Send the saved alternative summary to AI',
            )}
          </Checkbox>
          <Button
            disabled={!sendAnalysis}
            onClick={() =>
              act(async () => {
                setNarrative(
                  (
                    await apiClient.post('/spending-value/explain', {
                      runId: run.id,
                      confirmTransmission: sendAnalysis,
                    })
                  ).data.data.narrative,
                );
              })
            }
          >
            {L(
              'AI解释已计算方案（非财务结论）',
              'AI explanation of computed alternatives (not financial conclusions)',
            )}
          </Button>
          {narrative && (
            <Alert
              type="info"
              message={L(
                'AI定性说明，数字以正式计算卡片为准',
                'AI qualitative narrative; use official cards for numeric facts',
              )}
              description={[
                ...narrative.observations,
                ...narrative.tradeoffs,
                ...narrative.questions,
              ].join('；')}
            />
          )}
          <Button onClick={() => setTab('generate')}>
            {L('调整条件并重新生成', 'Adjust assumptions and regenerate')}
          </Button>
        </>
      ) : (
        <Alert
          message={L(
            '请先输入候选并生成组合',
            'Enter candidates and generate combinations first',
          )}
        />
      )}
      <Button
        onClick={() =>
          act(async () => {
            await loadHistory(1);
          })
        }
      >
        {L('查询优化历史', 'Load optimization history')}
      </Button>
      <Pagination
        current={historyPage}
        total={historyTotal}
        pageSize={20}
        showSizeChanger={false}
        onChange={(page) => act(() => loadHistory(page))}
      />
      {history.map((h) => (
        <Button
          key={h.id}
          onClick={() =>
            act(async () => {
              const value = (
                await apiClient.get(`/spending-value/runs/${h.id}`)
              ).data.data;
              setRun(value);
              setP(value.run.problem);
              setSelected(
                value.run.solution.plans.find((x: ValuePlan) => x.feasible)?.id,
              );
              setFeedback(undefined);
              setFeedbackId(undefined);
              setUncertainty(undefined);
            })
          }
        >
          {h.createdAt} {h.id.slice(0, 8)}
        </Button>
      ))}
    </Space>
  );
  const analysis = (
    <Space direction="vertical" style={{ width: '100%' }}>
      {run ? (
        <>
          <Card
            title={L(
              '多目标价值分（用户输入，非收益率）',
              'Multi-objective user values, not returns',
            )}
          >
            <Chart
              option={{
                tooltip: {},
                legend: {
                  data: plans
                    .filter((x) => x.feasible)
                    .slice(0, 6)
                    .map((x) => x.id.slice(0, 6)),
                },
                radar: {
                  indicator: run.run.problem.dimensions.map((name) => ({
                    name,
                    max: 10,
                  })),
                },
                series: [
                  {
                    type: 'radar',
                    data: plans
                      .filter((x) => x.feasible)
                      .slice(0, 6)
                      .map((x) => ({
                        name: x.id.slice(0, 6),
                        value: x.scores,
                      })),
                  },
                ],
              }}
            />
          </Card>
          <Space wrap>
            {p.dimensions.map((d, i) => (
              <label key={i}>
                {d}
                <InputNumber
                  min={0}
                  value={p.weights[i]}
                  onChange={(v) =>
                    change((x) => {
                      x.weights[i] = v ?? 0;
                    })
                  }
                />
              </label>
            ))}
            <Button
              onClick={() =>
                act(async () => {
                  const value = (
                    await apiClient.post(
                      `/spending-value/runs/${run.id}/weights`,
                      { weights: p.weights },
                    )
                  ).data.data;
                  setRun({ ...run, run: value });
                })
              }
            >
              {L(
                '仅重排已保存方案（不扫描账本）',
                'Reweight saved alternatives (no ledger scan)',
              )}
            </Button>
          </Space>
          <Space wrap>
            <Select
              value={parameter}
              style={{ width: 230 }}
              options={[
                'Budget',
                'Reserve',
                'Price',
                'FutureCost',
                'Hours',
                'Uses',
                'LifeMonths',
                ...p.dimensions.map((_, i) => 'Weight:' + i),
              ].map((value) => ({ value, label: value }))}
              onChange={setParameter}
            />
            <Button
              loading={busy}
              onClick={() =>
                act(async () => {
                  setUncertainty(
                    (
                      await apiClient.post('/spending-value/uncertainty', {
                        problem: p,
                        parameter,
                        factors,
                      })
                    ).data.data,
                  );
                })
              }
            >
              {L('分析情景范围', 'Analyze scenario ranges')}
            </Button>
          </Space>
          <Space wrap>
            {factors.map((value, i) => (
              <label key={i}>
                {L('情景倍率', 'Scenario factor')} {i + 1}
                <InputNumber
                  min={0.01}
                  max={3}
                  value={value}
                  onChange={(v) =>
                    setFactors(factors.map((n, j) => (i === j ? (v ?? 1) : n)))
                  }
                />
              </label>
            ))}
          </Space>
          {uncertainty && (
            <Card
              title={L(
                '情景范围不是发生概率',
                'Scenario ranges are not probabilities',
              )}
            >
              <Typography.Paragraph>{uncertainty.scope}</Typography.Paragraph>
              <Typography.Paragraph>
                {L('使排序改变的倍率', 'Factors changing rank')}:{' '}
                {uncertainty.rankingChanges.join(', ') ||
                  L('此范围未改变', 'No change in this range')}
              </Typography.Paragraph>
              <Table
                size="small"
                rowKey={(r) => r.first + r.second + r.dimension}
                pagination={{ pageSize: 5 }}
                scroll={{ x: 600 }}
                dataSource={uncertainty.weightThresholds}
                columns={[
                  {
                    title: L('方案一', 'First'),
                    dataIndex: 'first',
                    render: (v) => v.slice(0, 8),
                  },
                  {
                    title: L('方案二', 'Second'),
                    dataIndex: 'second',
                    render: (v) => v.slice(0, 8),
                  },
                  {
                    title: L('维度', 'Dimension'),
                    dataIndex: 'dimension',
                    render: (v) => p.dimensions[v],
                  },
                  {
                    title: L('等分权重', 'Equal-score weight'),
                    dataIndex: 'criticalWeight',
                    render: numeric,
                  },
                ]}
              />
              {uncertainty.cells.map((c) => (
                <div key={c.factor}>
                  × {c.factor}:{' '}
                  {c.ranking.map((id) => id.slice(0, 8)).join(' → ') ||
                    L('无可行方案', 'No feasible alternative')}
                </div>
              ))}
              <Typography.Paragraph>
                {L('所有情景保持可行的方案', 'Feasible across all scenarios')}:{' '}
                {uncertainty.robustPlanIds
                  .map((id) => id.slice(0, 8))
                  .join(', ') || '—'}
              </Typography.Paragraph>
              <Table
                rowKey="id"
                pagination={false}
                scroll={{ x: 700 }}
                dataSource={uncertainty.thresholds}
                columns={[
                  {
                    title: 'ID',
                    dataIndex: 'id',
                    render: (v) => v.slice(0, 8),
                  },
                  {
                    title: L('最低预算临界值', 'Minimum budget threshold'),
                    dataIndex: 'minimumBudget',
                    render: numeric,
                  },
                  {
                    title: L('最低可用现金', 'Minimum cash'),
                    dataIndex: 'minimumAvailableCash',
                    render: numeric,
                  },
                  {
                    title: L('最低小时', 'Minimum hours'),
                    dataIndex: 'minimumHours',
                    render: numeric,
                  },
                  {
                    title: L('最低精力', 'Minimum energy'),
                    dataIndex: 'minimumEnergy',
                    render: numeric,
                  },
                ]}
              />
            </Card>
          )}
        </>
      ) : (
        <Alert message={L('先生成分析快照', 'Generate a snapshot first')} />
      )}
    </Space>
  );
  const designer = (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Input.TextArea
        aria-label={L('自然语言需求', 'Natural language request')}
        rows={5}
        maxLength={4000}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <Checkbox checked={send} onChange={(e) => setSend(e.target.checked)}>
        {L(
          '同意将这段需求发送至已配置的AI服务',
          'Send this request to the configured AI service',
        )}
      </Checkbox>
      <Checkbox
        disabled={!snapshotId}
        checked={sendSnapshot}
        onChange={(e) => setSendSnapshot(e.target.checked)}
      >
        {L(
          '同时发送已读取的本人财务摘要（需摘要授权）',
          'Also send the loaded personal financial snapshot (summary consent required)',
        )}
      </Checkbox>
      <Button
        loading={busy}
        disabled={!send}
        onClick={() =>
          act(async () => {
            const value = (
              await apiClient.post('/spending-value/designer', {
                prompt,
                confirmTransmission: send,
                snapshotId: sendSnapshot ? snapshotId : null,
              })
            ).data.data;
            setDraft(value.draft);
            setBudgetMentions(value.budgetMentions ?? []);
            setAiTrace(value);
          })
        }
      >
        {L('生成待确认候选', 'Generate unconfirmed ideas')}
      </Button>
      {draft && (
        <Card
          title={L(
            'AI草案：价格与评分未知',
            'AI draft: prices and scores unknown',
          )}
        >
          <Typography.Paragraph>
            {L('用户明确条件（原文）', 'Explicit conditions (verbatim)')}:{' '}
            {draft.explicitConditions.join('; ')}
          </Typography.Paragraph>
          <Typography.Paragraph>
            {L('模型推测', 'Model assumptions')}: {draft.assumptions.join('; ')}
          </Typography.Paragraph>
          <Typography.Paragraph>
            {L('需要补充的信息', 'Missing information')}:{' '}
            {draft.questions.join('; ')}
          </Typography.Paragraph>
          <Typography.Paragraph>
            {L(
              '模型提取的目标（待确认）',
              'Model-interpreted goals (unconfirmed)',
            )}
            : {draft.goals?.join('; ') || '—'}
          </Typography.Paragraph>
          {budgetMentions.map((amount) => (
            <Button
              key={amount}
              onClick={() =>
                change((d) => {
                  d.budget = amount;
                })
              }
            >
              {L('确认采用原文预算', 'Confirm budget quoted from your text')}:{' '}
              {amount}
            </Button>
          ))}
          {draft.ideas.map((idea, i) => (
            <Card size="small" key={i} title={idea.name}>
              <Typography.Paragraph>{idea.purpose}</Typography.Paragraph>
              <Button
                disabled={p.candidates.length >= 100}
                onClick={() => {
                  newCandidate(idea.name, aiTrace?.trace?.traceId);
                  setTab('generate');
                }}
              >
                {L(
                  '添加为未确认项目并填写真实价格',
                  'Add unconfirmed item and enter real price',
                )}
              </Button>
            </Card>
          ))}
          <Typography.Text type="secondary">
            {aiTrace?.modelVersion} {aiTrace?.generatedAt}{' '}
            {aiTrace?.requestHash}
          </Typography.Text>
        </Card>
      )}
    </Space>
  );
  const preferences = (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Button onClick={() => act(preferenceLoad)}>
        {L('读取个人偏好与依据', 'Load personal preferences and evidence')}
      </Button>
      {prefs && (
        <>
          <Tag>
            {prefs.coldStart
              ? L('冷启动：反馈不足', 'Cold start: insufficient feedback')
              : L('已具备明确反馈', 'Explicit feedback available')}
          </Tag>
          <Checkbox
            checked={prefs.settings.enabled}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                settings: { ...prefs.settings, enabled: e.target.checked },
              })
            }
          >
            {L('主动授权偏好学习', 'Opt in to preference learning')}
          </Checkbox>
          <Typography.Paragraph>
            {L('当前手动权重', 'Manual weights')}:{' '}
            {prefs.settings.manualWeights.map(numeric).join(', ')}
            <br />
            {L('建议权重', 'Suggested weights')}:{' '}
            {prefs.suggestedWeights.map(numeric).join(', ')};{' '}
            {L('有效反馈数', 'Eligible feedback')}: {prefs.eligibleFeedback}
          </Typography.Paragraph>
          <Space wrap>
            <Button
              onClick={() =>
                act(async () => {
                  await write(
                    'put',
                    '/spending-value/preferences',
                    {
                      enabled: prefs.settings.enabled,
                      dimensions: p.dimensions,
                      manualWeights: p.weights,
                    } satisfies ValuePreferences,
                    prefs.version,
                  );
                  await preferenceLoad();
                })
              }
            >
              {L(
                '保存授权状态与当前手动权重',
                'Save consent status and current manual weights',
              )}
            </Button>
            <Button
              disabled={
                !prefs.suggestedWeights.length ||
                prefs.settings.dimensions.length !== p.dimensions.length ||
                !prefs.settings.dimensions.every(
                  (d, i) => d === p.dimensions[i],
                )
              }
              onClick={() =>
                change((d) => {
                  d.weights = prefs.suggestedWeights;
                })
              }
            >
              {L('由我应用建议权重', 'Apply suggested weights myself')}
            </Button>
            <Button
              danger
              onClick={() =>
                act(async () => {
                  await write(
                    'post',
                    '/spending-value/preferences/reset',
                    {
                      enabled: false,
                      dimensions: p.dimensions,
                      manualWeights: p.weights,
                    },
                    prefs.version,
                  );
                  await preferenceLoad();
                })
              }
            >
              {L(
                '重置学习（删除反馈影响并暂停）',
                'Reset learning (remove feedback and pause)',
              )}
            </Button>
          </Space>
          <Table
            rowKey="id"
            scroll={{ x: 650 }}
            dataSource={prefs.evidence}
            columns={[
              { title: L('反馈时间', 'Feedback time'), dataIndex: 'createdAt' },
              {
                title: L(
                  '满意度（未反馈为未知）',
                  'Satisfaction (unknown if absent)',
                ),
                render: (_, e) => numeric(e.feedback.satisfaction),
              },
              {
                title: L('学习依据', 'Learning evidence'),
                render: (_, e) =>
                  e.feedback.useForLearning
                    ? e.feedback.explicitPreferenceWeights
                        ?.map(numeric)
                        .join(', ')
                    : L('未授权用于学习', 'Not authorized for learning'),
              },
              {
                title: L('操作', 'Actions'),
                render: (_, e) => (
                  <Space>
                    <Button
                      onClick={() =>
                        act(async () => {
                          const value = (
                            await apiClient.get(
                              `/spending-value/feedback/${e.id}`,
                            )
                          ).data.data;
                          const archived = (
                            await apiClient.get(
                              '/spending-value/runs/' + value.feedback.runId,
                            )
                          ).data.data;
                          setRun(archived);
                          setP(archived.run.problem);
                          setSelected(value.feedback.planId);
                          setFeedback(value.feedback);
                          setFeedbackId(e.id);
                          setFeedbackVersion(value.version);
                          setReview(value);
                          setTab('review');
                        })
                      }
                    >
                      {L('查看/编辑', 'View / edit')}
                    </Button>
                    <Button
                      danger
                      onClick={() =>
                        act(async () => {
                          await write(
                            'post',
                            `/spending-value/feedback/${e.id}/revoke`,
                            {},
                            e.version,
                          );
                          await preferenceLoad();
                        })
                      }
                    >
                      {L('撤销影响', 'Revoke influence')}
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </>
      )}
    </Space>
  );
  const reviewPanel = (
    <Space direction="vertical" style={{ width: '100%' }}>
      {feedback ? (
        <>
          <Space wrap>
            <Input
              aria-label={L('交易关键词', 'Transaction keyword')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={L(
                '搜索备注/商户/交易ID',
                'Search note / merchant / transaction ID',
              )}
            />
            <Button
              onClick={() =>
                act(async () => {
                  setTx(
                    (
                      await apiClient.get('/spending-value/choices', {
                        params: {
                          currency: run?.run.problem.currency ?? p.currency,
                          keyword,
                        },
                      })
                    ).data.data.transactions,
                  );
                })
              }
            >
              {L('搜索真实支出', 'Search real expenses')}
            </Button>
            <Select
              mode="multiple"
              aria-label={L('购买交易', 'Purchase transactions')}
              placeholder={L('购买交易', 'Purchase transactions')}
              style={{ width: 260, maxWidth: '100%' }}
              value={feedback.purchaseTransactionIds}
              options={tx.map((t) => ({
                value: t.id,
                label: `${t.note || t.id} (${t.amount})`,
              }))}
              onChange={(v) =>
                setFeedback({ ...feedback, purchaseTransactionIds: v })
              }
            />
            <Select
              mode="multiple"
              aria-label={L('追加费用交易', 'Additional cost transactions')}
              placeholder={L('追加费用交易', 'Additional cost transactions')}
              style={{ width: 260, maxWidth: '100%' }}
              value={feedback.additionalTransactionIds}
              options={tx.map((t) => ({
                value: t.id,
                label: `${t.note || t.id} (${t.amount})`,
              }))}
              onChange={(v) =>
                setFeedback({ ...feedback, additionalTransactionIds: v })
              }
            />
          </Space>
          <Space wrap>
            {(['actualUses', 'actualHours', 'satisfaction'] as const).map(
              (key, i) => (
                <label key={key}>
                  {
                    [
                      L('实际使用次数', 'Actual uses'),
                      L('实际小时', 'Actual hours'),
                      L('满意度（0–10）', 'Satisfaction (0–10)'),
                    ][i]
                  }
                  <InputNumber
                    aria-label={key}
                    min={0}
                    max={key === 'satisfaction' ? 10 : undefined}
                    value={feedback[key]}
                    onChange={(v) => setFeedback({ ...feedback, [key]: v })}
                  />
                </label>
              ),
            )}
            {(['worthIt', 'wouldRepeat'] as const).map((key, i) => (
              <label key={key}>
                {i === 0
                  ? L('是否值得', 'Worth it')
                  : L('是否愿意再次选择', 'Would choose again')}
                <Select
                  style={{ width: 140 }}
                  value={
                    feedback[key] == null ? 'unknown' : String(feedback[key])
                  }
                  options={[
                    { value: 'unknown', label: L('未反馈', 'Unknown') },
                    { value: 'true', label: L('是', 'Yes') },
                    { value: 'false', label: L('否', 'No') },
                  ]}
                  onChange={(v) =>
                    setFeedback({
                      ...feedback,
                      [key]: v === 'unknown' ? null : v === 'true',
                    })
                  }
                />
              </label>
            ))}
          </Space>
          <Space wrap>
            {p.dimensions.map((d, i) => (
              <label key={i}>
                {L('实际价值分', 'Actual value')}: {d}
                <InputNumber
                  min={0}
                  max={10}
                  value={feedback.actualValueScores?.[i] ?? null}
                  onChange={(v) => {
                    const values = p.dimensions.map(
                      (_, j) => feedback.actualValueScores?.[j] ?? null,
                    );
                    values[i] = v;
                    setFeedback({ ...feedback, actualValueScores: values });
                  }}
                />
              </label>
            ))}
          </Space>
          <Input
            aria-label={L('目标完成情况', 'Goal progress')}
            value={feedback.goalProgress}
            maxLength={1000}
            placeholder={L('目标完成情况', 'Goal progress')}
            onChange={(e) =>
              setFeedback({ ...feedback, goalProgress: e.target.value })
            }
          />
          <Input.TextArea
            aria-label={L('购买后评价', 'Review notes')}
            value={feedback.notes}
            maxLength={2000}
            rows={3}
            onChange={(e) =>
              setFeedback({ ...feedback, notes: e.target.value })
            }
          />
          <Checkbox
            checked={feedback.useForLearning}
            onChange={(e) =>
              setFeedback({
                ...feedback,
                useForLearning: e.target.checked,
                explicitPreferenceWeights: e.target.checked ? p.weights : null,
              })
            }
          >
            {L(
              '主动授权将当前重要性权重作为本次明确反馈用于学习（先在偏好中心启用）',
              'Authorize current importance weights as explicit learning feedback (enable learning in Preferences first)',
            )}
          </Checkbox>
          <Button
            loading={busy}
            type="primary"
            onClick={() =>
              act(async () => {
                const saved = await write<{ id: string; version: string }>(
                  feedbackId ? 'put' : 'post',
                  '/spending-value/feedback' +
                    (feedbackId ? `/${feedbackId}` : ''),
                  feedback,
                  feedbackVersion,
                );
                setFeedbackId(saved.id);
                setFeedbackVersion(saved.version);
                setReview(
                  (await apiClient.get(`/spending-value/feedback/${saved.id}`))
                    .data.data,
                );
              })
            }
          >
            {L('保存消费反馈', 'Save consumption feedback')}
          </Button>
          {review && (
            <Card title={L('真实消费复盘', 'Actual consumption review')}>
              <Typography.Paragraph>
                {L('实际总成本', 'Actual total cost')}:{' '}
                {numeric(review.actualCost)}
                <br />
                {L('实际追加费用', 'Actual additional cost')}:{' '}
                {numeric(review.actualAdditionalCost)}
                <br />
                {L('实际每次成本', 'Actual cost per use')}:{' '}
                {numeric(review.actualCostPerUse)}
                <br />
                {L('成本预测偏差', 'Cost prediction deviation')}:{' '}
                {numeric(review.costDeviation)}
                <br />
                {L('相对预算差异', 'Difference from budget')}:{' '}
                {numeric(review.budgetDeviation)}
                <br />
                {L('主观评分变化', 'Subjective score changes')}:{' '}
                {review.subjectiveDeviations?.map(numeric).join(', ') ?? '—'}
                <br />
                {L('使用次数偏差', 'Usage deviation')}:{' '}
                {numeric(review.usageDeviation)}
                <br />
                {L('缺失关联', 'Missing links')}:{' '}
                {review.missing.join(', ') || '—'}
              </Typography.Paragraph>
            </Card>
          )}
        </>
      ) : (
        <Alert
          message={L(
            '先在资金对比中选择可行方案，或从偏好中心打开历史反馈',
            'Select a feasible saved alternative, or open historical feedback in Preferences',
          )}
        />
      )}
    </Space>
  );
  return (
    <Space
      className="spending-lab"
      direction="vertical"
      style={{ width: '100%', minWidth: 0 }}
    >
      <Typography.Title level={2}>
        {L('消费价值决策实验室 2.0', 'Spending Value Lab 2.0')}
      </Typography.Title>
      {error && <Alert type="error" showIcon message={error} />}
      {compact && (
        <select
          className="ant-input"
          aria-label={L('实验室页面', 'Lab section')}
          style={{
            width: '100%',
            minHeight: 36,
            backgroundColor: token.colorBgContainer,
            color: token.colorText,
            border: '1px solid ' + token.colorBorder,
            borderRadius: token.borderRadius,
            padding: 8,
          }}
          value={tab}
          onChange={(e) => setTab(e.target.value)}
        >
          {[
            'generate',
            'compare',
            'analysis',
            'designer',
            'preferences',
            'review',
            'manual',
          ].map((value, i) => (
            <option key={value} value={value}>
              {
                [
                  L('智能生成', 'Generate'),
                  L('资金对比', 'Allocation'),
                  L('多目标与敏感性', 'Objectives & sensitivity'),
                  L('AI设计师', 'AI designer'),
                  L('个人偏好', 'Preferences'),
                  L('消费复盘', 'Review'),
                  L('手动对比', 'Manual compare'),
                ][i]
              }
            </option>
          ))}
        </select>
      )}
      <Tabs
        tabBarStyle={compact ? { display: 'none' } : undefined}
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'generate',
            label: L('智能生成', 'Generate'),
            children: generate,
          },
          {
            key: 'compare',
            label: L('资金对比', 'Allocation'),
            children: compare,
          },
          {
            key: 'analysis',
            label: L('多目标与敏感性', 'Objectives & sensitivity'),
            children: analysis,
          },
          {
            key: 'designer',
            label: L('AI设计师', 'AI designer'),
            children: designer,
          },
          {
            key: 'preferences',
            label: L('个人偏好', 'Preferences'),
            children: preferences,
          },
          {
            key: 'review',
            label: L('消费复盘', 'Review'),
            children: reviewPanel,
          },
          {
            key: 'manual',
            label: L('手动对比', 'Manual compare'),
            children: <Manual />,
          },
        ]}
      />
    </Space>
  );
}
