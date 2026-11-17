import { t as tr, useLocale } from '../../i18n';
import { Alert, Button, Card, Collapse, Descriptions } from 'antd';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { ErrorState } from '../../components/Feedback';
import type { ApiResponse } from '../../types';
import type { Currency } from '../../types';
import { useUI } from '../../stores/ui';
import { Money } from '../../components/Money';
interface Definition { id: string; name: string; explanation: string; formula: string; source: string; limitation: string; timeBasis: string; refundTreatment: string; feeTreatment: string; adjustmentTreatment: string; ruleVersion: string }
export function MetricCenter({ start, end, currency }: { start: string; end: string; currency: Currency }) {
  useLocale();
  const [selected, setSelected] = useState<string>();
  const hidden = useUI(s => s.hidden);
  const detail = useQuery({ queryKey: ['metric-details', selected, start, end, currency], enabled: !!selected && !hidden && selected !== 'emergency-coverage', queryFn: () => apiClient.get<ApiResponse<{ details: Record<string, unknown> }>>('/reports/metric-details', { params: { metricId: selected, start, end, currency } }).then(r => r.data.data), retry: false });
  const q = useQuery({ queryKey: ['metric-definitions'], queryFn: () => apiClient.get<ApiResponse<Definition[]>>('/reports/metric-definitions').then(r => r.data.data) });
  return <Card title={tr("统一财务指标说明")} loading={q.isPending} className="mb16">
    {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
    <p>{tr("当前范围：")}{start} {tr("至")}{end}{tr("（结束日纳入）；币种：")}{currency}。</p>
    <Collapse items={q.data?.map(d => ({ key: d.id, label: d.name, children: <><Button onClick={() => setSelected(d.id)}>{tr("查看当前口径与实际数值")}</Button><Descriptions column={1} bordered items={[
      { key: 'formula', label: tr("公式"), children: d.formula }, { key: 'source', label: tr("数据来源"), children: d.source },
      { key: 'time', label: tr("时间口径"), children: d.timeBasis }, { key: 'refund', label: tr("退款"), children: d.refundTreatment },
      { key: 'fee', label: tr("费用"), children: d.feeTreatment }, { key: 'adjustment', label: tr("资产调整"), children: d.adjustmentTreatment },
      { key: 'limit', label: tr("限制"), children: d.limitation }, { key: 'version', label: tr("规则版本"), children: d.ruleVersion },
    ]} /></> }))} />
    {selected && (hidden ? <Alert message={tr("隐私模式已隐藏指标数值")} /> : selected === 'emergency-coverage' ? <Alert message={tr("需要在应急金分析中选择目标，才能计算实际分子分母。")} /> : detail.isError ? <ErrorState error={detail.error} retry={() => detail.refetch()} /> : <Descriptions title={tr("当前指标计算数据")} column={1} items={Object.entries(detail.data?.details || {}).filter(([, v]) => typeof v === 'string' || v === null).map(([key, v]) => ({ key, label: key, children: v === null ? '不适用' : ['income', 'expense', 'surplus', 'assets', 'liabilities', 'netWorth', 'change', 'openingNetWorth', 'currentNetWorth'].includes(key) ? <Money value={String(v)} currency={currency} /> : String(v) }))} />)}
  </Card>;
}
