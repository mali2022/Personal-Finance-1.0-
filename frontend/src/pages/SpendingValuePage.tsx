import SpendingValueDetails, {
  type LabInput,
  type LabReview,
} from './SpendingValueDetails';
import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  InputNumber,
  Space,
  Select,
  Table,
  Typography,
} from 'antd';
import { apiClient } from '../api/client';
type Decision = {
  name: string;
  currency: string;
  start: string;
  end: string;
  dimensions: string[];
  input: LabInput;
  reviews: LabReview[];
};
type Result = {
  id: string;
  totalCost: number;
  remaining: number;
  hours: number;
  costPerUse: number | null;
  feasible: boolean;
  preferenceScore: number | null;
  reasons: string[];
  nonDominated: boolean;
};
const today = new Date().toISOString().slice(0, 10);
const initial: Decision = {
  name: '消费决策 / Spending decision',
  currency: 'CNY',
  start: today,
  end: today,
  dimensions: ['快乐 / Joy', '成长 / Growth', '健康 / Health'],
  input: {
    budget: 1000,
    availableCash: null,
    safetyFloor: 0,
    availableHours: null,
    weights: [1, 1, 1],
    options: [
      { id: 'A', items: [], scores: [5, 5, 5], scoresConfirmed: false },
      { id: 'B', items: [], scores: [5, 5, 5], scoresConfirmed: false },
      {
        id: '不消费 / Keep cash',
        items: [],
        scores: [5, 5, 5],
        scoresConfirmed: false,
      },
    ],
  },
  reviews: [],
};
export default function SpendingValuePage() {
  const [b, setB] = useState<Decision>(initial),
    [id, setId] = useState<string>(),
    [version, setVersion] = useState('0'),
    [rows, setRows] = useState<Result[]>([]),
    [history, setHistory] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [actualReviews, setActualReviews] = useState<
    {
      review: LabReview;
      actualCost: number | null;
      expectedCost: number;
      missing: string[];
    }[]
  >([]);
  const change = (fn: (d: Decision) => void) => {
    const d = structuredClone(b);
    fn(d);
    d.input.options.forEach((o, i) => {
      if (JSON.stringify(o.items) !== JSON.stringify(b.input.options[i]?.items))
        o.scoresConfirmed = false;
    });
    setB(d);
    setRows([]);
    setActualReviews([]);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Space direction="vertical" style={{ width: '100%', padding: 12 }}>
      <Typography.Title level={2}>
        消费价值决策实验室 / Spending Value Lab
      </Typography.Title>
      {error && <Alert type="error" message={error} />}
      <Button
        onClick={() =>
          run(async () => {
            const v = (
              await apiClient.post(
                '/life-simulator/snapshots',
                { currency: b.currency },
                {
                  headers: {
                    'If-Match': '0',
                    'Idempotency-Key': crypto.randomUUID(),
                  },
                },
              )
            ).data.data.snapshot.suggested;
            change((d) => {
              d.input.availableCash = v.cash;
              d.input.monthlySaving = Math.max(
                0,
                v.monthlyIncome - v.monthlyExpense,
              );
            });
          })
        }
      >
        读取账本可用现金与历史储蓄建议（请复核）/ Read ledger baseline
      </Button>
      <Card title="决策与共同约束 / Decision and constraints">
        <Space wrap>
          <Input
            aria-label="名称 / Name"
            value={b.name}
            onChange={(e) =>
              change((d) => {
                d.name = e.target.value;
              })
            }
          />
          <Input
            aria-label="币种 / Currency"
            value={b.currency}
            onChange={(e) =>
              change((d) => {
                d.currency = e.target.value;
              })
            }
          />
          <Input
            type="date"
            aria-label="开始 / Start"
            value={b.start}
            onChange={(e) =>
              change((d) => {
                d.start = e.target.value;
              })
            }
          />
          <Input
            type="date"
            aria-label="结束 / End"
            value={b.end}
            onChange={(e) =>
              change((d) => {
                d.end = e.target.value;
              })
            }
          />
          {(
            [
              'budget',
              'availableCash',
              'safetyFloor',
              'availableHours',
            ] as const
          ).map((k, i) => (
            <label key={k}>
              {
                [
                  '预算 / Budget',
                  '可用现金（用户假设）/ Cash assumption',
                  '安全底线 / Safety floor',
                  '可用小时 / Hours',
                ][i]
              }
              <InputNumber
                min={0}
                value={b.input[k]}
                onChange={(v) =>
                  change((d) => {
                    if (k === 'budget' || k === 'safetyFloor')
                      d.input[k] = v ?? 0;
                    else d.input[k] = v;
                  })
                }
              />
            </label>
          ))}
        </Space>
      </Card>
      <Card title="偏好维度与权重 / Dimensions and weights">
        <Space wrap>
          {b.dimensions.map((n, i) => (
            <Space key={i}>
              <Input
                value={n}
                onChange={(e) =>
                  change((d) => {
                    d.dimensions[i] = e.target.value;
                  })
                }
              />
              <InputNumber
                min={0}
                value={b.input.weights[i]}
                onChange={(v) =>
                  change((d) => {
                    d.input.weights[i] = v ?? 0;
                  })
                }
              />
            </Space>
          ))}
          <Button
            onClick={() =>
              change((d) => {
                d.dimensions.push('自定义 / Custom');
                if (d.input.minimumScores) d.input.minimumScores.push(0);
                d.input.weights.push(1);
                d.input.options.forEach((o) => o.scores.push(5));
              })
            }
          >
            添加维度 / Add dimension
          </Button>
        </Space>
      </Card>
      {b.input.options.map((o, i) => (
        <Card key={i} title={o.id}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select
              aria-label="消费类型 / Type"
              value={o.type ?? 'Other'}
              options={[
                ['Other', '其他 / Other'],
                ['Experience', '体验 / Experience'],
                ['Learning', '学习 / Learning'],
                ['Health', '健康 / Health'],
                ['Durable', '耐用品 / Durable'],
                ['Combination', '组合 / Combination'],
                ['KeepCash', '不消费 / Keep cash'],
              ].map(([value, label]) => ({ value, label }))}
              onChange={(v) =>
                change((d) => {
                  d.input.options[i].type = v;
                })
              }
            />
            <Input
              aria-label="方案名称 / Option name"
              value={o.id}
              onChange={(e) =>
                change((d) => {
                  const old = d.input.options[i].id;
                  d.input.options[i].id = e.target.value;
                  d.reviews.forEach((r) => {
                    if (r.optionId === old) r.optionId = e.target.value;
                  });
                })
              }
            />
            {o.items.map((item, j) => (
              <Space wrap key={j}>
                <Input
                  aria-label="分项名称 / Item"
                  value={item.name}
                  onChange={(e) =>
                    change((d) => {
                      d.input.options[i].items[j].name = e.target.value;
                    })
                  }
                />
                {(['amount', 'followUpCost', 'hours', 'uses'] as const).map(
                  (k, q) => (
                    <label key={k}>
                      {
                        [
                          '金额 / Cost',
                          '后续成本 / Follow-up',
                          '小时 / Hours',
                          '预计次数 / Uses',
                        ][q]
                      }
                      <InputNumber
                        min={k === 'uses' ? 1 : 0}
                        value={item[k]}
                        onChange={(v) =>
                          change((d) => {
                            d.input.options[i].items[j][k] = v ?? 0;
                          })
                        }
                      />
                    </label>
                  ),
                )}
                <Button
                  onClick={() =>
                    change((d) => {
                      d.input.options[i].items.splice(j, 1);
                    })
                  }
                >
                  删除 / Remove
                </Button>
              </Space>
            ))}
            <Button
              onClick={() =>
                change((d) => {
                  d.input.options[i].items.push({
                    name: '分项 / Item',
                    amount: 0,
                    followUpCost: 0,
                    hours: 0,
                    uses: 1,
                  });
                })
              }
            >
              添加组合分项 / Add item
            </Button>
            <Space wrap>
              {b.dimensions.map((n, j) => (
                <label key={j}>
                  {n}
                  <InputNumber
                    min={0}
                    max={10}
                    value={o.scores[j]}
                    onChange={(v) =>
                      change((d) => {
                        d.input.options[i].scores[j] = v ?? 0;
                        d.input.options[i].scoresConfirmed = false;
                      })
                    }
                  />
                </label>
              ))}
            </Space>
            <Checkbox
              checked={o.scoresConfirmed}
              onChange={(e) =>
                change((d) => {
                  d.input.options[i].scoresConfirmed = e.target.checked;
                })
              }
            >
              我确认主观评分 / I confirm these subjective scores
            </Checkbox>
            <Button
              onClick={() =>
                change((d) => {
                  if (!d.reviews.some((r) => r.optionId === o.id))
                    d.reviews.push({
                      optionId: o.id,
                      transactionIds: [],
                      uses: 0,
                      satisfaction: 0,
                      notes: '',
                    });
                })
              }
            >
              添加复盘 / Review
            </Button>
          </Space>
        </Card>
      ))}
      <Button
        onClick={() =>
          change((d) => {
            d.input.options.push({
              id: `方案 ${d.input.options.length + 1}`,
              items: [],
              scores: d.dimensions.map(() => 5),
              scoresConfirmed: false,
            });
          })
        }
      >
        添加方案 / Add option
      </Button>
      {b.reviews.map((r, i) => (
        <Card key={i} title={`复盘 / Review: ${r.optionId}`}>
          <Space wrap>
            <Input
              placeholder="真实交易 ID，逗号分隔 / Transaction IDs"
              value={r.transactionIds.join(',')}
              onChange={(e) =>
                change((d) => {
                  d.reviews[i].transactionIds = e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean);
                })
              }
            />
            <label>
              实际次数 / Actual uses
              <InputNumber
                min={0}
                value={r.uses}
                onChange={(v) =>
                  change((d) => {
                    d.reviews[i].uses = v ?? 0;
                  })
                }
              />
            </label>
            <label>
              满意度 / Satisfaction
              <InputNumber
                min={0}
                max={10}
                value={r.satisfaction}
                onChange={(v) =>
                  change((d) => {
                    d.reviews[i].satisfaction = v ?? 0;
                  })
                }
              />
            </label>
            <Input
              placeholder="预期偏差 / Reflection"
              value={r.notes}
              onChange={(e) =>
                change((d) => {
                  d.reviews[i].notes = e.target.value;
                })
              }
            />
          </Space>
        </Card>
      ))}
      <Space wrap>
        <Button
          loading={busy}
          onClick={() =>
            run(async () => {
              setRows(
                (await apiClient.post('/spending-value/compare', b.input)).data
                  .data,
              );
            })
          }
        >
          比较 / Compare
        </Button>
        <Button
          loading={busy}
          onClick={() =>
            run(async () => {
              const res = await apiClient.request({
                method: id ? 'put' : 'post',
                url: '/spending-value' + (id ? `/${id}` : ''),
                data: b,
                headers: {
                  'If-Match': version,
                  'Idempotency-Key': crypto.randomUUID(),
                },
              });
              setId(res.data.data.id);
              setVersion(res.data.data.version);
              setActualReviews(
                (await apiClient.get(`/spending-value/${res.data.data.id}`))
                  .data.data.reviews,
              );
            })
          }
        >
          保存 / Save
        </Button>
        <Button
          onClick={() => {
            setId(undefined);
            setVersion('0');
            setB(structuredClone(initial));
            setRows([]);
          }}
        >
          新决策 / New
        </Button>
        <Button
          onClick={() =>
            run(async () => {
              setHistory(
                (await apiClient.get('/spending-value')).data.data.items,
              );
            })
          }
        >
          历史 / History
        </Button>
      </Space>
      <SpendingValueDetails
        key={JSON.stringify(b)}
        input={b.input}
        dimensions={b.dimensions}
        currency={b.currency}
        reviews={b.reviews}
        onInput={(v) =>
          change((d) => {
            d.input = v;
          })
        }
        onReviews={(v) =>
          change((d) => {
            d.reviews = v;
          })
        }
      />
      {actualReviews.map((r, i) => (
        <Alert
          key={i}
          message={r.review.optionId}
          description={
            '真实成本 / Actual: ' +
            (r.actualCost ?? '数据不足 / N/A') +
            '; 预期 / Expected: ' +
            r.expectedCost +
            '; 偏差 / Difference: ' +
            (r.actualCost == null
              ? '数据不足 / N/A'
              : r.actualCost - r.expectedCost) +
            '; 缺失关联 / Missing: ' +
            r.missing.join(', ')
          }
        />
      ))}
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          { title: '方案 / Option', dataIndex: 'id' },
          { title: '总成本 / Cost', dataIndex: 'totalCost' },
          { title: '剩余 / Remaining', dataIndex: 'remaining' },
          {
            title: '支付后现金 / Cash after',
            dataIndex: 'cashAfter',
            render: (v) => v ?? '数据不足 / N/A',
          },
          { title: '小时 / Hours', dataIndex: 'hours' },
          {
            title: '每次成本 / Per use',
            dataIndex: 'costPerUse',
            render: (v) => v ?? '数据不足 / N/A',
          },
          {
            title: '偏好 / Preference',
            dataIndex: 'preferenceScore',
            render: (v) => v ?? '未确认 / Unconfirmed',
          },
          {
            title: '解释 / Explanation',
            render: (_, r) =>
              `${r.feasible ? '可行 / Feasible' : '未通过约束 / Not feasible'}; ${r.nonDominated ? '非劣解 / Pareto; ' : ''}${r.reasons.join(', ')}`,
          },
        ]}
      />
      {history.map((h) => (
        <Button
          key={h.id}
          onClick={() =>
            run(async () => {
              const v = (await apiClient.get(`/spending-value/${h.id}`)).data
                .data;
              setB(v.input);
              setId(v.id);
              setVersion(v.version);
              setRows(v.result);
              setActualReviews(v.reviews);
            })
          }
        >
          {h.name}
        </Button>
      ))}
    </Space>
  );
}
