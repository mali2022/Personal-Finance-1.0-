## 2026-11-18 本地站点端口改为 5085（并入 1.0.0 正式版公告 / 2026.11.18.1，频道 stable）

- 原因：桌面版「个人记账」安装包（`%LOCALAPPDATA%\Programs\PersonalFinance`，快捷方式参数 `--desktop`）默认占用 5080，与本副本同时打开时后启动的一方报「后端端口 5080 已被占用」，表现为打不开；改用 5085 后两者可同时运行。
- 端口：`scripts/PersonalFinance.Local.ps1:128` 与 `:130` 的默认 `backendPort` 由 5080 改为 5085（`frontendPort` 仍 5174），静态模式地址为 `http://127.0.0.1:5085/`；开发模式端口仍 5174，`frontend/vite.config.ts:91` 的代理默认目标改为 `http://127.0.0.1:5085`（可用 `FINANCE_API_PROXY_TARGET` 覆盖）。2026-11-18 及以前本副本用 5080。
- 发布记录：版本保持 `frontend/package.json` 1.0.0、`currentVersion` 2026.11.18.1、`product` 1.0.0 不变；`frontend/src/data/releases.json` 只有 1 条公告 `official-1.0.0-20261118`，正文改写为「1.0 正式版发布：全部功能一览」，用 11 条说明覆盖全部已交付功能，并把端口 5085 与两处交付缺陷修复写进同一条公告；未新增 1.0.1 公告。
- 同期交付缺陷修复（详见下一节「启动修复」条）：补齐 `backend/src/PersonalFinance.Api/bin/Debug/net10.0/runtimes/win/lib/net9.0/Microsoft.Data.SqlClient.dll`；`PersonalFinance.Api.staticwebassets.runtime.json` 原固化原项目「个人记账」的 wwwroot，复制目录后仍托管旧页面，已在本目录重新 `dotnet build` 修正。
- 文档：`docs/维护手册-1.0.md`、`docs/本地启动与跨设备说明.md`、`backend/README.md`、`docs/ai-handover/00-START-HERE.md`、`docs/ai-handover/07-LOCAL-DEVELOPMENT.md`、`docs/ai-handover/09-CURRENT-STATUS.md`、`docs/ai-handover/10-BACKLOG-AND-ROADMAP.md` 与本文件的现行端口均改为 5085，历史条目保留 5080 并标为当时端口；`frontend/e2e/ai-phase1.spec.ts` 注释同步。
- 已实测（2026-11-18 02:07，交付目录内）：重新构建前端与后端后，启动器冷启动返回「Personal Finance 已就绪：http://127.0.0.1:5085/」，`/release-info.json` 为 2026.11.18.1 / 1 条公告；浏览器 1440x900 深色实测首页「Personal Finance 1.0.0 发布号：2026.11.18.1」，/updates 只有 1.0.0 一条公告且 11 条说明全部显示，无页面错误，只有未登录的预期 401；`Releases.test.tsx` 10 passed、`validate-releases.mjs` 输出 {"version":"2026.11.18.1","releases":1}。
- 云端通道清理（2026-11-18，按用户决定）：删除 `deploy/` 整个目录（`CLEANUP.md` 2810 B、`SNAPSHOT-READS.md` 1143 B、`scripts/pull-cloud-to-local.ps1`、`阿里云连接信息.txt` 1189 B 空白模板），云端备份恢复通道随之取消；`README.md:3` 改为说明该目录已删除，`docs/ai-handover/12-DOCUMENT-INDEX.md` 删掉两行登记与 `deploy/` 目录入口、未验证条目改写。未改应用代码与 `releases.json`，无新增发布公告。

## 2026-11-18 上一版本：官方 1.0 精简发布：版本重置、公告单条化、文档合并与一次性资产清理（发布 1.0.0 / 2026.11.18.1，已重新同步 wwwroot）

- 启动修复（交付后）：复制来的 `bin/Debug/net10.0/PersonalFinance.Api.staticwebassets.runtime.json` 仍固化原项目「个人记账」的 wwwroot 绝对路径，导致后端能启动却返回旧的 6.30.1 页面；已在交付目录重新 `dotnet build` 生成新清单，并补回被精简掉、但 deps.json 需要的 `runtimes/win/lib/net9.0/Microsoft.Data.SqlClient.dll`。修复后启动器实测 /api/health、/、/updates、/release-info.json 均为 2026.11.18.1 / 1.0.0，首页显示 Personal Finance 1.0.0。
- 版本重置：`frontend/package.json` 6.30.1 → 1.0.0；`frontend/src/data/releases.json` 的 `currentVersion` 改为 2026.11.18.1，`product` 改为 `{ name: "Personal Finance", channel: "stable", version: "1.0.0", releaseNumber: "2026.11.18.1" }`，公告只保留 1 条 `official-1.0.0-20261118`（date 2026-11-18 / kind new / 8 条中英说明）。
- 频道收紧：`scripts/validate-releases.mjs` 与 `frontend/src/features/releases/catalog.ts` 现在要求 `channel` 为 `stable`；`frontend/src/features/releases/product.tsx` 与 `frontend/src/pages/ReleaseNotesPage.tsx` 只在 `channel === "beta"` 时输出频道词，正式版界面因此不再出现该词。
- 旧公告归档：此前 102 条公告目录按原文保存到 `docs/archive/releases-history-previously-published.json`，内容未改写。
- 文档合并：117 篇旧发布文档合并为两篇后删除原件——`docs/版本历史-1.0.md`（874 行：演进总览 + 23 个分版本节 / 85 个版本条目 + 附录 A 102 条公告行 + 附录 B 117 条来源路径）、`docs/维护手册-1.0.md`（合并时 852 行，2026-11-18 增补 4.7 后 860 行，端口改动后 864 行：10 章 + 附录 A 常用命令速查 + 附录 B 术语与报错原文索引）。
- 一次性资产清理：删除 37 个 `playwright.*.config.ts` 与 `backend/tests` 下 144 个一次性脚本；`.github/workflows/frontend.yml` 与 `backend.yml` 从未引用它们，CI 不受影响。另删除 8 个过期文档目录产物（根 docs 下 1 篇总索引 md、4 个公告覆盖与重组快照 JSON，以及 tools 下 3 个目录校验 / 覆盖同步 / 排序脚本），本目录 12 号索引因此按现存文件重建。
- README：删掉版本目录横幅与「归档版本」引用块；「当前应用功能文档」段改为「当前版本 Personal Finance 1.0.0 正式版（发布号 2026.11.18.1，频道 stable）」，链接改指 `docs/版本历史-1.0.md`、`docs/维护手册-1.0.md`、`docs/ai-handover/00-START-HERE.md` 与 `sql/`。
- 静态站点：`backend/src/PersonalFinance.Api/wwwroot` 由 `frontend/dist` 重新同步，311 个文件 / 40475391 字节；原 813 个文件 / 51 MB 的目录树被完全取代。
- 校验（真实输出）：`node scripts/validate-releases.mjs` exit 0，`{"version":"2026.11.18.1","releases":1}`；`vitest src/tests/Releases.test.tsx` 10 passed；`node scripts/verify-build.mjs` exit 0（pwaPolicyVerified true / precacheResources 61 / totalAssets 221）；`vite build` exit 0；对新 wwwroot 起本地静态服务后 `/`、`/updates` 均返回 200，`/release-info.json` 报 2026.11.18.1；1440x900 前后截图显示页脚由「6.30.1 / 2026.11.17.2」变为「1.0.0 / 2026.11.18.1」且不再有频道词，新 1.0 公告正常渲染。
- 前端全量 vitest（已补跑）：106 文件 / 717 用例，711 通过 / 6 失败 / 0 跳过，1104.93 秒；失败为 `Concerts`、`Fuel` 2 项、`LoanSchedules`、`phase3`、`phase4:333`，在原项目 `个人记账/frontend` 重跑同 5 文件得到相同的 6 项失败（6 failed / 65 passed），属既有红灯。
- 未验证：未启动 ASP.NET 后端连真实库（AI 调度器会轮询生产库），登录与 API 端到端流程在本副本未验证。
- 本目录 08、09、10、12、15 已按以上事实同步更新。

