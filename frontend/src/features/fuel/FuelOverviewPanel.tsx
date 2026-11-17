import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Skeleton,
  Statistic,
  Table,
} from 'antd';
import dayjs from 'dayjs';
import { apiClient } from '../../api/client';
import { costApi } from './costs';
import { vehiclePlanningApi } from './planning';
import type { VehicleBudget } from './planning';
import type { FuelReport, Vehicle } from './api';
const Chart = lazy(() => import('../../components/Chart'));
export default function FuelOverviewPanel({
  report,
  vehicles,
  vehicleId,
  from,
  to,
  currency,
  hidden,
  english,
  onCosts,
}: {
  report: FuelReport;
  vehicles: Vehicle[];
  vehicleId?: string;
  from: string;
  to: string;
  currency: string;
  hidden: boolean;
  english: boolean;
  onCosts: () => void;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const month = dayjs().format('YYYY-MM');
  const costs = useQuery({
    queryKey: ['fuel', 'costs', { vehicleId, from, to }],
    queryFn: () => costApi.report({ vehicleId, from, to }),
    enabled: !hidden,
  });
  const budget = useQuery({
    queryKey: ['fuel', 'budget-overview', month, vehicleId],
    queryFn: async () =>
      (
        await apiClient.get<{ data: VehicleBudget[] }>(
          '/fuel/budget-overview',
          { params: { period: month, vehicleId } },
        )
      ).data.data,
    enabled: !hidden,
  });
  const planning = useQuery({
    queryKey: ['fuel', 'planning', vehicleId, from, to],
    queryFn: () => vehiclePlanningApi.report(vehicleId!, from, to),
    enabled: !hidden && !!vehicleId,
  });
  if (hidden) return null;
  const fuel =
    costs.data?.distanceCosts?.filter((r) => r.currency === currency) ?? [];
  const km = fuel.reduce((s, r) => s + r.fuelDistance, 0);
  const paid = fuel.reduce((s, r) => s + r.intervalFuelPaid, 0);
  const cash = costs.data?.summary.find((r) => r.currency === currency)?.net;
  const economic = planning.data?.economicEstimate;
  const cards = [
    [
      tr('期间购油加权实付单价', 'Period weighted paid fuel price'),
      report.summary.weightedUnitPrice ?? null,
      `${currency}/L`,
    ],
    [
      tr('有效统计里程', 'Valid interval distance'),
      report.summary.distance,
      'km',
    ],
    [
      tr('有效区间百公里燃油成本', 'Fuel cost/100km in valid intervals'),
      km > 0 ? Number(((paid * 100) / km).toFixed(2)) : null,
      currency,
    ],
    [
      tr('期间已关联净现金成本', 'Period linked net cash cost'),
      cash ?? null,
      currency,
    ],
    [
      tr(
        '净现金/有效公里（覆盖受限参考）',
        'Net cash/valid km (limited coverage)',
      ),
      cash != null && report.summary.distance > 0
        ? Number((cash / report.summary.distance).toFixed(4))
        : null,
      `${currency}/km`,
    ],
    [
      tr('选定车辆经济成本估算', 'Selected vehicle economic cost estimate'),
      economic?.total ?? null,
      economic?.currency ?? currency,
    ],
  ] as const;
  return (
    <>
      {(costs.isError || budget.isError || planning.isError) && (
        <Alert
          type="error"
          message={(costs.error ?? budget.error ?? planning.error)?.message}
        />
      )}
      <Row gutter={[12, 12]} style={{ marginTop: 8 }}>
        {cards.map(([label, value, unit]) => (
          <Col key={label} xs={24} sm={12} xl={8}>
            <Card size="small">
              <Statistic
                title={label}
                value={value ?? '—'}
                suffix={value == null ? '' : unit}
              />
            </Card>
          </Col>
        ))}
      </Row>
      {report.comparison && (
        <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
          {(['previousPeriod', 'previousYear'] as const).map((key) => {
            const value = report.comparison![key];
            return (
              <Col xs={24} sm={12} key={key}>
                <Card
                  size="small"
                  title={
                    key === 'previousPeriod'
                      ? tr(
                          '购油实付与前等长期间比较',
                          'Paid fuel purchases vs previous equal-length period',
                        )
                      : tr(
                          '购油实付同比',
                          'Paid fuel purchases vs previous year',
                        )
                  }
                >
                  <p>
                    {value.from ?? '—'} → {value.to ?? '—'} · {value.count}{' '}
                    {tr('条记录', 'records')} · {value.amount} {currency}
                  </p>
                  {value.changePercent == null
                    ? tr(
                        '缺少正数历史基数，不显示变化百分比',
                        'No positive recorded base; no change percentage',
                      )
                    : value.changePercent + '%'}
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
      <Card
        title={`${tr('当前月度车辆预算', 'Current monthly vehicle budgets')} · ${month}`}
        style={{ margin: '16px 0' }}
      >
        <Table<VehicleBudget>
          size="small"
          rowKey="id"
          loading={budget.isFetching}
          dataSource={budget.data ?? []}
          pagination={{ pageSize: 5 }}
          scroll={{ x: 650 }}
          columns={[
            {
              title: tr('车辆 / 范围', 'Vehicle / scope'),
              render: (_, r) =>
                `${vehicles.find((v) => v.id === r.input.vehicleId)?.name ?? r.input.vehicleId} / ${r.input.category}`,
            },
            {
              title: tr('预算原币', 'Original budget'),
              render: (_, r) => `${r.input.amount} ${r.input.currency}`,
            },
            {
              title: tr('实际 / 剩余', 'Actual / remaining'),
              render: (_, r) => `${r.actual} / ${r.remaining}`,
            },
            {
              title: tr('使用率', 'Usage'),
              render: (_, r) => (
                <span
                  style={
                    r.usedPercent > 100
                      ? { color: 'var(--ant-color-error)' }
                      : undefined
                  }
                >
                  {r.usedPercent}%
                </span>
              ),
            },
          ]}
        />
        <Button onClick={onCosts}>
          {tr('查看费用和预算明细', 'View cost and budget details')}
        </Button>
      </Card>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title={tr('月度购油实付支出', 'Monthly paid fuel purchases')}>
            <Suspense fallback={<Skeleton />}>
              <Chart
                option={{
                  tooltip: { trigger: 'axis' },
                  xAxis: {
                    type: 'category',
                    data: report.monthly.map((m) => m.month),
                  },
                  yAxis: { type: 'value', name: currency },
                  series: [
                    { type: 'bar', data: report.monthly.map((m) => m.amount) },
                  ],
                }}
              />
            </Suspense>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={tr(
              '已关联净现金成本构成',
              'Linked net cash cost composition',
            )}
          >
            <Suspense fallback={<Skeleton />}>
              <Chart
                option={{
                  tooltip: { trigger: 'axis' },
                  xAxis: {
                    type: 'category',
                    data:
                      costs.data?.categories
                        .filter((c) => c.currency === currency)
                        .map((c) => c.category) ?? [],
                  },
                  yAxis: { type: 'value', name: currency },
                  series: [
                    {
                      type: 'bar',
                      data:
                        costs.data?.categories
                          .filter((c) => c.currency === currency)
                          .map((c) => c.amount) ?? [],
                    },
                  ],
                }}
              />
            </Suspense>
          </Card>
        </Col>
      </Row>
    </>
  );
}
