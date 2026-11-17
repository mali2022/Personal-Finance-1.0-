import { Alert, Descriptions, Table } from 'antd';
import type { FuelAssessment, FuelEvidence } from './api';
import { fuelApi } from './api';
import { useQuery } from '@tanstack/react-query';

const reasons: Record<string, [string, string]> = {
  ODOMETER_RESET: [
    '已重置里程表，等待重置后的可靠满箱区间',
    'Odometer reset; await a reliable full interval in the new segment',
  ],
  FULL_TO_FULL: ['有效满箱区间', 'Valid full-to-full interval'],
  AMBIGUOUS_ORDER: [
    '同日记录无法确定先后，请核对日期与里程',
    'Same-day event order is ambiguous',
  ],
  INVALID_QUANTITY: ['存在非正油量，区间无效', 'Non-positive fuel quantity'],
  INVALID_ODOMETER: [
    '里程倒退、重复或为负数，区间无效',
    'Odometer reversed, repeated or negative',
  ],
  MISSED_FILL: ['疑似漏记加油，请先核实', 'A fill may be missing'],
  UNKNOWN_TANK_STATUS: [
    '加满状态未知，请确认原始记录',
    'Confirm unknown tank status',
  ],
  MISSING_ENDPOINT_ODOMETER: [
    '满箱端点缺少里程',
    'A full-tank endpoint has no odometer',
  ],
  NO_BASELINE: ['没有可靠的前一满箱基准', 'No reliable preceding full tank'],
  OPEN_INTERVAL: [
    '等待下一次有可靠里程的满箱记录',
    'Awaiting the next full tank with a reliable odometer',
  ],
};

export default function FuelCalculationDetails({
  assessment,
  english = false,
}: {
  assessment: FuelAssessment;
  english?: boolean;
}) {
  const detail = useQuery({
    queryKey: ['fuel', 'assessment', assessment.recordId],
    queryFn: () => fuelApi.assessment(assessment.recordId),
    enabled: !!assessment.evidenceTruncated,
  });
  const a = detail.data ?? assessment;
  const tr = (zh: string, en: string) => (english ? en : zh);
  return (
    <>
      {a.evidenceTruncated && (
        <Alert
          type={detail.isError ? 'error' : 'info'}
          message={
            detail.isError
              ? detail.error.message
              : tr(
                  '正在读取完整参与记录；当前仅显示最后20条，合计已包含全部记录',
                  'Loading full evidence; showing the last 20 rows. Totals already include all records',
                )
          }
        />
      )}
      <Alert
        type={a.status === 'VALID' ? 'success' : 'warning'}
        message={`${a.status} · ${reasons[a.reason]?.[english ? 1 : 0] ?? a.reason}`}
      />
      <Descriptions
        column={1}
        size="small"
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'start',
            label: tr('起点（不计入补油量）', 'Baseline (fuel excluded)'),
            children: a.start
              ? `${a.start.date} · ${a.start.odometer ?? '—'} km · ${a.start.id}`
              : '—',
          },
          {
            key: 'end',
            label: tr('本次记录', 'Current record'),
            children: `${a.end.date} · ${a.end.odometer ?? '—'} km · ${a.end.id}`,
          },
          {
            key: 'formula',
            label: tr('计算依据', 'Calculation'),
            children:
              a.status === 'VALID'
                ? `${a.litres} L ÷ ${a.distance} km × 100 = ${a.litresPer100Km} L/100km`
                : tr(
                    '不生成可信油耗；以下油量仅为原始记录，不代表有效消耗。',
                    'No trusted consumption result; quantities below are recorded purchases only.',
                  ),
          },
          {
            key: 'version',
            label: tr('规则 / 计算时间', 'Rule / calculated at'),
            children: `${a.ruleVersion} · ${a.calculatedAt}`,
          },
        ]}
      />
      <Table<FuelEvidence>
        size="small"
        rowKey="id"
        pagination={false}
        scroll={{ x: 500 }}
        dataSource={a.participatingRecords}
        columns={[
          { title: tr('参与记录', 'Included record'), dataIndex: 'id' },
          { title: tr('日期', 'Date'), dataIndex: 'date' },
          {
            title: 'km',
            dataIndex: 'odometer',
            render: (value) => value ?? '—',
          },
          { title: 'L', dataIndex: 'litres' },
          { title: tr('加满状态', 'Tank status'), dataIndex: 'tankStatus' },
        ]}
      />
    </>
  );
}