## 2026-11-17 修复分类「全部删除」与 CSV 导入被提交日志拦下（发布 2026.11.17.2 / 6.30.1，已部署本机 wwwroot）

- 现象：分类页「全部删除支出分类」预览正常（561 条、71 页），点「确认删除」弹红条「无法保存提交记录，请先查看待核实结果；也请检查浏览器是否允许会话存储。」，请求没有发出。
- 根因：`frontend/src/api/client.ts:35-52` 只对带 `Idempotency-Key` 的请求启用提交日志，而 `frontend/src/stores/operationJournal.ts` 的 `prepareOperation` / `pendingOperations` 用路径正则白名单校验，白名单里没有 `/categories/import` 与 `/categories/batch-delete`，于是命中 `operationJournal.ts:175` 抛 `请求地址不支持安全恢复。`，再被 `client.ts:100` 的 catch 统一改写成上面那句文案。预览接口不带幂等键、不经过提交日志，所以预览正常、只有「确认删除」失败。
- 改动（仅前端一处）：`frontend/src/stores/operationJournal.ts:50` 新增 `const categoryCsvPath = /^\/categories\/(?:import|batch-delete)$/;`，并在 `pendingOperations` 校验链首（:99）与 `prepareOperation` 白名单链首（:148）加入该判定。
- 后端未改：`FinanceEndpoints.cs:102`（import）与 `:104`（batch-delete）本就传 `key: true`，会写 `Operations` 记录，`/operations/{key}?fingerprint=` 可核实恢复；`CategoryImport.cs:151-169` 仍逐个校验引用与 Version、按层级由深到浅删除。
- 测试：`frontend/src/tests/operationJournal.test.ts` 末尾新增两组 `it.each`（两路径登记→回读→完成的往返；拒绝 `/categories`、`/categories/reorder`、两条 preview、单条 PUT/DELETE 共 6 条未开放路径）。改前 `node node_modules/vitest/vitest.mjs run --configLoader runner src/tests/operationJournal.test.ts` → 2 failed / 171 passed（`Error: 请求地址不支持安全恢复。` @ `src/stores/operationJournal.ts:172`）；改后 173 passed。关联回归：`operationJournal / aiOperationJournal / PhysicalJournal / Festivals / ConcertInterests / PayrollCenter / LifeSimulationJournal` 7 文件 209 passed；`categoryProtection / categoryCsv / CategoriesHierarchy / CategorySelector / templateImport / templateImportUi` 6 文件 39 passed，退出 0。
- 发布记录：`releases.json` 首条 `category-recovery-fix-20261117-2`（version 2026.11.17.2 / productVersion 6.30.1 / kind fixed / 2 条中英说明），`currentVersion` 2026.11.17.2、`product.version` 6.30.1、`product.releaseNumber` 2026.11.17.2，`frontend/package.json` 6.30.1。`node scripts/validate-releases.mjs` → {"version":"2026.11.17.2","releases":102}；`node node_modules/typescript/bin/tsc -b` 退出 0。
- 构建与部署（数据所有者本会话批准「现在构建并部署到本机 wwwroot」）：`vite build --configLoader runner` ✓ built in 13.77s（仅既有 chunk >500kB 警告）；wwwroot 备份 `.local-run/web-backup-20261117-183611`（14 个顶层条目）后 `robocopy frontend\dist backend\src\PersonalFinance.Api\wwwroot //E`（退出码 3 = 已复制 + 存在多余文件，属成功区间；MSYS bash 下必须写 `//E`，否则被当路径转成 `E:/` 而报「无效参数 #3」）。验证：`index.html` 改引用 `assets/index-DxpL8iZH.js`，该文件内含 `Ab=/^\/categories\/(?:import|batch-delete)$/`；当时端口 5080 的 `http://127.0.0.1:5080/release-info.json` 首条为 `category-recovery-fix-20261117-2`、currentVersion 2026.11.17.2；首页 200、该 hashed JS 200、`/api/health` healthy（buildId 347244E4…，后端未重启，wwwroot 为磁盘静态文件）。
- 未做：本机无 git，无法提供 diff 与 commit 号；未在真实账务上执行 561 条全量删除（按 AGENTS.md 不代做写操作）。

## 2026-11-17 （未发布）设计系统 v2 波 5 清理：视觉基线扩到 14 路由 + planning/import mock

- 新增 `frontend/src/mocks/planning.ts` 并在 handlers.ts 注册（周期交易/订阅/财务日历/自动化 8 个 GET 的空数据）；`frontend/src/mocks/imports.ts` 补 GET /api/imports 列表。
- `frontend/e2e-visual/ds-baseline.spec.ts` routes 13 → 14，纳入 /import。
- 验证：v2 56 passed (3.1m)；v1 56 passed 且 24 张基线图 md5 完全一致。
- 本次仅 mock 与测试脚本变更，不改产品行为；releases.json 未追加新条目（沿用已发布的 2026.11.17.1）。

## 2026-11-17 设计系统 v2 默认启用并发布 2026.11.17.1（已部署本机静态实例）

默认设计系统切到 v2（`frontend/src/design/ds-mode.ts` 的 BUILD_MODE 反转为 `VITE_DS_MODE === 'v1' ? 'v1' : 'v2'`），发布公告 `ui-refresh-20261117-1`（2026.11.17.1 / productVersion 6.30.0 / improved，4 条中英说明，公告总数 101），`frontend/package.json` 同步 6.30.0。

校验：`validate-releases` {"version":"2026.11.17.1","releases":101}、`tsc -b` 0、`vite build` 11.57s、`verify-build` 五项契约通过、`Releases.test.tsx` 10/10。

部署：wwwroot 备份 `.local-run/web-backup-20261117-042348`（478 文件）后 robocopy frontend/dist 到 wwwroot（/E）；当时 5080 的 /release-info.json = 2026.11.17.1、首页 200、/api/health healthy；5174 dev 实例按源码热更新同样已是 2026.11.17.1。回退：?ds=v1 或整站覆盖回备份目录。

