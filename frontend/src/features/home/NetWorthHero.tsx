import { useMemo, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import {
  ArrowRightOutlined,
  EyeInvisibleOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
  AppleChart,
  AppleEmpty,
  AppleSegmented,
  DeltaBadge,
  SkeletonCard,
} from '../../components/apple';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { t, useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import {
  formatCompactAmount,
  RANGES,
  useNetWorthSeries,
  type RangeKey,
} from '../overview';
import type { Currency, ReportGranularity } from '../../types';

function toNumber(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function periodLabel(period: string, granularity: ReportGranularity): string {
  if (granularity === 'month' || granularity === 'year') {
    return period.slice(0, 7).replace('-', '/');
  }
  return period.slice(5).replace('-', '/');
}

/**
 * Core net-worth card. Only the selected window is requested; React Query keeps
 * the other windows cached but never fetches them until the user asks for one.
 */
export function NetWorthHero({ currency }: { currency: string }) {
  useLocale();
  const hidden = useUI((state) => state.hidden);
  const [range, setRange] = useState<RangeKey>('30d');
  const query = useNetWorthSeries(currency, range);
  const data = query.data;
  const rangeLabel = RANGES.find((item) => item.key === range)?.label || range;

  const option = useMemo<EChartsCoreOption>(() => {
    if (!data) return {};
    const code = data.currency as Currency;
    return {
      grid: { left: 0, right: 6, top: 14, bottom: 0, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        valueFormatter: (value: unknown) =>
          formatCompactAmount(
            Number(value).toFixed(2),
            data.currency as Currency,
          ),
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: data.points.map((point) =>
          periodLabel(point.period, data.granularity),
        ),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { margin: 12, fontSize: 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        scale: true,
        splitNumber: 4,
        axisLabel: {
          fontSize: 11,
          margin: 8,
          formatter: (value: number) =>
            Math.abs(value) >= 10000
              ? formatCompactAmount(value.toFixed(2), code)
              : String(Math.round(value)),
        },
        splitLine: { lineStyle: { type: 'dashed' } },
      },
      series: [
        {
          name: t('净资产'),
          type: 'line',
          smooth: 0.26,
          symbol: 'none',
          lineStyle: { width: 2.5, color: '#007aff' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0, 122, 255, 0.26)' },
                { offset: 1, color: 'rgba(0, 122, 255, 0)' },
              ],
            },
          },
          emphasis: { focus: 'series' },
          data: data.points.map((point) => toNumber(point.netWorth)),
        },
      ],
    };
  }, [data]);

  return (
    <div className="pf-col-8 home-module" data-testid="home-networth">
      <section
        className="pf-hero home-hero"
        aria-label={t('净资产概览')}
      >
        <div className="pf-hero-head">
          <div className="home-hero-heading">
            <span className="pf-hero-label">
              <WalletOutlined aria-hidden="true" />
              {t('净资产')}
            </span>
          </div>
          <AppleSegmented
            value={range}
            ariaLabel={t('净资产区间')}
            onChange={setRange}
            options={RANGES.map((item) => ({
              value: item.key,
              label: t(item.shortLabel),
              title: t(item.label),
            }))}
          />
        </div>

        {query.isPending ? (
          <SkeletonCard rows={5} />
        ) : query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : data ? (
          <>
            <div className="pf-hero-value">
              <Link
                className="home-hero-link"
                to="/accounts"
                aria-label={t('查看账户与净资产明细')}
              >
                <span className="pf-hero-number">
                  <Money value={data.netWorth} currency={data.currency} />
                </span>
              </Link>
              <DeltaBadge
                amount={data.change}
                percent={data.changePercent}
                currency={data.currency}
                label={t('较区间起点')}
              />
            </div>

            <div className="pf-hero-split">
              <div>
                <span>{t('总资产')}</span>
                <strong>
                  <Money value={data.assets} currency={data.currency} />
                </strong>
              </div>
              <div>
                <span>{t('总负债')}</span>
                <strong>
                  <Money value={data.liabilities} currency={data.currency} />
                </strong>
              </div>
            </div>

            {data.excludedCurrencies.length > 0 ? (
              <p className="home-hero-warning" role="note">
                <WarningOutlined aria-hidden="true" />
                <span>
                  {t(
                    '以下外币账户缺少汇率，已从本卡片口径排除：{0}',
                    data.excludedCurrencies.join('、'),
                  )}
                </span>
              </p>
            ) : null}

            {hidden ? (
              <div className="home-chart-hidden" role="status">
                <EyeInvisibleOutlined aria-hidden="true" />
                <strong>{t('隐私模式已隐藏资产趋势图')}</strong>
                <span>{t('关闭隐私模式后显示所选区间的净资产走势')}</span>
              </div>
            ) : data.points.length === 0 ? (
              <AppleEmpty
                title={t('所选区间还没有净值数据')}
                description={t('记录账户交易后，这里会展示净资产走势')}
              />
            ) : (
              <div className="pf-hero-chart">
                <AppleChart
                  option={option}
                  height={212}
                  ariaLabel={t(
                    '净资产趋势图，{0} 至 {1}',
                    data.start,
                    data.end,
                  )}
                />
              </div>
            )}

            <div className="home-hero-foot">
              <span>
                {t(rangeLabel)}
                {' · '}
                {data.start} → {data.end}
              </span>
              <Link className="pf-link" to="/accounts">
                {t('查看账户')}
                <ArrowRightOutlined aria-hidden="true" />
              </Link>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
