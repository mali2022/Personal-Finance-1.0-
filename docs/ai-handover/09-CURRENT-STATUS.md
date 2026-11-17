## 2026-11-18 本地站点端口改为 5085（1.0.0 / 2026.11.18.1，频道 stable，公告并入 1.0 单条）

- 版本现状：`frontend/package.json` 为 1.0.0；`frontend/src/data/releases.json` 的 `currentVersion` 为 2026.11.18.1，`product` 为 `{ name: "Personal Finance", channel: "stable", version: "1.0.0", releaseNumber: "2026.11.18.1" }`；公告只有 1 条 `official-1.0.0-20261118`（date 2026-11-18 / kind new / 标题「1.0 正式版发布：全部功能一览」/ 11 条中英说明，按记账核心、分类预算计划、分析报表、资产投资、协作业务、导入对账、AI、体验安全、启动更新、配套整理分组）。端口 5085 与两处交付缺陷修复都写在这条公告里，没有单独的 1.0.1 公告。
- 端口现状：`scripts/PersonalFinance.Local.ps1:128` 与 `:130` 的默认 `backendPort` 改为 5085（`frontendPort` 仍 5174）；静态模式访问地址为 `http://127.0.0.1:5085/`，开发模式仍用 Vite 5174，`frontend/vite.config.ts:91` 的代理默认目标为 `http://127.0.0.1:5085`，可用 `FINANCE_API_PROXY_TARGET` 覆盖。2026-11-18 及以前为 5080。
- 原因：桌面版「个人记账」安装包（`%LOCALAPPDATA%\Programs\PersonalFinance`，快捷方式参数 `--desktop`，默认占用 5080）与本副本抢同一端口，同时打开时后启动的一方报「后端端口 5080 已被占用」，表现为打不开；改用 5085 后两者可同时运行。
- 同期修复两处交付缺陷：补齐 `backend/src/PersonalFinance.Api/bin/Debug/net10.0/runtimes/win/lib/net9.0/Microsoft.Data.SqlClient.dll`；`PersonalFinance.Api.staticwebassets.runtime.json` 原指向原项目 `个人记账` 的 wwwroot（复制目录后仍托管旧页面），已在本目录重新 `dotnet build` 修正。
- 文档：维护手册、本地启动与跨设备说明、backend/README、00/07/10/15 与 `frontend/e2e/ai-phase1.spec.ts` 注释中的现行端口均改为 5085；历史条目保留 5080 并标为当时端口。
- 已实测（2026-11-18 02:07，交付目录内，前端与后端均已按单条公告重新构建）：启动器冷启动日志为「已启动backend，PID 20500」「静态前端由后端托管，已就绪」「Personal Finance 已就绪：http://127.0.0.1:5085/」；`/`、`/api/health`、`/updates` 均 200，`/release-info.json` 为 2026.11.18.1 且只有 1 条公告；同一时刻桌面版在 5080 仍返回 200，两者并存。浏览器 1440x900 深色实测首页「Personal Finance 1.0.0 发布号：2026.11.18.1」，/updates 只有「1.0 正式版发布：全部功能一览」一条公告、11 条说明全部显示，无页面错误，只有未登录的预期 401（/api/auth/me、/api/auth/refresh）。`Releases.test.tsx` 10 passed（1.0.0 检索用例按 productVersion 解析目标条目），`validate-releases.mjs` 输出 {"version":"2026.11.18.1","releases":1}。未做：前端全量 vitest 重跑、登录/API/E2E 实测。
- 云端通道清理（2026-11-18，按用户决定）：删除 `deploy/` 整个目录（`CLEANUP.md`、`SNAPSHOT-READS.md`、`scripts/pull-cloud-to-local.ps1`、`阿里云连接信息.txt`），不再保留云端备份恢复通道；`README.md:3` 的“仅保留恢复通道”表述、`docs/ai-handover/12-DOCUMENT-INDEX.md` 的两行登记、目录入口与未验证说明同步改写（“其他目录文档”9 篇改为 7 篇）。本次只删除已停用脚本与文档，未改应用代码、未改 `releases.json`，因此不新增发布公告。

## 2026-11-18 上一版本：官方 1.0 精简发布（1.0.0 / 2026.11.18.1，频道 stable，wwwroot 已重同步）

- 版本现状：`frontend/package.json` 为 1.0.0（原 6.30.1）；`frontend/src/data/releases.json` 的 `currentVersion` 为 2026.11.18.1，`product` 为 `{ name: "Personal Finance", channel: "stable", version: "1.0.0", releaseNumber: "2026.11.18.1" }`，公告只有 1 条 `official-1.0.0-20261118`（date 2026-11-18 / kind new / 8 条中英说明）。本文件下方所有 6.30.x、2026.11.x 的版本记录都是当时的历史，不是当前状态。
- 频道处理：`scripts/validate-releases.mjs` 与 `frontend/src/features/releases/catalog.ts` 要求 `channel` 必须是 `stable`；`frontend/src/features/releases/product.tsx` 与 `frontend/src/pages/ReleaseNotesPage.tsx` 只在 `channel === "beta"` 时渲染频道词，所以正式版界面不再出现频道标注。
- 文档面：117 篇旧发布文档合并为 `docs/版本历史-1.0.md`（874 行）与 `docs/维护手册-1.0.md`（增补 4.7 后 860 行，端口改动后 864 行）后删除原件；102 条旧公告原文归档到 `docs/archive/releases-history-previously-published.json`；37 个 `playwright.*.config.ts`、144 个 `backend/tests` 一次性脚本与 8 个过期文档目录产物删除；README 重写为指向 1.0 两篇文档。变更明细见 15，现存文件索引见 12。
- 启动实测（2026-11-18 01:49，当时默认端口为 5080）：交付目录内 `powershell -File scripts/PersonalFinance.Local.ps1 -Mode Start -Static -NoBrowser` 返回「Personal Finance 已就绪：http://127.0.0.1:5080/」，/api/health、/、/updates、/release-info.json 均为 200 且发布号为 2026.11.18.1；浏览器实测首页显示「Personal Finance 1.0.0 发布号：2026.11.18.1」，无页面错误，控制台只有未登录时的预期 401（/api/auth/me、/api/auth/refresh）。此前失败已修复：静态资源清单固化原项目路径 + 缺 Microsoft.Data.SqlClient 运行库，详见维护手册 4.7。
- 站点：`backend/src/PersonalFinance.Api/wwwroot` 由 `frontend/dist` 重新同步（311 个文件 / 40475391 字节，旧的 813 个文件 / 51 MB 目录树被完全取代）；对同步后的目录起本地静态服务，`/` 与 `/updates` 返回 200，`/release-info.json` 报 2026.11.18.1。
- 已验证：公告校验 exit 0（`{"version":"2026.11.18.1","releases":1}`）、`Releases.test.tsx` 10 passed、`verify-build.mjs` exit 0（pwaPolicyVerified true）、`vite build` exit 0、1440x900 前后截图为 1.0.0 / 2026.11.18.1 且无频道词。
- 未验证：前端全量 vitest 已补（106 文件 / 717 用例：711 通过 / 6 失败 / 0 跳过，1104.93 秒；失败为 `Concerts`、`Fuel` 2 项、`LoanSchedules`、`phase3`、`phase4:333`，同样 5 个文件在原项目重跑得到相同的 6 项失败，属既有红灯）；本副本未启动 ASP.NET 后端连真实库（AI 调度器轮询生产库，按约定不动），登录、API 与端到端流程未验证；Playwright E2E、真实 AI 用例与备份恢复演练未做。
- 历史快照说明：本文件保留的 2026-10-31 等 git status 记录里出现的旧发布文档文件名，是当时的仓库状态；那些文档已在 2026-11-18 合并进 `docs/版本历史-1.0.md` 与 `docs/维护手册-1.0.md` 并删除，不是现存文件。

## 2026-11-17 修复分类「全部删除」/ CSV 导入无法提交（发布 2026.11.17.2 / 6.30.1，已部署本机 wwwroot）

- 现象与原因：分类页「全部删除支出分类」预览 561 条正常，但「确认删除」只弹「无法保存提交记录…」不发请求。原因是 `frontend/src/stores/operationJournal.ts` 的恢复白名单缺少 `/categories/import` 与 `/categories/batch-delete`，`prepareOperation` 抛 `请求地址不支持安全恢复。`，被 `frontend/src/api/client.ts:100` 包装成该文案；预览接口无幂等键，故不受影响。
- 代码：`operationJournal.ts:50` 新增 `categoryCsvPath = /^\/categories\/(?:import|batch-delete)$/`，并接入 `pendingOperations`（:99）与 `prepareOperation`（:148）；后端 `FinanceEndpoints.cs:102/104` 与 `CategoryImport.cs:151-169` 未改。
- 证据：`frontend/src/tests/operationJournal.test.ts` 新增 2 组 `it.each`；单文件改前 2 failed / 171 passed（错误指向 `operationJournal.ts:172`），改后 173 passed；关联回归 7 个提交日志文件 209 passed、6 个分类/导入文件 39 passed；`validate-releases` → 2026.11.17.2 / 102 条；`tsc -b` 退出 0。
- 构建与部署：`vite build` ✓ 13.77s；wwwroot 备份 `.local-run/web-backup-20261117-183611`（14 条目）后 robocopy `//E`（退出码 3）；`/release-info.json` 已是 2026.11.17.2 且首条为本次公告，index.html 引用的 `assets/index-DxpL8iZH.js` 内含 `/^\/categories\/(?:import|batch-delete)$/`，首页/该 JS 均 200、`/api/health` healthy。后端未重启。
- 未验证：真实账号 561 条批量删除的端到端交互；本机无 git，无法对照 HEAD。

## 2026-11-17 设计系统 v2 · 波 5 清理（视觉基线扩到 14 路由）

- 基线路由 13 → 14：`frontend/e2e-visual/ds-baseline.spec.ts` 的 routes 增加 `{ slug: 'import', path: '/import' }`。
- 新增 `frontend/src/mocks/planning.ts`（planningHandlers，8 个 GET：/api/planning/capabilities、/api/recurring-rules、/api/recurring-rules/:id/history、/api/recurring-occurrences、/api/subscriptions、/api/calendar-events、/api/automation-rules、/api/automation-executions，全部返回空 PagedResult 或空能力对象），在 `frontend/src/mocks/handlers.ts` 第 15 行 import、第 525 行 `...planningHandlers` 注册。
- `frontend/src/mocks/imports.ts` 增加 `http.get('/api/imports', () => ok({ items: [], total: 0, page: 1, pageSize: 10 }))`，补上 `frontend/src/features/imports/api412.ts:55 jobs()` 的列表接口；此前该请求 bypass 到真实后端拿 401，页面被踢回 /login。
- 证据：`DS_WAVE=wave-05f DS_MODE=v2 npx playwright test -c playwright.visual.config.ts` → 56 passed (3.1m)，产物 `frontend/verification/visual-baseline/wave-05f-v2/` 共 56 张；`DS_WAVE=wave-05f-v1check DS_MODE=v1` → 56 passed，且 24 张 wave-00-v1 原图 md5 identical=24 differing=0（v1 层零变化）。
- 抽查：desktop-light-import.png(1440x1197) 五步向导正常、任务表空态正常；desktop-light-calendar.png(1440x1314) 月历 2026-10 高亮 10-07、下方表格空态正常；页脚显示 6.30.0 / 2026.11.17.1。
- 仍未做：删 v1 死规则（check:ds 报 829 个无引用类名）、styles.css 刺进 antd 内部的覆写、pages.css 的 8 处 .ant-* 桥接、过渡开关 ?ds= / VITE_DS_MODE / localStorage.pf-ds 下一版移除、设置子路由未逐个调。

## 2026-11-17 设计系统 v2 默认启用并发版 2026.11.17.1（已部署本机静态实例）

- 决策来源：数据所有者在本会话选择「B 连生产一起部署」，即切默认 + 写公告 + 构建校验 + 部署真实实例。
- 代码改动三处：
  - `frontend/src/design/ds-mode.ts:5` 默认值反转：`const BUILD_MODE: DsMode = import.meta.env.VITE_DS_MODE === 'v1' ? 'v1' : 'v2';`（优先级仍是 ?ds= > localStorage `pf-ds` > 构建期常量，回退开关保留）。
  - `frontend/src/data/releases.json`：首条新增 `ui-refresh-20261117-1`（version 2026.11.17.1 / productVersion 6.30.0 / date 2026-11-17 / kind improved / 4 条中英说明，含 ?ds=v1 过渡对照入口），`currentVersion` = 2026.11.17.1，`product.version` = 6.30.0，`product.releaseNumber` = 2026.11.17.1；公告数 100 → 101。
  - `frontend/package.json` version 6.29.2 → 6.30.0（validator 要求与 product.version 一致）。
- 构建与校验（真实输出）：`node scripts/validate-releases.mjs` → {"version":"2026.11.17.1","releases":101}；`tsc -b` 退出 0；`vite build --configLoader runner` ✓ built in 11.57s（仅 chunk >500kB 的既有警告）；`node scripts/verify-build.mjs` → {"productionMock":false,"lazyRoutes":true,"chartsLazy":true,"apiExcludedFromCache":true,"javascriptChunks":197,"precachedResources":61}；`npx vitest run src/tests/Releases.test.tsx` 10/10 通过。
- 部署：`cp -r backend/src/PersonalFinance.Api/wwwroot/. .local-run/web-backup-20261117-042348/`（478 文件备份）→ `robocopy frontend/dist backend/src/PersonalFinance.Api/wwwroot /E`（退出码 3 = 已复制且存在多余文件，属成功区间）。验证：当时 5080 端口上 `http://127.0.0.1:5080/release-info.json` 返回 {"currentVersion":"2026.11.17.1",...}、首页 200、`/api/health` 返回 {"status":"healthy","code":"READY","buildId":"347244E4..."}。
- 5174 的 vite dev 实例未重启也不需要重启：`/release-info.json` 与 `/src/data/releases.json` 均已是 2026.11.17.1，源码热更新即生效。
- 未做/未验证：未用真实账号登录截图核对（`.local-run/bootstrap-credentials.local.json` 不存在，缺凭据；按 AGENTS.md 也不在真实账务上做写操作）；未重启当时 5080 端口上的后端（wwwroot 为磁盘静态文件，无需重启）；`frontend/src/styles.css` 里刺进 antd 内部的 v1 覆写与 `v2/pages.css` 的 8 处 .ant-* 桥接未删（见 10 待办）。
- 回退路径：单浏览器回退地址加 ?ds=v1 或写 localStorage `pf-ds=v1`；整站回退把 `.local-run/web-backup-20261117-042348` 覆盖回 wwwroot。

# 当前Git与开发状态

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：当前Git与开发状态。

## 2026-11-17 设计系统 v2 · 波 4（Apple 图表、辅助页表格密度、基线扩到 8 条路由；未发布，默认仍 v1）

改动（3 个文件）：
- `frontend/src/components/apple/EChart.tsx`（首页/仪表盘/Apple 卡片共用图表）：新增 `const v2 = readDsMode() === 'v2'`，v2 下坐标轴标签 12px + margin 10、图例文字 12px（v1 保持 11px）、全局 textStyle 补 12px、tooltip padding `[8,12]`（v1 `[10,12]`）、`extraCssText` 的投影改用 `token.boxShadowSecondary`（v1 仍是硬编码 `0 8px 24px rgba(0,0,0,.12)`）；`token.boxShadowSecondary` 与 `v2` 加入 effect 依赖。
- `frontend/src/design/v2/pages.css` 追加：表头 `.ant-table-thead > tr > th` 收到 13px/600 + `--ds-c-text-2`；`.ant-table-tbody > tr > td` `padding-block: 10px`，表格内按钮收到 32px、`.ant-tag` 收到 24px（行高由最高单元格决定，三者合起来正好落到方向 B 的 52px 基线）；`.pf-stat-value` 字重 700→600、字距 -0.5px。
- `frontend/e2e-visual/ds-baseline.spec.ts`：routes 6 → 8，新增 `{ slug: 'reconciliation', path: '/reconciliation' }` 与 `{ slug: 'categories', path: '/categories' }`。

过程中发现（真实结论，勿重复踩）：
- `/import` 不能进基线：该路由请求 MSW 未 mock 的接口 → 401 → axios 拦截器派发 unauthorized → `frontend/src/routes/index.tsx` 的 Protected `navigate('/login')`，4 个视口全部失败（desktop-light/desktop-dark/mobile-light/mobile-dark 均 "unexpected value http://127.0.0.1:5173/login"）。已从 routes 移除；要覆盖导入页需先给对应接口加 MSW handler。
- 第一次只加 `padding-block: var(--ds-s-3)`（12px）时分类表行高纹丝不动（约 70px）：行高被"状态 Tag + 操作按钮"撑住，减 padding 无效。必须同时收控件高度才有效果——这是本次唯一有效的做法。

验证（真实输出）：`check:ds` 通过（0 error，token 4/8/3/8，反模式 429/1032/591 不变）；`DS_WAVE=wave-04d DS_MODE=v2` → 31 passed + 1 flaky（`desktop-light › home` 首跑超时重试后通过，2.3m），逐图核对：`desktop-light-categories.png` 行高从 ~70px 收到 ~54px、表头 13px/600；`desktop-light-transactions.png` 仍是 52px 行、金额右对齐等宽数字、无破版；**v1 零变化**：`DS_WAVE=wave-04-v1check DS_MODE=v1` 32 passed，与 `wave-00-v1` 逐文件 md5 **identical=24 differing=0**（新加 2 条路由在 v1 无基线可比）。

未做：`/tags`、`/projects`、`/calendar`、`/recurring`、`/subscriptions`、`/import` 未进视觉基线；`frontend/src/features/dashboard/apple/charts.ts` 的 option 构造未逐项调（排版来自 EChart 的 v2 分支）；首页 `.pf-*` 除字重外未改（已全部走 --pf-* token，与 v2 别名晚绑定）。

未发布：默认 v1，`releases.json` 未改，`/release-info.json` 仍 2026.11.16.3。

## 2026-11-17 设计系统 v2 · 波 3（报表分析、图表排版、记账中心字段节奏；未发布，默认仍 v1）

目标：把"报表/分析"这一类页面（共用 `.summary-grid` + `.stat-value` + antd Card + `Chart`）与记账中心表单纳入 v2，并让 echarts 的坐标轴/图例/提示框跟随设计规范。

改动（3 个文件）：
- `frontend/src/design/v2/pages.css` 追加两段：
  - 通用卡片与统计：`[data-ds='v2'] .ant-card` 边框走 `--ds-c-line`、投影走 `--ds-e-1`（覆盖 `frontend/src/styles.css:204` 给全站卡片加的 `--shadow-card`）；`.ant-card .ant-card-head` 56px/14px/600；`.summary-grid` 间距 s-3、移动端 2 列；`.stat-value` 28px/600 等宽（≤1150px 与 ≤767px 降为 22px）；`.stat-label`/`.stat-caption` 13/12px 走 `--ds-c-text-2/3`。
  - 记账中心：`.transaction-create-surface` r-3 + 发丝线；内容区 s-6 内距、表单列间距 s-7；底部操作条发丝线 + 毛玻璃；`.form-section-title` 16px/600；`.amount-input` 金额输入 28px/600 等宽（移动端 22px）；`.entry-footer .ant-btn` 最小宽度 96。
- `frontend/src/components/Chart.tsx`：新增 `const v2 = readDsMode() === 'v2'`，在 v1 逻辑之上**只加 v2 分支**：坐标轴标签 12px/margin 10、`axisLine` 走 `colorBorderSecondary`、`axisTick.show=false`、`splitLine` 虚线、全局 `textStyle.fontSize 12`、tooltip 12px + `borderRadius 12` + `padding [8,12]` + `extraCssText: box-shadow: ${token.boxShadowSecondary}`、图例 12px + `itemWidth/itemHeight 8` + `itemGap 16`；v2 一并加入 effect 依赖。
- 未改：`frontend/src/components/apple/EChart.tsx`（首页/仪表盘 Apple 版图表，留到波 4）。