未做：未用真实账号登录截图（无凭据文件）；未重启后端；v1 死规则与 8 处 .ant-* 桥接未删。

# 增量变更记录

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：增量变更记录。

## 2026-11-17 设计系统 v2 波 4：Apple 图表、辅助页表格密度、基线扩到 8 路由（无发布公告）

`frontend/src/components/apple/EChart.tsx` 加 v2 分支（12px 轴/图例、tooltip 内距与 token 投影）；`frontend/src/design/v2/pages.css` 收表格密度（表头 13px/600、行 52px：cell 10px + 按钮 32 + Tag 24）与 `.pf-stat-value` 字重；`frontend/e2e-visual/ds-baseline.spec.ts` 路由 6 → 8。

`/import` 未纳入基线：其请求未 mock 的接口，401 会触发全局登出跳到 /login。

验证：`check:ds` 0 error；v2 `wave-04d-v2` 32 张（1 flaky）；v1 `wave-04-v1check-v1` 32 passed 且与 `wave-00-v1` md5 24/24 相同。未发布，默认仍 v1。

## 2026-11-17 设计系统 v2 波 3：报表分析、图表与记账中心（无发布公告）

`frontend/src/design/v2/pages.css` 追加通用卡片与统计段、记账中心段；`frontend/src/components/Chart.tsx` 增加 v2 分支（12px 轴标签与图例、虚线网格、无刻度、提示框 r12 + token 投影）。修正一处作用域违规：`extraCssText` 不再写 `var(--ds-e-2)` 字面量，改用 `token.boxShadowSecondary`。

验证：`tsc -b` 0；`check:ds` 0 error；v2 视觉 24/24（`wave-03c-v2`，报表页与记账页截图已逐图核对）；v1 与 `wave-00-v1` 24/24 md5 相同。

未发布：默认 v1，`releases.json` 未改。

## 2026-11-17 设计系统 v2 波 2：交易与账户页面对齐（无发布公告）

新增 `frontend/src/design/v2/pages.css` 并在 `frontend/src/main.tsx` 末尾引入；v2 下 Button 改 pill（`frontend/src/design/theme.ts`）。交易页：30px 页标题、四张独立 KPI 卡（28px/600 等宽）、币种汇总发丝线化、筛选卡 r-3、表格行高 52、金额右对齐等宽。账户页：概览四张 tinted KPI 子卡、22px/600 余额、账户行卡片化与 hover、r-3 面板。

验证：`tsc -b` 0 error；`check:ds` 通过；v2 视觉 24/24（`wave-02c-v2`）；v1 与 `wave-00-v1` 逐文件 md5 24/24 相同（零变化）。

未发布：默认 v1，`releases.json` 未改。发布仍在波 5。

## 2026-11-17 设计系统 v2 波 1：通用层、外壳层与 primitives（无发布公告）

完成内容：`frontend/src/design/v2/base.css`（排版/焦点/等宽数字/reduced-motion）、`frontend/src/design/v2/shell.css`（顶栏 68px 毛玻璃、内容区间距、rail 与 panel 几何、panel 选中态）、`frontend/src/design/v2/primitives.css` + `frontend/src/design/v2/index.tsx`（DsPageHeader/DsSection/DsCard/DsStat/DsToolbar/DsChip/DsSegment/DsTableShell/DsEmpty/DsState/DsMoney，零 antd、零行内样式）、`v2-tokens.css` 追加 17 个 `--ds-c-*` 颜色别名、`frontend/src/design/theme.ts` 增加 `dsMode` 参数与 v2 尺度映射、`frontend/src/main.tsx` 引入三个 v2 样式并传模式、`frontend/scripts/check-ds.mjs` 把 `theme.ts` 纳入 v2 层且棘轮只统计 v1。

验证：`tsc -b` 0 error；`check:ds` 通过；`DS_MODE=v2 npm run visual` 24/24；`DS_MODE=v1` 重跑与波 0 基线 24/24 逐文件 md5 相同（v1 零变化）。

未发布：默认 v1，用户可见零变化，`releases.json` 未改。发布仍在波 5。

## 2026-11-17 设计系统 v2 波 0：规范、token 层与视觉基线（无发布公告）

目标：数据所有者要求（原话）「不改变功能实现的情况下 彻底重新做前端UI 方案」，选定方向 B 后要求开工。波 0 只落规范与脚手架，不改业务页面、不改功能实现。

完成内容：`frontend/src/design/v2-spec.md`（冻结契约：收敛比、数值契约、primitives API、antd token 映射、不可触碰清单、波次表）、`frontend/src/design/v2-tokens.css`（`--ds-*`：圆角 4 档 10/12/16/pill、字阶 8 档 11/12/13/14/16/22/28/30、阴影 3 档、间距 8 档、密度与动效）、`frontend/src/design/ds-mode.ts`（`?ds=` > localStorage `pf-ds` > `VITE_DS_MODE`，写 `<html data-ds>`，默认 v1）、`frontend/src/main.tsx` 三处接线、`frontend/scripts/check-ds.mjs`（token 完整性/作用域/颜色/反模式棘轮/死规则，package.json `check:ds`）、`frontend/playwright.visual.config.ts` 与 `frontend/e2e-visual/ds-baseline.spec.ts`（6 路由 × 4 视口主题 = 24 张全页基线，package.json `visual`）、`frontend/ds-baseline.json`（inline style 429 / 字面 className 1032 / `.ant-*` 覆写 591）。

验证：`tsc -b` 0 error；`node scripts/check-ds.mjs` 通过（4/8/3/8 契约全部命中、0 error、warn 797 个待清理 v1 类名）；`npm run visual` 24/24（1.4m），产物 `frontend/verification/visual-baseline/wave-00-v1/`，抽查两张桌面图确为真实页面。

未发布：用户可见外观零变化（默认 v1、v2 token 无人引用），故 `frontend/src/data/releases.json` 未改、`/release-info.json` 仍为 2026.11.16.3；发布在波 5 默认切 v2 时进行。

未做/待办：波 1–5 见 `10-BACKLOG-AND-ROADMAP.md` 的「2026-11-17 设计系统 v2 波次待办」；MSW 缺 `/api/account-groups`、`/api/promotions` 处理器的独立修复项未动。

## 2026-11-16 交易导出新增「收支分类」列（发布 2026.11.16.3）

目标：数据所有者要求（原话）「导出的文件中增加收支分类」。澄清后范围=交易页导出的 CSV/Excel，格式=一列完整分类路径（如「生活 / 餐饮」），拆分交易写「多分类拆分」。

完成内容：`backend/src/PersonalFinance.Api/Application/OperationsService.cs` 的 `Export` 在表头「账户」后加「收支分类」（`:92`）；`:94-95` 取分类字典并新增 `CategoryText(string? id)` 沿父链拼 `" / "`；`:96` 的 `splitIds` 聚合查询按与 `FinanceService.ProjectTransactions` splits 相同的判定（`e.Kind == "Expense"` 且分类不等于手续费分类，去重计数 > 1）标出拆分交易；行值在 `:100` 写「多分类拆分」或完整路径，CSV 与 Excel 因共用 `Row` 而同时生效。

