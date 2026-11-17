import { Card, List, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { budgetPlanningApi } from '../api/financialPlanning';
import { ErrorState } from '../components/Feedback';
import { t, useLocale } from '../i18n';
import FinancialIndicatorsPage from './FinancialIndicatorsPage';
export default function AiRiskPage() {
  useLocale();
  const alerts = useQuery({
    queryKey: ['budgetAlerts', 1],
    queryFn: () => budgetPlanningApi.alerts(1),
  });
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card title={t('预算风险提醒')}>
        {alerts.isError ? (
          <ErrorState error={alerts.error} retry={() => alerts.refetch()} />
        ) : (
          <List
            loading={alerts.isPending}
            dataSource={alerts.data?.items.filter(
              (x) => !x.dismissed && !x.silent,
            )}
            locale={{ emptyText: t('暂无预算风险提醒') }}
            renderItem={(a) => (
              <List.Item>
                {a.month} · {t('预算预警阈值')} {a.threshold}%
              </List.Item>
            )}
          />
        )}
      </Card>
      <FinancialIndicatorsPage />
    </Space>
  );
}