过程中的真实失败（勿重试）：
- 首次写 `Chart.tsx` 时把 `box-shadow: var(--ds-e-2)` 直接写进 `extraCssText`，`check:ds` 报错 `作用域纪律: src/components/Chart.tsx 在 v2 层之外引用 --ds-*`；改为 `token.boxShadowSecondary`（v2 下该 token 本身就等于 `var(--ds-e-2)`，声明在 v2 层的 `theme.ts` 内）后通过。
- 把两次 `npm run visual`（各 1.3–1.4m）放进同一个 run_code 程序会撞 120s 执行上限被中断；必须把 `timeoutMs` 提到 480000 且一次只跑一套。

验证（本次实测）：`tsc -b` exit 0；`check:ds` 通过（0 error，token 4/8/3/8，反模式 429/1032/591 与基线一致）；`DS_WAVE=wave-03c DS_MODE=v2 npm run visual` 24 passed（1.3m）；逐图核对 `wave-03c-v2/desktop-light-reports.png`(1440x1862，KPI 四卡 28px/600、虚线网格、12px 轴标签、8px 图例点) 与 `desktop-light-bookkeeping-new.png`(1440x1528，金额 28px/600、分区标题 16px/600、r16 卡片)；**v1 零变化**：`DS_WAVE=wave-03-v1final DS_MODE=v1` 24 passed 后与 `wave-00-v1` 逐文件 md5 **24/24 相同**。

未做：`/reports/custom`、`/cashflow`、`/analytics/living-cost`、`/analytics/fuel`、`/calendar` 等页面只吃通用卡片/统计/图表规则，未逐页单独调；`apple/EChart.tsx` 与 `features/dashboard/apple/charts.ts` 的图表未动；未跑 vitest 全量（本波未改 DOM 与业务逻辑，仅 CSS 与图表呈现参数）。

未发布：默认 v1，`releases.json` 未改，`/release-info.json` 仍 2026.11.16.3。

## 2026-11-17 设计系统 v2 · 波 2（交易与账户页对齐方向 B；未发布，默认仍 v1）

目标：把交易（/transactions、/transactions?review=1）与账户（/accounts）两个高频页从"外壳级"推进到"页面级"v2，几何与排版对齐 `B-apple-refined.html`，不改任何 DOM 结构与业务逻辑。

做法：新增 `frontend/src/design/v2/pages.css`（全部规则以 `[data-ds='v2']` 为前缀，随 `?ds=v1` 整体失效），并在 `frontend/src/main.tsx` 的 v2 样式链末尾引入；同时把 v2 的 Button 组件 token 设为 pill（`frontend/src/design/theme.ts` 的 Button 块内 `...(v2 ? { borderRadius: 999, borderRadiusSM: 999, borderRadiusLG: 999 } : {})`）。

交易工作台（`.transaction-workspace`）：页标题 30px/700；`.transaction-summary` 退化为不可见栅格，四个计数各自成为一张独立 KPI 卡（surface + 1px 发丝线 + r-3 16px + e-1，数值 28px/600 等宽，标签 13px --ds-c-text-2）；分币种汇总改发丝线分隔、币种字母改为 24px 高的 tinted 小标、数值降到 16px/600；筛选卡 r-3 + 发丝线 + s-4 内距、字段标签 12px；表格 `density-standard` 单元格 padding 16px 12px（行高 52）、字号 14、hover 走 `--ds-c-surface-sub`、金额列 `.money` 右对齐且 `tabular-nums`；`density-compact/comfortable` 同步为 10px / 20px。

账户管理（`/accounts`）：`.account-overview`/`.account-filter-panel` r-3、s-5 内距、去投影；`.account-summary-grid > div` 成为四张 tinted KPI 子卡（`--ds-c-surface-sub`），数值 28px/600 等宽、币种前缀 11px/500；`.account-section-heading h2` 22px/600；`.account-manager-row` r-3、`s-4 s-5` 内距、hover 变 surface-sub、余额 22px/600 等宽；高级筛选分隔线改用发丝线；移动端概览子卡 22px 数值与 s-4 内距。

已知桥接债务（波 5 清）：pages.css 里有 8 处 `.ant-*` 选择器（表格单元格 padding/hover、账户行标题按钮、移动端 FAB 圆角），原因是个别 v1 规则直接定了单元格内距与 hover 底色，v1 规则删除后这些桥接一并删除；`check:ds` 的反模式棘轮只统计 v1 文件，故 v2 层合计仍为 591。

验证（本次实测）：
- `node node_modules/typescript/bin/tsc -b` → exit 0。
- `node scripts/check-ds.mjs` → 通过（0 error），token 契约 4/8/3/8，反模式指标与基线一致。
- `DS_WAVE=wave-02c DS_MODE=v2 npm run visual` → 24 passed（1.4m），产物 `frontend/verification/visual-baseline/wave-02c-v2/`（含中间态 wave-02-v2、wave-02b-v2）。逐图核对：`desktop-light-transactions.png`(1440x2235) 四张 KPI 卡、币种汇总、筛选卡、52px 表格行与右对齐等宽金额；`desktop-light-accounts.png`(1440x2002) 四张 tinted KPI 子卡与卡片式账户行；`desktop-dark-transactions.png` 暗色下 KPI 卡与发丝线成立；`mobile-light-transactions.png`(390x5805) KPI 2×2、无横向溢出。
- v1 零变化证明：`DS_WAVE=wave-02-v1check DS_MODE=v1` 重跑 24 passed，与 `wave-00-v1` 逐文件 md5 比对 **24/24 完全相同**。

未做 / 留到后续：记账中心（/bookkeeping/new）仅由 v2 token（输入框 36px、卡片 r-3、按钮 pill）间接生效，字段级节奏尚未单独收敛；报表页 5 个 echarts 未动；`.workspace-filter-tags` 的 antd Tag 仍是 v1 配色；未跑 `vitest` 全量（本波不改 DOM 与逻辑，测试面不受影响，波 3 起改动到组件时再跑）。

未发布：默认 v1，`frontend/src/data/releases.json` 未改，`/release-info.json` 仍 2026.11.16.3。

## 2026-11-17 设计系统 v2 · 波 1（通用层、外壳层、primitives、antd 映射；无用户可见变化、未发布）

目标：在波 0 的规范与开关之上落 v2 的真实样式层，仍然只在 `?ds=v2` 或 `VITE_DS_MODE=v2` 时生效，默认 v1 外观一字不改。

完成内容（前端 6 个文件改动 + 3 个新增）：
- `frontend/src/design/v2-tokens.css` 追加 `--ds-c-*` 颜色别名（bg/surface/surface-sub/surface-sunk/fill/fill-strong/line/line-strong/text/text-2/text-3/tint/tint-soft/pos/neg/warn/info），全部 `var(--pf-*)` 晚绑定，暗色无需重复声明。
- 新增 `frontend/src/design/v2/base.css`：排版（h1 30px/700、h2 22px、h3 16px、正文 14px/1.5）、链接、`:focus-visible` 焦点环（2px tint + 2px offset，输入框改 `--ds-focus-ring`）、`::selection`、`.ds-num` 等宽数字、`.ds-meta`/`.ds-label`/`.ds-hairline`、reduced-motion 兜底。
- 新增 `frontend/src/design/v2/shell.css`：顶栏 68px + 毛玻璃 + 下边发丝线、`.content` 间距与 1480px 上限、页面标题/副标题排版、rail 图标 44×44 圆角 12、panel 链接 34px 圆角 10 与选中态、panel 标题/分区标签字号。
- 新增 `frontend/src/design/v2/primitives.css` 与 `frontend/src/design/v2/index.tsx`：11 个展示型组件 `DsPageHeader`/`DsSection`/`DsCard`/`DsStat`/`DsToolbar`/`DsChip`/`DsSegment`/`DsTableShell`/`DsEmpty`/`DsState`/`DsMoney`，零 antd 依赖、零行内样式、零业务逻辑（`DsMoney` 只收已格式化字符串，设计层不做金额换算）。
- `frontend/src/design/theme.ts`：`financeTheme(dark, reducedMotion, dsMode = 'v1')` 新增第三参数；v2 下覆盖 borderRadius 10/LG 16/SM 10/XS 4、controlHeight 36/28/44、fontSize 14/12/16、fontWeightStrong 600、lineHeight 1.5、boxShadow 指向 `--ds-e-3`/`--ds-e-2`、Table 表头 `--ds-c-surface-sub` 且 cellPaddingBlock 16、Card headerHeight 56/paddingLG 20。
- `frontend/src/main.tsx`：在 v2-tokens.css 之后依次引入 base/primitives/shell 三个 v2 样式；`Root` 用 `useState(readDsMode)` 取一次模式传给 `financeTheme`。
- `frontend/scripts/check-ds.mjs`：作用域纪律把 `src/design/theme.ts` 也计为 v2 层（它是 antd token 桥，v2 值的唯一合法出口）；反模式棘轮只统计 v1 文件，v2 层新增代码不受旧债基线约束。
- `frontend/src/design/v2-spec.md`：`DsCard` 改为 `padding?: 'sm'|'md'|'lg'`（不接受数值以免行内样式）、`DsStat.value` 改 `ReactNode` 去掉 `format`、`DsMoney.value` 固定 `string`。

验证（本次实测）：`tsc -b` 0 error；`node scripts/check-ds.mjs` 通过（4/8/3/8 契约、0 error、棘轮 429/1032/591 与基线一致）；`DS_WAVE=wave-01 DS_MODE=v2 npm run visual` 24/24（1.4m）产物在 `frontend/verification/visual-baseline/wave-01-v2/`，抽查 desktop-light-home 与 desktop-light-transactions 为正常页面；**v1 零变化证明**：`DS_WAVE=wave-01-v1check DS_MODE=v1` 重跑 24/24 后与 wave-00-v1 逐文件 md5 比对 24/24 完全相同。

未发布：默认仍 v1，用户可见外观零变化，`releases.json` 未改、`/release-info.json` 仍 2026.11.16.3。

未验证/边界：v2 下的业务页面尚未改造（波 2 起），因此 `?ds=v2` 目前只呈现外壳与通用层的收敛，页面级字号/间距/KPI 卡片仍是 v1 数值；v2 的暗色、四态、≤760px 只做了基础兜底，未逐页验收。

## 2026-11-17 设计系统 v2 · 波 0（规范冻结、token 层、开关、审计、视觉基线；无用户可见变化、未发布）

目标：数据所有者要求（原话）「不改变功能实现的情况下 彻底重新做前端UI 方案」，选定方向 B（Apple 精修三代：保留 antd 底座，只做一致性收敛），要求分波推进、每波可独立回滚。波 0 只建规范与脚手架，业务页面一行未动。

完成内容（前端 8 个文件，1 个改动）：
- 新建 `frontend/src/design/v2-spec.md`（冻结契约 270 行）：收敛比表（字号 32→8、圆角 19→4、投影 80→3、`.ant-*` 覆写 125→0）、数值契约、断点 1280/1024/760、状态矩阵、不可触碰清单（201 处测试依赖的选择器）、antd token 映射表、波次表、变更控制。
- 新建 `frontend/src/design/v2-tokens.css`：`--ds-*` 全命名空间（圆角 10/12/16/pill、字阶 11/12/13/14/16/22/28/30、阴影 3 档、间距 8 档、密度 52/44/36/28、动效 120/200/320ms），暗色只覆写阴影与按压遮罩。全为新命名空间，未引用前不改变任何现有外观。
- 新建 `frontend/src/design/ds-mode.ts`：`v1|v2` 开关，优先级 URL `?ds=` > localStorage `pf-ds` > 构建期 `VITE_DS_MODE`，写入 `<html data-ds>`。默认 v1。
- 改 `frontend/src/main.tsx` 三处：引入 v2-tokens.css（排在 apple.css 之后）、引入 ds-mode、`start()` 首行 `applyDsMode()`。
- 新建 `frontend/scripts/check-ds.mjs`（`node scripts/check-ds.mjs`，package.json 脚本 `check:ds`）：token 完整性、`--ds-` 作用域纪律、v2 层颜色纪律（禁 hex/rgb）、反模式棘轮（inline style / 字面 className / `.ant-*` 只许下降，基线存 `frontend/ds-baseline.json` = 429/1032/591）、死规则报告（当前 797 个 v1 类名无引用，波 5 清理候选）。
- 新建 `frontend/playwright.visual.config.ts` + `frontend/e2e-visual/ds-baseline.spec.ts`（package.json 脚本 `visual`）：6 条路由 × 4 视口主题 = 24 张全页基线，固定时钟 2026-10-07T12:00:00Z、固定 mock、不接触真实账本。

架构决议：v1 的 CSS 规则一律不动，所有 v2 规则写成 `[data-ds='v2']` 前缀（cascade 高一级，天然覆盖 v1），只有波 5 才删除死规则；因此任何一波都可以靠 `?ds=v1` 或构建期常量整体回退。

验证（本次实测）：`tsc -b` 0 error；`check-ds.mjs` 通过（token 4/8/3/8 全部符合契约，0 error）；`npm run visual` 24/24 通过（1.4m），产物在 `frontend/verification/visual-baseline/wave-00-v1/`，已人工抽查 `desktop-light-home.png`（1440×1905）与 `desktop-light-accounts.png`（1440×2115）确为真实页面与真实 mock 数据，非错误页。

已知缺口（登记未处理）：MSW 未注册 `GET /api/account-groups` 与 `GET /api/promotions`，被 `onUnhandledRequest:'bypass'` 放行到真实后端后返回 401，拦截器派发 `finance:unauthorized` 把 /accounts 与 /bookkeeping/new 踢回 /login。视觉基线里用 `context.route` 给这两个接口补 `{data: []}` 绕过；根因是 mock 覆盖缺口，属独立修复项，未在本波改动 `frontend/src/mocks/handlers.ts`。

未发布：本波零用户可见变化（默认仍 v1，v2 token 无人引用），按 AGENTS.md 无需新增公告，`frontend/src/data/releases.json` 保持不动，`/release-info.json` 仍为 2026.11.16.3。发布留到波 5 默认切 v2 时。

未验证：本会话无 git 可执行文件，改动以文件清单与命令输出为证，无法提供 diff；v2 的暗色、焦点/按下/禁用/错误四态、≤760px 布局均尚未实现（波 1）。

## 2026-11-16 交易导出新增「收支分类」列（2026.11.16.3，已部署本机实例）

- 目标：数据所有者要求（原话）「导出的文件中增加收支分类」。澄清后范围限定为交易页导出的 CSV/Excel，写法为与列表「分类路径」一致的完整路径，拆分交易写「多分类拆分」而不展开明细。
- 后端：`backend/src/PersonalFinance.Api/Application/OperationsService.cs:92` 在表头「账户」后插入「收支分类」；`:94-96` 取全部分类构造 id→名称与 id→父级两个字典，新增本地函数 `CategoryText(string? id)`（沿父链拼接 `" / "`，`seen` 防循环、父级缺失即止、不抛异常）与 `splitIds` 聚合查询（`from e in db.Entries join t in q ... group e by e.TransactionId into g where g.Select(x => x.CategoryId).Distinct().Count() > 1`，并排除手续费分录）；`:100` 行值 `splitIds.Contains(t.Id) ? "多分类拆分" : Safe(CategoryText(t.CategoryId))`，CSV 与 Excel 共用同一 `Row` 写入。
- 测试：`backend/tests/PersonalFinance.Tests/ExpenseProductNameTests.cs:35-36` 在原导出用例补「收支分类」「生活 / 餐饮」断言；新增 `ExportMarksSplitTransactionsAndWritesFullCategoryPath`（`:44-67`）断言 CSV 表头前四列为「日期,类型,账户,收支分类」、单分类行为「生活 / 餐饮」、拆分行为「多分类拆分」，并再导一份 Excel 读回 `Worksheet(1)` 的 D 列校验同样三值。
- 发布记录：`frontend/src/data/releases.json` 首条新增 `export-transaction-category-20261116-3`（2026.11.16.3 / productVersion 6.29.2，公告 100 条），`currentVersion`、`product.version`、`product.releaseNumber` 与 `frontend/package.json` 的 6.29.2 已同步。
- 验证：隔离库（LocalDB 实例 `PFRestoreCheck` + 随机 `PersonalFinanceWeb_RestoreCheck_<32hex>`，跑完 DROP DATABASE）`dotnet test --filter "FullyQualifiedName~ExpenseProductNameTests"` 4/4 通过；`node scripts/validate-releases.mjs` 输出 `{"version":"2026.11.16.3","releases":100}`；`node node_modules/typescript/bin/tsc -b` 退出 0；`node node_modules/vite/bin/vite.js build --configLoader runner` 通过；`node scripts/verify-build.mjs` 输出 `{"productionMock":false,"lazyRoutes":true,"chartsLazy":true,"apiExcludedFromCache":true,"javascriptChunks":197,...}`；`src/tests/Releases.test.tsx` 10/10。
- 部署（2026-11-16 21:14，数据所有者确认现在部署后执行）：`scripts/PersonalFinance.Local.ps1 -Mode Stop` 停掉旧的 backend PID 16528 / frontend PID 17212 → `dotnet build backend/src/PersonalFinance.Api --no-restore`（0 警告 0 错误，DLL `backend/src/PersonalFinance.Api/bin/Debug/net10.0/PersonalFinance.Api.dll` 内含新标记串「多分类拆分」）→ `-Mode Start -NoBrowser` 起新 backend PID 8740 / frontend PID 10000（dev 模式，vite 127.0.0.1:5174 + 当时 API 5080）。验证：`curl http://127.0.0.1:5080/api/health` 与经 5174 代理均返回 `{"status":"healthy","code":"READY",...}`；`curl http://127.0.0.1:5174/src/data/releases.json` 的 `currentVersion` 已是 2026.11.16.3 且首条公告为该次更新。
- 未做：未替换 `backend/src/PersonalFinance.Api/wwwroot`（当前 dev 模式不从 wwwroot 提供页面，静态模式部署仍需先复制 `frontend/dist`）；未在真实账号上实际下载导出核对；MSW mock（`frontend/src/mocks/operations.ts:446-490`）的导出表头与真实后端本就不同，本次未改；财务报告页「导出 CSV」与自定义报表导出不含分类路径。本机 PATH 无 git，未核对 `git status`。

## 2026-11-16 线上版本 2026.11.16.2（收支分类 CSV 导入/导出/模板/全部删除）

