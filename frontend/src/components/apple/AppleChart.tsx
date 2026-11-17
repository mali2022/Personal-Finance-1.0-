import { Suspense, lazy } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { SkeletonCard } from './AppleCard';

const EChart = lazy(() => import('./EChart'));

/**
 * Public chart entry point. Keeps ECharts out of the initial bundle and provides
 * a stable, theme-aware fallback while the chart chunk loads.
 */
export function AppleChart({
  option,
  height = 220,
  ariaLabel,
  onClick,
  loadingRows = 4,
}: {
  option: EChartsCoreOption;
  height?: number;
  ariaLabel?: string;
  onClick?: (name: string) => void;
  loadingRows?: number;
}) {
  return (
    <Suspense fallback={<SkeletonCard rows={loadingRows} />}>
      <EChart
        option={option}
        height={height}
        ariaLabel={ariaLabel}
        onClick={onClick}
      />
    </Suspense>
  );
}
