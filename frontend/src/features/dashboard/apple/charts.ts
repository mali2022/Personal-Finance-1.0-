import type { EChartsCoreOption } from 'echarts/core';
import type { Currency } from '../../../types';
import { formatMoney } from '../../../utils/finance';
import { formatCompactAmount, surplusOf } from '../../overview';
import { t as tr } from '../../../i18n';
import { useUI } from '../../../stores/ui';

/**
 * Chart option builders for the dashboard. Two rules are enforced here:
 * 1. every tooltip renders the exact ledger string through `formatMoney`,
 *    never the floating point value ECharts uses to draw the geometry;
 * 2. axis ticks are compact (万 / 亿) so large balances stay readable.
 */
interface ChartDatum {
  value: number | null;
  raw?: string;
}

interface TooltipParam {
  seriesName?: string;
  marker?: string;
  value?: unknown;
  data?: unknown;
  axisValue?: unknown;
  axisValueLabel?: string;
  name?: string;
  percent?: number;
}

export function moneyText(value: unknown, currency: Currency): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    const datum = value as { raw?: unknown; value?: unknown };
    if (datum.raw !== undefined) return moneyText(datum.raw, currency);
    return moneyText(datum.value, currency);
  }
  try {
    return formatMoney(String(value), currency);
  } catch {
    return String(value);
  }
}

export function compactAxis(value: unknown, currency: Currency): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '';
  try {
    return formatCompactAmount(String(numeric), currency);
  } catch {
    return String(numeric);
  }
}

export function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

function tooltipTitle(params: TooltipParam[], resolve?: (label: string) => string) {
  const first = params[0];
  const label =
    first?.axisValueLabel ??
    (typeof first?.axisValue === 'string' ? first.axisValue : undefined) ??
    first?.name ??
    '';
  const text = String(label);
  return escapeHtml(resolve ? resolve(text) : text);
}

function tooltipRow(
  param: TooltipParam,
  currency: Currency,
  options: { rate?: boolean } = {},
): string {
  const isRate = options.rate && param.seriesName === tr('储蓄率');
  const value = isRate
    ? param.value === null || param.value === undefined
      ? tr('不可计算')
      : `${Number(param.value).toFixed(1)}%`
    : moneyText(param.data ?? param.value, currency);
  return `<div style="display:flex;justify-content:space-between;gap:20px;line-height:1.75"><span>${param.marker ?? ''}${escapeHtml(
    param.seriesName ?? '',
  )}</span><span style="font-variant-numeric:tabular-nums;font-weight:600">${escapeHtml(
    value,
  )}</span></div>`;
}

function axisTooltip(
  currency: Currency,
  options: { rate?: boolean; resolveTitle?: (label: string) => string } = {},
) {
  return (raw: unknown) => {
    const params = (Array.isArray(raw) ? raw : [raw]) as TooltipParam[];
    return `<div style="font-weight:600;margin-bottom:6px">${tooltipTitle(
      params,
      options.resolveTitle,
    )}</div>${params.map((param) => tooltipRow(param, currency, options)).join('')}`;
  };
}

export function categoryTooltip(currency: Currency) {
  return (raw: unknown) => {
    const param = (Array.isArray(raw) ? raw[0] : raw) as TooltipParam;
    const name = escapeHtml(String(param?.name ?? ''));
    const amount = moneyText(param?.data ?? param?.value, currency);
    const percent =
      typeof param?.percent === 'number' ? `${param.percent.toFixed(1)}%` : '';
    return `<div style="font-weight:600;margin-bottom:6px">${name}</div><div style="line-height:1.75">${tr(
      '金额',
    )} ${escapeHtml(amount)}</div><div style="line-height:1.75">${tr(
      '占比',
    )} ${percent}</div>`;
  };
}

const english = () => useUI.getState().language === 'en';

function monthName(index: number): string {
  return new Intl.DateTimeFormat(english() ? 'en-US' : 'zh-CN', {
    month: 'short',
  }).format(new Date(2020, index, 1));
}

export function monthShort(period: string): string {
  const month = Number(period.slice(5, 7));
  return english() ? monthName(month - 1) : `${month}月`;
}

export function monthFull(period: string): string {
  const year = period.slice(0, 4);
  const month = Number(period.slice(5, 7));
  return english()
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
      }).format(new Date(Number(year), month - 1, 1))
    : `${year}年${month}月`;
}

export function dateShort(period: string): string {
  return `${Number(period.slice(5, 7))}/${Number(period.slice(8, 10))}`;
}

export function periodFull(period: string): string {
  if (period.length === 10) {
    if (english())
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(
        new Date(
          Number(period.slice(0, 4)),
          Number(period.slice(5, 7)) - 1,
          Number(period.slice(8, 10)),
        ),
      );
    return `${period.slice(0, 4)}年${Number(period.slice(5, 7))}月${Number(
      period.slice(8, 10),
    )}日`;
  }
  if (period.length === 7) return monthFull(period);
  return period;
}

function datum(raw: string): ChartDatum {
  return { value: Number(raw), raw };
}

