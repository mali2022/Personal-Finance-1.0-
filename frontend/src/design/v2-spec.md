# 设计系统 v2 规范（冻结版）

- 方向：**B「Apple 精修三代」** —— 保留 Apple 语言与 antd 行为底座，只做数值与结构的收敛。
- 状态：**冻结**（本文件是波 1–5 的唯一数值契约；改动走第 10 节变更控制）。
- 落地文件：数值在 `frontend/src/design/v2-tokens.css`，开关在 `frontend/src/design/ds-mode.ts`，
  审计在 `frontend/scripts/check-ds.mjs`，视觉基线在 `frontend/e2e-visual/`。
- 视觉基准稿：`C:\\Users\\<用户名>\\Desktop\\ui-directions\\B-apple-refined.html`（波 2 的比对样本）。

## 0. 一页速览

| 维度 | v1 现状 | v2 契约 | 收敛比 |
| --- | --- | --- | --- |
| 字号 | 32 种 | **8 档** 11/12/13/14/16/22/28/30 | 4× |
| 圆角 | 19 种 | **4 档** 10/12/16/pill | ≈5× |
| 投影 | 80 条手写 | **3 档** `--ds-e-1/2/3` + 2 条 hairline | ≈16× |
| antd 内部覆写 | 125 处（`src/styles.css`） | **0 处**（全部走 ConfigProvider token + primitives） | 全清 |
| 内联 style | 429 处 | 只允许布局型（`gridTemplateColumns`、`minWidth`、动态色） | 见第 7 节 |
| 演示外壳 CSS 文件 | 9 个（4.9k 行，语义重叠） | 波 5 合并为 6 个（tokens/shell/data/reports/special/settings） | — |

**B 不降密度**：表行仍 52px、页标题仍 30px、KPI 仍是四张独立卡片。v2 只统一数值，不压缩信息量。

## 1. 目标与非目标

### 目标
1. 全站数值收敛到第 2 节的单一尺度；同一个"东西"在不同页面看起来必须一致。
2. 停止直接刺进 antd 内部；antd 只通过 `ConfigProvider theme` 与组件 props 控制外观。
3. 新增一层自有展示型 primitives（`src/design/v2/`），承担 KPI 卡、区块标题、工具条、空态等"产品形状"。
4. 每波可独立开关与回滚（`html[data-ds]`），任何时刻主分支可运行。
5. 暗色、focus/disabled/error、空/载/错三态、≤760px 布局在第一波就补齐，不留到最后。

### 非目标
- 不改任何业务行为、接口、金额精度、幂等、审计、i18n key、路由。
- 不换组件库（保留 antd 5），不引入 CSS-in-JS 运行时，不引入 Tailwind，不引入新依赖。
- 不改测试选择器所依赖的类名/角色/文案（第 7 节清单）。
- 不重排导航信息架构（分组与路径保持 `src/design/navigation.ts` 现状）。

## 2. 数值契约

所有值以 `--ds-*` 变量为唯一来源；**禁止在业务文件里写同义字面量**（审计脚本会报）。

### 2.1 颜色
沿用 v1 的 `--pf-*` 色板（`tokens.css` 已覆盖亮/暗两套），v2 **不新增任何 hex**。
含义映射固定：

| 用途 | token |
| --- | --- |
| 页面底色 | `--pf-bg` |
| 卡片/表面 | `--pf-surface`、次级表面 `--pf-surface-2`、凹陷区 `--pf-surface-3` |
| 主文本 / 次文本 / 辅助 / 反白 | `--pf-label` / `--pf-label-2` / `--pf-label-3` / `--pf-label-inverse` |
| 分隔线 | `--pf-separator`（强分隔 `--pf-separator-strong`） |
| 品牌/可交互 | `--pf-tint`（hover `--pf-tint-hover`、pressed `--pf-tint-active`、底纹 `--pf-tint-soft`） |
| 收入/正向 | `--pf-positive` |
| 支出/负向/危险 | `--pf-negative` |
| 警告 / 信息 | `--pf-warning` / `--pf-info` |
| 毛玻璃（顶栏、抽屉底） | `--pf-material` + `--pf-blur` |

缺口补齐（波 1 追加到 `v2-tokens.css`，均为 v1 语义色的新别名，不新增色值）：
`--ds-c-surface`、`--ds-c-surface-sub`、`--ds-c-line`、`--ds-c-text`、`--ds-c-text-2`、`--ds-c-text-3`、
`--ds-c-tint`、`--ds-c-tint-soft`、`--ds-c-pos`、`--ds-c-neg`、`--ds-c-warn`、`--ds-c-info`。

