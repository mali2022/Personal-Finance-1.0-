import { t as tr, useLocale } from '../../i18n';
import { Alert, Card, Descriptions, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import type { ApiResponse, Currency } from '../../types';
interface Health { savings: { surplus: string; savingsRate: string | null }; structure: { fixedExpenseIncomeRatio: string | null; sampleWarning: string }; worth: { assets: string; liabilities: string; netWorth: string } }
export function FinancialHealth({ start, end, currency }: { start: string; end: string; currency: Currency }) {
  useLocale();
  const hidden = useUI(s => s.hidden);
  const q = useQuery({ queryKey: ['financial-health', start, end, currency], queryFn: async () => {
    const params = { start, end, currency };
    const results = await Promise.all([
      apiClient.get<ApiResponse<Health['savings']>>('/reports/savings-rate', { params }),
      apiClient.get<ApiResponse<Health['structure']>>('/reports/expense-structure', { params }),
      apiClient.get<ApiResponse<Health['worth']>>('/reports/net-worth-attribution', { params }),
    ]);
    return { savings: results[0].data.data, structure: results[1].data.data, worth: results[2].data.data };
  } });
  return <Card title={tr("财务健康指标概览")} loading={q.isPending}>
    {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
    {q.data && <Space direction="vertical" style={{ width: '100%' }}>
      <Descriptions column={1} bordered items={[
        { key: 'surplus', label: tr("期间统计结余"), children: <Money value={q.data.savings.surplus} currency={currency} /> },
        { key: 'savings', label: tr("储蓄率"), children: hidden ? '••••' : q.data.savings.savingsRate === null ? '不适用' : q.data.savings.savingsRate + '%' },
        { key: 'fixed', label: tr("固定支出占收入"), children: hidden ? '••••' : q.data.structure.fixedExpenseIncomeRatio === null ? '不适用' : q.data.structure.fixedExpenseIncomeRatio + '%' },
        { key: 'worth', label: tr("推算期末净资产"), children: <Money value={q.data.worth.netWorth} currency={currency} /> },
        { key: 'debt', label: tr("推算期末负债"), children: <Money value={q.data.worth.liabilities} currency={currency} /> },
        { key: 'emergency', label: tr("应急金覆盖"), children: '需在应急金分析中明确选择目标与必要支出范围' },
        { key: 'cashflow', label: tr("近期缺口与偿债压力"), children: '查看未来现金流和债务压力标签；未登记未来计划不视为零付款' },
      ]} />
      <Alert message={q.data.structure.sampleWarning} type="info" />
    </Space>}
  </Card>;
}