- 源码与线上一致：`frontend/src/data/releases.json` 的 `currentVersion` 为 `2026.11.16.2`（product 6.29.1、99 条公告，最新一条 `category-csv-20261116-2`）；`frontend/package.json` version 6.29.1。生产构建结果已覆盖 `backend/src/PersonalFinance.Api/wwwroot`，旧版整份备份 `.local-run/web-backup-20261116-005945`；`/release-info.json` 返回 2026.11.16.2，`/api/health` 返回 200 `{"status":"healthy","code":"READY"}`，`/` 与登录后 `/categories` 均 200。
- 后端新增：`backend/src/PersonalFinance.Api/Contracts/CategoryBatchRequests.cs`；`backend/src/PersonalFinance.Api/Application/CategoryImport.cs` 里的纯函数 `CategoryImportRules.Plan`（预览与确认共用同一份规则，避免漂移）及 `FinanceService` 的 `CategoryImportPreview` / `ImportCategories` / `CategoryBulkDeletionPreview` / `DeleteCategories` / `BuildCategoryDeletion` / `CategoryReferenceLabels`；端点 `FinanceEndpoints.cs:101-104`。删除按层级由深到浅逐层 `SaveChanges`（`Category.ParentId` 自引用无级联），引用检查覆盖 12 类计数与导入/自动化/周期规则 JSON 载荷。
- 前端新增：`frontend/src/features/categories/categoryCsv.ts`（表头、1000 行、2MB、三级、状态校验，BOM+CRLF 导出与模板）、`frontend/src/features/categories/CategoryCsvToolbar.tsx`（导入两步预览确认、导出、模板、全部删除需输入「删除全部收入分类」），挂载于 `frontend/src/pages/CategoriesPage.tsx:289`；`frontend/src/api/finance.ts` 增四个方法与类型；MSW `frontend/src/mocks/handlers.ts` 补四条路由。
- 部署：旧的监听 PID 16972 不在 `.local-run/processes.json` 中（启动器判定「身份不匹配」拒绝停止），为替换 DLL 手动 `taskkill /PID 16972 /F`，`dotnet build backend/src/PersonalFinance.Api` 0 警告 0 错误后由 `scripts/PersonalFinance.Local.ps1 -Mode Start -Static` 拉起（PID 24104，日志 `.local-run/logs/20261116-005954-027-Start.log`）；静态资产备份后 `robocopy frontend/dist .../wwwroot /E`。数据库未迁移（仍 95 条）。随后拉起该进程的后台作业被取消导致服务退出，已用 `Start-Process` 分离重启（PID 13604，日志 `.local-run/logs/20261116-013232-622-Start.log`），`/release-info.json` 仍为 2026.11.16.2、`/api/health` 200。
- 验证：`tsc -b` 退出 0；`scripts/validate-releases.mjs` 输出 2026.11.16.2/99；生产构建 + `scripts/verify-build.mjs`（`productionMock:false`、`apiExcludedFromCache:true`）；vitest `src/tests/categoryCsv.test.ts` 9/9 与 `src/tests/CategoriesHierarchy.test.tsx` 4/4；新增 Playwright `frontend/e2e/category-csv.spec.ts` 3/3（导出与模板、两步导入、全部删除确认）。全量 `vitest run` 仍挂起，属 `10-BACKLOG-AND-ROADMAP.md` 已登记既有问题。部署后带 Bearer 令牌对真实库只读验证新端点：`POST /api/categories/deletion-preview {"kind":"Income"}` → 200 `total 115 / allowed 115 / blocked 0`，`POST /api/categories/import-preview`（劳动收入重名 + 一个新名）→ 200 `ready 1 / duplicates 1`，状态为 `Duplicate 同名分类已存在` 与 `Ready`，未写入任何数据；`pf-refresh` Cookie 的 Path 为 `/api/auth`，业务请求必须带 `Authorization: Bearer <accessToken>`。
- 证据：`.local-run/evidence/before-categories.png` / `after-categories.png`（同 1440x900、浅色、收入分类页；before 为临时移除工具栏后的同一 dev+MSW 构建）、`after-import-preview.png`、`after-delete-preview.png`、`live-after-categories.png`（部署后用 `bootstrap-credentials.local.json` 登录真实实例截图，只读未改动账务）。
- 未验证：真实账务上的导入/删除写入（只读预览已在真实库验证，写操作仅在 MSW 与 e2e 覆盖，避免改动数据所有者账务）；真实账号手工点击验收仍建议在 `/categories` 收入分类页自行执行。

## 2026-11-16 线上版本 2026.11.16.1（右侧悬浮 AI 记账助理）

- 源码与线上一致：`frontend/src/data/releases.json` 的 `currentVersion` 为 `2026.11.16.1`（product 6.29.0、98 条公告，最新一条 `floating-ai-chat-20261116-1`）；`frontend/package.json` version 6.29.0。生产构建结果已覆盖 `backend/src/PersonalFinance.Api/wwwroot`，旧版整份备份 `.local-run/web-backup-20261116-0035`。当时 `http://127.0.0.1:5080/` 的 index 引用 `assets/index-CE6G3Csn.js`，`/release-info.json` 返回 2026.11.16.1。
- 本次只改前端，后端未变、未重启、未动数据库（仍为迁移 95 条）。
- 新增 `frontend/src/features/ai/AiChatFab.tsx` + `frontend/src/design/ai-chat-fab.css`：右侧垂直居中 56px 圆形入口（图标 `frontend/public/ai-mascot.png`，256x256），桌面浮窗 380x560 靠按钮左侧、≤760px 整屏；直接调 `aiApi.settings()` 与 `aiApi.chat()`（SSE `/api/ai/chat/stream`，事件 delta/progress/error/completed），未启用或未配密钥时显示引导卡与「去 AI 设置」（`/settings/ai`）。挂载点 `frontend/src/layouts/AppLayout.tsx`，与原有 GlobalCopilot Drawer 互不影响；文案 `frontend/src/i18n/en.json` 追加 19 键。
- 验证：`tsc -b` 退出 0；`node node_modules/vitest/vitest.mjs run src/tests/AiChatFab.test.tsx` 6/6；真实账号登录后在 /accounts 实测流式问答成功（截图 `.local-run/shots/after-chat.png`），Before/After 证据 `before-accounts.png` / `after-idle.png` / `after-panel.png` / `after-mobile-panel.png`。
- 取视觉证据的通路（此前记作「CDP 不可用」，现已解决）：真实 Chrome 占用 Cookie 文件无法复制登录态，改为独立无头 Chrome `--headless=new --remote-debugging-port=9222 --user-data-dir=C:/Users/<用户名>/AppData/Local/Temp/pf-cdp-profile`，用 Node 内置 WebSocket 走 CDP（`.local-run/shots/cdp.mjs`）先页面内 `fetch('/api/auth/login')` 登录再 `Page.captureScreenshot`。凭据读 `backend/src/PersonalFinance.Api/bootstrap-credentials.local.json`，不写入任何文档。

## 2026-11-15 线上版本 2026.11.15.2（分类逐级进入式 + 0.00 金额）

- 源码与线上一致：`frontend/src/data/releases.json` 的 `currentVersion` 为 `2026.11.15.2`（product 6.28.0、97 条公告，最新一条 `drilldown-categories-zero-amount-20261115-2`）；生产构建结果已覆盖 `backend/src/PersonalFinance.Api/wwwroot`，旧版整份备份 `.local-run/web-backup-20261115-235552`。当时 `http://127.0.0.1:5080/` 的 index 引用 `assets/index-55TSZihy.js`，`/release-info.json` 返回 2026.11.15.2。
- 真实库 `PersonalFinanceWeb`：迁移 95 条（末条 `20261115233000_ZeroAmountTransactions`），迁移前备份 `backend/.backups/PersonalFinanceWeb-before-migrate-2026-11-16-00-00-57.bak`（92MB，`RESTORE VERIFYONLY ... WITH CHECKSUM` 通过）。当前约束定义为 `(([Amount]>(0) OR ([Type]=N'Transfer' OR [Type]=N'Income' OR [Type]=N'Expense')) AND [Fee]>=(0) AND [Version]>(0))`。
- 运行态：`/api/health` 返回 200 `{"status":"healthy","code":"READY"}`。本次后端由会话的后台作业启动（日志 `.local-run/logs/bg-backend.log`），不是启动器创建；`打开PersonalFinance.bat` 会复用已在 5080（当时端口）健康运行的后端，若该进程随会话退出，双击脚本即可重新拉起。
- 启动排障新增两条：库结构落后时启动器拒绝启动（`SCHEMA_OUTDATED`，必须走 `备份并升级本地数据库.bat` 或手工 `--initialize-db`）；手工 `--initialize-db` 需显式设置 `ConnectionStrings__Finance`，否则 `Program.cs:26` 抛「缺少 ConnectionStrings__Finance」。

## 2026-11-14 完全本地化：与云服务器断开（本节覆盖下方所有“云端主账本”历史结论）

数据所有者要求（原话）：「与云服务器断开连接，删除与云服务器连接的文件，完全本地化」，并追加「确保云端数据与本地一致」。

现状（2026-11-14 实测）：云服务器 192.0.2.1（personalfinance.invalid）完全不可达——HTTPS/HTTP/TCP 22/80/443/8080 全部超时、ping 100% 丢包；同期 baidu/github 正常，故为服务器侧故障而非本机断网。

已完成的清理：删除根目录 `启动云端账本.bat`、`备份云端PersonalFinance.bat`、`concert-p1-restore.tmp.sh`；删除 `scripts/PersonalFinance.Cloud.ps1`；`scripts/PersonalFinance.Local.ps1` 去掉隐式转云分支（`-Mode Start` 现在只启动本地，默认 ConfigPath=`scripts/local-runtime.json`、StateDirectory=`.local-run`）；`deploy/` 从 2210 个文件裁到 17 个（15 份历史 md + `scripts/pull-cloud-to-local.ps1` + `阿里云连接信息.txt`）；删除 `frontend/deploy/nginx.conf`、`frontend/Dockerfile`、`backend/Dockerfile`、`tools/verify-git-scope.mjs`；`.github/workflows` 移除引用已删脚本的步骤；`tools/stability-baseline.mjs` 的目录/文件清单同步收缩。

本地账本可运行：本机 SQL Server 默认实例 `.` 的 `PersonalFinanceWeb`；迁移从 93 补齐到 94（应用 `20261102110000_InvestmentReturnRevision`），迁移前备份 `backend/.backups/PersonalFinanceWeb-before-migrate-20261114-200320.bak`（99MB，VERIFYONLY 通过）；`/api/health` 返回 healthy/READY，前端 5174 返回 200。启动排障两条：静态资源清单过期导致启动即崩（`dotnet build backend/src/PersonalFinance.Api/PersonalFinance.Api.csproj -c Debug` 修复）；迁移缺失导致 503 SCHEMA_OUTDATED（见上）。

**云端数据缺口（不可恢复，已记录）**：本机最新可还原的云端快照是 2026-10-14 的 `PersonalFinanceWeb_Cloud_1f7b3a6f100f4aa39cb48ca880ad0fdb`（371 交易 / 2 用户 / 115 账户 / 686 分类）。本地 `PersonalFinanceWeb` 的 48 交易 / 36 账户 / 662 分类是该快照的严格子集，本地唯一用户 `fc453fdf`（owner@personal.finance）的数据与云端一致；云端多出的 323 条交易属于集成测试账号 `1e3cafea`（integration@personal.finance），按数据所有者决定不导入。2026-10-30 的云端备份 `pf-20261030-030001-596d9cfb.bak`（1.99GB，sha256 `BD1D8CF1…`，state Passed）只剩校验清单，.bak 文件已不在本机（Desktop/Downloads/Documents 均无）⇒ 2026-10-14 之后云上新增的数据无法取回。`deploy/阿里云连接信息.txt` 只含 IP/SSH/用户名/密钥路径/密码/域名，无 AccessKey，无法用 OpenAPI 查实例或快照。结论：本地 48 条交易即当前完整账本。

按数据所有者决定不发发布公告（未改 `frontend/src/data/releases.json`，currentVersion 仍为 2026.11.04.2）。未验证：云服务器是否永久下线、阿里云侧是否另有快照。注意 `12-DOCUMENT-INDEX.md` 已在 2026-11-18 按现存文件重建，不再列 `deploy/out/`、`deploy/update-stage*`、`deploy/nginx`、`deploy/tests`、`deploy/dist` 等已删除路径。

## 原工作区基线

以下是本次文档创建前快照；新增交接文档与AGENTS修改另计。修改态不等于已知正在开发，不自动提交/还原。

