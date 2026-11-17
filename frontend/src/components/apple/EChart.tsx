import { useEffect, useRef } from 'react';
import { theme } from 'antd';
import { chartPalette } from '../../design/theme';
import { readDsMode } from '../../design/ds-mode';
import { t as tr } from '../../i18n';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  AriaComponent,
  CanvasRenderer,
]);

/**
 * Low-noise Apple Health / Stocks style chart surface. Loaded lazily through
 * `AppleChart` so ECharts never lands in the initial page bundle.
 */
export default function EChart({
  option,
  height = 220,
  ariaLabel,
  onClick,
}: {
  option: EChartsCoreOption;
  height?: number;
  ariaLabel?: string;
  onClick?: (name: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { token } = theme.useToken();
  const v2 = readDsMode() === 'v2';
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, {
      renderer: 'canvas',
    });
    const axis = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return value;
      const axisOption = value as Record<string, unknown>;
      return {
        ...axisOption,
        axisLabel: {
          color: token.colorTextSecondary,
          fontSize: v2 ? 12 : 11,
          ...(v2 ? { margin: 10 } : {}),
          ...((axisOption.axisLabel as object) || {}),
        },
        axisLine: {
          ...((axisOption.axisLine as object) || {}),
          lineStyle: { color: token.colorBorderSecondary },
        },
        axisTick: { show: false },
        splitLine: {
          ...((axisOption.splitLine as object) || {}),
          lineStyle: { color: token.colorBorderSecondary, type: 'dashed' },
        },
      };
    };
    const axes = (value: unknown) =>
      Array.isArray(value) ? value.map(axis) : axis(value);
    const legend =
      option.legend && typeof option.legend === 'object'
        ? {
            icon: 'roundRect',
            itemWidth: 8,
            itemHeight: 8,
            itemGap: 16,
            textStyle: { color: token.colorTextSecondary, fontSize: v2 ? 12 : 11 },
            ...(option.legend as object),
          }
        : option.legend;
    chart.setOption({
      color: chartPalette,
      textStyle: {
        fontFamily: token.fontFamily,
        color: token.colorTextSecondary,
        ...(v2 ? { fontSize: 12 } : {}),
      },
      ...option,
      xAxis: axes(option.xAxis),
      yAxis: axes(option.yAxis),
      legend,
      aria: { enabled: true },
      tooltip: {
        backgroundColor: token.colorBgElevated,
        borderColor: token.colorBorderSecondary,
        borderWidth: 1,
        padding: v2 ? [8, 12] : [10, 12],
        textStyle: { color: token.colorText, fontSize: 12 },
        extraCssText: v2
          ? `border-radius:12px;box-shadow:${token.boxShadowSecondary};`
          : 'border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.12);',
        ...(typeof option.tooltip === 'object' && !Array.isArray(option.tooltip)
          ? option.tooltip
          : {}),
      },
      backgroundColor: 'transparent',
      animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationDuration: 280,
      animationEasing: 'cubicOut',
    });
    if (onClick) chart.on('click', (params) => onClick(String(params.name)));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [
    option,
    onClick,
    token.colorBgElevated,
    token.colorBorderSecondary,
    token.colorText,
    token.colorTextSecondary,
    token.fontFamily,
    token.boxShadowSecondary,
    v2,
  ]);
  return (
    <div
      ref={ref}
      className="pf-chart"
      role="img"
      aria-label={ariaLabel || tr('财务统计图表，鼠标悬停可读取精确数值')}
      style={{ height, width: '100%' }}
    />
  );
}
