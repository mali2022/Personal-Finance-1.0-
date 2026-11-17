import { t as tr, useLocale } from '../../i18n';
import { lazy, Suspense, useState } from 'react';
import { Card, Radio, Skeleton, theme } from 'antd';
import dayjs from 'dayjs';
import { EyeInvisibleOutlined } from '@ant-design/icons';
import { EmptyState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
import type { TrendPoint } from '../../types';
import './widgets.css';

const Chart = lazy(() => import('../../components/Chart'));

export function IncomeExpenseTrend({
  points,
  month,
  currency = 'CNY',
}: {
  points: TrendPoint[];
  month?: string;
  currency?: string;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const { token } = theme.useToken();
  const [view, setView] = useState('flows');
  const incomeColor = token.colorPrimary;
  const expenseColor = '#f19a62';
  return (
    <Card
      title={
        <div className="dashboard-panel-heading">
          <strong>{tr('收支趋势')}</strong>
          {month && month !== dayjs().format('YYYY-MM') ? (
            <span>{month}</span>
          ) : null}
        </div>
      }
      extra={
        <span className="dashboard-period">
          {tr('最近 {0} 个月', points.length || 6)}
        </span>
      }
      className="dashboard-panel dashboard-trend-panel"
    >
      <div className="dashboard-trend-toolbar">
        <Radio.Group
          aria-label={tr('趋势视图')}
          optionType="button"
          buttonStyle="solid"
          value={view}
          onChange={(event) => setView(event.target.value)}
          options={[
            { value: 'flows', label: tr('收入与支出') },
            { value: 'worth', label: tr('净资产趋势') },
          ]}
        />
        <div className="dashboard-chart-legend" aria-hidden="true">
          <span>
            <i style={{ backgroundColor: incomeColor }} />
            {view === 'worth' ? tr('净资产') : tr('收入')}
          </span>
          {view === 'flows' && (
            <span>
              <i style={{ backgroundColor: expenseColor }} />
              {tr('支出')}
            </span>
          )}
        </div>
      </div>
      <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
        {hidden ? (
          <div className="dashboard-chart-placeholder" role="status">
            <EyeInvisibleOutlined />
            <strong>{tr('金额已隐藏')}</strong>
            <span>{tr('关闭隐私模式后查看财务趋势')}</span>
          </div>
        ) : points.length === 0 ? (
          <div className="dashboard-chart-placeholder">
            <EmptyState
              description={tr('暂无趋势数据，记录交易后查看变化')}
              action={() => useUI.getState().openEntry('Expense')}
            />
          </div>
        ) : (
          <Chart
            option={{
              tooltip: {
                trigger: 'axis',
                axisPointer: { type: view === 'worth' ? 'line' : 'shadow' },
                borderWidth: 1,
                padding: [12, 16],
              },
              grid: {
                left: 0,
                right: 4,
                top: 28,
                bottom: 8,
                containLabel: true,
              },
              xAxis: {
                type: 'category',
                data: points.map((point) =>
                  tr('{0}月', Number(point.month.slice(5))),
                ),
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { margin: 16, fontSize: 12 },
              },
              yAxis: {
                type: 'value',
                name: currency,
                nameTextStyle: {
                  align: 'left',
                  fontSize: 12,
                  color: token.colorTextSecondary,
                },
                axisLabel: {
                  fontSize: 12,
                  margin: 10,
                  formatter: (value: number) =>
                    Math.abs(value) >= 10000
                      ? `${value / 10000}${tr('万')}`
                      : value.toLocaleString(),
                },
                splitLine: { lineStyle: { type: 'dashed' } },
              },
              series:
                view === 'worth'
                  ? [
                      {
                        name: tr('净资产'),
                        type: 'line',
                        smooth: 0.3,
                        symbol: 'circle',
                        symbolSize: 7,
                        lineStyle: { width: 3, color: incomeColor },
                        itemStyle: {
                          color: incomeColor,
                          borderColor: token.colorBgContainer,
                          borderWidth: 2,
                        },
                        areaStyle: {
                          color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                              { offset: 0, color: incomeColor + '38' },
                              { offset: 1, color: incomeColor + '00' },
                            ],
                          },
                        },
                        data: points.map((point) => Number(point.netWorth)),
                      },
                    ]
                  : [
                      {
                        name: tr('收入'),
                        type: 'bar',
                        barMaxWidth: 18,
                        barGap: '42%',
                        itemStyle: {
                          color: incomeColor,
                          borderRadius: [6, 6, 0, 0],
                        },
                        data: points.map((point) => Number(point.income)),
                      },
                      {
                        name: tr('支出'),
                        type: 'bar',
                        barMaxWidth: 18,
                        itemStyle: {
                          color: expenseColor,
                          borderRadius: [6, 6, 0, 0],
                        },
                        data: points.map((point) => Number(point.expense)),
                      },
                    ],
            }}
          />
        )}
      </Suspense>
    </Card>
  );
}