### 2.2 圆角（4 档，无例外）

| token | 值 | 适用 |
| --- | --- | --- |
| `--ds-r-1` | 10px | 侧栏面板条目、列表行内小块、输入框内部块、附件缩略图 |
| `--ds-r-2` | 12px | rail 图标底、卡片内嵌块、图表图例块、代码/标签块 |
| `--ds-r-3` | 16px | 卡片、表格容器、抽屉、弹窗、图表容器、空态容器 |
| `--ds-r-pill` | 999px | 按钮、chip、tag、搜索框、图标按钮、分段控件、头像外框 |

### 2.3 字阶（8 档）

| token | 字号 | 行高 | 字重 | 用途 |
| --- | --- | --- | --- | --- |
| `--ds-t-1` | 11px | 1.3 | 600 | 角标、状态标签、图表轴标签 |
| `--ds-t-2` | 12px | 1.5 | 400 | 元信息、时间戳、辅助说明 |
| `--ds-t-3` | 13px | 1.5 | 400/500 | 表头、侧栏条目、次要正文、说明文字 |
| `--ds-t-4` | 14px | 1.5 | 400 | 正文、表格单元格、表单控件 |
| `--ds-t-5` | 16px | 1.5 | 600 | 长文段落标题、抽屉标题 |
| `--ds-t-6` | 22px | 1.3 | 600 | 区块标题（"最近交易""账户分布"） |
| `--ds-t-7` | 28px | 1.15 | 600 | KPI 数值（tabular-nums） |
| `--ds-t-8` | 30px | 1.15 | 700 | 页面标题（每页一个） |

字重只用 400 / 500 / 600 / 700 四档；**禁止 300 与 800+**。
字族沿用 `--pf-font`，等宽数字用 `--ds-num-font` + `--ds-num-features`。

### 2.4 投影（3 档）

| token | 用途 |
| --- | --- |
| `--ds-e-1` | 静止卡片、表格容器、KPI 卡 |
| `--ds-e-2` | hover/选中、下拉面板、Popover、Tooltip |
| `--ds-e-3` | 抽屉、弹窗、命令面板、通知 |
| `--ds-hairline` | 用 1px 分隔线替代投影的场合（表格行、列表） |

同一元素禁止叠加两档投影；弹层类必须用 `--ds-e-3` 单一来源。
暗色只覆写三档值（`v2-tokens.css` 已声明）。

### 2.5 间距（8 档）
`--ds-s-1` 4 / `-2` 8 / `-3` 12 / `-4` 16 / `-5` 20 / `-6` 24 / `-7` 32 / `-8` 40。
卡片内边距固定 `--ds-s-5`（20px）；区块间距 `--ds-s-6`；页面水平留白 `--ds-gutter`（24px，≤760px 用 `--ds-gutter-tight` 16px）。

### 2.6 密度与控制件

| token | 值 | 适用 |
| --- | --- | --- |
| `--ds-row-h` | 52px | 表格数据行（B 不降密度） |
| `--ds-row-h-compact` | 44px | 抽屉/弹窗内的紧凑表格 |
| `--ds-head-h` | 44px | 表头 |
| `--ds-control-h-sm` | 28px | 表格内联操作、标签按钮 |
| `--ds-control-h` | 36px | 默认按钮/输入/选择器 |
| `--ds-control-h-lg` | 44px | 主操作按钮、移动端输入 |
| `--ds-touch-min` | 44px | 任何可点击元素的触控最小面积（含图标按钮的 padding 外扩） |

### 2.7 布局

| token | 值 | 说明 |
| --- | --- | --- |
| `--ds-rail-w` | 72px | 一级图标栏 |
| `--ds-panel-w` | 216px | 二级导航面板 |
| `--ds-topbar-h` | 68px | 顶栏（含搜索、主题、语言、AI、记账） |
| `--ds-content-max` | 1480px | 内容最大宽度，居中 |
| `--ds-gutter` | 24px | 页面水平留白 |

断点（沿用现有移动端断点，不新增）：

