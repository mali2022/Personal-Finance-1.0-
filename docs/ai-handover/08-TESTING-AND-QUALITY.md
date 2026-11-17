# 测试和质量

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：测试和质量。

## 本次结果（2026-11-18，1.0 精简发布）

本轮只动版本号、公告目录、文档与静态站点，没有改业务代码；下面每一项都是实际执行过并看到输出的。

| 检查 | 命令 | 结果 |
|---|---|---|
| 公告校验 | `node scripts/validate-releases.mjs` | exit 0，输出 `{"version":"2026.11.18.1","releases":1}` |
| 公告组件测试 | `vitest run src/tests/Releases.test.tsx` | 10 passed |
| 构建契约 | `node scripts/verify-build.mjs` | exit 0；pwaPolicyVerified true、precacheResources 61、totalAssets 221 |
| 生产构建 | `vite build` | exit 0 |
| 静态站点冒烟 | 对同步后的 wwwroot 起本地静态服务 | `/` 200、`/updates` 200、`/release-info.json` = 2026.11.18.1 |
| 界面取证 | 1440x900 前后截图 | 页脚由 6.30.1 / 2026.11.17.2 变为 1.0.0 / 2026.11.18.1，无频道词；新 1.0 公告正常渲染 |

**前端全量 vitest 已跑完**：`node node_modules/vitest/vitest.mjs run --configLoader runner --reporter=dot` → 106 文件 / 717 用例：711 通过 / 6 失败 / 0 跳过，1104.93 秒。6 项失败分布在 5 个文件：`Concerts.test.tsx`（路由分组断言期望 `special`、实际 `bookkeeping`）、`Fuel.test.tsx` 2 项（`/不自动创建支出/` 文案与归档用例）、`LoanSchedules.test.tsx` 1 项、`phase3.test.ts` 1 项（`10001n` vs `0n`）、`phase4.test.ts:333`（`3000n` vs `0n`）。把这 5 个文件在原项目 `个人记账/frontend` 重跑，得到完全相同的 6 项失败（6 failed / 65 passed），因此是本轮之前就存在的红灯，不是 1.0 精简引入的。

**本轮未执行的检查**：ASP.NET 后端没有连真实库启动（AI 调度器会轮询生产库，按约定不动），登录、API 与端到端流程在本副本仍未验证；Playwright E2E、真实 AI 用例（14 项 `AiLiveTests` 按设计 Skip）、备份与恢复演练、生产发布也都未做。后端 836 例仍是 2026-10-31 的记录（本轮未重跑后端测试）；前端全量已在本轮重跑，见上一段。

**索引已同步**：一次性脚本清理删除了 37 个 `playwright.*.config.ts` 与 144 个 `backend/tests` 下的一次性脚本，下方「测试文件索引」已移除 6 条指向已删 `backend/tests/*.ps1` 的条目；这些脚本均未被 CI 工作流引用，删除不影响 `.github/workflows` 的既有检查。

## 上一轮结果（2026-10-31 第二轮，隔离库实测）

完整证据、失败诊断和可重跑命令见 [16-CANDIDATE-VERIFICATION-20261031.md](16-CANDIDATE-VERIFICATION-20261031.md)；证据文件在 `verification/current-candidate/`（gitignored）。

|检查|结果|耗时/限制|
|---|---|---|
|后端构建（Api + Tests，--no-restore）|0 error / 0 warning|0.69 s / 0.87 s|
|隔离库迁移|93/93 迁移应用，139 表；`has-pending-model-changes` 无变更|12.03 s / 2.99 s|
|后端全量 `dotnet test`|**836 总数 / 821 通过 / 1 失败 / 14 跳过**|3.75 分钟|
|前端公告 `validate-releases.mjs`|通过，79 条，2026.10.31.1|48 ms|
|前端 `tsc -b`|通过，0 输出|9.64 s|
|前端全量 Vitest|**606 总数 / 605 通过 / 1 失败 / 0 跳过**（94 文件）|808 s|
|前端生产构建|通过（dist + release-info.json，79 条）|~10.6 s（vite）|
|真实库只读迁移历史|PersonalFinanceWeb 46/93，未应用 47，无多余|只读一条 SELECT|

失败 1+1（确定性、日历/文案相关、均未修复，属源码变更需授权）：后端 `AiAnalysisSqlTests.cs:215`（`AiComparisonWindow.cs:9` 上期窗口截断，2026-10-31 必现，10-28 基线为 Passed）；前端 `Fuel.test.tsx:135` 期望"不自动创建支出"，`FuelPage.tsx:387` 现文案为"不自动扣款"。跳过的 14 项全部是 `AiLiveTests`（`PF_AI_LIVE_ENABLED` 未启用），没有任何用例因缺 `PF_*` 环境变量而 Skip。

