# 可复现候选与隔离库回归验证

验证时间：2026-10-31 02:35–02:52（Asia/Shanghai，第二轮）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`（未变化，仍未提交工作区实现）。

目的：把 10 的首项任务（P1：独立可复现候选 + 隔离库回归）从"未准备"推进到"已实测"，并记录可重跑命令、真实计数、失败项诊断与未执行范围。

## 结论摘要

| 项目 | 结果 |
|---|---|
| git 基线与 09 文档 | 一致：730 条 status 条目（157 M / 5 D / 568 ??），除 09 自述"另计"的 AGENTS.md 与 docs/ai-handover/ 外无任何路径变化 |
| 后端构建 | `dotnet build --no-restore` 两个项目均 exit 0，0 warning / 0 error |
| 隔离库迁移 | LocalDB 独立实例 `PFRestoreCheck`，随机库 `PersonalFinanceWeb_RestoreCheck_2af7c290849e45582600a025dcd7e17a`，93/93 迁移应用，139 张表（finance 138 + `dbo.__EFMigrationsHistory`） |
| 模型与迁移一致性 | `dotnet ef migrations has-pending-model-changes` → `No changes have been made to the model since the last migration.` |
| 后端全量测试 | 836 总数 / 821 通过 / 1 失败 / 14 跳过，3.75 分钟 |
| 前端公告校验 | exit 0，79 条公告，currentVersion 2026.10.31.1 |
| 前端类型检查 | `tsc -b` exit 0，9.64 秒 |
| 前端全量单测 | 94 文件 / 606 用例：605 通过 / 1 失败 / 0 跳过，808.3 秒 |
| 前端生产构建 | exit 0：dist/index.html + release-info.json（79 条、currentVersion 2026.10.31.1）+ assets 270 |
| 真实账本库 | 仅一次只读 `__EFMigrationsHistory` 查询：PersonalFinanceWeb 已应用 46 / 源码 93，未应用 47，无源码中不存在的迁移；未写入、未迁移、未初始化 |
| 工作区改动 | 会话前后 git status 条目完全一致；未修改任何源码；未提交/推送/还原/清理 |

结论：当前工作区源码可以在隔离环境中完整复现（构建、迁移、全量测试、前端产线构建均可重跑），但**不能判定为全绿**：后端 1 项日历相关失败、前端 1 项文案断言漂移，均需授权后才能处理（见下文"待决策"）。

## 环境实测

- Windows 11 26200；Node v24.20.0；本机 pnpm 12.11.2（项目声明 `packageManager: pnpm@11.19.0`）；.NET SDK 10.0.401（运行时 10.0.12）；dotnet-ef 10.0.13。
- SQL Server 2025 Express 17.0.1050.2（默认实例 `Server=.`，正式/真实账本库所在）；LocalDB 内置 17.0.4025.3，本轮新建独立实例 `PFRestoreCheck`。
- 前端依赖已存在：`node_modules/.pnpm` 549 个包目录、顶层 38 项、`.modules.yaml` 记录的 `packageManager=pnpm@11.19.0`、`layoutVersion=5`、`nodeLinker=isolated`、`pendingBuilds` 为空、lockfileVersion 9.0。**未执行任何 pnpm/npm/yarn 安装或解析命令**，前后哈希与时间戳一致。

## 为什么不用 pnpm

`pnpm` 在本机是 12.11.2，与项目声明的 11.19.0 不一致，且 pnpm 12 默认启用 `manage-package-manager-versions`；在项目目录直接调用会触发依赖重装，无 TTY 时失败为 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，并可能清空既有 `node_modules`。

本轮全部改用 node 直接入口，未安装、未改动依赖：

```powershell
cd frontend
node scripts/validate-releases.mjs
node node_modules/typescript/bin/tsc -b
node node_modules/vitest/vitest.mjs run --configLoader runner
node node_modules/vite/bin/vite.js build --configLoader runner
```

只有确实需要安装时才应先解决版本一致性（安装 pnpm 11.19.0 或改用 corepack），且必须在备份/核对依赖后执行，不能在原目录盲目 purge。

## 隔离库（可复现步骤）

真实账本库（`PersonalFinanceWeb`、`PersonalFinanceWeb_Cloud`、`PersonalFinance` 等）一律只读；回归库建在**独立 LocalDB 实例**中，从物理上不与真实实例共享数据库。复核时该实例 `sys.databases` 仅有 `master/model/msdb/tempdb` 与本次 RestoreCheck 库，**不存在任何 PersonalFinanceWeb 真实库**。

```powershell
sqllocaldb create PFRestoreCheck      # 已存在则跳过
sqllocaldb start  PFRestoreCheck
$db = 'PersonalFinanceWeb_RestoreCheck_' + (-join ((1..32) | ForEach-Object { '0123456789abcdef'[(Get-Random -Maximum 16)] }))
$inst = Join-Path $env:LOCALAPPDATA 'Microsoft\Microsoft SQL Server Local DB\Instances\PFRestoreCheck'
sqlcmd -S "(localdb)\PFRestoreCheck" -E -C -b -Q "CREATE DATABASE [$db] ON PRIMARY (NAME=N'$db', FILENAME=N'$inst\$db.mdf') LOG ON (NAME=N'${db}_log', FILENAME=N'$inst\${db}_log.ldf');"

