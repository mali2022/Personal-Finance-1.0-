import { useMemo, useState } from 'react';
import { Alert, Card, Pagination, Space } from 'antd';
import Chart from '../../components/Chart';
import { useLocale } from '../../i18n';
import type { AssetReturn } from './AssetReturnPanel';

export function cashFlowChartOption(rows: AssetReturn['cashFlows'], english: boolean) {
  const valuation = (type: string) => type === 'OpeningValue' || type === 'ClosingValue';
  return {
    aria: { enabled: true, label: { description: english ? 'Cash-flow chart: contributions are negative, proceeds positive. Boundary valuations are calculation entries. Missing amounts are gaps. Use calculation details for exact amounts.' : '现金流图：投入为负，回收为正，边界估值为计算项，缺失金额留空。精确金额请查看计算明细。' } },
    tooltip: { trigger: 'axis' },
    legend: { data: [english ? 'Actual cash flow' : '实际现金流', english ? 'Boundary valuation' : '边界估值（计算项）'] },
    grid: { left: 75, right: 20, bottom: 80, top: 45 },
    xAxis: { type: 'category', data: rows.map(x => `${x.date} ${x.type}`), axisLabel: { rotate: 35 } },
    yAxis: { type: 'value' },
    series: [
      { name: english ? 'Actual cash flow' : '实际现金流', type: 'bar', data: rows.map(x => valuation(x.type) || x.amount == null ? null : Number(x.amount)) },
      { name: english ? 'Boundary valuation' : '边界估值（计算项）', type: 'bar', data: rows.map(x => !valuation(x.type) || x.amount == null ? null : Number(x.amount)), itemStyle: { borderType: 'dashed', borderWidth: 2 } },
    ],
  };
}

export function ReturnCashFlowChart({ data }: { data: AssetReturn }) {
  const english = useLocale() === 'en';
  const [page, setPage] = useState(1);
  const total = data.cashFlows.length;
  const current = Math.max(1, Math.min(page, Math.ceil(total / 100)));
  const option = useMemo(() => cashFlowChartOption(data.cashFlows.slice((current - 1) * 100, current * 100), english), [data, current, english]);
  return <Card size="small" title={english ? `Cash flows · ${data.currency}` : `现金流分布 · ${data.currency}`}>
    <Space direction="vertical" style={{ width: '100%' }}>
      {data.cashFlows.some(x => x.amount == null) && <Alert type="warning" message={english ? 'Missing converted amounts are gaps, not zero. Inspect cash-flow details.' : '缺失折算金额留空，不视为零；请核对现金流明细。'} />}
      <Chart option={option} />
      <Pagination current={current} onChange={setPage} pageSize={100} total={total} showSizeChanger={false} size="small" />
    </Space>
  </Card>;
}