| 宽度 | 外壳 | 内容 |
| --- | --- | --- |
| ≥1280px | rail + panel + topbar | 多列（KPI 4 列、图表 2 列） |
| 1024–1279px | rail + panel（panel 可折叠） | KPI 2×2、图表 1 列 |
| 760–1023px | rail + panel 抽屉化 | 单列，工具条换行 |
| <760px | 底部导航 + 顶部精简栏（`.shell-mobile-drawer`） | 单列，表单单列表单，金额列右对齐但不收缩 |

### 2.8 动效
`--ds-dur-1` 120ms（hover/press）、`--ds-dur-2` 200ms（展开/折叠、抽屉）、`--ds-dur-3` 320ms（页面级过渡）。
缓动只用 `--ds-ease`（进场/位移）与 `--ds-ease-out`（退场/淡出）。
`prefers-reduced-motion: reduce` 下全部动画降为 0ms 或仅保留透明度（由 `financeTheme` 的 `reducedMotion` 与 v2 规则双保险）。

### 2.9 焦点与状态层

| 状态 | 规则 |
| --- | --- |
| hover | 底色 `--pf-fill`（表面类）或 `--pf-tint-soft`（tint 类）；不改变尺寸、不加投影跳变 |
| pressed | 叠加 `--ds-press-veil`；按钮可 scale(0.98) 且 `--ds-dur-1` |
| focus-visible | `outline: var(--ds-focus-outline); outline-offset: var(--ds-focus-offset)`；禁止用 `outline: none` 收尾 |
| disabled | `opacity: var(--ds-disabled-opacity)` + `cursor: not-allowed`；不用灰色替换文字色 |
| loading | 内容保留骨架，控件右侧 16px spinner；禁止整页遮罩 |
| error | 边框 `--pf-negative`，说明文字 `--ds-t-2` + `--pf-negative`，**保留已填内容** |

### 2.10 金额排版
- 数字一律 `font-family: var(--ds-num-font)` + `font-feature-settings: var(--ds-num-features)`（等宽数字）。
- 右对齐；同一列宽由 `font-variant-numeric: tabular-nums` 保证，禁止用空格/固定宽度字符对齐。
- 颜色：收入 `--pf-positive`，支出 `--pf-negative`，净额按符号，隐藏状态显示 `••••`（沿用 `useUI.hidden`）。
- 现有 `.money` 类名与格式化函数必须保留（测试断言 `.money` 11 处）。

## 3. 组件规范与 primitives API（冻结）

新组件全部放 `frontend/src/design/v2/`，纯展示、无数据请求、无业务状态。

| 组件 | 签名（冻结） | 视觉 |
| --- | --- | --- |
| `DsPageHeader` | `{ title, subtitle?, actions?, backTo? }` | 30px/700 标题 + 12px 元信息 + 右侧按钮组，底部 `--ds-s-5` 间距 |
| `DsSection` | `{ title, extra?, dense?, children }` | 22px/600 标题；标题与内容间距 `--ds-s-3` |
| `DsCard` | `{ padding?: 'sm' \| 'md' \| 'lg', interactive?, tone?: 'flat' \| 'sunk' }` | 表面 `--pf-surface`、圆角 `--ds-r-3`、投影 `--ds-e-1`、内边距 20px（sm 12 / lg 28）；**不接受数值 padding，避免行内样式** |
| `DsStat` | `{ label, value: ReactNode, delta?, hint?, tone?, compact? }` | 标签 13px/label-2；数值 28px/600 等宽；delta 用 12px 语义色；**四张独立卡片** |
| `DsToolbar` | `{ left?, right?, wrap? }` | 高度 44px、间距 `--ds-s-2`、≤760px 自动换行 |
| `DsChip` | `{ active?, count?, onClick }` | pill、高 28–32px、active 用 tint 底 |
| `DsSegment` | `{ items, value, onChange }` | 映射 antd `Segmented`，pill 外观 |
| `DsTableShell` | `{ title?, toolbar?, footer?, children }` | 圆角 16px 容器 + hairline 表头；内部仍用 antd `Table` |
| `DsEmpty` | `{ title, hint?, action? }` | 图标 40px + 14px 标题 + 13px 说明，居中，最小高 200px |
| `DsState` | `{ state: 'loading' \| 'error' \| 'empty', onRetry? }` | 三态统一入口，替换散落的 `Skeleton`/`Alert`/`Empty` |
| `DsMoney` | `{ value: string, currency?, signed?, tone? }` | 只收**已格式化**的字符串，设计层不做金额换算；`.money` 类保持原样给测试用 |