未执行：真实 AI、前端 ESLint、Playwright E2E/integration、后端真实 HTTP、`backend/tests` 下旧 `.mjs`/`.ps1` 阶段套件、生产构建发布与迁移、备份恢复演练。上一轮（同日早些时候）的记录仅作历史：公告校验通过、Releases 10 项、PlanningMath 11 项；那轮 `pnpm exec vitest` 因依赖重装被无 TTY 保护拒绝，本轮已改用 node 入口规避。

## 测试入口

后端xUnit：backend/tests/PersonalFinance.Tests，dotnet test <该目录csproj>。SQL测试使用PF_DELETION_TEST_DATABASE及PF_TEST_SQL_CONNECTION_STRING，必须先读IsolatedSqlTestDatabase.cs核对随机RestoreCheck名称（`^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$`）与连接 InitialCatalog 一致；未设置时部分用例Skip，不算通过。真实AI由PF_AI_LIVE_ENABLED显式启用，本次不调用。

隔离库做法（本轮沿用，推荐）：建独立 LocalDB 实例（`sqllocaldb create PFRestoreCheck`）而不是复用真实 `Server=.` 实例；`ConnectionStrings__Finance` 指向该实例的随机 RestoreCheck 库后 `dotnet ef database update --no-build`，再设置两个 PF_* 变量跑测试。命令全文见 16；`Program.cs` 的 `--initialize-db` 会迁移并写种子，只在明确授权的隔离库使用。