export function incomeExpenseTrendOption(
  points: readonly { month: string; income: string; expense: string }[],
  currency: Currency,
): EChartsCoreOption {
  const titleByLabel = new Map(points.map((point) => [monthShort(point.month), monthFull(point.month)]));
  return {
    grid: { left: 4, right: 8, top: 36, bottom: 0, containLabel: true },
    legend: { data: [tr('收入'), tr('支出'), tr('结余')], top: 0, left: 0 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: axisTooltip(currency, {
        resolveTitle: (label) => titleByLabel.get(label) ?? label,
      }),
    },
    xAxis: { type: 'category', data: points.map((point) => monthShort(point.month)) },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => compactAxis(value, currency) },
    },
    series: [
      {
        name: tr('收入'),
        type: 'bar',
        barMaxWidth: 20,
        itemStyle: { borderRadius: [6, 6, 0, 0] },
        color: '#34c759',
        data: points.map((point) => datum(point.income)),
      },
      {
        name: tr('支出'),
        type: 'bar',
        barMaxWidth: 20,
        itemStyle: { borderRadius: [6, 6, 0, 0] },
        color: '#ff3b30',
        data: points.map((point) => datum(point.expense)),
      },
      {
        name: tr('结余'),
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2 },
        color: '#007aff',
        data: points.map((point) => datum(surplusOf(point.income, point.expense))),
      },
    ],
  } as EChartsCoreOption;
}

export function netWorthOption(
  points: readonly { period: string; netWorth: string }[],
  currency: Currency,
): EChartsCoreOption {
  const labels = points.map((point) =>
    point.period.length === 10 ? dateShort(point.period) : monthShort(point.period),
  );
  const titleByLabel = new Map(points.map((point, index) => [labels[index], periodFull(point.period)]));
  return {
    grid: { left: 4, right: 8, top: 18, bottom: 0, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: axisTooltip(currency, {
        resolveTitle: (label) => titleByLabel.get(label) ?? label,
      }),
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLabel: { hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { formatter: (value: number) => compactAxis(value, currency) },
    },
    series: [
      {
        name: tr('净资产'),
        type: 'line',
        smooth: true,
        symbol: points.length <= 31 ? 'circle' : 'none',
        symbolSize: 5,
        lineStyle: { width: 2.4 },
        areaStyle: { opacity: 0.12 },
        color: '#007aff',
        data: points.map((point) => datum(point.netWorth)),
      },
    ],
  } as EChartsCoreOption;
}

export function categoryDonutOption(
  items: readonly { name: string; amount: string; share: number }[],
  currency: Currency,
): EChartsCoreOption {
  return {
    tooltip: { trigger: 'item', formatter: categoryTooltip(currency) },
    series: [
      {
        name: tr('支出分类'),
        type: 'pie',
        radius: ['62%', '88%'],
        center: ['50%', '52%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderRadius: 6 },
        data: items.map((item) => ({
          name: item.name,
          value: Number(item.amount),
          raw: item.amount,
          share: item.share,
        })),
      },
    ],
  } as EChartsCoreOption;
}

export function cashBalanceOption(
  days: readonly { date: string; balance: string }[],
  currency: Currency,
): EChartsCoreOption {
  const labels = days.map((day) => dateShort(day.date));
  const titleByLabel = new Map(days.map((day, index) => [labels[index], periodFull(day.date)]));
  return {
    grid: { left: 4, right: 8, top: 18, bottom: 0, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: axisTooltip(currency, {
        resolveTitle: (label) => titleByLabel.get(label) ?? label,
      }),
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLabel: { hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { formatter: (value: number) => compactAxis(value, currency) },
    },
    series: [
      {
        name: tr('日余额'),
        type: 'line',
        smooth: 0.25,
        symbol: 'none',
        lineStyle: { width: 2.2 },
        areaStyle: { opacity: 0.14 },
        color: '#30b0c7',
        data: days.map((day) => datum(day.balance)),
      },
    ],
  } as EChartsCoreOption;
}

export function savingsOption(
  rows: readonly { month: string; surplus: string; rate: number | null }[],
  currency: Currency,
): EChartsCoreOption {
  const labels = rows.map((row) => monthShort(row.month));
  const rowByLabel = new Map(rows.map((row, index) => [labels[index], row]));
  return {
    grid: { left: 4, right: 8, top: 36, bottom: 0, containLabel: true },
    legend: { data: [tr('结余'), tr('储蓄率')], top: 0, left: 0 },
    tooltip: {
      trigger: 'axis',
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as TooltipParam[];
        const label = String(params[0]?.axisValueLabel ?? '');
        const row = rowByLabel.get(label);
        return `<div style="font-weight:600;margin-bottom:6px">${
          row ? escapeHtml(monthFull(row.month)) : escapeHtml(label)
        }</div>${params
          .map((param) => tooltipRow(param, currency, { rate: true }))
          .join('')}`;
      },
    },
    xAxis: { type: 'category', data: labels },
    yAxis: [
      {
        type: 'value',
        axisLabel: { formatter: (value: number) => compactAxis(value, currency) },
      },
      {
        type: 'value',
        axisLabel: { formatter: (value: number) => `${value}%` },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: tr('结余'),
        type: 'bar',
        barMaxWidth: 22,
        itemStyle: { borderRadius: [6, 6, 0, 0] },
        color: '#34c759',
        data: rows.map((row) => datum(row.surplus)),
      },
      {
        name: tr('储蓄率'),
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2 },
        color: '#007aff',
        data: rows.map((row) => (row.rate === null ? null : Number(row.rate.toFixed(2)))),
      },
    ],
  } as EChartsCoreOption;
}