$env:ConnectionStrings__Finance = "Server=(localdb)\PFRestoreCheck;Database=$db;Trusted_Connection=True;TrustServerCertificate=True;Encrypt=false"
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:Auth__SigningKey = ('x' * 48)          # 仅为满足设计时宿主校验的假值，不是真实密钥
$env:DataProtection__KeyPath = "$env:TEMP\pf-regression-keys"
dotnet ef database update --project backend/src/PersonalFinance.Api --no-build
dotnet ef migrations has-pending-model-changes --project backend/src/PersonalFinance.Api --no-build

$env:PF_DELETION_TEST_DATABASE = $db
$env:PF_TEST_SQL_CONNECTION_STRING = $env:ConnectionStrings__Finance
# 不设置 PF_AI_LIVE_ENABLED：真实 DeepSeek 调用默认关闭
dotnet test backend/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj --no-build `
  --logger "trx;LogFileName=backend-full.trx" --results-directory verification/current-candidate/backend
```

`IsolatedSqlTestDatabase.cs` 会同时校验库名正则 `^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$` 与连接 InitialCatalog 一致，两个环境变量缺一不可，缺省时相关 SQL 用例会 Skip（不算通过）。

迁移清单核对要点：源码 93 个迁移类 = 92 个带 `.Designer.cs` 的 `[Migration]` + 1 个主体文件自带 `[Migration]` 的 `20261010170205_PromotionRatesRecoveriesAndConfirmation`（无 Designer，属特殊但可正常应用）；隔离库 `__EFMigrationsHistory` 93 行、ProductVersion 全为 10.0.12、末尾 `20261030155832_FuelQueryIndexes`，与源码 0 缺失 / 0 多余。

## 失败项（2 项，均确定性复现，未修复）

### 1. 后端：`AiAnalysisSqlTests.FutureDatedIncomeIsExcludedAndMonthComparisonUsesTheSameElapsedTime`

- 断言位置 `backend/tests/PersonalFinance.Tests/AiAnalysisSqlTests.cs:215`，`Assert.Equal(currentDuration, previousDuration)`。
- 实测：Expected `30.02:41:54.2664245` / Actual `30.00:00:00`；单测连续重跑 2 次同样失败（只差小数秒）。
- 诊断：`Application/Ai/AiComparisonWindow.cs:9` 在"本期未结束"时把上期窗口截断到上月月末（`if (previousEnd > previousPlannedEnd) previousEnd = previousPlannedEnd;`）。2026-10-31 的本期已过时长 30d02h+ 超过 9 月真实长度 30d，于是本期时长与上期时长不相等。
- 性质：**日历/日期相关**，不是金额或幂等回归。同一用例在 2026-10-28 的历史 TRX（`verification/ai-6132/backend-full.trx`）中为 Passed；今天必然失败。产品 `basis` 文案已声明"未结束自然月按相同已过时长比较，受上月月末截断"，即当前实现符合其自述口径，**是测试断言与产品口径不一致**（断言假定两窗口时长恒等）。
- 未修复原因：改测试断言或改产品口径都属源码变更，本会话授权未覆盖，需数据所有者决定采用哪种口径。

### 2. 前端：`Fuel.test.tsx > belongs to Analysis and reports and shows full-tank denominators`

- 断言 `frontend/src/tests/Fuel.test.tsx:135` 期望文本 `/不自动创建支出/`；当前 `frontend/src/pages/FuelPage.tsx:387` 文案为"加油记录独立保存，不自动扣款；可在用车成本中关联已有交易，或明确确认后新建支出。"
- 定向 `-t` 复跑确定性失败（4.9 秒），不是超时/环境抖动，也不是本轮验证造成（会话开始后 `frontend/src` 修改文件数为 0）。
- 性质：**文案与测试断言漂移**。需确认以哪边为准（改 UI 文案从"不自动扣款"回到"不自动创建支出"，或更新测试断言），属用户可见文案/源码变更，需授权。

另注：前端全量单测耗时 808 秒，其中 `Fuel.test.tsx` 单文件 278 秒，测试时长本身偏高，属可优化项但不是本次失败原因。

## 真实账本库（只读核对，未写）

| 项目 | 数值 |
|---|---|
| 查询 | `SELECT MigrationId, ProductVersion FROM [PersonalFinanceWeb].[dbo].[__EFMigrationsHistory]`（仅此一次，只读） |
| 已应用迁移 | 46 |
| 源码迁移 | 93 |
| 未应用迁移 | 47（首条 `20261014110753_AiCenterReports`，末条已应用 `20261013120504_AiRequestConsentAudit`） |
| 源码中不存在的已应用迁移 | 0 |
| 表/数据/备份 | 未读取；未执行任何迁移、初始化、修复、备份或覆盖 |

