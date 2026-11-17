import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

/**
 * Apple system chart palette. The order matters for the dashboard / category
 * charts and mirrors the tokens in `tokens.css`.
 */
export const chartPalette = [
  '#007aff',
  '#34c759',
  '#ff9f0a',
  '#5e5ce6',
  '#30b0c7',
  '#ff2d55',
  '#af52de',
  '#8e8e93',
];

export const appleFont =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", sans-serif';

export function financeTheme(
  dark: boolean,
  reducedMotion = false,
  dsMode: 'v1' | 'v2' = 'v1',
): ThemeConfig {
  const label = dark ? '#f5f5f7' : '#1d1d1f';
  const label2 = dark ? '#a1a1a6' : '#5c5c63';
  const label3 = dark ? '#8e8e93' : '#70707a';
  const surface = dark ? '#1c1c1e' : '#ffffff';
  const canvas = dark ? '#000000' : '#f5f5f7';
  const separator = dark ? 'rgba(84,84,88,.6)' : 'rgba(60,60,67,.14)';
  const fill = dark ? 'rgba(120,120,128,.28)' : 'rgba(120,120,128,.1)';
  // v2 只按 v2-spec.md 的映射表改写尺度与表面，颜色仍由上面的明暗判断给出。
  const v2 = dsMode === 'v2';
  const v2Token = {
    borderRadius: 10,
    borderRadiusXS: 4,
    borderRadiusSM: 10,
    borderRadiusLG: 16,
    controlHeight: 36,
    controlHeightSM: 28,
    controlHeightLG: 44,
    fontSize: 14,
    fontSizeSM: 12,
    fontSizeLG: 16,
    fontWeightStrong: 600,
    lineHeight: 1.5,
    boxShadow: 'var(--ds-e-3)',
    boxShadowSecondary: 'var(--ds-e-2)',
  } satisfies ThemeConfig['token'];
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      motion: !reducedMotion,
      colorPrimary: dark ? '#0a84ff' : '#0066cc',
      colorSuccess: dark ? '#30d158' : '#1d8a46',
      colorWarning: dark ? '#ffb340' : '#a35200',
      colorError: dark ? '#ff6961' : '#d70015',
      colorInfo: dark ? '#40c8e0' : '#0066cc',
      colorBgLayout: canvas,
      colorBgContainer: surface,
      colorBgElevated: surface,
      colorFillSecondary: fill,
      colorText: label,
      colorTextPlaceholder: label3,
      colorTextSecondary: label2,
      colorBorder: separator,
      colorBorderSecondary: separator,
      borderRadius: 10,
      borderRadiusLG: 18,
      borderRadiusSM: 8,
      controlHeight: 44,
      fontSize: 14,
      fontFamily: appleFont,
      motionDurationMid: '0.2s',
      motionDurationSlow: '0.28s',
      boxShadow: dark
        ? '0 1px 1px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.32)'
        : '0 1px 1px rgba(0,0,0,.03), 0 4px 14px rgba(0,0,0,.035)',
      boxShadowSecondary: dark
        ? '0 2px 4px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.44)'
        : '0 2px 4px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.06)',
      ...(v2 ? v2Token : {}),
    },
    components: {
      Layout: {
        headerBg: dark ? 'rgba(28,28,30,.86)' : 'rgba(255,255,255,.82)',
        headerHeight: 68,
        headerPadding: '0 28px',
        siderBg: dark ? '#1c1c1e' : '#fbfbfd',
        bodyBg: canvas,
        triggerBg: dark ? '#2c2c2e' : '#f0f1f4',
        triggerColor: label,
      },
      Menu: {
        itemHeight: 40,
        itemBorderRadius: 10,
        itemMarginInline: 10,
        itemSelectedBg: dark ? '#2c2c2e' : 'rgba(0,122,255,.1)',
        itemSelectedColor: dark ? '#f5f5f7' : '#0058b8',
        itemHoverBg: dark ? 'rgba(120,120,128,.24)' : 'rgba(120,120,128,.08)',
        itemColor: dark ? '#a1a1a6' : '#5f5f66',
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        activeBarBorderWidth: 0,
        fontSize: 13,
      },
      Table: {
        headerBg: v2 ? 'var(--ds-c-surface-sub)' : dark ? '#2c2c2e' : '#fbfbfd',
        headerColor: label2,
        cellPaddingBlock: v2 ? 16 : 14,
        rowHoverBg: dark ? 'rgba(120,120,128,.2)' : '#f5f5f7',
        borderColor: separator,
        headerSplitColor: 'transparent',
      },
      Card: {
        headerFontSize: 15,
        headerHeight: v2 ? 56 : 60,
        paddingLG: v2 ? 20 : 22,
        colorBorderSecondary: separator,
      },
      Button: {
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        fontWeight: 500,
        // v2：按钮统一 pill，与 chip/tag/搜索框同一形状语汇。
        ...(v2 ? { borderRadius: 999, borderRadiusSM: 999, borderRadiusLG: 999 } : {}),
      },
      Input: {
        activeShadow: '0 0 0 4px rgba(0,102,204,.18)',
        hoverBorderColor: dark ? 'rgba(120,120,128,.64)' : 'rgba(60,60,67,.3)',
      },
      Select: {
        optionSelectedBg: dark ? 'rgba(10,132,255,.24)' : 'rgba(0,122,255,.1)',
      },
      Segmented: {
        itemSelectedBg: surface,
        trackBg: fill,
        trackPadding: 3,
        borderRadius: 999,
      },
      Progress: {
        defaultColor: dark ? '#0a84ff' : '#0066cc',
        remainingColor: fill,
      },
      Drawer: {
        footerPaddingBlock: 16,
        footerPaddingInline: 22,
      },
      Collapse: {
        headerBg: 'transparent',
        contentBg: 'transparent',
      },
      Tabs: {
        itemSelectedColor: dark ? '#f5f5f7' : '#1d1d1f',
        itemColor: label2,
        inkBarColor: dark ? '#0a84ff' : '#0066cc',
      },
      Breadcrumb: {
        itemColor: label2,
        lastItemColor: label,
        separatorColor: label3,
      },
      Tooltip: {
        colorBgSpotlight: dark ? '#f5f5f7' : '#1d1d1f',
        colorTextLightSolid: dark ? '#1d1d1f' : '#ffffff',
      },
    },
  };
}
