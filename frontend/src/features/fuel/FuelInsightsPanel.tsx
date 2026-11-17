import { lazy, Suspense } from 'react';
import { Card, Skeleton, Table } from 'antd';
import type { FuelReport, Vehicle } from './api';
const Chart = lazy(() => import('../../components/Chart'));
export default function FuelInsightsPanel({
  report,
  vehicles,
  english,
  hidden,
}: {
  report: FuelReport;
  vehicles: Vehicle[];
  english: boolean;
  hidden: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  if (hidden) return null;
  const rows = report.records
    .filter((r) => r.interval && r.assessment?.status === 'VALID')
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card
      title={tr(
        '有效油耗趋势与滚动窗口',
        'Valid consumption trends and rolling windows',
      )}
    >
      <Suspense fallback={<Skeleton />}>
        <Chart
          option={{
            tooltip: { trigger: 'axis' },
            legend: {},
            xAxis: {
              type: 'category',
              data: [...new Set(rows.map((r) => r.date))].sort(),
            },
            yAxis: { type: 'value', name: 'L/100km' },
            series: vehicles.map((v) => ({
              name: v.name,
              type: 'line',
              connectNulls: false,
              data: [...new Set(rows.map((r) => r.date))].sort().map((date) => {
                const selected = rows.filter(
                  (r) => r.vehicleId === v.id && r.date === date,
                );
                const km = selected.reduce(
                  (s, r) => s + r.interval!.distance,
                  0,
                );
                return km > 0
                  ? Number(
                      (
                        (selected.reduce((s, r) => s + r.interval!.litres, 0) *
                          100) /
                        km
                      ).toFixed(2),
                    )
                  : null;
              }),
            })),
          }}
        />
      </Suspense>
      <Table
        rowKey={(r) => r.vehicleId + '-' + r.requested}
        dataSource={report.insights?.windows ?? []}
        pagination={false}
        scroll={{ x: 650 }}
        columns={[
          {
            title: tr('车辆', 'Vehicle'),
            render: (_, r) =>
              vehicles.find((v) => v.id === r.vehicleId)?.name ?? r.vehicleId,
          },
          {
            title: tr('窗口 / 样本', 'Window / samples'),
            render: (_, r) => `${r.requested} / ${r.samples}`,
          },
          { title: 'km / L', render: (_, r) => `${r.distance} / ${r.litres}` },
          { title: 'L/100km', dataIndex: 'litresPer100Km' },
          {
            title: tr('依据状态', 'Evidence status'),
            render: (_, r) =>
              `${r.sufficient ? tr('完整窗口', 'Complete window') : tr('窗口数据不足', 'Incomplete window')}${r.estimated ? tr('；含估算油量', '; includes estimated quantities') : ''}`,
          },
        ]}
      />
    </Card>
  );
}