验证：隔离库 `PersonalFinanceWeb_RestoreCheck_<32hex>`（LocalDB `PFRestoreCheck`，跑完删除）后端 4/4 通过，新增用例断言 CSV 表头第 4 列为「收支分类」、单分类行为「生活 / 餐饮」、拆分行为「多分类拆分」，并导出 Excel 读回 D 列核对同样三值；`validate-releases.mjs` 100 条、`tsc -b` 0、生产构建与 `verify-build.mjs`（`productionMock:false`）通过、`src/tests/Releases.test.tsx` 10/10。

部署：2026-11-16 21:14 经启动器 `-Mode Stop` → `dotnet build backend/src/PersonalFinance.Api --no-restore`（0 警告 0 错误）→ `-Mode Start -NoBrowser` 重启本机 dev 实例（backend PID 8740 / frontend PID 10000），`/api/health` 直接与经 5174 代理均 healthy，`/src/data/releases.json` 已显示 2026.11.16.3。未做：wwwroot 未替换（dev 模式不从 wwwroot 提供页面）；未在真实账号上实际下载核对；MSW mock 与财务报告页/自定义报表导出未改。

## 2026-11-16 收支分类 CSV 导入/导出/模板/全部删除（发布 2026.11.16.2）

目标：数据所有者要求（原话）「收入分类 增加导入导出 全部删除 导入模版」，实现落在收支分类页（支出/收入两个页签共用同一套动作）。

完成内容（后端）：新增 `backend/src/PersonalFinance.Api/Contracts/CategoryBatchRequests.cs`（`CategoryImportRow` / `CategoryImportInput` / `CategoryKindInput` / `CategoryBatchDelete`）与 `backend/src/PersonalFinance.Api/Application/CategoryImport.cs`。`CategoryImportRules.Plan` 是纯函数，预览与确认共用：最多 1000 行、名称 1..100 字、父级路径 `/` 分隔最多三级、状态只接受 启用/停用，输出 可导入/同名分类已存在/错误原因 三态；`ImportCategories` 按父行先序建父级并按同级最大 SortOrder 追加，返回 `imported` 与 `skipped[{row,name,reason}]`。批量删除先预览（`CategoryBulkDeletionPreview` 返回深度、路径、`Allowed`/保留原因），确认时逐项校验 `Version` 冲突，按深度由深到浅逐层删除并每层 `SaveChanges`（自引用外键无级联）；引用判定 `CategoryReferenceLabels` 覆盖 12 类计数（子分类、交易含已删除、历史关联、预算明细/年度分配/结转、必要支出、分类分析、商户或模板、导入记录、周期规则、自动分类）并扫描导入行与规则 JSON 载荷里的 id。端点见 `FinanceEndpoints.cs:101-104`，写操作走既有 `Write(...)`，带幂等键与事务。

完成内容（前端）：`frontend/src/features/categories/categoryCsv.ts` 负责表头/行数/2MB/名称/状态/父级先序校验，导出行先父后子（同级 sortOrder、name），输出 BOM+CRLF，模板收入为 工资收入/奖金、支出为 餐饮/早餐(停用)。`frontend/src/features/categories/CategoryCsvToolbar.tsx` 提供 导入CSV / 导出CSV / 导入模板 / 全部删除 四个按钮；导入先请求预览弹窗（行号、分类名称、父级分类、状态、结果），确认按钮仅在 `ready>0` 时可点，成功后 `已导入 {0} 条分类，跳过 {1} 条`；全部删除先预览（Alert 汇总、层级、保留原因），需精确输入「删除全部收入分类」/「删除全部支出分类」才能确认，成功后 `已删除 {0} 条、保留 {1} 条`；两条流程各复用一次 `Idempotency-Key`，并 invalidate `['categories']` 与 `['categoryOverview']`。工具栏挂在 `frontend/src/pages/CategoriesPage.tsx:289`，API 与类型在 `frontend/src/api/finance.ts`，MSW 四条路由在 `frontend/src/mocks/handlers.ts`。

验证：`tsc -b` 0；`node scripts/validate-releases.mjs` 通过（99 条）；生产构建（validate + tsc + vite）14.43s，`scripts/verify-build.mjs` 输出 `{"productionMock":false,"lazyRoutes":true,"chartsLazy":true,"apiExcludedFromCache":true,...}`；vitest `categoryCsv.test.ts` 9/9、`CategoriesHierarchy.test.tsx` 4/4；新增 `frontend/e2e/category-csv.spec.ts` 3/3（导出文件名与内容、导入先预览后确认并分别标注重复行、全部删除需输入确认文字）；部署后 `/api/health` READY、`/release-info.json` 2026.11.16.2、四个新路由未登录返回 401（存在而非 404）。Before/After 见 `.local-run/evidence/before-categories.png` 与 `after-categories.png`，另有导入/删除预览与真实账号登录后的 `live-after-categories.png`。后端 DLL 变更需重启，本次手动停止不在启动器状态里的旧进程后重建并由启动器拉起；数据库未变更。

## 2026-11-16 右侧悬浮 AI 记账助理（发布 2026.11.16.1）

目标：数据所有者要求（原话）「你现在先做一个 右侧悬浮按钮 用于 AI 聊天对话框 不是现有的 Copilot」，并选定：按钮图标用其提供的角色图裁成圆头像、真接通 `/api/ai/chat/stream`、桌面浮窗 + 移动端整屏。

完成内容：素材 `frontend/public/ai-mascot.png`（256x256，由 1080x1080 原图用 Pillow LANCZOS 缩放）。新增 `frontend/src/features/ai/AiChatFab.tsx`——右侧垂直居中 56px 圆形按钮，点击打开面板（桌面 380px 靠按钮左侧、`height: min(560px, 70vh)`，≤760px `inset:0` 且高度 100%）；面板含头像与状态点（`AI 服务可用` / `AI 服务未就绪`）、新对话、关闭、消息区与输入框；`aiApi.settings()` 判门禁，`enabled` 或 `configured` 为假时显示引导卡与「去 AI 设置」链接；发送走 `aiApi.chat()` 的 SSE 增量渲染，busy 时按钮变「停止」并用 `AbortController` 中断；Esc 关闭、Enter 发送、Shift+Enter 换行。样式 `frontend/src/design/ai-chat-fab.css`，文案 `frontend/src/i18n/en.json` 追加 19 键，挂载 `frontend/src/layouts/AppLayout.tsx`（`<AiChatFab />` 紧随 `<AppShell />`，不影响 GlobalCopilot）。测试 `frontend/src/tests/AiChatFab.test.tsx` 6 例（门禁、设置读取失败重试、流式增量、停止中断、第二轮带 conversationId、Esc 关闭）。

验证：`tsc -b` 退出 0；vitest 该文件 6/6、与 AiPage.test.tsx 合计 17/17；`scripts/validate-releases.mjs` 通过（98 条）；生产构建 12 秒级；真实账号在 `/accounts` 打开面板发问，流式回答正常返回（截图 `.local-run/shots/after-chat.png`），Before/After 四张截图同场景同视口。已部署到本机 wwwroot，后端未变、未迁移数据库。

