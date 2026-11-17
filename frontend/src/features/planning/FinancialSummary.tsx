import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { Alert, Collapse } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { indicatorApi } from '../../api/financialPlanning';
import { Money } from '../../components/Money';
import { useUI } from '../../stores/ui';
export default function FinancialSummary() {
  useLocale();
  const [open, setOpen] = useState(false);
  const [emergencyIds, setEmergencyIds] = useState<string[]>([]);
  const hidden = useUI((s) => s.hidden);
  const q = useQuery({
    queryKey: ['financialSummary'],
    queryFn: indicatorApi.summary,
    enabled: open,
    staleTime: 60000,
  });
  const emergency = useQuery({
    queryKey: ['financialIndicators', 'summary', emergencyIds],
    queryFn: () =>
      indicatorApi.emergency({
        currency: 'CNY',
        months: 3,
        goalIds: emergencyIds.join(','),
        page: 1,
        pageSize: 1,
      }),
    enabled: open && emergencyIds.length > 0,
    staleTime: 60000,
  });
  return (
    <Collapse
      className="mb16"
      onChange={(keys) => setOpen(keys.length > 0)}
      items={[
        {
          key: 'planning',
          label: tr("财务规划摘要 · CNY"),
          children: q.isError ? (
            <Alert type="error" message={tr("规划摘要加载失败，请稍后重新打开")} />
          ) : (
            <>
              <p>
                {tr("本月剩余预算")}{' '}
                {q.data?.budgetRemaining != null ? (
                  <Money value={q.data.budgetRemaining} />
                ) : (
                  '尚未设置'
                )}
              </p>
              <p>
                {tr("本月储蓄率")}{' '}
                {hidden
                  ? '••••'
                  : q.data?.savingsRate != null
                    ? `${q.data.savingsRate}%`
                    : tr("不适用")}
              </p>
              <Select
                mode="multiple"
                aria-label={tr("摘要应急目标")}
                placeholder={tr("选择摘要应急目标")}
                style={{ width: '100%' }}
                value={emergencyIds}
                onChange={setEmergencyIds}
                options={q.data?.goals
                  .filter((g) => g.type === 'Emergency')
                  .map((g) => ({
                    value: g.id,
                    label: hidden ? tr("应急目标") : g.name,
                  }))}
              />
              <p>
                {tr("最近3个完整月应急覆盖：")}{hidden
                  ? '••••'
                  : emergency.data?.coverageMonths != null
                    ? tr("{0}个月", emergency.data.coverageMonths)
                    : tr("不适用或尚未明确选定目标")}
              </p>
              {emergency.isError && (
                <Alert
                  type="error"
                  message={tr("应急覆盖分析加载失败，请重新选择目标")}
                />
              )}
              {q.data?.goals.map((g) => (
                <p key={g.id}>
                  {hidden ? tr("储蓄目标") : g.name} {tr("· 已预留")}{' '}
                  <Money value={g.allocated} /> / <Money value={g.target} />
                </p>
              ))}
              {q.data?.upcoming.map((e) => (
                <p key={e.id}>
                  {e.expectedDate} · {hidden ? tr("近期计划") : e.name} ·{' '}
                  <Money
                    value={e.amount}
                    currency={e.currency as string}
                  />
                </p>
              ))}
            </>
          ),
        },
      ]}
    />
  );
}
