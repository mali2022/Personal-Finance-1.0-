import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
import type { LifeInput } from '../../api/lifeSimulator';
import Chart from '../../components/Chart';
import { useLocale } from '../../i18n';
import { lifeMessage } from './lifeLabels';
interface Cell {
  x: number;
  y: number | null;
  netWorth: number;
  minimumCash: number;
  firstShortfall: string | null;
}
interface Probability {
  modelVersion: string;
  seed: number;
  iterations: number;
  distribution: string;
  correlation: number;
  bands: { date: string; p10: number; p50: number; p90: number }[];
  cashExhaustionRatio: number;
  goalReachedRatio: number | null;
  finalValues: number[];
  limitations: string[];
}
export default function LifeRiskPanel({
  input,
  confirmed,
}: {
  input: LifeInput;
  confirmed: boolean;
}) {
  const en = useLocale() === 'en';
  const l = (zh: string, english: string) => (en ? english : zh);
  const [parameter, setParameter] = useState('InvestmentReturn');
  const [second, setSecond] = useState<string>();
  const [values, setValues] = useState('-.05,0,.03,.05,.08');
  const [secondValues, setSecondValues] = useState('0,.02,.04');
  const [cells, setCells] = useState<Cell[]>();
  const [probability, setProbability] = useState<Probability>();
  const [iterations, setIterations] = useState(100);
  const [seed, setSeed] = useState(20261027);
  const [vol, setVol] = useState(0.15);
  const [inflationVol, setInflationVol] = useState(0.01);
  const [incomeVol, setIncomeVol] = useState(0.03);
  const [correlation, setCorrelation] = useState(0);
  const [fee, setFee] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reports, setReports] = useState<
    { id: string; name: string; createdAt: string }[]
  >([]);
  const [reportSource, setReportSource] = useState<LifeInput>(input);
  const [reportTime, setReportTime] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    abort.current?.abort();
    setCells(undefined);
    setProbability(undefined);
    setReportSource(input);
  }, [input]);
  useEffect(() => () => abort.current?.abort(), []);
  const run = async (monte: boolean) => {
    if (abort.current) return;
    const c = new AbortController();
    abort.current = c;
    setBusy(true);
    setError('');
    try {
      if (monte) {
        const r = await apiClient.post<
          ApiResponse<{ id: string; result: Probability }>
        >(
          '/life-simulator/monte-carlo',
          {
            input,
            iterations,
            seed,
            investmentVolatility: vol,
            inflationVolatility: inflationVol,
            incomeVolatility: incomeVol,
            correlation,
            annualFee: fee,
          },
          {
            headers: {
              'If-Match': '0',
              'Idempotency-Key': crypto.randomUUID(),
            },
            signal: c.signal,
            timeout: 60000,
          },
        );
        setProbability(r.data.data.result);
        setReportSource(input);
        setReportTime(new Date().toISOString());
      } else {
        const parse = (s: string) => {
          const x = s.split(',').map((v) => Number(v.trim()));
          if (x.some((v) => !Number.isFinite(v)))
            throw new Error(
              l('请输入逗号分隔的数值', 'Enter comma-separated numbers'),
            );
          return x;
        };
        const r = await apiClient.post<ApiResponse<{ cells: Cell[] }>>(
          '/life-simulator/sensitivity',
          {
            input,
            parameter,
            values: parse(values),
            secondParameter: second || null,
            secondValues: second ? parse(secondValues) : null,
          },
          { signal: c.signal, timeout: 60000 },
        );
        setCells(r.data.data.cells);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      abort.current = null;
      setBusy(false);
    }
  };
  const options = [
    'InvestmentReturn',
    'Inflation',
    'IncomeGrowth',
    'ExpenseGrowth',
    'OtherReturn',
    'MonthlyIncome',
    'MonthlyExpense',
  ].map((value, i) => ({
    value,
    label: l(
      [
        '投资收益',
        '通胀',
        '收入增长',
        '费用增长',
        '房产等资产估值增长',
        '月收入',
        '月费用',
      ][i],
      value,
    ),
  }));
  return (
    <Card
      title={l(
        '敏感性、压力与概率分析',
        'Sensitivity, stress and probability analysis',
      )}
    >
      {error && <Alert type="error" message={error} />}
      <Typography.Paragraph>
        {l(
          '图表金额为名义值；购买力基期',
          'Charts show nominal values; purchasing power base',
        )}
        : {reportSource.start} · {reportSource.currency}
      </Typography.Paragraph>
      <Button
        disabled={busy}
        onClick={async () => {
          try {
            const r = await apiClient.get<
              ApiResponse<{
                items: { id: string; name: string; createdAt: string }[];
              }>
            >('/life-simulator/risk-reports', {
              params: { page: 1, pageSize: 10 },
            });
            setReports(r.data.data.items);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        {l('读取最近10份概率报告', 'Read latest 10 probability reports')}
      </Button>
      {reports.length > 0 && (
        <Table
          rowKey="id"
          size="small"
          dataSource={reports}
          pagination={false}
          scroll={{ x: 500 }}
          columns={[
            { title: l('报告', 'Report'), dataIndex: 'name' },
            { title: l('日期', 'Date'), dataIndex: 'createdAt' },
            {
              title: l('操作', 'Action'),
              render: (_, r) => (
                <Button
                  onClick={async () => {
                    try {
                      const x = await apiClient.get<
                        ApiResponse<{
                          input: { input: LifeInput };
                          result: Probability;
                          calculatedAt: string;
                        }>
                      >(`/life-simulator/risk-reports/${r.id}`);
                      setReportSource(x.data.data.input.input);
                      setReportTime(x.data.data.calculatedAt);
                      setProbability(x.data.data.result);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  {l('查看报告', 'View report')}
                </Button>
              ),
            },
          ]}
        />
      )}
      <Space wrap className="life-toolbar">
        <Select
          aria-label={l('敏感性参数', 'Sensitivity parameter')}
          options={options}
          value={parameter}
          onChange={setParameter}
        />
        <Input
          aria-label={l('参数取值', 'Parameter values')}
          style={{ width: 230 }}
          value={values}
          onChange={(e) => setValues(e.target.value)}
        />
        <Select
          allowClear
          placeholder={l('第二变量（可选）', 'Second variable (optional)')}
          options={options.filter((x) => x.value !== parameter)}
          value={second}
          onChange={setSecond}
          style={{ width: 200 }}
        />
        <Input
          aria-label={l('第二变量取值', 'Second variable values')}
          style={{ width: 200 }}
          value={secondValues}
          onChange={(e) => setSecondValues(e.target.value)}
        />
        <Button disabled={!confirmed || busy} onClick={() => run(false)}>
          {l('计算敏感性', 'Calculate sensitivity')}
        </Button>
      </Space>
      {cells && (
        <>
          <Chart
            option={{
              tooltip: { trigger: 'axis' },
              xAxis: {
                type: 'category',
                data: cells.filter((c) => c.y === cells[0].y).map((c) => c.x),
              },
              yAxis: { type: 'value' },
              series: [...new Set(cells.map((c) => c.y))].map((y) => ({
                type: 'line',
                name: y === null ? parameter : `${second}=${y}`,
                data: cells.filter((c) => c.y === y).map((c) => c.netWorth),
              })),
              legend: { type: 'scroll' },
            }}
          />
          <Table
            rowKey={(r) => `${r.x}:${r.y}`}
            size="small"
            dataSource={cells}
            scroll={{ x: 600 }}
            columns={[
              { title: parameter, dataIndex: 'x' },
              { title: second || '—', dataIndex: 'y' },
              {
                title: l('期末净资产', 'Final net worth'),
                dataIndex: 'netWorth',
                render: (v) => (
                  <span
                    style={{
                      background: v < 0 ? '#ffccc7' : '#d9f7be',
                      color: '#111',
                      padding: 4,
                    }}
                  >
                    {v.toFixed(2)}
                  </span>
                ),
              },
              {
                title: l('最低现金', 'Minimum cash'),
                dataIndex: 'minimumCash',
              },
              {
                title: l('首次缺口', 'First shortfall'),
                dataIndex: 'firstShortfall',
              },
            ]}
          />
        </>
      )}
      <Typography.Title level={4}>
        {l(
          'Monte Carlo：相关月度对数正态路径',
          'Monte Carlo: correlated monthly lognormal paths',
        )}
      </Typography.Title>
      <Space wrap>
        {[
          [l('次数', 'Iterations'), iterations, setIterations, 10, 500],
          [l('种子', 'Seed'), seed, setSeed, -2147483648, 2147483647],
          [
            l('投资年波动率', 'Investment annual volatility'),
            vol,
            setVol,
            0,
            0.8,
          ],
          [
            l('通胀年波动率', 'Inflation annual volatility'),
            inflationVol,
            setInflationVol,
            0,
            0.8,
          ],
          [
            l('收入年波动率', 'Income annual volatility'),
            incomeVol,
            setIncomeVol,
            0,
            0.8,
          ],
          [
            l('共同相关系数', 'Common correlation'),
            correlation,
            setCorrelation,
            -0.49,
            0.99,
          ],
          [l('投资年费用率', 'Annual investment fee'), fee, setFee, 0, 0.1],
        ].map(([label, value, set, min, max]) => (
          <label className="life-field" key={String(label)}>
            {String(label)}
            <InputNumber
              aria-label={String(label)}
              value={value as number}
              min={min as number}
              max={max as number}
              step={Number(max) > 1 ? 1 : 0.01}
              onChange={(v) => (set as (v: number) => void)(Number(v || 0))}
            />
          </label>
        ))}
      </Space>
      <Space wrap>
        <Button disabled={!confirmed || busy} onClick={() => run(true)}>
          {l('运行概率模拟并归档', 'Run and archive Monte Carlo')}
        </Button>
        <Button disabled={!busy} onClick={() => abort.current?.abort()}>
          {l('取消', 'Cancel')}
        </Button>
      </Space>
      {probability && (
        <>
          <Typography.Paragraph>
            {probability.modelVersion} · seed={probability.seed} · n=
            {probability.iterations} · {probability.distribution}
            {' · '}
            {reportTime}
            {' · '}
            {reportSource.name}
            {' · '}
            {reportSource.assumptionSource}
          </Typography.Paragraph>
          <Typography.Paragraph>
            {l('现金出现负值的模拟比例', 'Simulated cash deficit ratio')}:{' '}
            {(probability.cashExhaustionRatio * 100).toFixed(1)}% ·{' '}
            {l(
              '目标达成比例（未专门预留）',
              'Goal reached ratio (unallocated)',
            )}
            :{' '}
            {probability.goalReachedRatio === null
              ? '—'
              : (probability.goalReachedRatio * 100).toFixed(1) + '%'}
          </Typography.Paragraph>
          <Chart
            option={{
              tooltip: { trigger: 'axis' },
              legend: {},
              xAxis: {
                type: 'category',
                data: probability.bands.map((x) => x.date),
              },
              yAxis: { type: 'value' },
              series: (['p10', 'p50', 'p90'] as const).map((key) => ({
                name: key,
                type: 'line',
                showSymbol: false,
                data: probability.bands.map((x) => x[key]),
              })),
            }}
          />
          <Chart
            option={{
              tooltip: {},
              xAxis: {
                type: 'category',
                data: probability.finalValues
                  .slice()
                  .sort((a, b) => a - b)
                  .map((_, i) => i + 1),
              },
              yAxis: { type: 'value' },
              series: [
                {
                  name: l(
                    '期末资产分布（排序样本）',
                    'Final wealth distribution (ordered samples)',
                  ),
                  type: 'bar',
                  data: probability.finalValues.slice().sort((a, b) => a - b),
                },
              ],
            }}
          />
          <Alert
            type="warning"
            message={l(
              '依赖用户假设及模型，不是真实成功概率或收益保证',
              'Depends on user assumptions and model; not a true success probability or return guarantee',
            )}
            description={probability.limitations
              .map((x) => lifeMessage(x, en))
              .join(' · ')}
          />
          <Button
            onClick={() => {
              const u = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        input: reportSource,
                        probability,
                        calculatedAt: reportTime,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: 'application/json' },
                ),
              );
              const a = document.createElement('a');
              a.href = u;
              a.download = 'life-risk-report.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(u), 1000);
            }}
          >
            {l('导出概率报告', 'Export probability report')}
          </Button>
        </>
      )}
    </Card>
  );
}