## 2026-11-15 记账分类逐级进入式 + 实际金额支持 0.00（发布 2026.11.15.2）

目标：数据所有者要求（原话）「全局修改记账时的分类选择 采用「逐级进入式」导航」「允许经我确认后的 实际金额0.00」。

完成内容：新增 `frontend/src/components/CategoryPicker.tsx`——触发器显示完整路径，面板按「大类 → 子类 → 三级」逐级进入，带面包屑与底部「最终分类路径」，顶部搜索命中完整路径可直接选；有三级子类的二级分类不可直选，没有子类的一级分类不可选（与后端 `FinanceService.Category(..., leaf: true)` 的「请选择二级或三级分类」一致）；历史值中的停用项仅回显时展示并标注。`frontend/src/components/Selectors.tsx` 的 `CategorySelector` props 不变、内部改渲染 `CategoryPicker`，20 处调用点无需改动；样式 `frontend/src/design/category-picker.css`（≤760px 整屏），文案 `frontend/src/i18n/en.json` 追加 11 键。0.00 由 `frontend/src/features/transactions/QuickEntry.tsx` 在提交前用 `modal.confirm` 二次确认（支出/收入/转账），`frontend/src/utils/finance.ts` 允许 0 元单条拆分，`frontend/src/i18n/transactions.en.json` 追加 4 键。后端 `FinanceService.cs` 对支出/收入/转账改用 `MoneyAllowZero`，0 元仅限单账户付款、单条拆分，跨币种转账本金仍须大于零，0 元交易不写分录、手续费分录保留原金额；`CategoryStatisticsService.cs` 用查询侧补偿让 0 元支出仍出现在分类统计且不与 AssetLoss/Adjustment 补偿重复。迁移 `20261115233000_ZeroAmountTransactions` 把 `CK_Transaction_Amounts` 放宽为「`Amount > 0` 或类型为 Expense/Income/Transfer」，`Fee`/`Version` 条件不变。顺带修复侧栏折叠后仍占 216px 空白：`frontend/src/design/shell.css` 增加 `.app-shell .shell-sidebar.is-collapsed { width: var(--pf-rail); }`。

修改文件：上述新增/修改，另含 `frontend/src/data/releases.json`、`frontend/package.json`(6.28.0)、`frontend/src/layouts/AppLayout.tsx`、`backend/src/PersonalFinance.Api/Infrastructure/FinanceDb.cs`、`backend/src/PersonalFinance.Api/Infrastructure/FinanceDbModelSnapshot.cs`、`backend/src/PersonalFinance.Api/Infrastructure/Migrations/20261115233000_ZeroAmountTransactions.cs`(+Designer)、`backend/tests/PersonalFinance.Tests/ZeroAmountTransactionTests.cs`、`frontend/src/tests/CategorySelector.test.tsx`、`frontend/src/tests/ZeroAmount.test.tsx`、`frontend/src/tests/finance.test.tsx`。

数据库/API 变化：`finance.Transactions` 的校验约束放宽（仅约束，无数据/列/索引变化，`--initialize-db` 后迁移 95 条）；交易保存接口接受 0 元支出/收入/转账，其它类型仍要求大于零。

测试：`tsc -b` 通过；前端分类与 0 元相关 7 个测试文件 32 例通过（CategorySelector 11、ZeroAmount 5、EntryWorkflow、MultiPayment、ExportPanel、TransactionsPagination、CategoriesHierarchy）；后端 `--filter ZeroAmountTransactionTests|FinanceRulesTests|CategoryStatisticsTests|ExpensePaymentAllocationTests|EntryWorkflowSqlTests` 63 通过 / 0 失败（隔离库实测，用后 DROP）。未执行：前端全量 606 项、ESLint、Playwright E2E、真实 HTTP 端到端、真实 AI。

发布：`releases.json` 新增 2026.11.15.2（productVersion 6.28.0），`scripts/validate-releases.mjs` 通过（97 条）；生产构建通过后覆盖 `backend/src/PersonalFinance.Api/wwwroot`（旧版整份备份 `.local-run/web-backup-20261115-235552`）；真实库先备份 `backend/.backups/PersonalFinanceWeb-before-migrate-2026-11-16-00-00-57.bak`（92MB，`RESTORE VERIFYONLY ... WITH CHECKSUM` 通过）再应用迁移，`/api/health` 返回 healthy/READY。

问题/下一步：0.00 的浏览器端点击验证与 UI Before/After 截图未完成；本机启动器遇到库结构落后会直接拒绝启动（`SCHEMA_OUTDATED`），手工 `--initialize-db` 需显式提供 `ConnectionStrings__Finance`，否则 `Program.cs:26` 抛「缺少 ConnectionStrings__Finance」。Commit：无新增（本机无 git 可执行文件）。

## 2026-10-31 建立交接基线

目标/完成：跨厂商入口、架构、功能/API/数据库/测试/历史索引和安全规则。修改文件：本目录及AGENTS.md。数据库/API变化：无。Commit：无新增提交。测试：公告校验、前端10项、后端数学11项通过；全量未执行。问题/下一步：独立候选及隔离回归，见10。

## 2026-10-31 第二轮：可复现候选与隔离库回归实测

目标：执行 10 的首项任务（P1），以当前源码、EF 迁移、实际配置和本次可复现测试为准，建立隔离回归。

完成内容：git 基线与 09 逐条比对（730 条一致）；后端两项目 `--no-restore` 构建 0 error/0 warning；独立 LocalDB 实例 `PFRestoreCheck` + 随机 `PersonalFinanceWeb_RestoreCheck_2af7c290849e45582600a025dcd7e17a` 应用 93/93 迁移、139 表，`has-pending-model-changes` 无变更；后端全量 836 总数/821 通过/1 失败/14 跳过；前端公告 79 条、`tsc -b`、生产构建通过，全量单测 606 总数/605 通过/1 失败/0 跳过；真实库 `PersonalFinanceWeb` 只读迁移历史 46/93、未应用 47、无多余；11 号文档的 decimal 精度覆盖疑点已实测澄清（模型/快照/库一致，未改模型）；10 中 P2 十二项只读核对为 0 已实现/4 部分/8 未实现。

修改文件：`docs/ai-handover/` 下 16（新增）、00、04、07、08、09、10、13、14、15；AGENTS.md 未再改。数据库/API 变化：无（真实库零写，隔离库为本轮新建）。Commit：无新增。测试：见上，隔离库实测；失败 2 项均为口径/文案问题且未修复。问题/下一步：两个失败项的口径需授权；真实库 47 个待应用迁移需维护窗口；E2E/ESLint/旧套件/真实 AI 未执行。证据在 `verification/current-candidate/`（gitignored，克隆后按 16 重跑）。

会话收尾：数据所有者选择"两个失败项都不改、只保留记录；本轮到此为止"，未做任何源码/文案/测试修改，也未对真实库应用迁移。下一位从 09 → 10 → 16 接手。

后续重要开发更新09、10、15；按需更新功能、API、模型、架构、测试。每条记录日期、目标、完成内容、实际文件、DB/API变化、测试计数与耗时、问题、下一步、Commit（若存在）。

## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。


## 2026-10-31 GitHub 源码同步

