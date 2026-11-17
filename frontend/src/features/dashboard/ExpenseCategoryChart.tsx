import { t as tr, useLocale } from '../../i18n';
import { EmptyState } from '../../components/Feedback';
import { lazy, Suspense, useId, useState } from 'react';
import { Card, Button, Skeleton, theme } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowRightOutlined,
  DownOutlined,
  EyeInvisibleOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Money } from '../../components/Money';
import { useUI } from '../../stores/ui';
import { decimal, minor } from '../../utils/finance';
import type { CategoryStat } from '../../types';

const Chart = lazy(() => import('../../components/Chart'));
const categoryColors = [
  '#4564ed',
  '#f19a62',
  '#90a4f5',
  '#70bfd1',
  '#b7a4eb',
  '#c8d2e9',
];

export function ExpenseCategoryChart({
  items,
  month,
  currency = 'CNY',
}: {
  items: CategoryStat[];
  month: string;
  currency?: string;
}) {
  useLocale();
  const navigate = useNavigate();
  const hidden = useUI((s) => s.hidden);
  const [expanded, setExpanded] = useState(false);
  const rankingId = useId();
  const { token } = theme.useToken();
  const ranked = [...items].sort((a, b) => {
    const difference = minor(b.amount) - minor(a.amount);
    return difference > 0n ? 1 : difference < 0n ? -1 : 0;
  });
  const positive = ranked.filter((item) => minor(item.amount) > 0n);
  const total = positive.reduce((sum, item) => sum + minor(item.amount), 0n);
  const share = (amount: string) =>
    total > 0n
      ? Math.max(0, Number((minor(amount) * 10000n) / total) / 100)
      : 0;
  const drill = (id: string) =>
    navigate('/transactions?' + new URLSearchParams({ categoryId: id, month }));
  return (
    <Card
      className="dashboard-panel dashboard-category-panel"
      title={
        <div className="dashboard-panel-heading">
          <strong>{tr('支出花在哪里')}</strong>
          {month === dayjs().format('YYYY-MM') ? null : <span>{month}</span>}
        </div>
      }
      extra={
        <Button type="link" onClick={() => navigate('/reports')}>
          {tr('分析')}
          <ArrowRightOutlined />
        </Button>
      }
    >
      {hidden ? (
        <div className="dashboard-private-note" role="status">
          <EyeInvisibleOutlined />
          {tr('金额已隐藏')}
        </div>
      ) : positive.length === 0 ? (
        <EmptyState
          description={tr('暂无可绘制的正支出，退款及负值保留在明细中')}
        />
      ) : (
        <div className="dashboard-category-overview">
          <div className="dashboard-category-donut">
            <Suspense
              fallback={<Skeleton.Avatar active size={144} shape="circle" />}
            >
              <Chart
                option={{
                  tooltip: {
                    trigger: 'item',
                    formatter: '{b}<br/>{c} 元 · {d}%',
                  },
                  color: positive.map(
                    (_, index) => categoryColors[index % categoryColors.length],
                  ),
                  series: [
                    {
                      type: 'pie',
                      radius: ['74%', '94%'],
                      center: ['50%', '50%'],
                      padAngle: 4,
                      minAngle: 3,
                      itemStyle: {
                        borderRadius: 5,
                        borderColor: token.colorBgContainer,
                        borderWidth: 1,
                      },
                      label: { show: false },
                      emphasis: { scaleSize: 4 },
                      data: positive.map((item) => ({
                        name: item.name,
                        value: Number(item.amount),
                      })),
                    },
                  ],
                }}
                onClick={(name) => {
                  const category = items.find((item) => item.name === name);
                  if (category) drill(category.categoryId);
                }}
              />
            </Suspense>
            <div className="dashboard-donut-center" aria-hidden="true">
              <strong>{positive.length}</strong>
              <span>{tr('支出分类')}</span>
            </div>
          </div>
          <div className="dashboard-category-total">
            <span>{tr('正支出合计')}</span>
            <strong>
              <Money currency={currency} value={decimal(total)} />
            </strong>
            <small>{tr('点击分类查看明细')}</small>
          </div>
        </div>
      )}
      {ranked.length > 0 && (
        <div className="dashboard-category-ranking" id={rankingId}>
          {(expanded ? ranked : ranked.slice(0, 5)).map((item) => {
            const percentage = share(item.amount);
            const positiveIndex = positive.findIndex(
              (category) => category.categoryId === item.categoryId,
            );
            const color = hidden
              ? token.colorTextSecondary
              : positiveIndex >= 0
                ? categoryColors[positiveIndex % categoryColors.length]
                : token.colorTextSecondary;
            return (
              <button
                className="dashboard-category-row"
                key={item.categoryId}
                onClick={() => drill(item.categoryId)}
              >
                <span className="dashboard-category-label">
                  <i style={{ backgroundColor: color }} />
                  <span>{item.name}</span>
                  <small>
                    {hidden
                      ? '••'
                      : minor(item.amount) < 0n
                        ? tr('退款 / 调整')
                        : `${percentage.toFixed(1)}%`}
                  </small>
                </span>
                <strong>
                  <Money currency={currency} value={item.amount} />
                </strong>
                {!hidden && (
                  <span className="dashboard-category-track" aria-hidden="true">
                    <i
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: color,
                      }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {ranked.length > 5 && (
        <Button
          type="text"
          className="dashboard-category-toggle"
          aria-expanded={expanded}
          aria-controls={rankingId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? tr('收起分类') : tr('展开全部 {0} 类', ranked.length)}
          {expanded ? (
            <UpOutlined aria-hidden="true" />
          ) : (
            <DownOutlined aria-hidden="true" />
          )}
        </Button>
      )}
    </Card>
  );
}
