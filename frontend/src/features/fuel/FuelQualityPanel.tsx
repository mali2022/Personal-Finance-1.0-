import { Alert, Button, Card, Space, Table, Tag } from 'antd';
import type { FuelReport, FuelRow, FuelQualityIssue, Vehicle } from './api';
const labels: Record<string, [string, string]> = {
  DISCOUNT_AMOUNT_MISMATCH: [
    '优惠前金额减抵扣与实付相差超过0.05',
    'Gross less discounts differs from payment by over 0.05',
  ],
  POSTED_PRICE_MISMATCH: [
    '挂牌价乘油量与优惠前金额相差超过0.05',
    'Posted price times litres differs from gross by over 0.05',
  ],
  ODOMETER_RESET: [
    '已明确标记里程表重置，不跨界计算',
    'Explicit odometer reset; intervals cannot cross it',
  ],
  MISSING_ODOMETER: ['里程未记录', 'Missing odometer'],
  UNKNOWN_TANK_STATUS: ['加满状态未知', 'Unknown tank status'],
  UNKNOWN_FUEL_GRADE: ['油品未知', 'Unknown fuel grade'],
  MISSED_FILL: ['已标记疑似漏记', 'Marked missing fill'],
  ESTIMATED_QUANTITY: [
    '油量来自参考价估算',
    'Reference-price quantity estimate',
  ],
  INVALID_QUANTITY_OR_AMOUNT: ['油量或金额无效', 'Invalid quantity or amount'],
  EXCEEDS_TANK_CAPACITY: [
    '加油量超过已填油箱容量',
    'Quantity exceeds recorded tank capacity',
  ],
  LONG_RECORD_GAP: [
    '相邻记录间隔超过90天',
    'More than 90 days between records',
  ],
  PRICE_AMOUNT_MISMATCH: [
    '实付与录入单价推算不一致',
    'Price/amount discrepancy',
  ],
  POSSIBLE_DUPLICATE: [
    '同车同币种同油品、同日或相邻日油量金额相同',
    'Same vehicle, currency, grade, quantity and amount within one day',
  ],
  CONSUMPTION_INCREASE: [
    '油耗高于前5个区间中位数30%',
    'Consumption over 30% above prior-five median',
  ],
  CONSUMPTION_DECREASE: [
    '油耗低于前5个区间中位数30%',
    'Consumption over 30% below prior-five median',
  ],
  RISING_CONSUMPTION: [
    '最近3个有效区间连续上升',
    'Last three valid intervals rise',
  ],
  INVALID_ODOMETER: [
    '里程倒退、重复或负数',
    'Reversed, repeated or negative odometer',
  ],
  AMBIGUOUS_ORDER: ['同日加油先后不明', 'Ambiguous same-day order'],
};
export default function FuelQualityPanel({
  quality,
  rows,
  vehicles,
  hidden,
  english,
  onEdit,
}: {
  quality: NonNullable<FuelReport['quality']>;
  rows: FuelRow[];
  vehicles: Vehicle[];
  hidden: boolean;
  english: boolean;
  onEdit: (row: FuelRow) => void;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  if (hidden) return null;
  return (
    <Card
      title={tr('数据质量检查', 'Data quality checks')}
      style={{ marginBottom: 16 }}
    >
      <Alert
        type={quality.issues.length ? 'warning' : 'info'}
        message={tr(
          `当前范围 ${quality.issues.length} 条提示（非故障诊断）`,
          `Current range: ${quality.issues.length} findings (not mechanical diagnoses)`,
        )}
        description={tr(
          '提示不会自动修改、删除记录或改变加满状态，也不直接改变区间是否有效。重复、油箱容量和时间间隔仅供核对；容量可能是当前档案估计，间隔不证明漏记。统计只比较同一车辆；当前区间之前须有5个有效且非参考价估算区间，才检查30%偏离和连续上升，最多取最近5个，避免未来数据参与基准。',
          'Findings do not edit/delete records, change tank status or directly invalidate intervals. Duplicate, capacity and date-gap checks require review; current tank metadata may be estimated and a gap does not prove a missing fill. Statistics use only the same vehicle and require five prior valid non-reference-estimated intervals; only the latest five are used, with no future-data baseline.',
        )}
      />
      <Space wrap style={{ margin: '12px 0' }}>
        {quality.samples.map((s) => (
          <Tag key={s.vehicleId}>
            {vehicles.find((v) => v.id === s.vehicleId)?.name ?? s.vehicleId}:{' '}
            {tr('截至结束日可用区间', 'Eligible intervals by end date')}{' '}
            {s.eligibleIntervals}
            {s.eligibleIntervals <= s.requiredPriorIntervals
              ? tr(' · 统计样本不足', ' · insufficient statistical sample')
              : ''}
          </Tag>
        ))}
      </Space>
      <Table<FuelQualityIssue>
        size="small"
        rowKey={(issue) => `${issue.recordId}:${issue.code}`}
        dataSource={quality.issues}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 900 }}
        columns={[
          {
            title: tr('日期 / 记录', 'Date / record'),
            render: (_, issue) => (
              <>
                {rows.find((r) => r.id === issue.recordId)?.date} ·{' '}
                {issue.recordId}
              </>
            ),
          },
          {
            title: tr('级别', 'Severity'),
            dataIndex: 'severity',
            filters: ['INFO', 'WARNING', 'ERROR'].map((value) => ({
              value,
              text: value,
            })),
            onFilter: (value, r) => r.severity === value,
            render: (value) => (
              <Tag
                color={
                  value === 'ERROR'
                    ? 'red'
                    : value === 'WARNING'
                      ? 'orange'
                      : 'blue'
                }
              >
                {value}
              </Tag>
            ),
          },
          {
            title: tr('原因', 'Reason'),
            render: (_, issue) =>
              labels[issue.code]?.[english ? 1 : 0] ?? issue.code,
          },
          {
            title: tr('观测值 / 参照值', 'Observed / reference'),
            render: (_, issue) =>
              `${issue.observed ?? '—'} / ${issue.baseline ?? '—'}`,
          },
          {
            title: tr('关联记录', 'Related records'),
            render: (_, issue) => issue.relatedRecordIds.join(', ') || '—',
          },
          {
            title: tr('核对', 'Review'),
            render: (_, issue) => {
              const row = rows.find((r) => r.id === issue.recordId);
              return row ? (
                <Button size="small" onClick={() => onEdit(row)}>
                  {tr('核对原始记录', 'Review original fill')}
                </Button>
              ) : null;
            },
          },
        ]}
      />
    </Card>
  );
}