数据所有者明确要求上传 GitHub，授权本次源码归档与远程同步至现有私有仓库 `mali2022/Personal-Finance-1.0`。纳入现有工作区实现、迁移、测试与交接文档；本地配置、密钥、数据库、备份、日志和测试结果不上传，不删除本地文件。本次仅同步源码，不部署、不迁移真实库、不修改两个已知失败项；此前测试结果见 16，不重复运行完整回归。历史未提交状态为同步前快照。

同步进度：上传清单与本地提交已准备；远程仍只有初始化 README。本机 Git 缺少 GitHub 凭据，直接推送被阻止；尚未上传成功。后续登录后先 fetch，保留远程初始化提交并处理双方独立历史，禁止强制覆盖。现有本地历史未做完整密钥审计，推送历史前须检查；本次仅扫描当前候选文件的常见密钥格式。

## 2026-10-31 Apple Design 首页与仪表盘重构

目标/完成：按用户要求真实实施 Apple 风格首页与仪表盘重构（设计系统、浅色优先主题、浅色 macOS 外壳、Bento 仪表盘、区间/账期统一筛选、模块布局持久化、i18n、发布公告）。修改文件：见 09 本轮段落；新增 `docs/Apple-首页与仪表盘重构-开发与验收报告-20261031.md`。数据库/API 变化：无（后端零改动）。Commit：无新增提交（本机无 Git）。测试：`validate-releases` PASS、`tsc -b` 0 error、生产构建 exit 0、新增测试 12/12、全量前端 618 项 616 通过/2 失败（既有 Fuel 文案漂移 + 满载下 30s 超时，90s 下 29.28s 通过）、浏览器 16/16 Home/Dashboard 矩阵通过、API 数值一致、无重复请求。问题/下一步：真实后端与真实 AI 未联调；既有 mock 缺口与两处既有前端失败未修；生产部署/迁移未授权。

## 2026-10-31 生产发布：Apple 首页与仪表盘 2026.10.31.2

目标/完成：按数据所有者指令发布 `https://personalfinance.invalid`，版本 `2026.10.31.2`/产品 `6.21.0`。方式：先前端静态原子发布，再后端版本目录同步+全量发布（release-integrity 封存 365 产物、`dotnet publish` linux-x64、`apply-update.sh` 数据库备份校验/重建镜像/迁移检查/健康检查/回滚快照）。数据库/API 变化：无业务代码与结构变化，EF 无待应用迁移；`/api/version` 与 `/release-info.json` 均为 `2026.10.31.2`。Commit：无。测试：包 SHA、`nginx -t`、precache 资源、数据库备份校验、线上静态哈希一致、chunk 200、API READY、`/updates` 正常。问题/下一步：已登录生产界面未用真实账号逐页复核；真实 AI 与恢复演练未执行。

## 2026-10-31 第一轮闭环：待办明细与记账后刷新（2026.10.31.3）

目标/完成：修正首页待确认/异常/未分类卡片与明细筛选不一致（新增只读 `statusFlag=NeedsReview` 严格筛选；异常/未分类分别使用 `anomaly=Any` / `anomaly=Category`；去整理指向真实待整理队列）；记账、修改、删除后首页与仪表盘通过统一失效谓词自动刷新。修改文件：`backend/src/PersonalFinance.Api/Application/FinanceService.cs`、`backend/tests/.../TransactionWorkspaceTests.cs`、`frontend/src/features/overview/{links,refresh}.ts`、`features/home/PendingSection.tsx`、`features/dashboard/apple/PlanningModules.tsx`、`utils/finance.ts`、`types/index.ts`、`features/transactions/WorkspaceFilters.tsx`、`routes/index.tsx`、`mocks/*`、新增 2 个前端测试；`releases.json` 新增 `2026.10.31.3`（产品 6.21.1）。数据库/API 变化：无结构变更；仅新增查询参数。测试：后端全量 837/822 通过/1 既有日期失败/14 跳过；前端全量 624/623 通过/1 既有 Fuel 文案失败；新测试全部通过；浏览器实测卡片与列表 0/1/0 一致、创建/修改/删除后金额自动更新并回到基线。数据所有者随后要求完全本地交付：本轮未上传云端、未执行部署脚本、生产保持 `2026.10.31.2`；本地版本 `2026.10.31.3` 已构建/封存/回归。

## 2026-11-01 本地项目迁移与静态 BAT 启动

目标/完成：保留 C 盘，复制项目到 `G:\Personal Finance`；本地 BAT 改为后端静态托管，脱离 Node/Vite；运行时自动探测；补充 `备份并升级本地数据库.bat` 与跨设备说明。修改文件：根 BAT、`scripts/PersonalFinance.Local.ps1`、`docs/本地启动与跨设备说明.md`、`backend/src/PersonalFinance.Api/wwwroot`（前端构建产物）及 G 盘副本。数据库变化：本地 `PersonalFinanceWeb` 先备份（101MB，校验通过）后由 46 迁移升级到 93；生产/云端未改。测试：本地 C 与 G 静态启动页面 200、`/api/health` READY、登录页 0 console error；G 盘未安装完整前端依赖也无需 Node。问题/下一步：跨设备仍需目标机具备 .NET 10、SQL Server 与数据库备份还原；演示模式仍需 Node 与 `pnpm install`。

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


2026-11-02：完成本人付款逐票有偿转让、真实回款/返款、来源失效警告、撤销/审计及回收后负担，返款与场次/商品共享上限。候选2026.11.02.2/6.21.10，后端36/36及扩充1/1、前端相关27项、类型/版本/生产构建/产物检查通过。无新资金分录或DDL，测试库与本轮日志已清理，未部署或操作正式数据。P0余5组，含代付转让仍待代付组。详见演唱会3.0最新记录。


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

## 2026-11-04 页面头部清理（2026.11.04.1 / 6.25.0，已上线）

目标/完成：按数据所有者「去除多余的二级标签和描述、让布局解释一切」的要求，清理全站页面头部的英文小标签、标题下副标题与页面级静态说明条；保留状态/错误/隐私/权限/数据限制提示、表单内说明与真实数据。修改文件：52 个页面文件 + 2 个布局/组件（HomeWelcome、PageTitle 移除 description）、9 个样式文件、5 个 i18n 英文文件（删 56 条孤儿词条）、`releases.json` 与 `package.json`（6.25.0），以及 13 个引用旧文案的 e2e/integration/预览脚本断言（改为 `.home-page` 稳定标记）。数据库/API 变化：无（无迁移、无接口改动、无 mock 数据改动）。Commit：无（本机无 Git）。

测试：`validate-releases` PASS（94 条）、`tsc -b` 0 error、生产构建 13.73s、`verify-build` 通过（productionMock:false / precache 59 / 220 资产）；本地全量前端 103 文件 / 680 用例 676 通过 / 4 失败（2 项既有 Fuel 文案与超时、2 项既有 phase3/phase4 mock 断言，均非本轮引入）；演示 mock 真实 Chromium 23 路由 + 移动 3 页无 eyebrow/副标题残留、0 pageerror；公开页真实 Chromium 0 console error、新公告可见。