前端不要用 `pnpm`：本机 pnpm 12.11.2 与声明 11.19.0 不一致，调用会触发依赖重装（无 TTY 时为 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`）。用 `node node_modules/vitest/vitest.mjs run --configLoader runner`、`node node_modules/typescript/bin/tsc -b`、`node node_modules/vite/bin/vite.js build --configLoader runner` 直接入口，验证前后对比 `node_modules/.pnpm` 数量与 lockfile 哈希可证明未安装。Vitest 为 jsdom/MSW、vitest.config.ts 单 worker、30 秒超时，全量约 13 分钟。E2E：frontend/e2e，真实 API 模式先读 playwright 配置和 seed 行为；本轮未执行。

性能工具tools/million-*、isolated-load、reconciliation-performance等需要合成隔离库，不在本次创建百万数据。

历史人生模拟续作报告记载611/611后端、496前端及百万关键词8并发P95约8.6–9.2秒；与当前源码不同，不能作为本次通过或SLA。条件与候选指纹见原报告。未逐一重现全部历史基线。

最低回归：改金额/投资跑数学及SQL一致性；改交易/导入/对账跑幂等、退款、撤回与余额；改AI跑授权、跨用户、撤权、工具输出；改UI跑对应组件及关键API浏览器链。通过后不重复无关全套。

## 测试文件索引

[backend/tests/PersonalFinance.Tests/AdministrationSupportTests.cs](<../../backend/tests/PersonalFinance.Tests/AdministrationSupportTests.cs>)

[backend/tests/PersonalFinance.Tests/AiAgentTests.cs](<../../backend/tests/PersonalFinance.Tests/AiAgentTests.cs>)

[backend/tests/PersonalFinance.Tests/AiAnalysisSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/AiAnalysisSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/AiAnalysisTests.cs](<../../backend/tests/PersonalFinance.Tests/AiAnalysisTests.cs>)

[backend/tests/PersonalFinance.Tests/AiLiveTests.cs](<../../backend/tests/PersonalFinance.Tests/AiLiveTests.cs>)

[backend/tests/PersonalFinance.Tests/AiPhase1HttpTests.cs](<../../backend/tests/PersonalFinance.Tests/AiPhase1HttpTests.cs>)

[backend/tests/PersonalFinance.Tests/AiPhase1PerformanceTests.cs](<../../backend/tests/PersonalFinance.Tests/AiPhase1PerformanceTests.cs>)

[backend/tests/PersonalFinance.Tests/AiPhase1Tests.cs](<../../backend/tests/PersonalFinance.Tests/AiPhase1Tests.cs>)

[backend/tests/PersonalFinance.Tests/AiSafetyTests.cs](<../../backend/tests/PersonalFinance.Tests/AiSafetyTests.cs>)

[backend/tests/PersonalFinance.Tests/AiSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/AiSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/AiStreamingToolsTests.cs](<../../backend/tests/PersonalFinance.Tests/AiStreamingToolsTests.cs>)

[backend/tests/PersonalFinance.Tests/AiUnifiedAcceptanceSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/AiUnifiedAcceptanceSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/AiUnrestrictedTests.cs](<../../backend/tests/PersonalFinance.Tests/AiUnrestrictedTests.cs>)

[backend/tests/PersonalFinance.Tests/AuditAiQueryRegressionTests.cs](<../../backend/tests/PersonalFinance.Tests/AuditAiQueryRegressionTests.cs>)

[backend/tests/PersonalFinance.Tests/AuditFinanceRulesTests.cs](<../../backend/tests/PersonalFinance.Tests/AuditFinanceRulesTests.cs>)

[backend/tests/PersonalFinance.Tests/AuditFinanceSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/AuditFinanceSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/BatchProtectionTests.cs](<../../backend/tests/PersonalFinance.Tests/BatchProtectionTests.cs>)

[backend/tests/PersonalFinance.Tests/CashFlowMathTests.cs](<../../backend/tests/PersonalFinance.Tests/CashFlowMathTests.cs>)

[backend/tests/PersonalFinance.Tests/CategoryStatisticsTests.cs](<../../backend/tests/PersonalFinance.Tests/CategoryStatisticsTests.cs>)

[backend/tests/PersonalFinance.Tests/CollaborationHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/CollaborationHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/CollaborationTests.cs](<../../backend/tests/PersonalFinance.Tests/CollaborationTests.cs>)

[backend/tests/PersonalFinance.Tests/ConcertInterestHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/ConcertInterestHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/ConcertTests.cs](<../../backend/tests/PersonalFinance.Tests/ConcertTests.cs>)

[backend/tests/PersonalFinance.Tests/CreditStatementWindowTests.cs](<../../backend/tests/PersonalFinance.Tests/CreditStatementWindowTests.cs>)

[backend/tests/PersonalFinance.Tests/CurrencyWorkflowTests.cs](<../../backend/tests/PersonalFinance.Tests/CurrencyWorkflowTests.cs>)

[backend/tests/PersonalFinance.Tests/DashboardValuationReuseSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/DashboardValuationReuseSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/DebtOrderTests.cs](<../../backend/tests/PersonalFinance.Tests/DebtOrderTests.cs>)

[backend/tests/PersonalFinance.Tests/DebtScheduleTests.cs](<../../backend/tests/PersonalFinance.Tests/DebtScheduleTests.cs>)

[backend/tests/PersonalFinance.Tests/DefaultProductPricesTests.cs](<../../backend/tests/PersonalFinance.Tests/DefaultProductPricesTests.cs>)

[backend/tests/PersonalFinance.Tests/DefaultTagsTests.cs](<../../backend/tests/PersonalFinance.Tests/DefaultTagsTests.cs>)

[backend/tests/PersonalFinance.Tests/DeletionSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/DeletionSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/EntryWorkflowSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/EntryWorkflowSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/ExpensePaymentAllocationTests.cs](<../../backend/tests/PersonalFinance.Tests/ExpensePaymentAllocationTests.cs>)

[backend/tests/PersonalFinance.Tests/ExpenseProductNameTests.cs](<../../backend/tests/PersonalFinance.Tests/ExpenseProductNameTests.cs>)

[backend/tests/PersonalFinance.Tests/FestivalFinancialTests.cs](<../../backend/tests/PersonalFinance.Tests/FestivalFinancialTests.cs>)

[backend/tests/PersonalFinance.Tests/FestivalPerformanceTests.cs](<../../backend/tests/PersonalFinance.Tests/FestivalPerformanceTests.cs>)

[backend/tests/PersonalFinance.Tests/FestivalTests.cs](<../../backend/tests/PersonalFinance.Tests/FestivalTests.cs>)

[backend/tests/PersonalFinance.Tests/FinanceRulesTests.cs](<../../backend/tests/PersonalFinance.Tests/FinanceRulesTests.cs>)

[backend/tests/PersonalFinance.Tests/FinanceSqlCollection.cs](<../../backend/tests/PersonalFinance.Tests/FinanceSqlCollection.cs>)

[backend/tests/PersonalFinance.Tests/FinancialConsistency20Tests.cs](<../../backend/tests/PersonalFinance.Tests/FinancialConsistency20Tests.cs>)

[backend/tests/PersonalFinance.Tests/FinancialConsistencyPerformanceTests.cs](<../../backend/tests/PersonalFinance.Tests/FinancialConsistencyPerformanceTests.cs>)

[backend/tests/PersonalFinance.Tests/FinancialMemoryHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/FinancialMemoryHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/FinancialMemoryTests.cs](<../../backend/tests/PersonalFinance.Tests/FinancialMemoryTests.cs>)

[backend/tests/PersonalFinance.Tests/FinancialReportToolsTests.cs](<../../backend/tests/PersonalFinance.Tests/FinancialReportToolsTests.cs>)

[backend/tests/PersonalFinance.Tests/FinancialReviewTests.cs](<../../backend/tests/PersonalFinance.Tests/FinancialReviewTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelBulkTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelBulkTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelChronologyTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelChronologyTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelEconomyTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelEconomyTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelImportTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelImportTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelInsightsTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelInsightsTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelIntervalAnalysisTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelIntervalAnalysisTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelMathV2Tests.cs](<../../backend/tests/PersonalFinance.Tests/FuelMathV2Tests.cs>)

[backend/tests/PersonalFinance.Tests/FuelPeriodComparisonTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelPeriodComparisonTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelPriceAnalysisTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelPriceAnalysisTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelQualityTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelQualityTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelReceiptFactsTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelReceiptFactsTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelReceiptTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelReceiptTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelStationTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelStationTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelStrategyTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelStrategyTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelTests.cs>)

[backend/tests/PersonalFinance.Tests/FuelVehicleRulesTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelVehicleRulesTests.cs>)

[backend/tests/PersonalFinance.Tests/ImportCleaningIntegrationTests.cs](<../../backend/tests/PersonalFinance.Tests/ImportCleaningIntegrationTests.cs>)

[backend/tests/PersonalFinance.Tests/ImportIdentityTests.cs](<../../backend/tests/PersonalFinance.Tests/ImportIdentityTests.cs>)

[backend/tests/PersonalFinance.Tests/ImportProjectionTests.cs](<../../backend/tests/PersonalFinance.Tests/ImportProjectionTests.cs>)

[backend/tests/PersonalFinance.Tests/InterestAccountingTests.cs](<../../backend/tests/PersonalFinance.Tests/InterestAccountingTests.cs>)

[backend/tests/PersonalFinance.Tests/InvestmentTests.cs](<../../backend/tests/PersonalFinance.Tests/InvestmentTests.cs>)

[backend/tests/PersonalFinance.Tests/InvitationAccessTests.cs](<../../backend/tests/PersonalFinance.Tests/InvitationAccessTests.cs>)

[backend/tests/PersonalFinance.Tests/IsolatedSqlTestDatabase.cs](<../../backend/tests/PersonalFinance.Tests/IsolatedSqlTestDatabase.cs>)

[backend/tests/PersonalFinance.Tests/KeywordSearchSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/KeywordSearchSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/LedgerAnomalyEquivalenceTests.cs](<../../backend/tests/PersonalFinance.Tests/LedgerAnomalyEquivalenceTests.cs>)

[backend/tests/PersonalFinance.Tests/LifeRetirementTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeRetirementTests.cs>)

[backend/tests/PersonalFinance.Tests/LifeSimulationHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeSimulationHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/LifeSimulationPrivacyTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeSimulationPrivacyTests.cs>)

[backend/tests/PersonalFinance.Tests/LifeSimulationRiskTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeSimulationRiskTests.cs>)

[backend/tests/PersonalFinance.Tests/LifeSimulationTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeSimulationTests.cs>)

[backend/tests/PersonalFinance.Tests/LiveFxTests.cs](<../../backend/tests/PersonalFinance.Tests/LiveFxTests.cs>)

[backend/tests/PersonalFinance.Tests/LoanScheduleHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/LoanScheduleHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/LoanScheduleTests.cs](<../../backend/tests/PersonalFinance.Tests/LoanScheduleTests.cs>)

[backend/tests/PersonalFinance.Tests/MerchantAnomalySqlTests.cs](<../../backend/tests/PersonalFinance.Tests/MerchantAnomalySqlTests.cs>)

[backend/tests/PersonalFinance.Tests/PayrollCenterTests.cs](<../../backend/tests/PersonalFinance.Tests/PayrollCenterTests.cs>)

[backend/tests/PersonalFinance.Tests/PeriodReviewReuseSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/PeriodReviewReuseSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/PhysicalAssetHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/PhysicalAssetHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/PhysicalAssetTests.cs](<../../backend/tests/PersonalFinance.Tests/PhysicalAssetTests.cs>)

[backend/tests/PersonalFinance.Tests/PlanningMathTests.cs](<../../backend/tests/PersonalFinance.Tests/PlanningMathTests.cs>)

[backend/tests/PersonalFinance.Tests/ProfileAvatarTests.cs](<../../backend/tests/PersonalFinance.Tests/ProfileAvatarTests.cs>)

[backend/tests/PersonalFinance.Tests/ProfileSecurityTests.cs](<../../backend/tests/PersonalFinance.Tests/ProfileSecurityTests.cs>)

[backend/tests/PersonalFinance.Tests/ProfileSessionSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/ProfileSessionSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/PromotionMathTests.cs](<../../backend/tests/PersonalFinance.Tests/PromotionMathTests.cs>)

[backend/tests/PersonalFinance.Tests/RecurringScheduleTests.cs](<../../backend/tests/PersonalFinance.Tests/RecurringScheduleTests.cs>)

[backend/tests/PersonalFinance.Tests/ReportPeriodTests.cs](<../../backend/tests/PersonalFinance.Tests/ReportPeriodTests.cs>)

[backend/tests/PersonalFinance.Tests/ReportTerminalBoundaryTests.cs](<../../backend/tests/PersonalFinance.Tests/ReportTerminalBoundaryTests.cs>)

[backend/tests/PersonalFinance.Tests/RequestShapeTests.cs](<../../backend/tests/PersonalFinance.Tests/RequestShapeTests.cs>)

[backend/tests/PersonalFinance.Tests/RunningBalanceRangeSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/RunningBalanceRangeSqlTests.cs>)

[backend/tests/PersonalFinance.Tests/RuntimeHealthTests.cs](<../../backend/tests/PersonalFinance.Tests/RuntimeHealthTests.cs>)

[backend/tests/PersonalFinance.Tests/SmartReconciliationHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/SmartReconciliationHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/SmartReconciliationTests.cs](<../../backend/tests/PersonalFinance.Tests/SmartReconciliationTests.cs>)

[backend/tests/PersonalFinance.Tests/SnapshotReadHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/SnapshotReadHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingApprovalConstraintTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalConstraintTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingApprovalInstallmentTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalInstallmentTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingApprovalPersistenceTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalPersistenceTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingApprovalRulesTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalRulesTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingApprovalSchemaTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalSchemaTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingIntelligenceHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingIntelligenceHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingOptimizerTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingOptimizerTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingValueHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingValueHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/SpendingValueMathTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingValueMathTests.cs>)

[backend/tests/PersonalFinance.Tests/StabilityHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/StabilityHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/StageGRulesTests.cs](<../../backend/tests/PersonalFinance.Tests/StageGRulesTests.cs>)

[backend/tests/PersonalFinance.Tests/StandardImportTests.cs](<../../backend/tests/PersonalFinance.Tests/StandardImportTests.cs>)

[backend/tests/PersonalFinance.Tests/StatisticsManagementHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/StatisticsManagementHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/StatisticsManagementTests.cs](<../../backend/tests/PersonalFinance.Tests/StatisticsManagementTests.cs>)

[backend/tests/PersonalFinance.Tests/StatisticsPolicyTests.cs](<../../backend/tests/PersonalFinance.Tests/StatisticsPolicyTests.cs>)

[backend/tests/PersonalFinance.Tests/TimeAssetsTests.cs](<../../backend/tests/PersonalFinance.Tests/TimeAssetsTests.cs>)

[backend/tests/PersonalFinance.Tests/TransactionKeywordFlightTests.cs](<../../backend/tests/PersonalFinance.Tests/TransactionKeywordFlightTests.cs>)

[backend/tests/PersonalFinance.Tests/TransactionWorkspaceHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/TransactionWorkspaceHttpTests.cs>)

[backend/tests/PersonalFinance.Tests/TransactionWorkspaceTests.cs](<../../backend/tests/PersonalFinance.Tests/TransactionWorkspaceTests.cs>)

[backend/tests/PersonalFinance.Tests/TransferImportTests.cs](<../../backend/tests/PersonalFinance.Tests/TransferImportTests.cs>)

[backend/tests/PersonalFinance.Tests/VehicleCostRulesTests.cs](<../../backend/tests/PersonalFinance.Tests/VehicleCostRulesTests.cs>)

[backend/tests/PersonalFinance.Tests/VehicleDistanceCostTests.cs](<../../backend/tests/PersonalFinance.Tests/VehicleDistanceCostTests.cs>)

[backend/tests/PersonalFinance.Tests/VehiclePlanningTests.cs](<../../backend/tests/PersonalFinance.Tests/VehiclePlanningTests.cs>)

[frontend/e2e/ai-center.spec.ts](<../../frontend/e2e/ai-center.spec.ts>)

[frontend/e2e/ai-phase1.spec.ts](<../../frontend/e2e/ai-phase1.spec.ts>)

[frontend/e2e/final.spec.ts](<../../frontend/e2e/final.spec.ts>)

[frontend/e2e/fixtures.ts](<../../frontend/e2e/fixtures.ts>)

[frontend/e2e/fuel.spec.ts](<../../frontend/e2e/fuel.spec.ts>)

[frontend/e2e/global-copilot.spec.ts](<../../frontend/e2e/global-copilot.spec.ts>)

[frontend/e2e/on-this-day.spec.ts](<../../frontend/e2e/on-this-day.spec.ts>)

[frontend/e2e/phase2.spec.ts](<../../frontend/e2e/phase2.spec.ts>)

[frontend/e2e/phase3.spec.ts](<../../frontend/e2e/phase3.spec.ts>)

[frontend/e2e/phase4.spec.ts](<../../frontend/e2e/phase4.spec.ts>)

[frontend/e2e/pwa.spec.ts](<../../frontend/e2e/pwa.spec.ts>)

[frontend/e2e/transactions.spec.ts](<../../frontend/e2e/transactions.spec.ts>)

[frontend/src/tests/account-management.test.ts](<../../frontend/src/tests/account-management.test.ts>)

[frontend/src/tests/AiAnalysisView.test.tsx](<../../frontend/src/tests/AiAnalysisView.test.tsx>)

[frontend/src/tests/AiConversationPrivacy.test.tsx](<../../frontend/src/tests/AiConversationPrivacy.test.tsx>)

[frontend/src/tests/aiOperationJournal.test.ts](<../../frontend/src/tests/aiOperationJournal.test.ts>)

[frontend/src/tests/AiOverview.test.tsx](<../../frontend/src/tests/AiOverview.test.tsx>)

[frontend/src/tests/AiPage.test.tsx](<../../frontend/src/tests/AiPage.test.tsx>)

[frontend/src/tests/api.test.ts](<../../frontend/src/tests/api.test.ts>)

[frontend/src/tests/BudgetsPage.test.tsx](<../../frontend/src/tests/BudgetsPage.test.tsx>)

[frontend/src/tests/CategoriesHierarchy.test.tsx](<../../frontend/src/tests/CategoriesHierarchy.test.tsx>)

[frontend/src/tests/categoryProtection.test.ts](<../../frontend/src/tests/categoryProtection.test.ts>)

[frontend/src/tests/CategorySelector.test.tsx](<../../frontend/src/tests/CategorySelector.test.tsx>)

[frontend/src/tests/Collaboration.test.tsx](<../../frontend/src/tests/Collaboration.test.tsx>)

[frontend/src/tests/ConcertInterests.test.tsx](<../../frontend/src/tests/ConcertInterests.test.tsx>)

[frontend/src/tests/Concerts.test.tsx](<../../frontend/src/tests/Concerts.test.tsx>)

[frontend/src/tests/copilotContext.test.ts](<../../frontend/src/tests/copilotContext.test.ts>)

[frontend/src/tests/currencies.test.tsx](<../../frontend/src/tests/currencies.test.tsx>)

[frontend/src/tests/currencySettings.test.tsx](<../../frontend/src/tests/currencySettings.test.tsx>)

[frontend/src/tests/DashboardLayout.test.tsx](<../../frontend/src/tests/DashboardLayout.test.tsx>)

[frontend/src/tests/DashboardSummary.test.tsx](<../../frontend/src/tests/DashboardSummary.test.tsx>)

[frontend/src/tests/DirectoryDeleteDialog.test.tsx](<../../frontend/src/tests/DirectoryDeleteDialog.test.tsx>)

[frontend/src/tests/EntryWorkflow.test.tsx](<../../frontend/src/tests/EntryWorkflow.test.tsx>)

[frontend/src/tests/ExportPanel.test.tsx](<../../frontend/src/tests/ExportPanel.test.tsx>)

[frontend/src/tests/Feedback.test.tsx](<../../frontend/src/tests/Feedback.test.tsx>)

[frontend/src/tests/Festivals.test.ts](<../../frontend/src/tests/Festivals.test.ts>)

[frontend/src/tests/final.test.ts](<../../frontend/src/tests/final.test.ts>)

[frontend/src/tests/finance.test.tsx](<../../frontend/src/tests/finance.test.tsx>)

[frontend/src/tests/FinancialInsights.test.tsx](<../../frontend/src/tests/FinancialInsights.test.tsx>)

[frontend/src/tests/FinancialReportAi.test.tsx](<../../frontend/src/tests/FinancialReportAi.test.tsx>)

[frontend/src/tests/FinancialReportExport.test.ts](<../../frontend/src/tests/FinancialReportExport.test.ts>)

[frontend/src/tests/FinancialReports.test.tsx](<../../frontend/src/tests/FinancialReports.test.tsx>)

[frontend/src/tests/Fuel.test.tsx](<../../frontend/src/tests/Fuel.test.tsx>)

[frontend/src/tests/FuelAiPanel.test.tsx](<../../frontend/src/tests/FuelAiPanel.test.tsx>)

[frontend/src/tests/FuelBulkActions.test.tsx](<../../frontend/src/tests/FuelBulkActions.test.tsx>)

[frontend/src/tests/fuelCalculation.test.ts](<../../frontend/src/tests/fuelCalculation.test.ts>)

[frontend/src/tests/fuelImport.test.ts](<../../frontend/src/tests/fuelImport.test.ts>)

[frontend/src/tests/FuelImportDialog.test.tsx](<../../frontend/src/tests/FuelImportDialog.test.tsx>)

[frontend/src/tests/FuelOverviewPanel.test.tsx](<../../frontend/src/tests/FuelOverviewPanel.test.tsx>)

[frontend/src/tests/FuelPricesPanel.test.tsx](<../../frontend/src/tests/FuelPricesPanel.test.tsx>)

[frontend/src/tests/FuelQualityPanel.test.tsx](<../../frontend/src/tests/FuelQualityPanel.test.tsx>)

[frontend/src/tests/FuelReceiptFields.test.tsx](<../../frontend/src/tests/FuelReceiptFields.test.tsx>)

[frontend/src/tests/FuelReceipts.test.ts](<../../frontend/src/tests/FuelReceipts.test.ts>)

[frontend/src/tests/fuelRecords.test.ts](<../../frontend/src/tests/fuelRecords.test.ts>)

[frontend/src/tests/FuelStationsPanel.test.tsx](<../../frontend/src/tests/FuelStationsPanel.test.tsx>)

[frontend/src/tests/FuelStrategyPanel.test.tsx](<../../frontend/src/tests/FuelStrategyPanel.test.tsx>)

[frontend/src/tests/FuelTrashPanel.test.tsx](<../../frontend/src/tests/FuelTrashPanel.test.tsx>)

[frontend/src/tests/fuelWorkspace.test.ts](<../../frontend/src/tests/fuelWorkspace.test.ts>)

[frontend/src/tests/i18n.test.ts](<../../frontend/src/tests/i18n.test.ts>)

[frontend/src/tests/importCleaning412.test.tsx](<../../frontend/src/tests/importCleaning412.test.tsx>)

[frontend/src/tests/importMapping412.test.ts](<../../frontend/src/tests/importMapping412.test.ts>)

[frontend/src/tests/LifeRetirement.test.tsx](<../../frontend/src/tests/LifeRetirement.test.tsx>)

[frontend/src/tests/LifeSimulationJournal.test.ts](<../../frontend/src/tests/LifeSimulationJournal.test.ts>)

[frontend/src/tests/LifeSimulator.test.tsx](<../../frontend/src/tests/LifeSimulator.test.tsx>)

[frontend/src/tests/LoanSchedules.test.tsx](<../../frontend/src/tests/LoanSchedules.test.tsx>)

[frontend/src/tests/MerchantSelector.test.tsx](<../../frontend/src/tests/MerchantSelector.test.tsx>)

[frontend/src/tests/MobileControls.test.tsx](<../../frontend/src/tests/MobileControls.test.tsx>)

[frontend/src/tests/MultiPayment.test.tsx](<../../frontend/src/tests/MultiPayment.test.tsx>)

[frontend/src/tests/navigation.test.ts](<../../frontend/src/tests/navigation.test.ts>)

[frontend/src/tests/operationJournal.test.ts](<../../frontend/src/tests/operationJournal.test.ts>)

[frontend/src/tests/PayrollCenter.test.tsx](<../../frontend/src/tests/PayrollCenter.test.tsx>)

[frontend/src/tests/payrollDelete.test.tsx](<../../frontend/src/tests/payrollDelete.test.tsx>)

[frontend/src/tests/phase2.test.ts](<../../frontend/src/tests/phase2.test.ts>)

[frontend/src/tests/phase3.test.ts](<../../frontend/src/tests/phase3.test.ts>)

[frontend/src/tests/phase4.test.ts](<../../frontend/src/tests/phase4.test.ts>)

[frontend/src/tests/PhysicalAssets.test.tsx](<../../frontend/src/tests/PhysicalAssets.test.tsx>)

[frontend/src/tests/PhysicalJournal.test.ts](<../../frontend/src/tests/PhysicalJournal.test.ts>)

[frontend/src/tests/ProfileRegistration.test.tsx](<../../frontend/src/tests/ProfileRegistration.test.tsx>)

[frontend/src/tests/Releases.test.tsx](<../../frontend/src/tests/Releases.test.tsx>)

[frontend/src/tests/ReportAnalysisPage.test.tsx](<../../frontend/src/tests/ReportAnalysisPage.test.tsx>)

[frontend/src/tests/savedViews.test.ts](<../../frontend/src/tests/savedViews.test.ts>)

[frontend/src/tests/session.test.ts](<../../frontend/src/tests/session.test.ts>)

[frontend/src/tests/setup.ts](<../../frontend/src/tests/setup.ts>)

[frontend/src/tests/SmartReconciliation.test.tsx](<../../frontend/src/tests/SmartReconciliation.test.tsx>)

[frontend/src/tests/SpendingApprovals.test.tsx](<../../frontend/src/tests/SpendingApprovals.test.tsx>)

[frontend/src/tests/standardImport.test.ts](<../../frontend/src/tests/standardImport.test.ts>)

[frontend/src/tests/StatisticsManagement.test.tsx](<../../frontend/src/tests/StatisticsManagement.test.tsx>)

[frontend/src/tests/StatisticsPolicy.test.tsx](<../../frontend/src/tests/StatisticsPolicy.test.tsx>)

[frontend/src/tests/SupportAdmin.test.tsx](<../../frontend/src/tests/SupportAdmin.test.tsx>)

[frontend/src/tests/TaskRunControl.test.tsx](<../../frontend/src/tests/TaskRunControl.test.tsx>)

[frontend/src/tests/templateImport.test.ts](<../../frontend/src/tests/templateImport.test.ts>)

[frontend/src/tests/templateImportUi.test.tsx](<../../frontend/src/tests/templateImportUi.test.tsx>)

[frontend/src/tests/TimeAssets.test.tsx](<../../frontend/src/tests/TimeAssets.test.tsx>)

[frontend/src/tests/TransactionCalendar.test.tsx](<../../frontend/src/tests/TransactionCalendar.test.tsx>)

[frontend/src/tests/TransactionDrawerDirectory.test.tsx](<../../frontend/src/tests/TransactionDrawerDirectory.test.tsx>)

[frontend/src/tests/TransactionDrawerSwitch.test.tsx](<../../frontend/src/tests/TransactionDrawerSwitch.test.tsx>)

[frontend/src/tests/TransactionIntegrityLazy.test.tsx](<../../frontend/src/tests/TransactionIntegrityLazy.test.tsx>)

[frontend/src/tests/TransactionsPagination.test.tsx](<../../frontend/src/tests/TransactionsPagination.test.tsx>)

[frontend/src/tests/TransactionWorkspace.test.ts](<../../frontend/src/tests/TransactionWorkspace.test.ts>)

[frontend/src/tests/TransferPresentation.test.ts](<../../frontend/src/tests/TransferPresentation.test.ts>)

[frontend/src/tests/uiPrivacy.test.tsx](<../../frontend/src/tests/uiPrivacy.test.tsx>)

[frontend/src/tests/valuationCsv.test.ts](<../../frontend/src/tests/valuationCsv.test.ts>)

[frontend/src/tests/VehicleCostsPanel.test.tsx](<../../frontend/src/tests/VehicleCostsPanel.test.tsx>)

[frontend/src/tests/VehicleDecisionsPanel.test.tsx](<../../frontend/src/tests/VehicleDecisionsPanel.test.tsx>)

[frontend/src/tests/VehiclePlanningPanel.test.tsx](<../../frontend/src/tests/VehiclePlanningPanel.test.tsx>)

[frontend/src/tests/VehicleValuePanel.test.tsx](<../../frontend/src/tests/VehicleValuePanel.test.tsx>)

[frontend/src/tests/YearCountdown.test.tsx](<../../frontend/src/tests/YearCountdown.test.tsx>)

## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。
