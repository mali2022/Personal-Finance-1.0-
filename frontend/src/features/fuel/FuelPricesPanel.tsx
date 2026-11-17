import { lazy, Suspense } from 'react';
import { Alert, Button, Card, Empty, Skeleton, Table } from 'antd';
import type { FuelRow, FuelStationPrices, Vehicle } from './api';
const Chart = lazy(() => import('../../components/Chart'));

export const fuelGradeOptions = [
  { value: 'Unknown', zh: '未知油品', en: 'Unknown grade' },
  { value: 'Petrol92', zh: '92号汽油', en: 'Petrol 92' },
  { value: 'Petrol95', zh: '95号汽油', en: 'Petrol 95' },
  { value: 'Petrol98', zh: '98号汽油', en: 'Petrol 98' },
  { value: 'Diesel0', zh: '0号柴油', en: 'Diesel 0' },
  { value: 'DieselMinus10', zh: '-10号柴油', en: 'Diesel -10' },
  { value: 'Other', zh: '其他（不可直接比较）', en: 'Other (not comparable)' },
];

export default function FuelPricesPanel({
  groups,
  rows,
  vehicles,
  hidden,
  english,
  onEdit,
}: {
  groups?: FuelStationPrices[];
  rows: FuelRow[];
  vehicles: Vehicle[];
  hidden: boolean;
  english: boolean;
  onEdit: (row: FuelRow) => void;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  if (hidden)
    return (
      <Alert
        type="info"
        message={tr(
          '隐私模式已隐藏加油站和油价明细',
          'Station and price details are hidden in privacy mode',
        )}
      />
    );
  if (!groups?.length)
    return (
      <Empty
        description={tr(
          '当前筛选范围暂无油价分析数据',
          'No price analysis data for these filters',
        )}
      />
    );
  const grade = (value: string) =>
    fuelGradeOptions.find((g) => g.value === value)?.[english ? 'en' : 'zh'] ??
    value;
  const station = (value: string) =>
    value || tr('未填写加油站', 'Station not recorded');
  return (
    <>
      <Table<FuelStationPrices>
        style={{ marginTop: 8 }}
        size="small"
        rowKey={(g) =>
          JSON.stringify([g.vehicleId, g.currency, g.fuelGrade, g.station])
        }
        dataSource={groups}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1000 }}
        columns={[
          {
            title: tr('加油站', 'Station'),
            render: (_, g) => station(g.station),
          },
          {
            title: tr('车辆', 'Vehicle'),
            render: (_, g) =>
              vehicles.find((v) => v.id === g.vehicleId)?.name ?? g.vehicleId,
          },
          { title: tr('油品', 'Grade'), render: (_, g) => grade(g.fuelGrade) },
          { title: tr('币种', 'Currency'), dataIndex: 'currency' },
          { title: tr('次数', 'Fills'), dataIndex: 'count' },
          { title: 'L', dataIndex: 'litres' },
          { title: tr('实付合计', 'Total paid'), dataIndex: 'amount' },
          {
            title: tr('加权实付 /L', 'Weighted paid /L'),
            dataIndex: 'weightedUnitPrice',
          },
          {
            title: tr('最低 / 最高实付单价', 'Min / max paid price'),
            render: (_, g) => `${g.minimumUnitPrice} / ${g.maximumUnitPrice}`,
          },
          {
            title: tr('参考价估算记录', 'Reference estimates'),
            dataIndex: 'estimatedQuantityCount',
          },
        ]}
        expandable={{
          expandedRowRender: (g) => (
            <>
              {g.trend.length > 1 && (
                <Card
                  size="small"
                  title={`${station(g.station)} · ${grade(g.fuelGrade)} · ${g.currency}/L`}
                >
                  <Suspense fallback={<Skeleton active />}>
                    <Chart
                      option={{
                        tooltip: { trigger: 'axis' },
                        xAxis: {
                          type: 'category',
                          data: g.trend.map((p) => p.date),
                        },
                        yAxis: {
                          type: 'value',
                          name: `${g.currency}/L`,
                          scale: true,
                        },
                        series: [
                          {
                            type: 'line',
                            data: g.trend.map((p) => p.unitPrice),
                          },
                        ],
                        aria: { enabled: true },
                      }}
                    />
                  </Suspense>
                </Card>
              )}
              <Table<FuelRow>
                size="small"
                rowKey="id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 600 }}
                dataSource={rows.filter((r) => g.recordIds.includes(r.id))}
                columns={[
                  { title: tr('日期', 'Date'), dataIndex: 'date' },
                  {
                    title: tr('原始站名', 'Original station'),
                    dataIndex: 'station',
                  },
                  { title: 'L', dataIndex: 'litres' },
                  {
                    title: tr('实付', 'Paid'),
                    render: (_, r) => `${r.amount} ${r.currency}`,
                  },
                  {
                    title: tr('操作', 'Actions'),
                    render: (_, r) => (
                      <Button size="small" onClick={() => onEdit(r)}>
                        {tr('编辑记录', 'Edit fill')}
                      </Button>
                    ),
                  },
                ]}
              />
            </>
          ),
        }}
      />
    </>
  );
}