生产发布：push-update.ps1 退出 0，DB 备份 `pf-20261104-212311-fb274fca.bak`（1.9G，VERIFYONLY）、无迁移应用、新 buildId `C50DB154…`、回滚目录 `update-20261104-212311`；线上版本/公告/健康一致，`index.html` 与本地 dist 哈希一致。未运行 Playwright E2E；线上登录态未人工验收（无可用生产凭据，未创建测试账号/流水）。
## 2026-11-04 22:30 生产账本：删除 4 个未使用分类（静默数据清理）

数据所有者要求删除分类管理中的 4 个二级分类（日常早餐、日常午餐、日常晚餐、加餐宵夜，截图显示前三个已停用），并限定「其他内容不要改动」。已在云端正式账本 `https://personalfinance.invalid`、owner 账号 `fc453fdf…/LiZiqing` 下执行删除；未改代码、未升版本、未写版本公告（`releases.json` 保持 2026.11.04.1 / 6.25.0）。

删除前核实：4 个分类均无正常交易；其中 3 个当天 22:03 已被用户停用。按既有流程新建并 VERIFYONLY 校验备份 `pf-20261104-222348-a6038b0d.bak`（1.9G，Express 不支持压缩）。受外键与完整性规则约束，单事务内同时清理了已删除记录的旧分类关联：`finance.Entries.CategoryId` 91 行、`finance.Transactions.CategoryId` 91 行（均为 2017–2022 年的已删除记录）、`finance.Directory.CategoryId` 4 行（商户/模板），随后删除 4 行 `finance.Categories`，并写入 4 条 `AuditRecords`（Action=Remove、Source=User）留痕。未改动任何正常交易、预算、统计或其他分类；旧导入归档 `ImportRows.DataJson` 保留历史快照 ID 未改。

验证：4 个目标 ID 在 Categories/Entries/Transactions/Directory 引用均为 0；owner 分类数 670→666；父分类「餐饮食品」其余 7 个子分类及排序不变；`/api/health` READY，`/api/categories` 匿名 401。回滚方式：还原上述备份，或按备份中 4 行 Categories 与 91+91+4 行引用重建。备份/内部路径不写入公开公告。

## 2026-11-04 深度清理面板/卡片说明文字（2026.11.04.2 / 6.26.0，已上线）

目标/完成：按数据所有者「更深一层全部删除、标题与内容保留距离」的要求，删除功能面板/卡片/抽屉/弹窗内的业务规则与口径说明、卡片副标题、指标解释与营销短句，以及侧边栏小标签；保留状态/告警/隐私/权限/数据限制/同意提示、字段帮助、空状态与真实数据。修改文件：`frontend/src` 下 151 个文件（页面/组件/样式/i18n），另更新 5 个单测与 2 个 e2e 断言；`releases.json` 与 `package.json` 升至 6.26.0。数据库/API 变化：无（无迁移、无接口改动、无 mock 数据改动）。Commit：无（本机无 Git）。

规模：约 280 处静态说明/标签（其中 info 提示条约 120 条），i18n 删除 124 条孤儿词条，清理约 20 个失效 CSS 选择器。间距：43 条路由浏览器测量 + 截图，页面标题↔内容 24–30px；修复首页问候与状态行、记账中心/车辆能源中心标题下无间距、报表中心按钮堆叠；`PageTitle` 默认 20px 下间距。测试：`validate-releases` PASS（95 条）、`tsc -b` 0 error、生产构建 11.9s、`verify-build` 通过；全量前端 680 用例 676 通过 / 4 失败（均为既有 Fuel 与 phase3/phase4 问题，无新增）；演示 mock 43 路由 0 残留、0 pageerror。

生产发布：push-update.ps1 退出 0，sourceDigest `1d81c97a…`，封存 1152 产物，DB 备份 `pf-20261104-225602-6eda305c.bak`（VERIFYONLY），无迁移，新 buildId `193BBDFC…`，回滚目录 `update-20261104-225602`；线上版本/公告/健康一致，`index.html` 与本地 dist 哈希一致。注意：本次备份轮转删除了 22:30 分类清理使用的 `pf-20261104-222348-a6038b0d.bak`，服务器仅保留 22:56 备份；如需回滚该分类删除需按文档重建或使用外部备份。未运行 E2E；线上登录态未人工验收。

## 2026-11-12 本地磁盘清理（无代码改动、无发布）

按数据所有者授权清理本地项目目录：删除旧备份副本（保留最新 Verified 备份与 4 份 retained 旧库）、旧部署产物、旧验证证据/构建输出/PDB/旧 releases 暂存/旧日志，并 DROP 两个仍 ONLINE 的 RestoreCheck 验证库（544MB）。项目体积 9,530.2MB → 3,510.8MB（约 −63%），C: 可用 49.0GB → 54.33GB。保留 .nuget、frontend/node_modules+.pnpm-store、backend/src/bin/Debug、deploy 当前发布包、最新备份、账单导入数据、.git、源码/文档/密钥。未改代码、未升版本、未发布；验证：本地启动依赖路径全部存在，dll 新于源码可直接启动。证据：`.local-run/cleanup-20261112/`（gitignored）。

## 2026-11-14 完全本地化：删除云端连接物、修启动器、补齐本地迁移（无发布公告）

目标：按数据所有者「与云服务器断开连接，删除与云服务器连接的文件，完全本地化」与「确保云端数据与本地一致」完成去云端化。

完成内容：① 删除根目录 `启动云端账本.bat`、`备份云端PersonalFinance.bat`、`concert-p1-restore.tmp.sh` 与 `scripts/PersonalFinance.Cloud.ps1`；`scripts/PersonalFinance.Local.ps1` 删除隐式转云分支，`-Mode Start` 一律启动本地（登录自启动任务因此不再打开云端）；② `deploy/` 由 2210 文件裁到 17（保留 15 份历史 md、`scripts/pull-cloud-to-local.ps1` 与 `阿里云连接信息.txt` 作恢复通道），删除 `.runtime`、`api.Dockerfile`、`docker-compose.prod.yml`、`nginx/`、`out/`、`tests/`、`dist/` 及其余脚本；③ 删除 `frontend/deploy/nginx.conf`、`frontend/Dockerfile`、`backend/Dockerfile`、`tools/verify-git-scope.mjs`；④ `.github/workflows/backend.yml` 去掉 “Check static publication and backup failure handling”，`frontend.yml` 去掉 `release-integrity.test.mjs`；⑤ `tools/stability-baseline.mjs` 目录/文件清单同步收缩。

数据库/API 变化：仅应用既有迁移 `20261102110000_InvestmentReturnRevision`（`finance.Users.InvestmentReturnRevision` uniqueidentifier、非空、默认 `Guid.Empty`），零接口改动。迁移前备份 `backend/.backups/PersonalFinanceWeb-before-migrate-20261114-200320.bak`（99MB，`BACKUP … WITH INIT, CHECKSUM` + `RESTORE VERIFYONLY` 通过）。

