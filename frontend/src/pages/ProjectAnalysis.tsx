import { DatePicker } from '../components/ResponsiveDatePicker';
import { t as tr, useLocale } from '../i18n';
import { LoadingState } from '../components/LoadingState';
import { lazy, Suspense, useState } from 'react';
import { Card, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useUI } from '../stores/ui';
import { reportApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import type { DirectoryRecord } from '../types';
const Chart = lazy(() => import('../components/Chart'));
export function ProjectAnalysis({ project }: { project: DirectoryRecord }) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(5, 'month').startOf('month'),
    dayjs().endOf('month'),
  ]);
  const filters = {
    start: range[0].format('YYYY-MM-DD'),
    end: range[1].format('YYYY-MM-DD'),
    currency: project.currency,
    granularity: 'month' as const,
    projectId: project.id,
  };
  const q = useQuery({
    queryKey: ['reports', filters],
    queryFn: () => reportApi.get(filters),
  });
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <>
      <DatePicker.RangePicker
        value={range}
        onChange={(v) => {
          if (v?.[0] && v[1]) setRange([v[0], v[1]]);
        }}
      />
      <p>{tr("消费按支出减退款统计，借贷与垫付不计入项目消费。")}</p>
      {q.isPending ? (
        <LoadingState />
      ) : (
        q.data && (
          <>
            <Space>
              <span>
                {tr("期间支出")}{' '}
                <Money value={q.data.expense} currency={project.currency} />
              </span>
              <span>
                {tr("项目总预算")}{' '}
                <Money value={project.budget} currency={project.currency} />
              </span>
            </Space>
            {hidden ? (
              <p>{tr("金额已隐藏，统计图暂停显示。")}</p>
            ) : (
              <Suspense fallback={<LoadingState />}>
                <Card title={tr("分类分布")}>
                  <Chart
                    option={{
                      tooltip: { trigger: 'item' },
                      series: [
                        {
                          type: 'pie',
                          radius: ['48%', '70%'],
                          data: q.data.categories.map((c) => ({
                            name: c.name,
                            value: Number(c.amount),
                          })),
                        },
                      ],
                    }}
                  />
                </Card>
                <Card title={tr("月度支出趋势")}>
                  <Chart
                    option={{
                      tooltip: { trigger: 'axis' },
                      xAxis: {
                        type: 'category',
                        data: q.data.points.map((p) => p.period),
                      },
                      yAxis: { type: 'value' },
                      series: [
                        {
                          type: 'line',
                          data: q.data.points.map((p) => Number(p.expense)),
                        },
                      ],
                    }}
                  />
                </Card>
              </Suspense>
            )}
          </>
        )
      )}
    </>
  );
}