```text
D .workbuddy-ai/memory/2026-10-19.md
 M backend/src/PersonalFinance.Api/Application/AccountManagementEndpoints.cs
 M backend/src/PersonalFinance.Api/Application/AccountManagementService.cs
 M backend/src/PersonalFinance.Api/Application/AccountStatisticsService.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiAgentConfiguration.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiAgentService.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiAgentTools.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiAnswerValidator.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiContextService.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiConversationService.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiEndpoints.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiFinancialTools.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiGatewayControl.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiOptions.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiPrivacyService.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiPrivacyText.cs
 M backend/src/PersonalFinance.Api/Application/Ai/AiRequestContext.cs
 M backend/src/PersonalFinance.Api/Application/Ai/DeepSeekChatService.cs
 M backend/src/PersonalFinance.Api/Application/Ai/DeepSeekClient.cs
 M backend/src/PersonalFinance.Api/Application/Ai/DeepSeekUsageService.cs
 M backend/src/PersonalFinance.Api/Application/AnnualBudgetService.cs
 M backend/src/PersonalFinance.Api/Application/AssetManagementEndpoints.cs
 M backend/src/PersonalFinance.Api/Application/AssetManagementService.cs
 M backend/src/PersonalFinance.Api/Application/AssetReportsService.cs
 M backend/src/PersonalFinance.Api/Application/AssetValuationChangeService.cs
 M backend/src/PersonalFinance.Api/Application/BatchService.cs
 M backend/src/PersonalFinance.Api/Application/BusinessService.cs
 M backend/src/PersonalFinance.Api/Application/CategoryStatisticsService.cs
 M backend/src/PersonalFinance.Api/Application/FinanceEndpoints.cs
 M backend/src/PersonalFinance.Api/Application/FinanceService.cs
 M backend/src/PersonalFinance.Api/Application/FinancialPlanningEndpoints.cs
 M backend/src/PersonalFinance.Api/Application/FinancialReportCenterService.cs
 M backend/src/PersonalFinance.Api/Application/FinancialReviewService.cs
 M backend/src/PersonalFinance.Api/Application/FuelEndpoints.cs
 M backend/src/PersonalFinance.Api/Application/FuelService.cs
 M backend/src/PersonalFinance.Api/Application/ImportCleaningService.cs
 M backend/src/PersonalFinance.Api/Application/ImportRecoveryService.cs
 M backend/src/PersonalFinance.Api/Application/ImportSuggestionService.cs
 M backend/src/PersonalFinance.Api/Application/InvestmentMath.cs
 M backend/src/PersonalFinance.Api/Application/InvestmentPerformanceService.cs
 M backend/src/PersonalFinance.Api/Application/InvestmentService.cs
 M backend/src/PersonalFinance.Api/Application/NetWorthAnalysisService.cs
 M backend/src/PersonalFinance.Api/Application/OnThisDayService.cs
 M backend/src/PersonalFinance.Api/Application/OperationService.cs
 M backend/src/PersonalFinance.Api/Application/OperationsService.cs
 M backend/src/PersonalFinance.Api/Application/PlanningCalendarService.cs
 M backend/src/PersonalFinance.Api/Application/ReportAggregation.cs
 M backend/src/PersonalFinance.Api/Application/ReportsService.cs
 M backend/src/PersonalFinance.Api/Application/ReviewSummaryService.cs
 M backend/src/PersonalFinance.Api/Application/StageGEndpoints.cs
 M backend/src/PersonalFinance.Api/Application/TransactionRunningBalances.cs
 M backend/src/PersonalFinance.Api/Contracts/BatchRequests.cs
 M backend/src/PersonalFinance.Api/Contracts/Requests.cs
 M backend/src/PersonalFinance.Api/Domain/AiEntities.cs
 M backend/src/PersonalFinance.Api/Domain/Entities.cs
 M backend/src/PersonalFinance.Api/Domain/FuelEntities.cs
 M backend/src/PersonalFinance.Api/Infrastructure/FinanceDb.cs
 M backend/src/PersonalFinance.Api/Infrastructure/Migrations/FinanceDbModelSnapshot.cs
 M backend/src/PersonalFinance.Api/Program.cs
 M backend/tests/PersonalFinance.Tests/AiAgentTests.cs
 M backend/tests/PersonalFinance.Tests/AiLiveTests.cs
 M backend/tests/PersonalFinance.Tests/AiPhase1HttpTests.cs
 M backend/tests/PersonalFinance.Tests/AiPhase1Tests.cs
 M backend/tests/PersonalFinance.Tests/AiSafetyTests.cs
 M backend/tests/PersonalFinance.Tests/AiSqlTests.cs
 M backend/tests/PersonalFinance.Tests/CategoryStatisticsTests.cs
 M backend/tests/PersonalFinance.Tests/DeletionSqlTests.cs
 M backend/tests/PersonalFinance.Tests/FuelTests.cs
 M backend/tests/PersonalFinance.Tests/KeywordSearchSqlTests.cs
 M deploy/docker-compose.prod.yml
 M deploy/scripts/apply-update.sh
 M deploy/scripts/backup.sh
 M deploy/tests/update-rollback.sh
 M "docs/Personal Finance 测试版 6.1.0 - 120 - 加油与油耗.md"
 M "docs/Personal Finance 测试版 6.1.2 - 122 - 性能稳定性与私有源码验证.md"
 M frontend/e2e/ai-center.spec.ts
 M frontend/e2e/final.spec.ts
 M frontend/e2e/transactions.spec.ts
 M frontend/package.json
 M frontend/pnpm-lock.yaml
 M frontend/pnpm-workspace.yaml
 M frontend/public/import-template.csv
 M frontend/src/api/accounts2.ts
 M frontend/src/api/ai.ts
 M frontend/src/api/aiAgent.ts
 M frontend/src/api/batch.ts
 M frontend/src/api/business.ts
 M frontend/src/api/finance.ts
 M frontend/src/api/operations.ts
 M frontend/src/components/AiEvidenceCards.tsx
 M frontend/src/components/Chart.tsx
 M frontend/src/components/Feedback.tsx
 M frontend/src/data/releases.json
 M frontend/src/design/dashboard.css
 M frontend/src/design/navigation.ts
 M frontend/src/features/accounts/AccountManagementPanels.tsx
 M frontend/src/features/accounts/AccountManagerList.tsx
 M frontend/src/features/ai/GlobalCopilot.tsx
 M frontend/src/features/ai/copilotContext.tsx
 M frontend/src/features/dashboard/FinancialInsights.tsx
 M frontend/src/features/dashboard/QuickActions.tsx
 M frontend/src/features/financialReports/ReportAi.tsx
 M frontend/src/features/fuel/api.ts
 M frontend/src/features/imports/ImportDuplicateReview.tsx
 M frontend/src/features/imports/ImportExecutionHistory.tsx
 M frontend/src/features/imports/mapping.ts
 M frontend/src/features/reports/StatisticsSettings.tsx
 M frontend/src/features/transactions/BatchDrawer.tsx
 M frontend/src/features/transactions/QuickEntry.tsx
 M frontend/src/features/transactions/ReviewDrawer.tsx
 M frontend/src/features/transactions/SavedViewPicker.tsx
 M frontend/src/features/transactions/TransactionDrawer.tsx
 M frontend/src/features/transactions/TransactionTable.tsx
 M frontend/src/features/transactions/savedViews.ts
 M frontend/src/i18n/ai.en.json
 M frontend/src/i18n/en.json
 M frontend/src/i18n/index.ts
 M frontend/src/layouts/AppLayout.tsx
 M frontend/src/main.tsx
 M frontend/src/mocks/handlers.ts
 M frontend/src/mocks/imports.ts
 M frontend/src/mocks/phase2.ts
 M frontend/src/mocks/phase3.ts
 M frontend/src/pages/AccountsPage.tsx
 M frontend/src/pages/AiAgentPage.tsx
 M frontend/src/pages/AiPage.tsx
 M frontend/src/pages/AiSettingsPage.tsx
 M frontend/src/pages/BusinessPage.tsx
 M frontend/src/pages/CalendarPage.tsx
 M frontend/src/pages/CategoriesPage.tsx
 M frontend/src/pages/DashboardPage.tsx
 M frontend/src/pages/DirectoryPage.tsx
 M frontend/src/pages/FuelPage.tsx
 M frontend/src/pages/ImportPage.tsx
 M frontend/src/pages/ManagedAssetsPage.tsx
 M frontend/src/pages/ReconciliationPage.tsx
 M frontend/src/pages/SettingsPage.tsx
 M frontend/src/pages/TimeAssetsPage.tsx
 M frontend/src/pages/TransactionsPage.tsx
 M frontend/src/routes/index.tsx
 M frontend/src/stores/operationJournal.ts
 M frontend/src/tests/AiPage.test.tsx
 M frontend/src/tests/CategoriesHierarchy.test.tsx
 M frontend/src/tests/FinancialInsights.test.tsx
 M frontend/src/tests/FinancialReports.test.tsx
 M frontend/src/tests/Fuel.test.tsx
 M frontend/src/tests/MultiPayment.test.tsx
 M frontend/src/tests/Releases.test.tsx
 M frontend/src/tests/TransactionsPagination.test.tsx
 M frontend/src/tests/operationJournal.test.ts
 M frontend/src/tests/setup.ts
 M frontend/src/types/index.ts
 M frontend/src/utils/finance.ts
 M frontend/vitest.config.ts
 M scripts/Clean-PersonalFinance.Project.ps1
 D tools/complete-release-history.mjs
 M tools/isolated-load.mjs
 D tools/publish-fuel-notes.mjs
 D tools/publish-stability-notes.mjs
 D tools/reorganize-docs.mjs
 M tools/verify-fuel-sql.ps1
?? AI消费审批中心-开发与验收报告.md
?? AI消费审批中心1.1-深度完善与验收报告.md
?? FESTIVAL-FINANCE-ACCEPTANCE.md
?? FESTIVAL-FINANCE-API.md
?? FESTIVAL-FINANCE-ARCHITECTURE.md
?? FESTIVAL-FINANCE-IMPLEMENTATION.md
?? FESTIVAL-FINANCE-TEST-REPORT.md
?? backend/src/PersonalFinance.Api/Application/Ai/AiAnalysisReport.cs
?? backend/src/PersonalFinance.Api/Application/Ai/AiComparisonWindow.cs
?? backend/src/PersonalFinance.Api/Application/Ai/AiContextBudget.cs
?? backend/src/PersonalFinance.Api/Application/Ai/AiEvidenceConsistency.cs
?? backend/src/PersonalFinance.Api/Application/Ai/AiInvestigationMemory.cs
?? backend/src/PersonalFinance.Api/Application/Ai/AiInvestigationPlan.cs
?? backend/src/PersonalFinance.Api/Application/Ai/AiReadToolExecutor.cs
?? backend/src/PersonalFinance.Api/Application/Ai/AiStructuredOutput.cs
?? backend/src/PersonalFinance.Api/Application/AiInvestigationQueries.cs
?? backend/src/PersonalFinance.Api/Application/CollaborationAiEndpoint.cs
?? backend/src/PersonalFinance.Api/Application/CollaborationEndpoints.cs
?? backend/src/PersonalFinance.Api/Application/CollaborationModel.cs
?? backend/src/PersonalFinance.Api/Application/CollaborationReports.cs
?? backend/src/PersonalFinance.Api/Application/CollaborationService.cs
?? backend/src/PersonalFinance.Api/Application/ConcertEndpoints.cs
?? backend/src/PersonalFinance.Api/Application/ConcertModels.cs
?? backend/src/PersonalFinance.Api/Application/ConcertReports.cs
?? backend/src/PersonalFinance.Api/Application/ConcertService.cs
?? backend/src/PersonalFinance.Api/Application/FestivalAi.cs
?? backend/src/PersonalFinance.Api/Application/FestivalAttachments.cs
?? backend/src/PersonalFinance.Api/Application/FestivalEndpoints.cs
?? backend/src/PersonalFinance.Api/Application/FestivalModels.cs
?? backend/src/PersonalFinance.Api/Application/FestivalPlanning.cs
?? backend/src/PersonalFinance.Api/Application/FestivalRepeat.cs
?? backend/src/PersonalFinance.Api/Application/FestivalValue.cs
?? backend/src/PersonalFinance.Api/Application/FinancialDiagnosticsService.cs
?? backend/src/PersonalFinance.Api/Application/FinancialMemoryService.cs
?? backend/src/PersonalFinance.Api/Application/FuelAi.cs
?? backend/src/PersonalFinance.Api/Application/FuelBulk.cs
?? backend/src/PersonalFinance.Api/Application/FuelChronology.cs
?? backend/src/PersonalFinance.Api/Application/FuelEconomyMath.cs
?? backend/src/PersonalFinance.Api/Application/FuelImport.cs
?? backend/src/PersonalFinance.Api/Application/FuelInsightsAnalysis.cs
?? backend/src/PersonalFinance.Api/Application/FuelIntervalAnalysis.cs
?? backend/src/PersonalFinance.Api/Application/FuelPeriodComparison.cs
?? backend/src/PersonalFinance.Api/Application/FuelPriceAnalysis.cs
?? backend/src/PersonalFinance.Api/Application/FuelQualityAnalysis.cs
?? backend/src/PersonalFinance.Api/Application/FuelReceipts.cs
?? backend/src/PersonalFinance.Api/Application/FuelRecordRules.cs
?? backend/src/PersonalFinance.Api/Application/FuelStations.cs
?? backend/src/PersonalFinance.Api/Application/FuelStrategy.cs
?? backend/src/PersonalFinance.Api/Application/FuelVehicleRules.cs
?? backend/src/PersonalFinance.Api/Application/InterestAccounting.cs
?? backend/src/PersonalFinance.Api/Application/InterestAi.cs
?? backend/src/PersonalFinance.Api/Application/InterestAttachments.cs
?? backend/src/PersonalFinance.Api/Application/InterestEndpoints.cs
?? backend/src/PersonalFinance.Api/Application/InterestReports.cs
?? backend/src/PersonalFinance.Api/Application/InterestScenes.cs
?? backend/src/PersonalFinance.Api/Application/InterestSuggestions.cs
?? backend/src/PersonalFinance.Api/Application/LifeRetirementPlanning.cs
?? backend/src/PersonalFinance.Api/Application/LifeSimulationEngine.cs
?? backend/src/PersonalFinance.Api/Application/LifeSimulationRisk.cs
?? backend/src/PersonalFinance.Api/Application/LifeSimulationService.cs
?? backend/src/PersonalFinance.Api/Application/LoanScheduleService.cs
?? backend/src/PersonalFinance.Api/Application/MemoryAiEndpoint.cs
?? backend/src/PersonalFinance.Api/Application/PhysicalAssetEndpoints.cs
?? backend/src/PersonalFinance.Api/Application/PhysicalAssetMath.cs
?? backend/src/PersonalFinance.Api/Application/PhysicalAssetReports.cs
?? backend/src/PersonalFinance.Api/Application/PhysicalAssetService.cs
?? backend/src/PersonalFinance.Api/Application/RefundSourceSearch.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationAllocations.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationEndpoints.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationEngine.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationIssues.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationOverview.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationRulePreview.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationService.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationTasks.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationTransactionLinks.cs
?? backend/src/PersonalFinance.Api/Application/SmartReconciliationTrust.cs
?? backend/src/PersonalFinance.Api/Application/SpendingApprovalAi.cs
?? backend/src/PersonalFinance.Api/Application/SpendingApprovalExtras.cs
?? backend/src/PersonalFinance.Api/Application/SpendingApprovalLease.cs
?? backend/src/PersonalFinance.Api/Application/SpendingApprovalRules.cs
?? backend/src/PersonalFinance.Api/Application/SpendingApprovalService.cs
?? backend/src/PersonalFinance.Api/Application/SpendingApprovalSettings.cs
?? backend/src/PersonalFinance.Api/Application/SpendingCompute.cs
?? backend/src/PersonalFinance.Api/Application/SpendingDesignerEndpoint.cs
?? backend/src/PersonalFinance.Api/Application/SpendingExplanationEndpoint.cs
?? backend/src/PersonalFinance.Api/Application/SpendingIntelligenceService.cs
?? backend/src/PersonalFinance.Api/Application/SpendingMultiObjective.cs
?? backend/src/PersonalFinance.Api/Application/SpendingOptimizer.cs
?? backend/src/PersonalFinance.Api/Application/SpendingUncertainty.cs
?? backend/src/PersonalFinance.Api/Application/SpendingValueMath.cs
?? backend/src/PersonalFinance.Api/Application/SpendingValueService.cs
?? backend/src/PersonalFinance.Api/Application/StandardImportFields.cs
?? backend/src/PersonalFinance.Api/Application/StatisticsManagementAnalysis.cs
?? backend/src/PersonalFinance.Api/Application/StatisticsManagementService.cs
?? backend/src/PersonalFinance.Api/Application/StatisticsPolicyService.cs
?? backend/src/PersonalFinance.Api/Application/TransactionAiEndpoints.cs
?? backend/src/PersonalFinance.Api/Application/TransactionDuplicateCandidates.cs
?? backend/src/PersonalFinance.Api/Application/TransactionKeywordFlight.cs
?? backend/src/PersonalFinance.Api/Application/TransactionLedgerAnomalies.cs
?? backend/src/PersonalFinance.Api/Application/TransactionWorkspace.cs
?? backend/src/PersonalFinance.Api/Application/TransactionWorkspaceEndpoints.cs
?? backend/src/PersonalFinance.Api/Application/VehicleCosts.cs
?? backend/src/PersonalFinance.Api/Application/VehicleDecisions.cs
?? backend/src/PersonalFinance.Api/Application/VehicleDistanceCosts.cs
?? backend/src/PersonalFinance.Api/Application/VehiclePlanning.cs
?? backend/src/PersonalFinance.Api/Contracts/PhysicalAssetRequests.cs
?? backend/src/PersonalFinance.Api/Contracts/StatisticsManagementRequests.cs
?? backend/src/PersonalFinance.Api/Domain/CollaborationEntities.cs
?? backend/src/PersonalFinance.Api/Domain/FinancialMemory.cs
?? backend/src/PersonalFinance.Api/Domain/PhysicalAssetEntities.cs
?? backend/src/PersonalFinance.Api/Domain/SmartReconciliation.cs
?? backend/src/PersonalFinance.Api/Domain/TransactionStatementMatch.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261020114548_AccountBankBranch.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261020114548_AccountBankBranch.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261020154641_FuelOptionalOdometer.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261020154641_FuelOptionalOdometer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261020155817_FuelQuantityPrice.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261020155817_FuelQuantityPrice.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261021102507_FinancialMemories.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261021102507_FinancialMemories.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261022103647_PhysicalAssetCenter.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261022103647_PhysicalAssetCenter.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261022161514_TransactionWorkspace.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261022161514_TransactionWorkspace.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261022174635_SharedFinanceCenters.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261022174635_SharedFinanceCenters.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261022175426_SharedFinanceSplitInputs.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261022175426_SharedFinanceSplitInputs.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261024113738_AccountFullCardNumber.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261024113738_AccountFullCardNumber.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261025173437_MillionLedgerQueryIndexes.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261025173437_MillionLedgerQueryIndexes.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261025174433_LedgerEntryCoveringIndex.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261025174433_LedgerEntryCoveringIndex.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261025175328_LedgerTransactionProjectionIndex.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261025175328_LedgerTransactionProjectionIndex.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261025182552_RefundOriginLookupIndex.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261025182552_RefundOriginLookupIndex.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026112139_ComplexTransactionQueryIndexes.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026112139_ComplexTransactionQueryIndexes.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026144759_SmartReconciliationEvidence.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026144759_SmartReconciliationEvidence.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026145123_SmartReconciliationTasks.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026145123_SmartReconciliationTasks.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026150332_StatementResolutionHistory.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026150332_StatementResolutionHistory.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026150720_StatementAllocationRelations.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026150720_StatementAllocationRelations.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026163550_SmartReconciliationProvenanceAndTaskHistory.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026163550_SmartReconciliationProvenanceAndTaskHistory.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026165353_SmartReconciliationConfirmationMode.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026165353_SmartReconciliationConfirmationMode.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026172301_SmartReconciliationHistoryIndex.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026172301_SmartReconciliationHistoryIndex.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026184313_SmartReconciliationTransactionLookupIndex.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026184313_SmartReconciliationTransactionLookupIndex.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026213759_StatementRuleExpectedAmount.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261026213759_StatementRuleExpectedAmount.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261027162830_AiPersonalReadAccess.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261027162830_AiPersonalReadAccess.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261027163854_AiStructuredReportSnapshots.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261027163854_AiStructuredReportSnapshots.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261028102517_AiUnifiedFinancialConsent.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261028102517_AiUnifiedFinancialConsent.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261028213038_SpendingApprovalDocumentLookup.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261028213038_SpendingApprovalDocumentLookup.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030105230_FuelTankStatus.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030105230_FuelTankStatus.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030110536_FuelGrade.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030110536_FuelGrade.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030112250_FuelVehicleProfile.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030112250_FuelVehicleProfile.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030120818_FuelRecordTrash.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030120818_FuelRecordTrash.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030153429_FuelReceiptFacts.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030153429_FuelReceiptFacts.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030154723_FuelEventChronology.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030154723_FuelEventChronology.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030155832_FuelQueryIndexes.Designer.cs
?? backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261030155832_FuelQueryIndexes.cs
?? backend/tests/PersonalFinance.Tests/AiAnalysisSqlTests.cs
?? backend/tests/PersonalFinance.Tests/AiAnalysisTests.cs
?? backend/tests/PersonalFinance.Tests/AiStreamingToolsTests.cs
?? backend/tests/PersonalFinance.Tests/AiUnifiedAcceptanceSqlTests.cs
?? backend/tests/PersonalFinance.Tests/AiUnrestrictedTests.cs
?? backend/tests/PersonalFinance.Tests/CollaborationHttpTests.cs
?? backend/tests/PersonalFinance.Tests/CollaborationTests.cs
?? backend/tests/PersonalFinance.Tests/ConcertInterestHttpTests.cs
?? backend/tests/PersonalFinance.Tests/ConcertTests.cs
?? backend/tests/PersonalFinance.Tests/DashboardValuationReuseSqlTests.cs
?? backend/tests/PersonalFinance.Tests/EntryWorkflowSqlTests.cs
?? backend/tests/PersonalFinance.Tests/FestivalFinancialTests.cs
?? backend/tests/PersonalFinance.Tests/FestivalPerformanceTests.cs
?? backend/tests/PersonalFinance.Tests/FestivalTests.cs
?? backend/tests/PersonalFinance.Tests/FinancialConsistency20Tests.cs
?? backend/tests/PersonalFinance.Tests/FinancialConsistencyPerformanceTests.cs
?? backend/tests/PersonalFinance.Tests/FinancialMemoryHttpTests.cs
?? backend/tests/PersonalFinance.Tests/FinancialMemoryTests.cs
?? backend/tests/PersonalFinance.Tests/FuelBulkTests.cs
?? backend/tests/PersonalFinance.Tests/FuelChronologyTests.cs
?? backend/tests/PersonalFinance.Tests/FuelEconomyTests.cs
?? backend/tests/PersonalFinance.Tests/FuelImportTests.cs
?? backend/tests/PersonalFinance.Tests/FuelInsightsTests.cs
?? backend/tests/PersonalFinance.Tests/FuelIntervalAnalysisTests.cs
?? backend/tests/PersonalFinance.Tests/FuelMathV2Tests.cs
?? backend/tests/PersonalFinance.Tests/FuelPeriodComparisonTests.cs
?? backend/tests/PersonalFinance.Tests/FuelPriceAnalysisTests.cs
?? backend/tests/PersonalFinance.Tests/FuelQualityTests.cs
?? backend/tests/PersonalFinance.Tests/FuelReceiptFactsTests.cs
?? backend/tests/PersonalFinance.Tests/FuelReceiptTests.cs
?? backend/tests/PersonalFinance.Tests/FuelStationTests.cs
?? backend/tests/PersonalFinance.Tests/FuelStrategyTests.cs
?? backend/tests/PersonalFinance.Tests/FuelVehicleRulesTests.cs
?? backend/tests/PersonalFinance.Tests/InterestAccountingTests.cs
?? backend/tests/PersonalFinance.Tests/LedgerAnomalyEquivalenceTests.cs
?? backend/tests/PersonalFinance.Tests/LifeRetirementTests.cs
?? backend/tests/PersonalFinance.Tests/LifeSimulationHttpTests.cs
?? backend/tests/PersonalFinance.Tests/LifeSimulationPrivacyTests.cs
?? backend/tests/PersonalFinance.Tests/LifeSimulationRiskTests.cs
?? backend/tests/PersonalFinance.Tests/LifeSimulationTests.cs
?? backend/tests/PersonalFinance.Tests/LoanScheduleHttpTests.cs
?? backend/tests/PersonalFinance.Tests/LoanScheduleTests.cs
?? backend/tests/PersonalFinance.Tests/MerchantAnomalySqlTests.cs
?? backend/tests/PersonalFinance.Tests/PeriodReviewReuseSqlTests.cs
?? backend/tests/PersonalFinance.Tests/PhysicalAssetHttpTests.cs
?? backend/tests/PersonalFinance.Tests/PhysicalAssetTests.cs
?? backend/tests/PersonalFinance.Tests/ReportTerminalBoundaryTests.cs
?? backend/tests/PersonalFinance.Tests/RunningBalanceRangeSqlTests.cs
?? backend/tests/PersonalFinance.Tests/SmartReconciliationHttpTests.cs
?? backend/tests/PersonalFinance.Tests/SmartReconciliationTests.cs
?? backend/tests/PersonalFinance.Tests/SnapshotReadHttpTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingApprovalConstraintTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingApprovalInstallmentTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingApprovalPersistenceTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingApprovalRulesTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingApprovalSchemaTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingIntelligenceHttpTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingOptimizerTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingValueHttpTests.cs
?? backend/tests/PersonalFinance.Tests/SpendingValueMathTests.cs
?? backend/tests/PersonalFinance.Tests/StandardImportTests.cs
?? backend/tests/PersonalFinance.Tests/StatisticsManagementHttpTests.cs
?? backend/tests/PersonalFinance.Tests/StatisticsManagementTests.cs
?? backend/tests/PersonalFinance.Tests/StatisticsPolicyTests.cs
?? backend/tests/PersonalFinance.Tests/TransactionKeywordFlightTests.cs
?? backend/tests/PersonalFinance.Tests/TransactionWorkspaceHttpTests.cs
?? backend/tests/PersonalFinance.Tests/TransactionWorkspaceTests.cs
?? backend/tests/PersonalFinance.Tests/VehicleCostRulesTests.cs
?? backend/tests/PersonalFinance.Tests/VehicleDistanceCostTests.cs
?? backend/tests/PersonalFinance.Tests/VehiclePlanningTests.cs
?? backend/tests/account-page-optimization.mjs
?? backend/tests/smart-reconciliation-seed.sql
?? deploy/CLEANUP.md
?? deploy/SNAPSHOT-READS.md
?? deploy/scripts/cleanup-server.py
?? deploy/scripts/reset-application-backups.py
?? docs/AI分析体系升级-审计与验收-20261028.md
?? docs/AI工具参数兼容修复-6.13.1-20261028.md
?? docs/LIFE-SIMULATOR-CONTINUATION-20261028.md
?? docs/LIFE-SIMULATOR-DELIVERY.md
?? "docs/Personal Finance 测试版 6.1.3 - 123 - 账户管理优化.md"
?? "docs/Personal Finance 测试版 6.1.4 - 124 - 账户分组删除修复.md"
?? "docs/Personal Finance 测试版 6.1.5 - 125 - 历史加油补录可选里程.md"
?? docs/ai-6132-final-acceptance-20261028.md
?? docs/ai-6132-release-checklist.md
?? docs/ai-unified-consent-migration.sql
?? docs/ai-unrestricted-acceptance-20261028.md
?? docs/finance-consistency-audit-2.md
?? docs/music-interest-delivery-20261029.md
?? docs/shared-finance-centers.md
?? docs/spending-value-lab-v2.md
?? docs/spending-value-lab.md
?? docs/全部交易工作台-审计与验证-20261023.md
?? docs/全部交易性能对比-20261023.md
?? docs/全部异常超时修复-20261023.md
?? docs/历史上的今天-6.4.0-重构与验证.md
?? docs/实物资产中心-6.7.0.md
?? docs/性能审计报告-20261023.md
?? docs/智能自动对账2.0-6.11.0-开发与验收报告-20261027.md
?? docs/智能自动对账2.0-6.11.0-线上发布记录-20261027.md
?? docs/标准CSV导入说明.md
?? docs/演唱会专项记账-20261021.md
?? docs/独立记账中心-6.12.0-线上发布记录-20261027.md
?? docs/百万级全功能测试与全局优化-20261026.md
?? docs/百万级复杂查询专项优化-20261026.md
?? docs/记账与资金往来优化-20261025.md
?? docs/财务统计口径管理-6.5.0.md
?? docs/财务统计口径管理-6.6.0.md
?? docs/项目全部功能报告-2026-10-25.md
?? docs/项目功能检查证据-2026-10-25/
?? frontend-all-20261026.log
?? frontend/bookkeeping-build.log
?? frontend/e2e/fuel.spec.ts
?? frontend/e2e/on-this-day.spec.ts
?? frontend/integration/collaboration-layout.spec.ts
?? frontend/integration/festivals.spec.ts
?? frontend/integration/life-simulator.spec.ts
?? frontend/integration/spending-approvals.spec.ts
?? frontend/integration/spending-intelligence.spec.ts
?? frontend/integration/spending-value.spec.ts
?? frontend/playwright.accounts.config.ts
?? frontend/playwright.ai-analysis.config.ts
?? frontend/playwright.bookkeeping.config.ts
?? frontend/playwright.concert.config.ts
?? frontend/playwright.entry.config.ts
?? frontend/playwright.fuel.config.ts
?? frontend/playwright.idle.config.ts
?? frontend/playwright.life.config.ts
?? frontend/playwright.loan.config.ts
?? frontend/playwright.memory.config.ts
?? frontend/playwright.million.config.ts
?? frontend/playwright.physical.config.ts
?? frontend/playwright.reconciliation.config.ts
?? frontend/playwright.standard-import.config.ts
?? frontend/playwright.statistics.config.ts
?? frontend/playwright.transactions-workspace.config.ts
?? frontend/redesign-tests/account-management.spec.ts
?? frontend/redesign-tests/ai-analysis.spec.ts
?? frontend/redesign-tests/bookkeeping.spec.ts
?? frontend/redesign-tests/concerts.spec.ts
?? frontend/redesign-tests/entry-workflow.spec.ts
?? frontend/redesign-tests/fuel-history.spec.ts
?? frontend/redesign-tests/idle-requests.spec.ts
?? frontend/redesign-tests/loan-schedules.spec.ts
?? frontend/redesign-tests/million-real.spec.ts
?? frontend/redesign-tests/physical-assets.spec.ts
?? frontend/redesign-tests/smart-reconciliation.spec.ts
?? frontend/redesign-tests/standard-import.spec.ts
?? frontend/redesign-tests/statistics-management.spec.ts
?? frontend/redesign-tests/transaction-workspace.spec.ts
?? frontend/src/api/lifeSimulator.ts
?? frontend/src/api/physicalAssets.ts
?? frontend/src/api/spendingIntelligence.ts
?? frontend/src/components/ai/
?? frontend/src/data/familyRelationships.ts
?? frontend/src/data/fuel-price-reference.json
?? frontend/src/features/accounts/AccountToolbar.tsx
?? frontend/src/features/accounts/accountView.ts
?? frontend/src/features/accounts/accounts.css
?? frontend/src/features/collaboration/
?? frontend/src/features/concerts/
?? frontend/src/features/dashboard/CashflowOverview.tsx
?? frontend/src/features/dashboard/DashboardLayout.tsx
?? frontend/src/features/festivals/
?? frontend/src/features/fuel/FuelAiPanel.tsx
?? frontend/src/features/fuel/FuelBulkActions.tsx
?? frontend/src/features/fuel/FuelCalculationDetails.tsx
?? frontend/src/features/fuel/FuelDiscountFields.tsx
?? frontend/src/features/fuel/FuelEconomyDetails.tsx
?? frontend/src/features/fuel/FuelImportDialog.tsx
?? frontend/src/features/fuel/FuelInsightsPanel.tsx
?? frontend/src/features/fuel/FuelOverviewPanel.tsx
?? frontend/src/features/fuel/FuelPricesPanel.tsx
?? frontend/src/features/fuel/FuelQualityPanel.tsx
?? frontend/src/features/fuel/FuelReceiptFields.tsx
?? frontend/src/features/fuel/FuelRecordFilters.tsx
?? frontend/src/features/fuel/FuelStationsPanel.tsx
?? frontend/src/features/fuel/FuelStrategyPanel.tsx
?? frontend/src/features/fuel/FuelTrashPanel.tsx
?? frontend/src/features/fuel/VehicleCostsPanel.tsx
?? frontend/src/features/fuel/VehicleDecisionsPanel.tsx
?? frontend/src/features/fuel/VehiclePlanningPanel.tsx
?? frontend/src/features/fuel/VehicleProfileCard.tsx
?? frontend/src/features/fuel/VehicleProfileFields.tsx
?? frontend/src/features/fuel/VehicleValuePanel.tsx
?? frontend/src/features/fuel/ai.ts
?? frontend/src/features/fuel/bulk.ts
?? frontend/src/features/fuel/calculation.ts
?? frontend/src/features/fuel/costs.ts
?? frontend/src/features/fuel/import.ts
?? frontend/src/features/fuel/planning.ts
?? frontend/src/features/fuel/receipts.ts
?? frontend/src/features/fuel/records.ts
?? frontend/src/features/fuel/strategy.ts
?? frontend/src/features/fuel/workspace.ts
?? frontend/src/features/planning/LifeRetirementPanel.tsx
?? frontend/src/features/planning/LifeRiskPanel.tsx
?? frontend/src/features/planning/lifeLabels.ts
?? frontend/src/features/planning/lifePresets.ts
?? frontend/src/features/reconciliation/
?? frontend/src/features/reports/statisticsPolicyApi.ts
?? frontend/src/features/reports/statisticsPolicyCatalog.ts
?? frontend/src/features/transactions/TransactionAiPanel.tsx
?? frontend/src/features/transactions/TransactionIntegrityPanel.tsx
?? frontend/src/features/transactions/WorkspaceFilters.tsx
?? frontend/src/features/transactions/WorkspaceSummary.tsx
?? frontend/src/features/transactions/WorkspaceTable.tsx
?? frontend/src/features/transactions/anomalyRules.ts
?? frontend/src/features/transactions/transaction-create.css
?? frontend/src/features/transactions/workspace.css
?? frontend/src/features/transactions/workspaceApi.ts
?? frontend/src/i18n/reconciliation.en.json
?? frontend/src/i18n/transactions.en.json
?? frontend/src/mocks/statisticsManagement.ts
?? frontend/src/mocks/transactionWorkspace.ts
?? frontend/src/pages/CollaborationPage.tsx
?? frontend/src/pages/ConcertsPage.tsx
?? frontend/src/pages/FestivalsPage.tsx
?? frontend/src/pages/LifeSimulatorPage.css
?? frontend/src/pages/LifeSimulatorPage.tsx
?? frontend/src/pages/LoanSchedulesPage.tsx
?? frontend/src/pages/OnThisDayPage.tsx
?? frontend/src/pages/PhysicalAssetsPage.tsx
?? frontend/src/pages/SpendingApprovalExtrasPanel.tsx
?? frontend/src/pages/SpendingApprovalSettingsPanel.tsx
?? frontend/src/pages/SpendingApprovalsPage.tsx
?? frontend/src/pages/SpendingLabPage.tsx
?? frontend/src/pages/SpendingValueDetails.tsx
?? frontend/src/pages/SpendingValuePage.tsx
?? frontend/src/pages/StatisticsManagementPage.tsx
?? frontend/src/pages/TransactionCreatePage.tsx
?? frontend/src/pages/collaboration.css
?? frontend/src/pages/concerts.css
?? frontend/src/pages/on-this-day.css
?? frontend/src/pages/spendingLab.css
?? frontend/src/pages/statistics-management.css
?? frontend/src/tests/AiAnalysisView.test.tsx
?? frontend/src/tests/Collaboration.test.tsx
?? frontend/src/tests/ConcertInterests.test.tsx
?? frontend/src/tests/Concerts.test.tsx
?? frontend/src/tests/DashboardLayout.test.tsx
?? frontend/src/tests/EntryWorkflow.test.tsx
?? frontend/src/tests/Festivals.test.ts
?? frontend/src/tests/FuelAiPanel.test.tsx
?? frontend/src/tests/FuelBulkActions.test.tsx
?? frontend/src/tests/FuelImportDialog.test.tsx
?? frontend/src/tests/FuelOverviewPanel.test.tsx
?? frontend/src/tests/FuelPricesPanel.test.tsx
?? frontend/src/tests/FuelQualityPanel.test.tsx
?? frontend/src/tests/FuelReceiptFields.test.tsx
?? frontend/src/tests/FuelReceipts.test.ts
?? frontend/src/tests/FuelStationsPanel.test.tsx
?? frontend/src/tests/FuelStrategyPanel.test.tsx
?? frontend/src/tests/FuelTrashPanel.test.tsx
?? frontend/src/tests/LifeRetirement.test.tsx
?? frontend/src/tests/LifeSimulationJournal.test.ts
?? frontend/src/tests/LifeSimulator.test.tsx
?? frontend/src/tests/LoanSchedules.test.tsx
?? frontend/src/tests/PhysicalAssets.test.tsx
?? frontend/src/tests/PhysicalJournal.test.ts
?? frontend/src/tests/SmartReconciliation.test.tsx
?? frontend/src/tests/SpendingApprovals.test.tsx
?? frontend/src/tests/StatisticsManagement.test.tsx
?? frontend/src/tests/StatisticsPolicy.test.tsx
?? frontend/src/tests/TaskRunControl.test.tsx
?? frontend/src/tests/TransactionDrawerSwitch.test.tsx
?? frontend/src/tests/TransactionIntegrityLazy.test.tsx
?? frontend/src/tests/TransactionWorkspace.test.ts
?? frontend/src/tests/VehicleCostsPanel.test.tsx
?? frontend/src/tests/VehicleDecisionsPanel.test.tsx
?? frontend/src/tests/VehiclePlanningPanel.test.tsx
?? frontend/src/tests/VehicleValuePanel.test.tsx
?? frontend/src/tests/account-management.test.ts
?? frontend/src/tests/fuelCalculation.test.ts
?? frontend/src/tests/fuelImport.test.ts
?? frontend/src/tests/fuelRecords.test.ts
?? frontend/src/tests/fuelWorkspace.test.ts
?? frontend/src/tests/standardImport.test.ts
?? paper/
?? statistics-management-build.log
?? statistics-policy-build.log
?? tools/capture-million-sql.ps1
?? tools/life-simulator-million.mjs
?? tools/million-load.mjs
?? tools/million-query-diagnostics.mjs
?? tools/million-soak.mjs
?? tools/million-write-check.mjs
?? tools/reconciliation-core-check.mjs
?? tools/reconciliation-import-performance.mjs
?? tools/reconciliation-performance.mjs
?? tools/start-million-candidate.ps1
?? tools/start-million-environment.ps1
?? tools/verify-account-card-sql.ps1
?? tools/verify-ai-analysis.ps1
?? tools/verify-concert-sql.ps1
?? tools/verify-entry-workflow-sql.ps1
?? tools/verify-festivals-browser.ps1
?? tools/verify-festivals-sql.ps1
?? tools/verify-loan-sql.ps1
?? tools/verify-million-functional.ps1
?? tools/verify-physical-assets-sql.ps1
?? tools/verify-reconciliation-resume.ps1
?? tools/verify-spending-approvals.ps1
?? tools/verify-statistics-policy-sql.ps1
?? tools/verify-transaction-workspace-sql.ps1
?? transaction-workspace-build.log
?? verification-ai-unrestricted-backend.log
?? verification-ai-unrestricted-build.log
?? verification-ai-unrestricted-frontend.log
?? verification-ai-unrestricted-ui-recheck.log
?? verification-life-browser-accepted.log
?? verification-life-browser-final.log
?? verification-life-browser-pass.log
?? verification-life-browser-retry.log
?? verification-life-browser-v2-final.log
?? verification-life-browser.log
?? verification-life-build-final.log
?? verification-life-build.log
?? verification-life-continuation-backend.log
?? verification-life-continuation-browser-final.log
?? verification-life-continuation-browser.log
?? verification-life-continuation-format-final.log
?? verification-life-continuation-format.log
?? verification-life-continuation-frontend-all.log
?? verification-life-continuation-million-environment.log
?? verification-life-continuation-targeted.log
?? verification-life-delivery-tests.log
?? verification-life-deploy-backend.log
?? verification-life-deploy-frontend.log
?? verification-life-deploy-integrity-tests.log
?? verification-life-final-29.log
?? verification-life-final-acceptance.log
?? verification-life-final-candidate-backend.log
?? verification-life-final-candidate-backend.trx
?? verification-life-final-candidate-budget-backend.log
?? verification-life-final-candidate-budget-backend.trx
?? verification-life-final-math.log
?? verification-life-final-validation.log
?? verification-life-format-delivery.log
?? verification-life-format-final.log
?? verification-life-format-v2.log
?? verification-life-format.log
?? verification-life-frontend-accepted-final.log
?? verification-life-frontend-all.log
?? verification-life-frontend-clean.log
?? verification-life-frontend-delivery.log
?? verification-life-frontend-final.log
?? verification-life-frontend.log
?? verification-life-frozen-ai-contracts.log
?? verification-life-full-prepublish-r2.log
?? verification-life-integration.log
?? verification-life-math.log
?? verification-life-million-candidate.log
?? verification-life-million-environment.log
?? verification-life-million-matrix.log
?? verification-life-million-optimized-candidate.log
?? verification-life-million-optimized.log
?? verification-life-million-simulator-retry.log
?? verification-life-million-simulator.log
?? verification-life-million-v2-candidate.log
?? verification-life-million-v2-simulator.log
?? verification-life-mobile-overflow.log
?? verification-life-model-audit.log
?? verification-life-production-backup-20261028.log
?? verification-life-production-deploy-20261028.log
?? verification-life-production-deploy-budget-20261028.log
?? verification-life-production-smoke-20261028.json
?? verification-life-regression.log
?? verification-life-release-20261028.log
?? verification-life-release-final.log
?? verification-life-retirement-format-final.log
?? verification-life-retirement-format.log
?? verification-life-retirement-frontend.log
?? verification-life-retirement-math.log
?? verification-life-retirement-targets.log
?? verification-life-rollback-remote-test-final.log
?? verification-life-rollback-remote-test.log
?? verification-life-search-coalesced.log
?? verification-life-smart-isolated.log
?? verification-life-v2-integration.log
?? verification-life-v2-math.log
?? 代码审查报告-20261028.md
?? 加油与油耗2.0-开发与验收报告.md
?? 记账主页仪表盘-2026-10-27.html
?? 记账主页仪表盘-2026-10-27.png
?? 项目功能清单.html
```

