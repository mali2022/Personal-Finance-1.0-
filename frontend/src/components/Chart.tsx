import { t as tr, useLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Button, Table, theme } from 'antd';
import { useUI } from '../stores/ui';
import { chartPalette } from '../design/theme';
import { readDsMode } from '../design/ds-mode';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts';
import {
  RadarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
echarts.use([
  RadarComponent,
  RadarChart,
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  AriaComponent,
  CanvasRenderer,
]);
export default function Chart({
  option,
  onClick,
}: {
  option: EChartsCoreOption;
  onClick?: (name: string) => void;
}) {
  useLocale();
  const [showData, setShowData] = useState(false);
  const hidden = useUI((s) => s.hidden);
  const ref = useRef<HTMLDivElement>(null);
  const { token } = theme.useToken();
  // v2：坐标轴/图例/提示框的字号与描边按设计规范收敛（v1 输出保持不变）。
  const v2 = readDsMode() === 'v2';
  useEffect(() => {
    if (!ref.current || hidden) return;
    const chart = echarts.init(ref.current, undefined);
    const axisStyle = (axis: unknown) => {
      if (!axis || typeof axis !== 'object') return axis;
      const value = axis as Record<string, unknown>;
      return {
        ...value,
        axisLabel: {
          ...(value.axisLabel as object),
          color: token.colorTextSecondary,
          ...(v2 ? { fontSize: 12, margin: 10 } : {}),
        },
        axisLine: {
          ...(value.axisLine as object),
          lineStyle: { color: v2 ? token.colorBorderSecondary : token.colorBorder },
        },
        axisTick: v2 ? { show: false } : (value.axisTick as object),
        splitLine: {
          ...(value.splitLine as object),
          lineStyle: {
            color: token.colorBorderSecondary,
            ...(v2 ? { type: 'dashed' } : {}),
          },
        },
      };
    };
    const axesStyle = (axis: unknown) =>
      Array.isArray(axis) ? axis.map(axisStyle) : axisStyle(axis);
    chart.setOption({
      color: chartPalette,
      textStyle: {
        fontFamily: token.fontFamily,
        color: token.colorTextSecondary,
        ...(v2 ? { fontSize: 12 } : {}),
      },
      ...option,
      xAxis: axesStyle(option.xAxis),
      yAxis: axesStyle(option.yAxis),
      aria: { enabled: true, ...(typeof option.aria === 'object' ? option.aria : {}) },
      tooltip: {
        backgroundColor: token.colorBgContainer,
        borderColor: token.colorBorder,
        textStyle: { color: token.colorText, ...(v2 ? { fontSize: 12 } : {}) },
        ...(v2
          ? {
              borderRadius: 12,
              borderWidth: 1,
              padding: [8, 12],
              extraCssText: `box-shadow: ${token.boxShadowSecondary};`,
            }
          : {}),
        ...(typeof option.tooltip === 'object' && !Array.isArray(option.tooltip)
          ? option.tooltip
          : {}),
      },
      legend: option.legend
        ? {
            textStyle: {
              color: token.colorTextSecondary,
              ...(v2 ? { fontSize: 12 } : {}),
            },
            ...(v2 ? { itemWidth: 8, itemHeight: 8, itemGap: 16 } : {}),
            ...(typeof option.legend === 'object' &&
            !Array.isArray(option.legend)
              ? option.legend
              : {}),
          }
        : undefined,
      backgroundColor: 'transparent',
      animation: false,
    });
    if (onClick) chart.on('click', (p) => onClick(p.name));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [
    option,
    onClick,
    hidden,
    token.colorBgContainer,
    token.colorTextSecondary,
    token.colorText,
    token.colorBorder,
    token.colorBorderSecondary,
    token.boxShadowSecondary,
    token.fontFamily,
    v2,
  ]);
  if (hidden)
    return (
      <div className="chart-hidden" role="status">
        {tr('隐私模式已隐藏图表')}
      </div>
    );
  const series = (
    Array.isArray(option.series)
      ? option.series
      : option.series
        ? [option.series]
        : []
  ) as { name?: string; data?: unknown[] }[];
  const axes = (
    Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis
  ) as { data?: unknown[] } | undefined;
  const rows = series.flatMap((series, index) =>
    (series.data || []).map((item, i) => {
      const point =
        item && typeof item === 'object' && !Array.isArray(item)
          ? (item as { name?: string; value?: unknown })
          : undefined;
      return {
        key: index + ':' + i,
        series: series.name || '系列 ' + (index + 1),
        label: String(point?.name ?? axes?.data?.[i] ?? i + 1),
        value: String(point?.value ?? item ?? '—'),
      };
    }),
  );
  return (
    <div className="finance-chart">
      <div
        ref={ref}
        role="img"
        aria-label={tr('财务统计图表，可通过查看数据读取原始数值')}
        style={{ height: 270, width: '100%' }}
      />
      {rows.length > 0 && (
        <Button
          type="link"
          aria-expanded={showData}
          onClick={() => setShowData((value) => !value)}
        >
          {showData ? tr('收起数据') : tr('查看数据')}
        </Button>
      )}
      {showData && (
        <Table
          size="small"
          rowKey="key"
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 360 }}
          columns={[
            { title: tr('系列'), dataIndex: 'series' },
            { title: tr('项目'), dataIndex: 'label' },
            {
              title: tr('原始数值（单位沿用图表）'),
              dataIndex: 'value',
              align: 'right',
            },
          ]}
        />
      )}
    </div>
  );
}