验证：`__EFMigrationsHistory` 93 → 94（max `20261102110000_InvestmentReturnRevision`）；`PersonalFinance.Local.ps1 -Mode Start -NoBrowser` 输出「Personal Finance 已就绪：http://127.0.0.1:5174/」；`/api/health` 200 `{"status":"healthy","code":"READY"}`，5174 返回 200；`backend/tests/cloud-backup-guards.ps1` 7 项通过（无数据库写入）。未运行后端/前端全量测试。

云端数据缺口：本机最新可还原云端快照为 2026-10-14 的 `PersonalFinanceWeb_Cloud_1f7b3a6f100f4aa39cb48ca880ad0fdb`（371 交易），本地 48 交易为其子集且本人数据一致；2026-10-30 的 1.99GB 备份文件已丢失，2026-10-14 之后云上数据不可恢复（详见 09）。

注意事项：`dotnet … --initialize-db` 在 MSYS bash 下必须显式传 `--environment Development --ConnectionStrings:Finance='Server=.;Database=PersonalFinanceWeb;…'`，否则报「缺少 ConnectionStrings__Finance」。Commit：无（本机无 git）。未改 `releases.json`，未发布（数据所有者决定不发公告）。


## 2026-11-14 数据库清理（数据所有者主动要求）

目标：只保留 `PersonalFinanceWeb` 一个账本库，并清空账户/交易/分录重新开始。

完成内容：① 删除库 `PersonalFinance`（旧 schema：17 交易/8 账户/33 分类/36 分录，26 表）、`PersonalFinanceDB`（5 张空表）、`PersonalBookkeeping`（1 张空表）、`PF_Audit_20261114`（临时审计还原库）；`PersonalFinanceWeb_Cloud` 与 `PersonalFinanceWeb_Cloud_1f7b3a6f100f4aa39cb48ca880ad0fdb`（371 条云端快照）由数据所有者先行在 SSMS 删除。**遗留问题**：删除前的备份脚本因中文路径经 sqlcmd 编码成乱码而失败（`无法打开备份设备 … 操作系统错误 5(拒绝访问)`），脚本未在备份失败时中止即执行 DROP，故 `PersonalFinance` 的旧 schema 数据不可恢复；今后删除前必须「备份成功且大小校验通过」才允许 DROP，备份目录用纯 ASCII 路径。② 按数据所有者选择「物理清空」，在单事务内删除 `finance.TransactionTag` 1 行、`finance.Entries` 99 行、`finance.Transactions` 48 行、`finance.Accounts` 34 行；保留 `finance.Categories` 662、`finance.Directory` 62、`finance.Documents` 2、`finance.Users` 1、`finance.AuditRecords` 26850。清空前备份 `C:\temp\pf-backup\pre-wipe-20261114.bak`（97,937,920 字节，`RESTORE VERIFYONLY … WITH CHECKSUM` 通过）。

数据库/API 变化：仅删除数据行，无 schema、无接口改动，迁移仍 94/94。踩坑：`DELETE` 报 `SET 选项的设置不正确: 'QUOTED_IDENTIFIER'`（表含筛选索引），需 `SET QUOTED_IDENTIFIER ON` 或 sqlcmd `-I`。

验证：`/api/health` 200 `{"status":"healthy","code":"READY"}`，前端 5174 返回 200。Commit：无（本机无 git）。

## 2026-11-15 导航栏重设计并本地发布（2026.11.15.1 / 6.27.0）

目标：按数据所有者「不影响功能的前提下重新设计导航栏」重做桌面端侧栏。澄清后确定：① 结构＝图标轨 + 分组详情栏；② 允许合并/重命名分组，按 7 组执行；③ 只动桌面侧栏与顶栏对齐，手机端抽屉/底部栏视觉不动；④ 沿用 `--pf-*` token 的浅色材质与细线分隔；⑤ 顶栏内容与顺序完全不变；⑥ 轨道点击切换、当前组高亮、可折叠为纯轨道。

完成内容：`frontend/src/design/navigation.ts` 分组模型由 `routes: [string,string][]` 改为 `sections: [{ key, label?, routes }]`（`settingsNavigation` 单分区），新增 `groupRoutes()` 派生 helper，`activeNavigation`/`canonicalNavigationPath` 语义与 `/admin` 特判保留；9 组归并为 7 组（总览、记账、账户与资产、薪酬与社保、预算与计划、分析与报告、AI 智能中心），原「专项财务」「时间资产管理」降级为组内节标题。`frontend/src/layouts/AppLayout.tsx` 用 `aside.sidebar.shell-sidebar`（保留 print 隐藏钩子类名）替换 `Layout.Sider`：72px `.shell-rail`（7 个 `button.rail-group[data-group]` + 底部 `/settings` + `.rail-collapse`）与 216px `.shell-panel`（`.panel-title`、`.panel-section-label`、`a.panel-link[data-path]`），折叠改由 `matchMedia('(max-width: 991px)')` 驱动，`frontend/src/design/shell.css` 与 `tokens.css` 增补轨道/面板样式并移除桌面 antd Menu 侧栏规则，`frontend/src/pages/SettingsPage.tsx` 改用 `groupRoutes`，`frontend/src/i18n/en.json` 补新分组/分区词条，手机抽屉继续用 antd Menu 仅同步组名。

验证：`tsc -b` 0 error；`vitest run src/tests/navigation.test.ts` 5/5 通过（重写断言：7 组顺序、每节非空、路由与标签唯一、别名一致性、`/settings/*` 与 `/admin` 归属、英文标签、7 个报表分析节归属）；浏览器实测（1424x805，mock 5173）轨道 72px／面板 216px／主区 margin 288px、折叠后 72px、暗色 rail rgb(20,20,22)、英文面板标题 Bookkeeping、390x844 侧栏 display:none 且底部导航不变、快捷键 e 仍打开 QuickEntry；顶栏 innerText 改造前后一致。Playwright（channel chrome）final+phase2+phase3 12 通过/4 失败，失败均为既有或环境原因（3 处首页入口漂移、1 处 4173 预览未启动），phase4 6/6。

构建与发布：`validate-releases` PASS（96 条）、生产构建 12.21s、`verify-build` 通过（productionMock:false、precache 60、220 资产）；`frontend/dist` 覆盖 `backend/src/PersonalFinance.Api/wwwroot`（旧版备份 `.local-run/web-backup-20261115-191223`），`index.html` 与 `release-info.json` SHA256 一致，当时端口 5080 的 `http://127.0.0.1:5080/release-info.json` 与 `/updates` 页面均为 2026.11.15.1 / 6.27.0。

数据库/API 变化：无（无迁移、无接口改动；无 DDL/DML 故未备份）。Commit：无（本机无 git）。

问题/下一步：① e2e 首页入口漂移 7 处未修（`transactions.spec.ts:20/60/69/81`、`phase2.spec.ts:38/60`、`phase3.spec.ts:100` 仍在 `/` 等「记支出/记收入/账户间转账/退款」，这些按钮现只挂在 `/dashboard`），数据所有者选择「仅记录」；② 本机全量 Vitest 挂起（480s 无输出、定向 5 文件 300s 超时），未定位；③ `ai-center.spec.ts:26`（空输入时发送按钮 disabled）、`:36`（`.ai-chat-history` 不存在）为既有失败。