外壳（波 1）：`AppLayout` 的三段 `rail / panel / topbar` 只换数值与状态样式，DOM 结构与 `.shell-*` 类名**不变**
（`fixtures.ts` 的 `openNavigationGroup` 依赖 `.shell-sidebar .shell-rail button.rail-group[data-group]` 与 `.shell-panel .panel-title`）。

antd 映射（波 1 写入 `src/design/theme.ts`，作为 v2 的第二来源）：

| antd token | v2 值 |
| --- | --- |
| `borderRadius` / `borderRadiusLG` / `borderRadiusSM` / `borderRadiusXS` | 10 / 16 / 10 / 4 |
| `controlHeight` / `SM` / `LG` | 36 / 28 / 44 |
| `fontSize` / `fontSizeSM` / `fontSizeLG` | 14 / 12 / 16 |
| `fontWeightStrong` | 600 |
| `lineHeight` | 1.5 |
| `boxShadow` / `boxShadowSecondary` / `boxShadowTertiary` | `--ds-e-3` / `--ds-e-2` / `--ds-e-1` 的具体字符串 |
| `colorPrimary` / `colorLink` | `--pf-tint` |
| `colorText` / `Secondary` / `Tertiary` / `Quaternary` | `--pf-label` / `-label-2` / `-label-3` / `-label-3` |
| `colorBorder` / `colorBorderSecondary` | `--pf-separator-strong` / `--pf-separator` |
| `Table.cellPaddingBlock` / `headerBg` / `rowHoverBg` | 16 / `--pf-surface-2` / `--pf-fill` |
| `Card.bodyPadding` / `paddingLG` | 20 / 20 |
| `Button.controlHeight` / `primaryShadow` | 36 / `none` |

## 4. 状态矩阵（每个表面必须逐项验收）

| 表面 | default | hover | pressed | focus-visible | disabled | loading | error | empty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 主/次/文字按钮 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| 输入 / 选择 / 日期 | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | — |
| 表格行 | ✓ | ✓ | ✓ | ✓ | — | 骨架 | 行内错误条 | ✓ |
| KPI 卡 | ✓ | 指针型才 hover | — | 若可点 | — | 骨架 | 值位显示 — | — |
| 抽屉 / 弹窗 | ✓ | — | — | ✓ | — | 内容骨架 | 内容错误态 | ✓ |
| 侧栏条目 | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| 分段/chip | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |

## 5. 主题与响应式
- 两套主题（light / dark）由 `html[data-theme]` 驱动（已存在）；v2 规则必须两套都写或只用 token。
- v2 新增**任何** hex 颜色都会被 `check-ds.mjs` 拒绝（`v2-tokens.css` 与已豁免文件除外）。
- 三档断点见 2.7；≤760px 必须有独立验收（视觉基线含 390×844）。

## 6. 无障碍与 i18n
- 触控目标 ≥ `--ds-touch-min`（44px）；图标按钮用 padding 达标。
- 文字对比度：正文对表面 ≥ 4.5:1，大号数字 ≥ 3:1（沿用 v1 色板已验证的组合，不新造灰阶）。
- 所有交互元素有可见 `focus-visible`；键盘可达（antd 已保证，禁止 `tabIndex={-1}` 滥用破坏）。
- 文案全部走 `t()`（`src/i18n/index.ts`）；v2 只改样式，不新增硬编码中文；新增类名不参与文案。
- 图表必须同时提供文字摘要（已有页面结构保留）。

## 7. 硬约束：不可触碰清单

1. 业务逻辑、接口、金额/汇率/精度、幂等、Version、用户隔离、审计：**零改动**。
2. 这些测试依赖的选择器/类名必须保留：`.home-page`、`.money`、`.global-copilot-drawer`、`.category-row`、`.shell-mobile-drawer`、`.payment-split-row`，以及 `e2e/redesign-tests/integration` 中 201 处 `.ant-*`（`.ant-drawer-content` 31、`.ant-select-item-option-content` 30、`.ant-drawer-close` 14、`.ant-modal-confirm` 11 等）。
3. 保留 antd 组件与其 DOM：`Table / Form / Modal / Drawer / Select / DatePicker / Upload / Tree / Popconfirm` 不做自研替换。
4. 内联 `style={{}}` 只允许布局型与动态值（`gridTemplateColumns`、`minWidth`、计算出的颜色/宽度）；静态间距/字号/圆角/颜色必须走 token。
5. 不新增 npm 依赖；不改 `package.json` 的 `packageManager`（本机 pnpm 12 会触发重装，统一用 `node` 直接入口）。
6. 不改路由与导航信息架构；`/settings/updates` 与 `/updates` 的发布公告链路不动。