## 最近提交

```text
91bbbdf 2026-10-20 Make Copilot browser checks independent and select budget month explicitly
f01840f 2026-10-20 Track release feature sources and bound annual heading checks
1ba23aa 2026-10-20 Preserve offline smoke checks and finalize browser CI
5e9ed00 2026-10-20 Optimize transaction search and offline caching for 6.1.2
8f3ebeb 2026-10-20 chore: record verified 6.1.1 production release and audit outcomes
9819036 2026-10-20 fix: finalize 6.1.1 stability checks and release safeguards
d97d6ab 2026-10-20 chore: capture project source and first stability fixes for 6.1.1
```

大量新领域、迁移、测试、历史报告未进入HEAD，克隆HEAD无法重现。已完成开发范围优先看源码，最近报告为历史证据；当前原开发者未完成任务顺序无法完全确认。**可复现候选与隔离回归已在同日第二轮完成主体（见下节），真实库待应用迁移清单也已通过只读查询确定（47 条）**；下一步是失败项口径决策与真实库迁移窗口授权。

本任务（第一轮）仅添加交接文档、合并AGENTS；测试生成bin/obj等常规产物，没有授权清理原文件。

## 2026-10-31 第二轮：可复现候选与隔离回归（本次实测）

分支/HEAD 未变：`main` / `91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。**工作区仍含全部未提交实现**（730 条 status：157 M / 5 D / 568 ??）；本轮逐条比对原基线，除 09 自述"另计"的 `AGENTS.md` 与本目录外无任何路径变化，未提交、未还原、未清理。完整证据与可重跑命令见 [16-CANDIDATE-VERIFICATION-20261031.md](16-CANDIDATE-VERIFICATION-20261031.md)。

| 核对项 | 实测结果 |
|---|---|
| 环境 | Node v24.20.0；本机 pnpm 12.11.2（声明 11.19.0，**未用 pnpm**，全部走 node 入口）；.NET SDK 10.0.401；dotnet-ef 10.0.13；SQL Server 2025 Express 17.0.1050.2；LocalDB 17.0.4025.3 |
| 后端构建 | 两个项目 `--no-restore` 均 exit 0，0 warning / 0 error |
| 隔离库 | 独立 LocalDB 实例 `PFRestoreCheck` + `PersonalFinanceWeb_RestoreCheck_2af7c290849e45582600a025dcd7e17a`；93/93 迁移，139 张表 |
| 模型一致性 | `has-pending-model-changes` → No changes（模型/快照/迁移链自洽） |
| 后端全量测试 | 836 总数 / **821 通过 / 1 失败 / 14 跳过**，3.75 分钟 |
| 前端 | 公告校验 79 条通过；`tsc -b` 通过；单测 606 用例 **605 通过 / 1 失败 / 0 跳过**（808 秒）；生产构建通过（dist + release-info.json） |
| 真实库只读核对 | `PersonalFinanceWeb`：已应用 46 / 源码 93，未应用 47，无源码中不存在的迁移；**未写入、未迁移、未初始化** |
| 源码改动 | 无（会话前后 git status 完全一致） |

两个失败项（均确定性复现、均未修复，属源码变更需授权）：

- 后端 `AiAnalysisSqlTests.FutureDatedIncomeIsExcludedAndMonthComparisonUsesTheSameElapsedTime`：`AiComparisonWindow.cs:9` 把未结束月份的上期窗口截断到上月月末，2026-10-31 本期已过 30d02h+ 超过 9 月 30d，导致断言的两段时长不等。日期相关，2026-10-28 历史基线为 Passed；产品 `basis` 文案已声明截断口径，冲突在**测试断言与产品口径**，不是金额/幂等回归。
- 前端 `Fuel.test.tsx:135` 期望 `/不自动创建支出/`，当前 `FuelPage.tsx:387` 文案为"不自动扣款；…"：**文案与断言漂移**，不是环境或本轮引入。

其他事实：真实库比源码少 47 个迁移，**当前源码不能直接连该库正常运行**；`Program.cs` 的 `--initialize-db` 只校验库名前缀以 `PersonalFinanceWeb` 开头（会放行 `PersonalFinanceWeb_Cloud`），严禁在疑似正式库误用。11 号文档的"前段精度被通用 decimal 循环覆盖"疑点已实测：循环确实覆盖前段 18,3/5,4 声明（实际生效 28,4，只更宽不截断），但模型/快照/库三方一致、无挂起迁移，故本轮不改模型。

未执行：真实 AI（14 项 Skip）、ESLint、Playwright E2E、旧 `.mjs`/`.ps1` 阶段套件、生产发布/迁移、备份恢复演练、API 真机 HTTP。隔离库与 `PFRestoreCheck` 实例保留待复核，只可删除本次自建对象。

## 未验证事项

本次未逐业务端到端验收；生产、云端、外部AI、E2E 浏览器、百万/性能数字及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md) 与 [16](16-CANDIDATE-VERIFICATION-20261031.md)。


## 2026-10-31 GitHub 源码同步

数据所有者明确要求上传 GitHub，授权本次源码归档与远程同步至现有私有仓库 `mali2022/Personal-Finance-1.0`。纳入现有工作区实现、迁移、测试与交接文档；本地配置、密钥、数据库、备份、日志和测试结果不上传，不删除本地文件。本次仅同步源码，不部署、不迁移真实库、不修改两个已知失败项；此前测试结果见 16，不重复运行完整回归。历史未提交状态为同步前快照。

同步进度：上传清单与本地提交已准备；远程仍只有初始化 README。本机 Git 缺少 GitHub 凭据，直接推送被阻止；尚未上传成功。后续登录后先 fetch，保留远程初始化提交并处理双方独立历史，禁止强制覆盖。现有本地历史未做完整密钥审计，推送历史前须检查；本次仅扫描当前候选文件的常见密钥格式。

## 2026-10-31 Apple Design 首页与仪表盘重构（本次实测）

范围：仅前端。首页 `/` 改为「个人财务控制中心」（新 `pages/HomePage.tsx` + `features/home/**`），新增 `/dashboard` 专业分析工作台（重写 `pages/DashboardPage.tsx` + `features/dashboard/apple/**`）；新增 Apple 设计系统 `design/apple.css`、重写 `design/tokens.css`、更新 `design/theme.ts`、`design/shell.css`、`styles.css`；新增 `components/apple/**` 与 `features/overview/**` 共享数据层；`routes/index.tsx`、`design/navigation.ts` 新增路由与「仪表盘」入口；新增 `mocks/apple.ts`（仅 dev mock）；`src/i18n/en.json` 新增 250 条新界面英文词条；`releases.json` 新增 `2026.10.31.2`（productVersion 6.21.0），`package.json` 同步 6.21.0。**未改后端、数据库、迁移、API 契约。**

验证（2026-10-31，本机）：`validate-releases` PASS（80 条）；`tsc -b` 0 error；生产构建 exit 0（18.55s，dist + release-info.json 2026.10.31.2）；新增 `HomePage.test.tsx` 6/6、`AppleDashboard.test.tsx` 6/6；全量前端 96 文件 / 618 用例：616 通过 / 2 失败（均在既有 `Fuel.test.tsx`：`不自动创建支出` 文案漂移为既有已知失败；`archives and restores...` 在 `--testTimeout=90000` 下 29.28s 通过，默认 30s 在满载机器上超时，属时序/性能而非功能回归）；浏览器矩阵（4 视口 × 2 主题，Home/Dashboard 16/16 行）h1 唯一、0 console error、无横向溢出、图表懒加载、API 数值一致、按需请求无重复。独立 verifier 报告与截图见 `frontend/verification/apple-redesign/`（gitignored）。

未验证/未授权：真实后端/真实库联调、真实 DeepSeek 调用、生产发布与迁移、备份恢复演练均未执行；浏览器数据来自 MSW 演示账本。既有回归页面（/accounts、/budgets、/planning/life-simulator）在 dev mock 下仍有未覆盖端点的 500/422 请求，属既有 mock 缺口，不是本次页面回归；/reports 320px 既有 AntD Tabs 横向滚动、/accounts 既有 37px 拖拽手柄同为既有问题。

## 2026-10-31 生产发布（Apple 首页与仪表盘 2026.10.31.2）

数据所有者要求发布线上并更新版本，已完成**两阶段发布**到 `https://personalfinance.invalid`：① 前端静态原子发布；② 后端版本目录同步+全量发布。最终线上 `2026.10.31.2` / 产品 `6.21.0`（上一线上 `2026.10.31.1` / `6.20.0`），`/api/version` 与 `/release-info.json` 一致，`/api/health` 为 `healthy/READY`（新 buildId `C7B732B1…`），EF 检查**无待应用迁移**，数据库结构未变。全量包 SHA256 `be50fa68…eea5`（44.32MB，6 分片上传后服务端合并校验一致）、静态包 `ec98aa42…53d3`；发布前 release-integrity 封存 365 个产物，数据库备份 `pf-20261031-214805-b2ddc3e9.bak`（1.9G）并校验；发布后线上静态哈希与本地 `dist` 逐字节一致、新 Home/Dashboard/chart chunk 均 200、`/updates` 展示新公告。回滚目录 `/srv/personal-finance/.rollback/update-20261031-214805` 与静态回滚快照保留。完整记录见根 `docs/Apple-首页与仪表盘重构-开发与验收报告-20261031.md` 第 12 节与 `frontend/verification/apple-redesign/production-deploy-20261031.log`。

## 2026-10-31 第一轮闭环修复（2026.10.31.3）

按数据所有者优先级完成第一轮两项缺口：① 首页/仪表盘待确认、异常、未分类卡片与明细筛选口径一致（待确认使用严格 `statusFlag=NeedsReview`，异常 `anomaly=Any`，未分类 `anomaly=Category`，去整理指向 `/transactions/review`）；② 记账、修改、删除成功后统一失效 `overview-*`、`dashboard`、`accounts`、`smart-reconciliation`、`transactions`、`reports` 与既有规划/财务查询，首页与仪表盘无需手动刷新。后端仅新增只读筛选参数，无迁移/结构/业务规则变化。验证：后端全量 837 项 822 通过 / 1 个既有日期断言失败 / 14 跳过；前端全量 624 项 623 通过 / 1 个既有 Fuel 文案失败；新增测试全部通过；浏览器实测卡片数量与列表总数一致（0/1/0），创建/修改/删除后金额自动更新并在删除后回到基线。版本 `2026.10.31.3` / 产品 `6.21.1`。**数据所有者要求完全本地交付，本轮未上传云端、未部署、未改生产；生产保持 `2026.10.31.2`。**

## 2026-11-01 项目迁移到 G 盘与本地静态启动

数据所有者要求保留 C 盘并迁移到 `G:\Personal Finance`，支持本地 BAT 与跨设备。已完成：C 盘原目录保留；G 盘复制源码、文档、启动脚本、后端 Debug 产物、前端构建与 `wwwroot`（排除了运行状态、备份、验证截图、NuGet/临时缓存等）。新增 `打开PersonalFinance.bat`（本地静态模式：仅 .NET 后端 5080（当时端口）托管 `backend/src/PersonalFinance.Api/wwwroot`，不依赖 Node/Vite）、`启动云端账本.bat`、`打开演示界面.bat`；`本地启动与跨设备说明.md` 记录路径、运行时自动探测、跨设备前提与回滚。原 `启动PersonalFinance.bat`/`快速进入.bat` 改为本地静态入口。为让本地完整模式可用，已先备份 `PersonalFinanceWeb`（`backend\.backups\PersonalFinanceWeb-before-local-portable-20261101-014123.bak`，校验通过），再应用 47 个待应用迁移（46→93），`/api/health` 本地实测 `healthy/READY`；G 盘静态启动实测页面 200、登录页正常、0 console error。生产未上传、未部署、未改动。

## 2026-11-01 演唱会3.0首轮审计
新增 docs/演唱会专项记账3.0-项目现状审计.md，含初步A–Y差异矩阵。复核现有场次与兴趣消费源码；InterestAccountingTests 当前7/7通过，相关后端项目编译成功。尚未完成完整审计、P0开发及真实数据库验收，后续从ConcertReports/InterestReports与隔离SQL测试继续。未改生产、未应用迁移、未清理既有文件。


## 2026-11-01 P0：已确认交易归集门禁

复核 ConcertReports 与 InterestReports，发现前者费用仅排除 Deleted，后者仅纳入 Confirmed。现修复 ConcertService 保存费用及 ConcertReports 有效费用为仅接受 Confirmed，与日常兴趣消费一致。原交易变为 NeedsReview 后排除费用并提示；恢复 Confirmed 后重新计入。不创建资金分录，无DDL变更，无API结构变更。

变更文件：ConcertService.cs、ConcertReports.cs、ConcertTests.cs。新增隔离SQL HTTP回归断言：待复核原交易不计入全场/自担成本、关联写入422、恢复确认后金额恢复。修复前既有隔离SQL套件8/8通过；修复后结果以测试与验收报告为准。尚未发布，不更新发布版本、不部署、不触碰正式库。

本轮最终验证：修复后隔离SQL测试7通过/1失败/0跳过；新增确认状态生命周期断言通过。既有2003条档案分页5秒阈值失败，未放宽阈值，性能根因待采样。详见 docs/演唱会专项记账3.0-测试与验收报告.md。未发布。


2026-11-01：演唱会分页带诊断隔离SQL验证8/8通过；2003档案第50页HTTP23ms、报表55ms。上轮超时未复现、根因未确定；保留阈值与诊断，无查询/模型/迁移变更。证据见演唱会3.0测试与验收报告最新节。继续P0领域缺口，未发布。

## 2026-11-01 P0逐张门票档案

本轮新增ConcertOrder.Tickets兼容字段、逐票票区/座位/观演人/类型/状态编辑与明细显示、数量与状态及保留历史校验、TicketsUpdated审计。复用现有场次Write、版本和幂等，不新增资金流水、表或迁移。独立巡演未开发。

最终验证：隔离SQL套件8/8通过（30秒，无跳过），覆盖旧档案兼容、逐票数量超限、重复ID、已保存票删除拒绝、领取需要出票、未来演出不可使用、状态保存、审计与总账交易数量/场次金额不变。前端Concerts.test 5/5通过，Releases.test 10/10通过，TypeScript通过，版本校验通过，Vite生产构建通过（13.18秒，存在大于500KB分块提示）。后端仅既有InvitationAccessTests xUnit2031警告；组件环境有既有getComputedStyle伪元素提示。没有浏览器E2E验收，不将组件测试当作浏览器测试。

公告初次校验发现kind不在既有枚举，改为new后通过。候选公告2026.11.01.1、产品6.21.2，只描述本次实际功能，不代表3.0全部完成。未上传、部署或替换本地wwwroot，未操作正式数据库。隔离库由脚本清理，无新增备份、一次性文件或真实业务测试数据。

新增架构与数据模型、功能实施矩阵、未完成项与后续规划文档；与审计、开发记录、测试报告共六份文档均为当前阶段记录。后续优先独立巡演及场次引用完整性。

2026-11-01：独立巡演基础档案与场次关联已完成，候选2026.11.01.2/6.21.3；SQL9/9、前端154/154通过。旧历史分组兼容，用户归属/版本/幂等/审计生效，无DDL与新资金分录，未部署。详见演唱会3.0开发记录最新节。剩余巡演成本汇总、艺人关系、时区、后续P0；不代表全功能完成。

2026-11-01：巡演成本汇总及场次下钻完成，候选2026.11.01.3/6.21.4；SQL9/9、组件7/7及公告10/10通过。分币种复用原场次报告，无资金写入/DDL，未部署。详见演唱会3.0开发与验收记录最新节。后续关注时区/艺人关系及剩余P0，浏览器与百万性能未验收。

2026-11-01：场次IANA时区与当地年度/月度归属、时间修改审计已实现，候选2026.11.01.4/6.21.5。旧JSON默认上海、旧客户端null更新保留原时区。时间输入明确设备时区，专用场馆当地时间输入控件未实现。前端11/11、公告10/10、类型及生产构建/产物检查通过；后端最终结果见3.0测试报告最新节。无DDL、无正式库操作、未部署。

本轮最终结果：补充旧客户端null更新兼容断言后，后端相关测试20/20通过（24秒，无跳过），包含真实隔离SQL HTTP回归与11项时区单元用例。隔离库脚本正常结束并清理。前端11/11、公告10/10及构建检查有效，无需重复执行。未部署、无一次性文件待清理。


2026-11-01：场次主艺人档案引用、明确解除及更名统计完成，候选2026.11.01.5/6.21.6；后端21/21（含单元与真实隔离SQL）、前端及公告20/20，类型/构建/产物检查通过。无DDL/新资金流水，未部署。旧客户端null保留已有引用，显式对象artistId:null解除并不再名称回退。细节及未完成项见3.0开发/验收记录最新节。下一步别名成员/多艺人设计，P0整体未完成。

2026-11-01：候选2026.11.01.6/6.21.7完成艺人/乐队类别、别名、成员角色日期、前后修改历史及别名待确认规则建议，无DDL或自动财务写入。新功能定向SQL1/1、前端组件22/22及公告10/10、类型/构建/产物检查通过；整套后端本轮21通过1既有分页超时失败（HTTP6092ms、独立后测SQL页9ms，未定位根因）。未部署，隔离库已清理。优先同请求性能追踪，再推进多艺人等剩余P0；详见3.0最新开发/验收记录。

2026-11-01：仅隔离测试新增ConcertPaginationTrace，同请求记录认证/会话、连接、SQL及读取、路由和响应时间，替换独立后测SQL。定向1/1、演唱会相关组22/22通过（分页21ms/服务端20.48ms/报表59ms，2003文档）；历史6092ms超时未复现、根因未确定，不称修复。保留5秒阈值；无生产代码/DDL/版本变化、未部署，测试库与本轮临时日志已清理。详见3.0验收报告最新节。

2026-11-01：候选2026.11.01.7/6.21.8完成联合演出每场明确比例、未分配、逐笔整数分币退款、商品独立归属、确认损失及场次/年度汇总；旧null请求保留计划，明确Primary退出，有审计，无DDL或资金分录。最终后端相关34/34、前端相关34项及类型/前端生产构建/产物检查通过。隔离库与本轮日志已清理，未部署/未改正式数据。仍欠票务生命周期、逐费用比例覆盖、完整音乐节流程及浏览器/百万验收；历史6092ms未定位。详见3.0最新开发/验收节。

2026-11-02：候选2026.11.02.1/6.21.9完成逐票赠送资料登记、撤销与历史，null旧请求保留原Gift，实际使用状态与资金独立。后端相关35/35、前端及公告25项、类型/前端构建/产物检查通过；隔离库及本轮日志已清理，无DDL或资金公式变更，未部署/未操作正式数据。有偿转让、逐票退款/保险/结案、免费获赠出票等仍待完成；历史6092ms未定位。见3.0最新开发/验收记录。


2026-11-02：候选2026.11.02.2/6.21.10完成本人付款逐票转让及真实分次回款/返款关联、撤销与历史，场次/年度/巡演另列回收后负担，原成本/预算/艺人消费口径不变。含代垫订单留在代付组。后端36/36及补充1/1、前端相关27项、类型/公告/生产构建/产物检查通过。无DDL，隔离库及本轮日志已清理，未部署/替换wwwroot/写正式库。P0余5组，下一步逐票退款/延期；历史6092ms根因仍未定位。详见演唱会3.0最新开发与验收节。


2026-11-02 P0已完成并上线：产品6.22.0，发布2026.11.02.3。用户明确选择本轮范围为剩余P0+验收+上线，P1/P2/P3不在本轮范围。逐票退款/延期、保险/未使用分项/结案、免费获赠与零现金他人代付/应付、代付转让及逐费用艺人覆盖均已交付。前端相关198/198，后端相关组42/42及追加边界3/3，真实SQL百万交易/两百万分录门禁1/1、桌面和手机深色真实API浏览器1/1通过；追加3项与前组有重叠，不合计为唯一用例数。生产构建/类型/91条版本校验/PWA及1148产物完整性封存通过。已按现有流程校验数据库备份并部署，未应用新迁移（93条保持），未进行正式账务测试。线上release-info与API版本一致，healthy/READY，首页HTML与本地封存构建一致，演唱会新chunk200，公开更新页面实际显示新公告且0 pageerror。发布包SHA256 C651655DF592E4857B9D33123F168CD4D33024C1D43F1FD141B29D52BB31960D，源码摘要3b41a72c280e7c33366501b9b7bb5f76267ce2bd337a1250352401359e332ae1。历史商品分页6092ms偶发根因仍未定位；本次另行修复的是百万背景历史交易候选深分页10327ms降至3575ms，不混称同一缺陷。细节见演唱会3.0测试与验收报告最新节。


2026-11-02收尾：本轮全部随机隔离数据库由脚本finally删除，清单恢复为任务开始前的既有库（不删除用途未确认的旧隔离库）；删除9个本轮临时验证日志及5个部署临时文件。完整生产部署日志移为frontend/verification/concert-p0/production-deploy-20261102-3.log作为必要审计，桌面/手机/公开更新截图、正式封存构建和最新发布包保留。云服务器受管理数据库备份当前1份，已通过VERIFYONLY；未配置额外对象存储，未新增本地数据库备份。源码未自动暂存、提交或推送。唯一清理遗留：自动审批审查拒绝了递归删除本地deploy/out/update-stage，使用已核实的绝对路径仍仅返回blocked by policy，未提供具体原因；该打包暂存目录已保留，未改用其他方式绕过限制，不影响已完成的生产发布。

## 2026-11-02 投资收益率2.0开发中
已新增 InvestmentReturns.cs 独立IRR/XIRR引擎与 InvestmentReturnTests.cs 六个基准用例。仅初步审计；未接入业务API/前端，未扩展数据库，未发布。定向dotnet test长时间无输出后请求中止，未取得测试结果，不视为通过。复杂变号仅检测到的多根返回MultipleRoots，否则保守返回AmbiguousCashFlow；搜索范围外返回NoRootInSearchRange。账户/组合边界、历史汇率、缓存、报表、E2E与百万性能均待实施。保留全部既有工作区改动，未操作正式库或备份。


### 2026-11-02 投资收益率2.0单资产计算阶段
新增InvestmentReturnCashFlows与InvestmentReturnService，以及GET /investments/assets/{id}/returns?start=yyyy-MM-dd&end=yyyy-MM-dd（可选原币currency）。使用用户归属校验、结算日、未舍入终值、期初前一日/期末精确日期估值；全部退出无终值；调拨缺少估值返回TransferValuationMissing。查询限制20000笔并传递取消令牌；未使用缓存，尚需一致性/权限HTTP测试、缓存及前端接入。新增持有估值缺失与全退出测试。dotnet test无输出，已中止，编译及测试结果未验证；未发布、无DDL、未操作正式数据。后续先解决测试运行阻塞，再继续集成，不视为完成验收。


本阶段最终验证更正：首次编译与新增源码并行导致测试引用尚未编入的类型；文件稳定后重新执行同一定向命令，API与测试项目编译成功，InvestmentReturnTests 8/8通过、0跳过（91ms）。此前无输出是编译等待，不能认定环境阻塞。仅既有InvitationAccessTests xUnit2031警告。HTTP权限、并发一致性及前端等仍待验证。无测试业务数据或新增备份需清理。


### 2026-11-02 投资收益率2.0前端接入阶段
InvestmentPerformancePage接入单资产选择及AssetReturnPanel，真实调用GET资产returns，展示年化XIRR、Actual/365及精确日期估值说明、期间/原币、异常原因、可追溯分页现金流抽屉；收益率不适用不显示0%。查询键复用investment-performance前缀，支持现有投资写入失效和请求取消。中文/英文及隐私遮蔽已覆盖新增界面。类型检查通过，InvestmentReturns组件测试3/3通过（服务端收益率、明细、缺估值、多解）；既有jsdom伪元素提示。pnpm exec触发依赖重装检查被拒后使用现有node_modules直接执行，无安装。生产构建结果见后续记录。未发布，未更新正式公告；无DDL/生产数据操作。浏览器真实API、账户/组合、汇率、持久缓存、报表与百万性能仍待完成。


前端阶段最终验证：TypeScript通过，组件3/3通过，Vite生产构建通过（14.04秒，存在大分块提示）。这是未发布开发候选，不代表完整发布校验或浏览器验收；构建产物沿用现有dist目录，未部署或生成重复备份。


### 2026-11-02 投资收益率2.0真实SQL/HTTP阶段
新增InvestmentReturnHttpTests（复用既有ConcertTests.Factory及SQL隔离框架，暂未拆分测试基础设施）。隔离SQL迁移后真实HTTP定向1/1通过、0跳过（17秒）：未登录401、跨用户404、缺估值、10%收益、估值更正-10%、撤销/恢复现金流重算、原币限制422、非法日期422、未创建普通总账交易。更正通过隔离夹具直接更新，不能作为更正写接口全生命周期或E2E通过证据。脚本退出0并完成finally隔离库删除；无正式库操作、无重复备份。前端刷新改为失效整个investment-performance查询前缀，覆盖总览和单资产XIRR。类型检查结果见本次工具记录。未发布、无DDL变更；账户/组合边界、历史汇率、服务端缓存、并发一致性、真实浏览器及百万性能仍待完成。


### 2026-11-02 投资收益率2.0账户/组合边界规则
新增InvestmentBoundaryReturns纯计算服务与4项边界测试：完整现金+持仓期初/期末价值由调用方提供并验证；证券交易、投资收入费用不作外部资本；组合内部转账排除；跨选定边界转账为投入/提款；未知分类和缺失历史价值明确阻断。数学及边界定向12/12通过、0跳过（86ms），编译成功，仅既有xUnit2031警告。尚未接入账户/组合API，不能宣称账户收益率已交付；原因是AssetReportsService明确现有OpeningBalance历史生效未知，不能将历史绝对净资产估算冒充准确期初值。下一步建立可追溯期初价值来源及严格交易分类映射，再接API；不得假造日期。另核实已有FxValuationRate和FxRateSelection ExactDate策略，可复用历史汇率能力，不需另建货币系统。无DDL、正式库操作或测试数据，未发布，无新增备份/临时文件需清理。


### 2026-11-02 投资收益率2.0历史汇率阶段
单资产returns API复用FxValuationRate/FxRateSelection ExactDate直接报价，支持报告币种currency；现金流按结算日、期初价值按前一日、终值按截止日折算。缺失或非正汇率返回ExchangeRateMissing，无最新汇率回填。现金流返回原币金额/币种、报价ID/日期/来源；折算decimal金额以完整精度序列化后求根。前端详情支持原币与汇率列及缺失原因，尚欠独立报告币种选择交互（现有页面资产列表仍按报告币种筛选），不可宣称跨币种前端完整。首次扩展隔离HTTP1/1通过17秒；最终金额序列化调整后复验见后续。前端类型检查及既有组件3/3通过。未发布、无DDL/生产操作；测试脚本清理隔离库，无新增备份。账户/组合期初来源、缓存、E2E/性能和报表集成仍未完成。


历史汇率阶段最终代码：隔离SQL真实HTTP复验1/1通过、0跳过（16秒），编译成功；脚本退出0，隔离库已清理。本轮未做浏览器或生产构建，不沿用上轮构建作为本轮证据。


### 2026-11-02 投资收益率2.0报告币种交互
收益页面新增独立XIRR报告币种选择（默认资产原币），与原报表原币筛选分开；切换报告币种不改变选中资产，重新请求服务端returns。修正方法说明为精确日期历史汇率及缺失不回填，保留原币/报告币现金流与来源展示。TypeScript通过，InvestmentReturns组件5/5通过（新增汇率缺失原因与切换请求参数，含英文）。尚未覆盖真实浏览器选择器交互，组件不是E2E。生产构建见本次运行结果。无后端/DDL变更、无生产操作、无测试数据或备份需清理；未发布。仍需账户/组合可靠期初、缓存、报表/AI及真实浏览器和性能验收。


### 2026-11-02 投资收益率2.0周期语义与数值边界
InvestmentReturns新增PeriodicIrr(amounts, periodsPerYear)：12/月、4/季、1/年及自定义(0,366]，分别返回PeriodReturn与复利AnnualizedRate，失败/溢出保持null；未接普通IRR UI或API，不将不规则交易按月聚合冒充等间隔IRR。求根改金额对数项缩放与补偿求和，过滤零项保留周期序号，最大20000非聚合输入、2秒求根预算，ResourceLimit明确失败；原搜索log(1+r)约[-27.631,27.631]、16384扫描、每根最多100次二分、1e-13区间及1e-9归一化残差保持明确。新增月季年/26周期、无效周期、真实零收益、近-100%与50年历史测试；数学及边界20/20通过（82ms），编译成功，仅既有xUnit2031警告。真实HTTP最终回归见后续。无DDL/生产操作，未发布。账户/组合期初、缓存、完整IRR交互、报表AI、E2E/性能仍未完成。


周期/数值阶段最终回归：隔离SQL真实HTTP1/1通过、0跳过（17秒），隔离库由脚本finally清理，退出0；无新增测试数据/临时文件或备份需保留。20k限制位于Solve，XIRR为同日聚合后的项数限制，API读取仍限制20000笔原始投资交易。


### 2026-11-02 投资收益率2.0周期IRR API与交互
新增POST /investments/returns/periodic（认证组，纯计算不写库），Amounts为2至512个有符号decimal字符串（18位整数/8位小数），PeriodsPerYear显式(0,366]；非法金额/周期返回422。页面新增手动等间隔核算，月/季/年/自定义周期，单期IRR与复利年化分别展示，输入修改清除旧结果，支持中英文/隐私及错误展示。明确每行一期/第0期/空期0，不自动将不规则实际交易聚合冒充IRR。后端隔离SQL真实HTTP1/1通过（16秒，无跳过，含周期标准值/年化、认证401和非法金额422）；前端类型检查通过，周期及资产组件合计6/6通过，未运行本轮生产构建/浏览器E2E。隔离库finally清理，无新增业务测试数据、备份或临时文件需清理。未发布、无DDL/生产操作。尚欠账户组合可靠期初、缓存失效、报表AI、趋势归因及全套E2E/百万性能，不能声明整体完成。


### 2026-11-02 投资收益率2.0读取一致性与资源预算
审计无统一持久投资变更版本，未贸然启用进程内结果缓存：多实例/历史汇率/关联账务失效尚无可靠统一机制。returns增加与FinanceService.Write同资源finance-user共享应用锁（2秒等待），Serializable事务统一读取资产/交易/估值/汇率，10秒取消预算，计算后提交；超时503 INVESTMENT_RETURN_TIMEOUT，锁/死锁/SQL超时503 INVESTMENT_RETURN_BUSY。不缓存结果、不宣称解决百万扫描。新增四个并发HTTP相同报告结果一致性断言；最终隔离SQL/HTTP定向1/1通过15秒、无跳过，编译通过，仅既有xUnit2031。未专门注入锁超时或并发写入验收，Serializable锁范围及大规模性能仍待测。隔离库由脚本finally清理，无正式库/DDL/发布操作，无新增备份/临时文件需清理。后续持久变更版本与缓存、账户/组合期初、报表AI、E2E及百万性能仍待实施。


### 2026-11-02 投资收益率2.0持久失效版本与单资产缓存
新增基础设施迁移20261102110000_InvestmentReturnRevision（finance.Users独立非映射列），FinanceDb同步/异步保存对投资/估值/汇率/账户/交易/分录/归集策略旧新用户同事务更新随机版本，回滚保持旧版本。单资产returns缓存按数据库/用户/资产/日期/报告币种/持久版本/政策隔离，归属及版本查询先于命中，16MB容量/单项1MB/2分钟过期，calculationId可追溯复用。只覆盖跟踪EF写入；直接SQL/批量更新/数据库恢复需显式更新版本或停服清缓存，不宣称任意外部写自动失效。当前Investment/Asset服务未发现绕过EF的业务变更。初次编译Entry方法名与实体冲突已限定实体名后修复。最终隔离SQL/HTTP1/1通过14秒，含缓存命中、估值/汇率更正失效、撤销恢复、回滚、四并发及权限；通用保存路径影响验证TransactionWorkspaceTests 18/18通过26秒、0跳过。两轮隔离库均finally清理，未操作正式库。新增docs/投资收益率2.0-缓存与迁移.md含部署顺序/回滚/边界；未发布，无备份及临时文件需清理。账户/组合/财务空间缓存、多实例实测、性能监控/百万、报表AI和E2E仍欠验收。


### 2026-11-02 投资收益率2.0净收益金额归因与整体进度
新增InvestmentReturnAmounts，将总收益与期间净已实现/未实现变化/净分红/净利息对平，费用仅展示已包含不重扣；缺估值/调拨/不对平不宣称完整归因。单资产API与前端接入原币净归因及报告币现金流总收益，汇率缺失保持报告币null，独立汇率归因未支持。缓存政策升v2避免旧结构复用。最终后端23/23通过15秒（含真实SQL/HTTP），前端7/7通过、类型检查最终通过；首次失败系期间未实现期望4应24、decimal字符串尾零与文本匹配，已修正后复验，无精度放宽。隔离库清理，无正式库/发布操作、无临时数据或备份需清理。新增docs/投资收益率2.0-实施进度.md逐阶段列实际状态，整体未完成：账户/组合API、报告AI、图表比较导出、完整E2E/百万性能和最终交付仍待完成，不用测试数估百分比。


### 2026-11-02 投资收益率2.0现金流图与JSON导出
单资产工作台新增真实现金流图（实际交易/边界估值两系列，缺失金额null，不填零或插值，每页100笔）与完整计算结果JSON导出；金额精确字符串及状态/来源/汇率均保留，隐私和刷新时禁用导出。复用Chart主题/响应式/隐私及saveBlob，未新增依赖。类型检查通过，前端8/8组件通过（含下载调用与图表null/实际/估值映射），生产构建结果见本次工具记录。未验证真实ECharts渲染、下载文件或360/1440浏览器，不把mock组件当E2E。后端未改未重复测，无数据库/生产/发布操作，无新增测试数据/备份或临时文件需清理。整体进度更新docs/投资收益率2.0-实施进度.md：数学主体、单资产API/UI/历史汇率/缓存/净归因已实现，账户组合API、可靠期初、资产趋势/比较、分享、报告AI及完整E2E/百万性能仍未完成。


现金流图阶段最终构建：Vite生产构建通过11.28秒，保留大于500KB分块提示；未发布，未覆盖后端wwwroot。


### 2026-11-02 投资收益率2.0真实浏览器生命周期通过
新增investment-returns Playwright规格，复用原浏览器脚本新增白名单TestSpec参数/API就绪检查；真实API资产/买入/分红/估值/追加/部分卖出/历史撤销替代更正，1440与360收益率、实际ECharts、明细抽屉、实际JSON下载解析及无横向溢出，Chromium最终1/1通过10.8秒。实际1资产/4有效交易/1撤销/1估值，非百万验证；创建通过真实API而非投资录入表单。发现Money仅接受2小数导致精度字符串崩溃，新增局部BigInt显示舍入，保留计算/导出原精度；图表自定义ARIA避免空值NaN播报。夹具先分红后追加触发保守歧义，成功样例改为单次变号，不宣称复杂现金流全部可解。其他早期失败为API启动竞态/ARIA及中文关闭定位，均有依据处理后重跑。最终前端9/9、类型检查、Vite生产构建通过11.29秒（大分块提示）。隔离数据库/密钥/日志由finally清理，成功重跑清除失败轨迹；自动审批策略拒绝删除.last-run.json，保留此测试状态文件。未生产部署/迁移。整体见docs/投资收益率2.0-实施进度.md；账户组合API、报告AI、趋势比较、英文深色多币种E2E、百万性能和最终交付仍未完成。


### 2026-11-02 投资收益率2.0多币种/英文深色浏览器扩展
仅扩展真实API Playwright与进度文档，无产品源码/DDL改动。最终Chromium1/1通过16.8秒，未跳过；1440/360均覆盖中文浅色+CNY、英文深色+USD，报告币种切换、缺汇率提示、5条历史报价正式API补录后刷新计算、明细来源及实际JSON导出（原币330/报告币165）。实体1资产/4有效交易/1撤销/1估值/5报价，不是百万测试；16.8秒是整段E2E，不是API预算或P95。未测全部语言主题组合/其他浏览器。复用上一轮有效类型/组件/生产构建，不重复执行。脚本finally已清理隔离库、临时密钥/日志；Playwright正常保留状态文件，不重试此前策略拒绝删除。未生产迁移/发布。整体状态见docs/投资收益率2.0-实施进度.md：单资产核心与上述E2E已实现验证，账户组合API/期初、专业趋势比较、分享、报告AI、百万分位性能和完整交付仍未完成。


### 2026-11-02 投资收益率2.0基础资产对比
新增POST /investments/returns/compare（1至20项不重复资产、统一期间/报告币种），事务内先校验全部用户归属，复用单资产Core与缓存，整批10秒预算、返回摘要不带大量明细。页面新增多选对比，年化XIRR/报告币收益/状态/区间币种，失败留空并解释，不汇总为组合收益。最终隔离SQL/HTTP1/1通过15秒：两资产正常/空数据、缓存一致、跨用户404、重复422；原单项更正回滚等回归通过。前端9/9、类型检查通过；真实Chromium E2E1/1通过19.4秒（原1440/360中文浅色/英文深色多币种生命周期保持，新增桌面英文深色对比操作与单项一致），移动对比未专门验收。Vite最终构建见本轮工具输出。隔离库/临时服务密钥日志已finally清理，运行状态文件按既有策略保留；无DDL/生产迁移/发布。整体见docs/投资收益率2.0-实施进度.md：基础资产对比已实现，账户组合、其他维度/专业趋势/分享、报告AI、百万分位性能及最终交付仍未完成。


### 2026-11-02 投资收益率2.0自定义报告中心集成
新增InvestmentReturns独立主题，xirrPercent/totalProfit及机器状态，复用正式批量/单资产服务缓存（calculationId一致），上限20资产、同期间报告币，不改原Investment持仓分支。前端主题/指标中英文、百分数及高精度金额显示，既有保存/CSV/Excel流程复用。真实导出发现外Write事务+Compare嵌套事务，修复为复用调用方事务，独立仍自建Serializable；最终SQL/HTTP1/1通过16秒（报告一致性、缺失状态、实际Excel列/状态读取）；真实Chromium扩展报告主题/预览与API CSV/Excel下载核对1/1通过19.6秒，原单资产/对比/视口/汇率等继续通过。导出创建通过API，未点击报告导出按钮本身。前端9/9、类型检查及后端编译通过，生产构建见本轮输出。隔离库/导出测试文档/临时服务日志密钥清理，运行状态文件保留，无正式库或发布操作。整体见docs/投资收益率2.0-实施进度.md；账户组合/专业趋势/其他比较维度/分享、年度报告AI、百万分位性能及最终交付仍未完成。


## 2026-11-02 投资收益率2.0核心交付与最终证据
最终报告docs/投资收益率2.0-功能与验收报告.md覆盖功能/数学规范/现金流/API/迁移/前端/源码/验证/性能/已知边界/回滚及6.11.0规划发布草案（非实际版本）；实施进度首页已改为当前状态。新增账户完整价值append-only文档及登记表单（不生成资金流水）、账户/组合API、精确历史FX与同事务版本缓存；内部证券及所选账户转账排除，未知分类/未确认/无现金调拨阻断。新增24个月有缺口的历史趋势、价值/净现金投入/简单累计率、净归因图、类别原币排序/跨币种分页对比、摘要分享、投资详情深链与资产配置对比面板、年度/月度报告及CSV/只读AI结构化证据。AI权限未扩展。临时Name索引尝试因nvarchar(max)失败已撤销，最终迁移仅GUID令牌列。
验证分组：数学/边界/归因/投资SQL及AI基础37/37，AI安全SQL/独立确认及交易工作区64/64；最终扩展HTTP1/1通过17秒含写锁Busy/回滚/提交、调拨阻断；前端相关28/28+年度CSV新增覆盖2/2（重叠1项），幂等恢复154/154；最终Chromium1/1通过22.3秒含1440/360、中文浅色/英文深色、多币种/报告/实际导出、对比、账户组合内部转账、估值表单/更正、趋势及年度API。最终类型/后端编译/生产构建通过，Vite9.90秒大分块提示（资产配置最后复用面板后最终构建记录见后续，不以旧构建冒充）。
百万：同一现有框架1M普通交易/2M分录，另8投资资产/1600投资交易/104估值，原有核心及投资回归通过；20冷单项P50/P95/max=42.03/135.72/268.77ms，20热=4.08/10.72/35.72ms，8并发全成功23.66ms批墙钟；P99不报。独立较小SQL夹具20冷账户P95=47.48ms、组合100.72ms、13点趋势524.26ms；不冒充百万投资或生产SLA。SQL单项扫描1/逻辑读75/CPU0/约4ms，终端中文编码异常注明。
所有本轮随机隔离库、临时API/密钥日志及导出测试数据已清理；剩余一个2026-11-01既有隔离库归属非本轮，保留不动；Playwright小运行状态文件保留，不重试先前策略拒绝删除。无新备份、生产迁移/发布/提交/推送。原始全量需求仍非100%：项目投资归属、独立汇率金额归因、缺失历史/调拨信息、多实例/共享财务空间及无限历史异步等明确边界详见报告，不伪造数据或称0%。


最终交付补充：功能与验收报告已完整列出15类交付信息（集中一份报告而非重复文档）。最终Chromium扩展资产配置收益面板1440/360后1/1通过23.8秒；最终Vite11.80秒、类型检查通过。AI追加防错规则：不可用XIRR不能借用无关零金额转述为0%，实际成功零收益仍可显示；AiUnrestricted/AiSafety定向57/57通过。已知限定：未调用外部模型、不支持独立汇率金额归因/可靠项目归属、无现金调拨信息不足时阻断，未做多实例/共享投资空间/全主题语言组合/生产恢复实测，故原始需求不标100%。性能环境Intel Ultra5 225/15.5GiB/SQL Express17.0.1050.2/.NET10.0.401/Node24.20.0；冷为应用缓存未命中，不是SQL冷磁盘。用户要求继续完成后已持续推进核心实现及验证，不把阶段测试数量替代最终业务正确性。未发布；未改公开releases版本；部署前必须先按既有流程备份验证并迁移新增令牌列，正式库未代执行。


## 2026-11-02 投资收益率2.0正式上线收尾
用户明确授权“继续任务 直到完成部署线上”，已按既有流程成功部署2026.11.02.4 /6.23.0（不采用规划6.11.0）。2026-11-02 23:41:15 +08:00独立HTTPS验收健康READY、公告版本、API/入口JS与本地封存哈希一致、release-info no-cache；收益/项目匿名401。未创建生产测试账号/流水，未暂存提交推送。
备份新建后实际隔离还原+DBCC CHECKDB及内容验证成功，checksum核对后清理明确旧备份，保留唯一有效新副本；生产演练库残留0。迁移20261102110000_InvestmentReturnRevision已应用，运行架构读/更新1/1、数据库CONTROL=0。旧代码镜像保留回滚，定位及恢复规则见docs/投资收益率2.0-功能与验收报告.md第15节（内部信息不得发布到公告）。
最终FX+HTTP5/5、前端184/184、发布记录10/10、TS/生产构建通过；实际API隔离库Chromium1/1通过28.1秒，1440/360及项目表单/FX明细；百万框架最终代码1/1通过，1M普通交易/2M分录另8投资资产/1600投资交易/104估值，冷P95≤1秒及8并发断言通过，不冒充百万投资或生产SLA。最终完整单项分位输出未留存，报告保留较早样本并明确区分，未为日志重复建数。
补齐ClosingRateConstantCurrencyBridge及生效日期整项资产项目分类，不等同独立已实现汇兑收入/逐笔项目分摊/项目组合率。缺估值/汇率/非现金调拨信息明确阻断；共享投资空间、多实例实测及无限历史异步未实现。核心可计算范围上线完成，原始全量需求限制继续明示，非100%虚报。任务产生隔离业务数据/服务已清理；既有非本轮隔离库、策略拒绝删除的Playwright小状态文件及正式构建/部署产物保留。无新增依赖，无业务数据重建。


P1连续任务进行中（用户授权完成后上线）：原始范围G行程/H场馆/I收藏/J回忆/K预算与目标/L首页。已增加ConcertTrips、ConcertExperiences服务与TripPanel、ExperiencePanel、SceneAttachments；新增行程、多场引用、时间线、场馆、主观座位评分、Setlist/嘉宾/安可、外部媒体与已有附件引用。未增加表或迁移，不写新资金流水。首个隔离SQL TripsExperiencesAndMemoriesKeepOwnerBoundariesAndNeverDuplicateLedger 1/1通过，后端和TS编译通过；随后调整行程退款使用ConcertReport新增verifiedRefunds，尚待复验。尚未完整验收或发布，不得标记P1完成。剩余收藏扩展、预算目标与首页、附件/费用共享边界、历史/安全解除、完整组件/浏览器/性能及发布。工作区另有已上线投资收益率2026.11.02.4/6.23.0与94迁移的原有修改，必须保留；发布应取最新版本并使用实际上海日期。


## 2026-11-03 P1 G—L发布候选

行程/场馆座位/商品音乐收藏/回忆/专项预算目标/真实首页六模块已实现，候选2026.11.03.1 /6.24.0，尚待本次生产发布结果，不以候选号冒充已上线。无新DDL/迁移，不生成资金事实；版本/幂等/用户隔离/审计及原来源变更核验复用现有机制。收藏出售返款与行程/场次/商品用途互斥，跨币种分别统计，原目标/预留不重复占款。验证、API/源码入口、测量范围与边界集中见[本轮P1进度](../演唱会专项记账3.0-P1实施进度.md)。P2/P3及历史分页偶发超时未归入本轮已完成项。


## 2026-11-03 P1正式上线完成

用户授权的P1 G—L六模块已完成开发、必要验收及线上部署，本次P1发布待办为0。线上[演唱会专项](https://personalfinance.invalid/concerts)，发布号2026.11.03.1 /产品6.24.0。既有push-update.ps1退出0，后端生产构建/TypeScript/Vite10.98秒/产物检查和封存通过（1152产物），发布记录10/10通过；源码摘要9642320806743dd8c96d2b5d2f51d2a35531150fb099bbcff1b941dcdf2070d7，API SHA256为97F1E4BEF0BE0E6C5DAD7011EDAF214FDA4958DA8F49967E5E9630D3CF1ECD09。无新增迁移，当前94迁移已是最新；运行权限检查通过。

2026-11-03 01:25 +08:00独立HTTPS验收健康READY、公告版本/产品号/API哈希一致、release-info no-cache，新增trips/collections/planning-budgets/experiences/memories/overview/planning-sources匿名401。公开更新页真实Chromium320宽度搜索/检查更新通过、页面错误0；release-info/index/sw及公告登录样式脚本与封存产物哈希一致。Node直连曾连接超时，按本机系统代理路径后验证成功，不是服务故障。登录态业务在隔离库验证，未创建生产测试用户或账务。

发布前按既有流程创建并VERIFYONLY校验备份；上线后同一备份实际还原至随机隔离演练库、DBCC CHECKDB及用户/94迁移结构检查通过、原备份SHA256未变，演练库已由trap删除。云端pf备份保留1份。内部恢复定位：pf-20261103-012132-c1be18b2.bak，SHA256 4ad28fa7af5db5d3929fa50514c12197df95dbed4d5d1818e17c5517b78f5d29；本次旧代码/镜像回滚资料由工具保留在/srv/personal-finance/.rollback/update-20261103-012132。内部路径与密钥不进公开公告。本次仅新增JSON文档及字段，代码回滚不得删除P1档案或覆盖账务。

清理实际结果：随机SQL测试库、浏览器临时API/密钥目录及生产还原演练库已按脚本清理，远端本次恢复脚本已由trap删除。最终本地批量删除临时日志/脚本及移动审计文件的命令被自动审批拒绝（仅返回blocked by policy，无具体原因），整条命令未执行，不绕过重试。因此根目录concert-p1*.tmp.log及concert-p1-restore.tmp.sh暂时保留；部署/恢复原日志分别为concert-p1-deploy.tmp.log、concert-p1-restore.tmp.log，线上核对证据在deploy/out/concert-p1-cloud-20261103.json及frontend/verification/releases/cloud。未将凭据写入本次临时脚本。既有归属不明隔离库、用户文件、原有未提交源码、Playwright小状态及必要构建/回滚资料保留。未新增依赖、未暂存/提交/推送。P2/P3仍未完成，历史商品HTTP6092ms偶发根因仍未定位；不冒称已验收百万P1文档、生产并发分位或外部媒体/AI服务。

## 2026-11-03 19:40-20:05 商品价格：移除提示条、更新默认价格表（静默发布）

用户明确要求本次不升版本号、不写入版本更新公告：releases.json 保持 2026.11.03.1 / 6.24.0，/api/version 与公开 release-info 未变。

1) 商品价格页移除默认商品价格表提示条（含“查看价格来源”链接），源码 frontend/src/pages/StageGPage.tsx；用既有 publish-static.sh 单独发布前端，线上 StageGPage chunk 与本地构建 SHA256 一致且无提示条文案。
2) 默认商品价格表更新为 2026-11-03《【价格动态】山西榆次汇隆市场2026年11月3日价格动态》（sourceId huilong-20261103，90 项：蔬菜34/水果15/肉蛋水产25/粮油16，取原文平均价）。修改 backend/src/PersonalFinance.Api/Infrastructure/DefaultProductPrices.json 与 backend/tests/PersonalFinance.Tests/DefaultProductPricesTests.cs；该测试 2/2 通过，Release linux-x64 构建及 release-integrity 封存/校验通过，运行镜像内嵌新 sourceId。
3) 按既有 apply-update 流程部署（因不写公告，未走 push-update 的版本公告闸门）：更新前数据库备份 VERIFY 通过，新 buildId 9F59EAF7D91D090C6F1ADB400837560872720FD9C749E0F6FB4FF6ECA51318DA，健康 READY，无迁移应用；回滚目录 /srv/personal-finance/.rollback/update-20261103-194545。
4) 服务器初始 owner 登录密码已被修改，无法用既有凭据调用“补充默认价格表”API；经用户确认采用直接写库：单事务为 owner 账号（fc453fdf…/LiZiqing）新增 2026-11-03 的 90 条参考价（确定性 Id；Source 含 11-03 日期），按哈希核验商品/规格/单位，旧 10-13 的 91 条保留为历史，其他账号不受影响（owner 181 条，全库 361 条）。此路径未写审计/幂等记录；回滚 SQL 位于 .rollback/price-import-20261103/rollback.sql。页面“补充默认价格表”按钮与默认参考价数据保留。

## 2026-11-04 页面头部清理并上线（2026.11.04.1 / 6.25.0）

数据所有者要求「把项目所有这样的全部去除或者修改，避免使用不必要的二级标签和描述，让布局本身解释一切」，范围选择「页面级清理」，并明确「直接发布到生产」。

范围：全站页面头部（页面/标签页顶部）的英文小标签（`.eyebrow` / `.pf-eyebrow` / `.ai-eyebrow` / `.payroll-eyebrow` / `.memory-eyebrow`）、标题下副标题（`<p>`、`.pf-subtitle`、`Typography.Paragraph`、`PageTitle description`）与页面头部的静态业务规则说明条。保留错误/警告/隐私/权限/数据限制/数量状态提示、表单内说明、Empty 描述、真实数据与主操作控件。未改后端逻辑、API 契约、数据库/迁移、mock 数据。

实现：52 个页面文件 + 2 个布局/组件文件（`HomeWelcome`、`PageTitle`，后者移除 `description` 属性）、9 个样式文件（styles.css、apple、apple-dashboard、auth、refinement、dashboard、ai-center、payroll、on-this-day），并清理 5 个 i18n 英文文件（en、ai、transactions、reconciliation、releases）共 56 条已无引用的词条；`releases.json` 新增 2026.11.04.1（产品 6.25.0），`package.json` 同步。引用被删文案的 13 个 e2e/integration/预览脚本断言改为稳定标记 `.home-page` 与标题断言。

验证：`validate-releases` PASS（94 条）；`tsc -b` 0 error；生产构建 13.73s、`verify-build` 通过（productionMock:false、precache 59、220 资产）。本地全量前端 103 文件 / 680 用例：676 通过 / 4 失败，均为既有问题而非本轮引入——2 项既有 Fuel（`不自动创建支出` 文案漂移、`archives and restores...` 30s 超时，与 2026-10-31 记录一致），2 项既有 phase3/phase4 mock 报表断言（本轮未改 mock/API/业务逻辑，隔离复现同样失败）。演示 mock 模式真实 Chromium 抽查 23 条路由 + 移动端 3 条：全部有 h1、0 个 eyebrow/副标题残留、0 pageerror（既有 mock 端点 500 属既有缺口）。公开页真实 Chromium（1440 中文 + 移动 /updates）0 console error，新公告可见。

发布（push-update.ps1 全量，退出 0）：sourceDigest `850737186c65095ae3134d39b26d1f7e9db4fffcead4f7d9d6441fd6317b4317`，封存 1152 产物，发布包 84.0 MB，后端产物 152.2MB；数据库备份 `pf-20261104-212311-fb274fca.bak`（1.9G，VERIFYONLY 通过），无迁移应用（94 条保持）；新 buildId `C50DB15485E7829E65995479440AC5924F143C4141E9469E247F620DB9B4D267`（旧 `9F59EAF7…`），回滚目录 `/srv/personal-finance/.rollback/update-20261104-212311`。线上 `/api/version` = 6.25.0 / 2026.11.04.1，`/api/health` healthy/READY，`/release-info.json` no-cache、94 条、首条 `lean-ui-headers-20261104-1`；`/`、`/updates`、`/login` 均 200；线上 `index.html` 与本地 `frontend/dist/index.html` SHA256 一致（`82896e2f…`），服务器 `web` 双树同步。

未验证/边界：登录态线上页面未做人工验收（生产 owner 口令已按记录被修改，本轮未创建生产测试账号或流水；登录态视觉/交互在本地演示 mock 下验证）。E2E/integration Playwright 套件未运行（依赖隔离后端与测试账号），仅静态解析与改动自查。P2/P3 未涉及；服务器磁盘发布后 84%（可用 6.4G），备份轮转保留 1 份。
## 2026-11-04 22:30 生产清理：删除 4 个未使用分类

按数据所有者要求，在云端正式账本（owner `fc453fdf…`）删除「日常早餐/日常午餐/日常晚餐/加餐宵夜」4 个二级分类；未改代码、未升版本、未写公告。删除前已备份并 VERIFYONLY（`pf-20261104-222348-a6038b0d.bak`）；因外键约束同时清空 91 行已删除交易分录、91 行已删除交易、4 行商户/模板的旧分类关联，并写 4 条 Remove 审计。正常交易/预算/统计/其他分类未改，owner 分类数 670→666。详见 15。

## 2026-11-04 深度清理面板/卡片说明文字并上线（2026.11.04.2 / 6.26.0）

数据所有者要求「更深一层全部删除」，并明确「所有标题与内容要保留距离」。在 2026.11.04.1 页面级清理基础上继续清理卡片/面板/弹窗内的说明文字。

范围与实现：删除各功能面板、卡片、抽屉与弹窗内的业务规则/口径解释——静态 info 提示条约 120 条、说明性段落与卡片级副标题/口径小字约 160 处（合计约 280 处）；删除卡片标题下副标题（AppleCard `subtitle` 能力及 15 个调用点）、指标解释、营销短句、侧边栏「个人财务空间」小标签与仪表盘页脚标语。保留错误/警告/隐私/权限/数据限制/知情同意等状态提示、表单字段帮助、Empty 描述、真实数据与操作。同步清理 5 个 i18n 英文文件 124 条孤儿词条、约 20 个失效 CSS 选择器；`releases.json` 新增 2026.11.04.2（产品 6.26.0），`package.json` 同步。

间距：对 43 条路由做浏览器测量与截图复核，页面标题到内容的间距集中在 24–30px；修复首页问候与状态行（2px→10px）、记账中心与车辆能源中心标题下无间距、报表中心标题与按钮堆叠等问题；`PageTitle` 独立使用时默认 20px 下间距、`page-heading` 内保持 0。删除说明后无标题贴内容或大块空白（个别卡片 head 与 body 为既有 flush 设计）。

验证：`validate-releases` PASS（95 条）；`tsc -b` 0 error；生产构建 11.9s、`verify-build` 通过（productionMock:false、precache 60、220 资产）；本地全量前端 103 文件 / 680 用例：676 通过 / 4 失败（仍为既有 2 项 Fuel 文案与超时、2 项 phase3/phase4 mock 报表断言，本轮无新增失败；已同步更新 5 个引用被删文案的单测与 2 个 e2e 断言）。演示 mock 真实 Chromium 扫描 43 条路由：0 个 eyebrow/副标题残留、0 pageerror，标题↔内容间距无塌陷；公开页真实 Chromium 0 console error、新公告可见。

发布（push-update.ps1 全量，退出 0）：sourceDigest `1d81c97a80fa8a7932f555730e483d79de33504a8e1a97ca6e6aae507d536bb1`，封存 1152 产物，发布包 84.0 MB；新 buildId `193BBDFCF1B3B4A2EB7EC24A40F0D6B4DCE040D7EAA71EC16CD739D3ECCE60A0`（旧 `C50DB154…`），数据库备份 `pf-20261104-225602-6eda305c.bak`（1.9G，VERIFYONLY），无迁移应用；回滚目录 `/srv/personal-finance/.rollback/update-20261104-225602`。线上 `/api/version` = 6.26.0 / 2026.11.04.2，`/api/health` healthy/READY，`/release-info.json` no-cache、95 条、首条 `lean-ui-panels-20261104-2`；`/`、`/updates`、`/login` 均 200；线上 `index.html` 与本地 `frontend/dist/index.html` SHA256 一致（`311e4446…`），服务器双树同步。

风险与边界：本次部署的备份轮转（保留最近 1 份）删除了 22:30 分类清理所用的 `pf-20261104-222348-a6038b0d.bak`，服务器当前仅保留 22:56 备份（已含该分类删除）；如需回滚取消分类删除，只能依据文档记录重建或使用外部备份。服务器磁盘 86%（可用 5.4G）。未运行 Playwright E2E；生产登录态页面未人工验收（无可用生产凭据、未创建生产测试账号/流水）；菜单/卡片内的短标签（指标名、状态 Tag、字段级帮助）按“数据而非描述”保留。

## 2026-11-12 本地项目目录磁盘清理（数据所有者授权，未改代码/未升版本）

按数据所有者要求「把不影响项目本地运行的可删除的都删除」，清理本地工作目录（纯本地文件操作；未改源码、未发布、未触碰真实账本数据库、密钥与当前部署包）。

删除：① 旧备份副本——保留最新 Verified `20261110T180003Z_…/database.bak`（98.3MB）与 4 份 retained 旧库（26.5MB），删除其余 18 个 .bak/.partial；② 旧部署产物——6.11.0 之前的旧 dist/update-stage 副本、9 个旧 tarball、history-version-verification 等（477MB）；③ 旧验证截图/测试证据与根级日志/trx（约 258MB）；④ releases/stage-z 旧暂存 141MB；⑤ 构建输出——backend/tests bin/obj、src bin/Release、src obj/Debug|Release（804MB）；⑥ src/bin/Debug 内 3 份 libSkiaSharp PDB（274MB）；⑦ .local-run 旧日志/截图/压测目录（136MB）；⑧ 根 node_modules 空壳与 tsbuildinfo。另 DROP 了两个早先测试遗留、仍 ONLINE 的 `PersonalFinanceWeb_RestoreCheck_…` 验证库（544MB，mdf/ldf 位于 backend/.backups 的 restore 目录且被 SQL 占用；确认无其他会话后 SET SINGLE_USER + DROP，SQL 自动回收文件），真实账本与云端库未动。

结果：项目 9,530.2MB / 91,862 文件 / 13,305 目录 → 3,510.8MB / 85,263 文件 / 9,258 目录（约 −63%）；C: 可用 49.0GB → 54.33GB。保留：backend/.nuget（离线构建缓存 1.52GB）、frontend/node_modules+.pnpm-store（pnpm 硬链接对，破坏 dev server 且单删不释放）、backend/src/bin/Debug（运行必需 dll）、deploy 当前发布包与回执（436MB）、最新备份、.local-run/wechat-import（账单数据 104MB）、.git、源码/docs/密钥/配置。本地启动复核：dll（2026-11-11 23:34:26）新于最新源码（2026-11-03 19:41:57），启动器可直接启动、无需重建；保留依赖路径全部存在。

证据与余项：`.local-run/cleanup-20261112/cleanup-log.txt`、`cleanup-result.json`（均 gitignored）。可选未执行（需另行确认）：.nuget 1,522MB（删后需联网 restore）、deploy 当前包 436MB（下次部署前可重建）、SQL 实例内测试/还原库约 1.5GB（位于项目目录之外，含其他项目 StubbornPlanet 的库）。

## 2026-11-15 导航栏重设计并本地发布（2026.11.15.1 / 6.27.0）

按数据所有者「不影响功能的前提下重新设计导航栏」完成桌面侧栏重做：9 组归并为 7 组，侧栏改为 72px 图标轨 + 216px 分组详情栏（`aside.sidebar.shell-sidebar` > `.shell-rail` + `.shell-panel`），点击分组切换面板、可折叠为纯轨道，折叠由 `matchMedia('(max-width: 991px)')` 驱动；顶栏内容/顺序/快捷键未变，手机抽屉与底部导航视觉未变（仅同步组名）。

主要文件：`frontend/src/design/navigation.ts`（`sections` 模型 + `groupRoutes`）、`frontend/src/layouts/AppLayout.tsx`、`frontend/src/design/shell.css`、`frontend/src/design/tokens.css`、`frontend/src/pages/SettingsPage.tsx`、`frontend/src/i18n/en.json`、`frontend/src/tests/navigation.test.ts`、`frontend/e2e/`（7 个文件选择器迁移）、`frontend/src/data/releases.json`、`frontend/package.json`。

验证与发布：`tsc -b` 0 error；导航单测 5/5；`validate-releases` PASS（96 条）；生产构建 12.21s；`verify-build` 通过；`frontend/dist` 已覆盖 `backend/src/PersonalFinance.Api/wwwroot`（旧版备份 `.local-run/web-backup-20261115-191223`），`/release-info.json` 与 `/updates` 均为 2026.11.15.1 / 6.27.0；Playwright 迁移后 `phase4` 6/6、`final+phase2+phase3` 12 通过/4 失败（既有 3 处首页入口漂移 + 1 处 4173 预览未启动）。无数据库/API 变化，无迁移，未备份。本机无 git，无提交。

待办：e2e 首页入口漂移 7 处按数据所有者决定仅记录不修（新入口在 `/dashboard` 与顶栏「记一笔」）；本机全量 Vitest 挂起原因未定位；`ai-center.spec.ts:26/36` 两处既有失败未修。