含义：**当前源码不能直接连这个库正常运行**（缺 47 个迁移对应的表/列）。要上线必须先备份、在隔离恢复库演练、再经明确授权在维护窗口应用迁移；本会话没有授权，未做任何应用。生产实际连哪个库仍需结合部署配置确认（本机另有 `PersonalFinanceWeb_Cloud` 等库，均未触碰）。

注意 `Program.cs` 的 `--initialize-db` 仅校验库名前缀以 `PersonalFinanceWeb` 开头（会放行 `PersonalFinanceWeb_Cloud`），因此绝不能在疑似正式库上误用该参数。

## 精度与模型一致性（回应 11 的 P2 疑点）

11 号文档记有疑点："FinanceDb 的前段精度配置可能被后段通用 decimal 循环覆盖"。本轮实测：

- `FinanceDb.cs:627-644` 的循环确实对**所有** decimal 属性后置设置 `precision 28, scale 4`（属性名含 `Rate` 则为 28,8），因此写在循环之前的具体精度（如 `FuelRecord.Litres` 18,3）会被覆盖；写在循环之后（`:645-657`）的会生效。
- 隔离库 `INFORMATION_SCHEMA.COLUMNS` 抽查：`finance.FuelRecord` 的 Amount/Discount/EnteredUnitPrice/Litres/Odometer/OriginalAmount/PointsRedemption/PostedUnitPrice 全为 `decimal(28,4)`；`InvestmentTrade.Amount/Commission/OtherFee/Tax` 为 (28,4)、`Price/Quantity` 为 (28,8)；`AiUsageRecord.EstimatedCost/ReservedCost` 为 (20,10)。与 `FinanceDbModelSnapshot.cs`（143 处 HasPrecision：28,4×122；28,8×19；20,10×2）一致。
- `has-pending-model-changes` 无变更 → 当前模型、快照、迁移链自洽，未发现精度漂移导致的挂起迁移。

结论：疑点**部分成立但不构成数据风险**——前的 18,3/5,4 声明是死配置（实际生效 28,4），存储精度只会更宽不会截断；模型与库无漂移，因此本轮**不修改**模型或迁移。若后续要收紧精度，必须先备份、在隔离恢复库验证、经授权才可改模型并新增迁移。

## 未执行（明确区分，不算通过）

- 真实 DeepSeek 调用（14 项 `AiLiveTests` 按设计 Skip；`PF_AI_LIVE_ENABLED` 未启用）。
- 前端 ESLint、Playwright E2E / integration 浏览器回归。
- `backend/tests` 下旧 `.mjs` / `.ps1` 阶段脚本套件（含百万数据、性能、恢复演练脚本）。
- 后端生产发布构建、`--initialize-db`、任何迁移到真实库的操作。
- 生产/云端环境、真实备份恢复演练。
- 后端真实 HTTP 端到端（未启动 API 服务）。

## 证据位置

本轮证据写入 `verification/current-candidate/`（`.gitignore` 已忽略 `verification/`，**不会被提交**，克隆后需按本文重跑）：

- `baseline-git-status.txt`、`baseline-head.txt`、`baseline-diffstat.txt`：会话开始时的 git 基线快照。
- `backend/`：`environment.json`、`summary.json`、`build.log`、`migration.log`、`backend-full.log`、`backend-full.trx`、`pending-model-changes.log`、`real-db-migrations-readonly.log`、`real-db-migration-diff.txt`、`failure-rerun.log`、`reproduce.ps1`。
- `frontend/`：`01`–`05b` 各 `.log`、`04-vitest-full.log`、`04c-failure-detail.log`、`summary.json`、`summary.md`、`check-dist.mjs`。
- `audit/audit-report.md`：09 基线逐条比对 + 10 中 P2 十二项源码核对 + 百万工具清单。

隔离库与 LocalDB 实例保留以便复核；仅可删除本次自建对象（`PersonalFinanceWeb_RestoreCheck_2af7...`、实例 `PFRestoreCheck`），不得动真实库。

## 待决策（需数据所有者授权）

1. 后端日历相关失败：采用"测试断言按产品口径修正（断言两窗口时长仅在未截断时相等）"，还是修改产品窗口口径？
2. 前端 Fuel 文案：以哪边为准（UI 文案 vs 测试期望）？
3. 真实库 47 个待应用迁移：是否安排维护窗口（备份 → 隔离恢复库演练 → 授权后应用）？
4. 10 中 P2 十二项（0 已实现 / 4 部分实现 / 8 未实现）是否授权其中某几项继续开发。

## 未验证事项

本次验证只覆盖上述命令与环境；生产、云端、备份恢复、外部 AI、E2E 浏览器与百万/性能数字均未验证。`verification/` 与会话内其它未跟踪日志不属可提交源码。