## 8. 波次计划

| 波 | 范围 | 交付 | 关闭条件 |
| --- | --- | --- | --- |
| **0（本次）** | 规范 + token + 开关 + 审计 + 视觉基线 | `v2-spec.md`、`v2-tokens.css`、`ds-mode.ts`、`main.tsx` 两行接入、`scripts/check-ds.mjs`、`playwright.visual.config.ts`、`e2e-visual/` | 视觉零变化（基线图与改动前一致）、`tsc -b` 通过、审计 0 error |
| 1 | 外壳与通用层 | `design/v2/base.css`、`design/v2/shell.css`、primitives、`theme.ts` 映射、四态、暗色、≤760px | 外壳两主题两断点基线通过；`openNavigationGroup` 用例通过 |
| 2 | 账户与记账主干 | 账户列表/详情、交易列表/详情/新建、分类选择器、KPI 与表格规范落地 | 对齐 `B-apple-refined.html`；`.money`/分类/拆分行用例通过 |
| 3 | 报表与分析 | 首页/仪表盘、报表、自定义报表、财务报告、图表包装（5 个 echarts 文件） | 图表主题与暗色通过；图表懒加载仍生效 |
| 4 | 专项 | 薪酬、生活成本、燃料、时间资产、演出/节日、贷款、导入、对账 | 各域定向用例通过；导入/对账无回归 |
| 5 | 设置与管理 + 收尾 | 设置、个人资料、管理、统计、AI 设置、发布公告；删除 v1 死规则并把默认切到 v2 | 全站默认 v2；`releases.json` 新增公告；`verify-build` 通过 |

每波固定流程：读当前源码 → 只写 `[data-ds='v2']` 规则 → 跑定向单测 → 截基线对比 → 更新第 9 节记录 → 报结果。

## 9. 开关、审计与视觉基线

### 开关
```
优先级：URL ?ds=v2 / ?ds=v1  >  localStorage.pf-ds  >  构建期 VITE_DS_MODE（默认 v1）
注入：<html data-ds="v1|v2">（main.tsx start() 内 applyDsMode()）
回滚：?ds=v1 即时生效，或 localStorage.removeItem('pf-ds') 回到构建期默认
```
默认值在波 5 之前**保持 v1**；波 5 把默认改为 v2 并在 `v2-spec.md` 记录切换日期与公告 id。

### 审计（`node scripts/check-ds.mjs`）

| 检查 | 规则 | 级别 |
| --- | --- | --- |
| token 完整性 | `v2-tokens.css` 必须恰好 4 圆角 / 8 字阶 / 3 投影 / 8 间距 | error |
| 作用域纪律 | `[data-ds='v2']` 以外的文件不得引用 `var(--ds-` | error |
| 颜色纪律 | v2 CSS 内不得出现 `#hex` / `rgb(` 字面量 | error |
| 反模式棘轮 | 内联 style、字面 className、`.ant-*` 覆写总数不得高于基线 | error |
| 死规则报告 | 列出 v1 CSS 中已无任何组件引用的类（波 5 清理依据） | warn |

### 视觉基线（`playwright.visual.config.ts` + `e2e-visual/`）
- 路由：`/`、`/transactions`、`/accounts`、`/reports`、`/bookkeeping/new`、`/settings`
- 组合：桌面 1440×900 与移动 390×844，各 light/dark → 24 张
- 输出：`frontend/verification/visual-baseline/<wave>-<ds>/<viewport>-<theme>-<route>.png`
- 数据：dev server + MSW（不登录真实账本），时钟固定 `2026-10-07T12:00:00Z`
- 比对：同 wave 的 before/after 目录逐张目视 + 像素差；波 0 的产物就是"Before"。

## 10. 变更控制
- 数值契约（第 2 节）变更 = 一次独立评审：需同时给出受影响波次、基线重拍范围、审计预算调整。
- 组件签名（第 3 节）变更 = 加字段可以，删/改语义需列出所有调用点。
- 每波结束在本文件追加一行"波次记录"（日期、版本号、公告 id、基线目录、遗留项）。
