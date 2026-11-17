# 功能盘点档案

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：功能盘点档案。

## 统计口径

按28个业务域分组，不重复计算子页面。所有域存在实现但本次未逐一动态验收，统一标为“部分完成”：28项；已完成0、开发中0、仅设计0、无法确认0。此口径表示验收证据不足，不等于28个模块均有缺陷。具体子功能可能状态未知；便携能力另列，不计业务域。

## 交易与独立记账

**功能目标：** 交易与独立记账的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/collaboration/TransactionSharingFields.tsx](<../../frontend/src/features/collaboration/TransactionSharingFields.tsx>)、[frontend/src/features/dashboard/RecentTransactions.tsx](<../../frontend/src/features/dashboard/RecentTransactions.tsx>)、[frontend/src/features/dashboard/TransactionCalendar.tsx](<../../frontend/src/features/dashboard/TransactionCalendar.tsx>)、[frontend/src/features/reconciliation/TransactionStatementLinks.tsx](<../../frontend/src/features/reconciliation/TransactionStatementLinks.tsx>)、[frontend/src/features/timeAssets/TransactionSelector.tsx](<../../frontend/src/features/timeAssets/TransactionSelector.tsx>)、[frontend/src/features/transactions/anomalyRules.ts](<../../frontend/src/features/transactions/anomalyRules.ts>)、[frontend/src/features/transactions/BatchDrawer.tsx](<../../frontend/src/features/transactions/BatchDrawer.tsx>)、[frontend/src/features/transactions/PromotionFields.tsx](<../../frontend/src/features/transactions/PromotionFields.tsx>)、[frontend/src/features/transactions/QuickEntry.tsx](<../../frontend/src/features/transactions/QuickEntry.tsx>)、[frontend/src/features/transactions/RefundSourceSelector.tsx](<../../frontend/src/features/transactions/RefundSourceSelector.tsx>)、[frontend/src/features/transactions/ReviewDrawer.tsx](<../../frontend/src/features/transactions/ReviewDrawer.tsx>)、[frontend/src/features/transactions/SavedViewPicker.tsx](<../../frontend/src/features/transactions/SavedViewPicker.tsx>)、[frontend/src/features/transactions/savedViews.ts](<../../frontend/src/features/transactions/savedViews.ts>)、[frontend/src/features/transactions/TransactionAiPanel.tsx](<../../frontend/src/features/transactions/TransactionAiPanel.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/SmartReconciliationTransactionLinks.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationTransactionLinks.cs>)、[backend/src/PersonalFinance.Api/Application/TransactionAiEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/TransactionAiEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/TransactionDuplicateCandidates.cs](<../../backend/src/PersonalFinance.Api/Application/TransactionDuplicateCandidates.cs>)、[backend/src/PersonalFinance.Api/Application/TransactionKeywordFlight.cs](<../../backend/src/PersonalFinance.Api/Application/TransactionKeywordFlight.cs>)、[backend/src/PersonalFinance.Api/Application/TransactionLedgerAnomalies.cs](<../../backend/src/PersonalFinance.Api/Application/TransactionLedgerAnomalies.cs>)、[backend/src/PersonalFinance.Api/Application/TransactionRunningBalances.cs](<../../backend/src/PersonalFinance.Api/Application/TransactionRunningBalances.cs>)、[backend/src/PersonalFinance.Api/Application/TransactionWorkspace.cs](<../../backend/src/PersonalFinance.Api/Application/TransactionWorkspace.cs>)、[backend/src/PersonalFinance.Api/Application/TransactionWorkspaceEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/TransactionWorkspaceEndpoints.cs>)

**数据库模型：** AiTransactionDraft、FinanceTransaction、SharedTransaction、TransactionAnalysisAttribute、TransactionBatchRecord、TransactionReview、TransactionStatementMatch、TransactionTag。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/TransactionKeywordFlightTests.cs](<../../backend/tests/PersonalFinance.Tests/TransactionKeywordFlightTests.cs>)、[backend/tests/PersonalFinance.Tests/TransactionWorkspaceHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/TransactionWorkspaceHttpTests.cs>)、[backend/tests/PersonalFinance.Tests/TransactionWorkspaceTests.cs](<../../backend/tests/PersonalFinance.Tests/TransactionWorkspaceTests.cs>)、[frontend/e2e/transactions.spec.ts](<../../frontend/e2e/transactions.spec.ts>)、[frontend/redesign-tests/transaction-workspace.spec.ts](<../../frontend/redesign-tests/transaction-workspace.spec.ts>)、[frontend/src/tests/TransactionCalendar.test.tsx](<../../frontend/src/tests/TransactionCalendar.test.tsx>)、[frontend/src/tests/TransactionDrawerDirectory.test.tsx](<../../frontend/src/tests/TransactionDrawerDirectory.test.tsx>)、[frontend/src/tests/TransactionDrawerSwitch.test.tsx](<../../frontend/src/tests/TransactionDrawerSwitch.test.tsx>)、[frontend/src/tests/TransactionIntegrityLazy.test.tsx](<../../frontend/src/tests/TransactionIntegrityLazy.test.tsx>)、[frontend/src/tests/TransactionsPagination.test.tsx](<../../frontend/src/tests/TransactionsPagination.test.tsx>)、[frontend/src/tests/TransactionWorkspace.test.ts](<../../frontend/src/tests/TransactionWorkspace.test.ts>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 账户与卡片

**功能目标：** 账户与卡片的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/api/accounts2.ts](<../../frontend/src/api/accounts2.ts>)、[frontend/src/features/accounts/AccountAnalysis.tsx](<../../frontend/src/features/accounts/AccountAnalysis.tsx>)、[frontend/src/features/accounts/AccountManagementPanels.tsx](<../../frontend/src/features/accounts/AccountManagementPanels.tsx>)、[frontend/src/features/accounts/AccountManagerList.tsx](<../../frontend/src/features/accounts/AccountManagerList.tsx>)、[frontend/src/features/accounts/AccountToolbar.tsx](<../../frontend/src/features/accounts/AccountToolbar.tsx>)、[frontend/src/features/accounts/accountView.ts](<../../frontend/src/features/accounts/accountView.ts>)、[frontend/src/features/accounts/CreditCardPanel.tsx](<../../frontend/src/features/accounts/CreditCardPanel.tsx>)、[frontend/src/features/accounts/FundStatusPanel.tsx](<../../frontend/src/features/accounts/FundStatusPanel.tsx>)、[frontend/src/features/dashboard/AccountBalanceCards.tsx](<../../frontend/src/features/dashboard/AccountBalanceCards.tsx>)、[frontend/src/pages/AccountsPage.tsx](<../../frontend/src/pages/AccountsPage.tsx>)、[frontend/src/tests/account-management.test.ts](<../../frontend/src/tests/account-management.test.ts>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/AccountManagementEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/AccountManagementEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/AccountManagementService.cs](<../../backend/src/PersonalFinance.Api/Application/AccountManagementService.cs>)、[backend/src/PersonalFinance.Api/Application/AccountStatisticsService.cs](<../../backend/src/PersonalFinance.Api/Application/AccountStatisticsService.cs>)、[backend/src/PersonalFinance.Api/Application/InterestAccounting.cs](<../../backend/src/PersonalFinance.Api/Application/InterestAccounting.cs>)

**数据库模型：** Account、AccountFundHold、AccountGroup、HousingFundAccount。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/InterestAccountingTests.cs](<../../backend/tests/PersonalFinance.Tests/InterestAccountingTests.cs>)、[frontend/redesign-tests/account-management.spec.ts](<../../frontend/redesign-tests/account-management.spec.ts>)、[frontend/src/tests/account-management.test.ts](<../../frontend/src/tests/account-management.test.ts>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 分类与标签

**功能目标：** 分类与标签的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/api/categoryStatistics.ts](<../../frontend/src/api/categoryStatistics.ts>)、[frontend/src/features/dashboard/ExpenseCategoryChart.tsx](<../../frontend/src/features/dashboard/ExpenseCategoryChart.tsx>)、[frontend/src/mocks/categoryStatistics.ts](<../../frontend/src/mocks/categoryStatistics.ts>)、[frontend/src/pages/CategoriesPage.tsx](<../../frontend/src/pages/CategoriesPage.tsx>)、[frontend/src/pages/CategoryDetailPage.tsx](<../../frontend/src/pages/CategoryDetailPage.tsx>)、[frontend/src/tests/CategoriesHierarchy.test.tsx](<../../frontend/src/tests/CategoriesHierarchy.test.tsx>)、[frontend/src/tests/categoryProtection.test.ts](<../../frontend/src/tests/categoryProtection.test.ts>)、[frontend/src/tests/CategorySelector.test.tsx](<../../frontend/src/tests/CategorySelector.test.tsx>)、[frontend/src/utils/categories.ts](<../../frontend/src/utils/categories.ts>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/CategoryHierarchy.cs](<../../backend/src/PersonalFinance.Api/Application/CategoryHierarchy.cs>)、[backend/src/PersonalFinance.Api/Application/CategoryService.cs](<../../backend/src/PersonalFinance.Api/Application/CategoryService.cs>)、[backend/src/PersonalFinance.Api/Application/CategoryStatisticsService.cs](<../../backend/src/PersonalFinance.Api/Application/CategoryStatisticsService.cs>)

**数据库模型：** Category、PhysicalCategory。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/CategoryStatisticsTests.cs](<../../backend/tests/PersonalFinance.Tests/CategoryStatisticsTests.cs>)、[frontend/src/tests/CategoriesHierarchy.test.tsx](<../../frontend/src/tests/CategoriesHierarchy.test.tsx>)、[frontend/src/tests/categoryProtection.test.ts](<../../frontend/src/tests/categoryProtection.test.ts>)、[frontend/src/tests/CategorySelector.test.tsx](<../../frontend/src/tests/CategorySelector.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 首页仪表盘

**功能目标：** 首页仪表盘的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/dashboard/AccountBalanceCards.tsx](<../../frontend/src/features/dashboard/AccountBalanceCards.tsx>)、[frontend/src/features/dashboard/BudgetProgress.tsx](<../../frontend/src/features/dashboard/BudgetProgress.tsx>)、[frontend/src/features/dashboard/CashflowOverview.tsx](<../../frontend/src/features/dashboard/CashflowOverview.tsx>)、[frontend/src/features/dashboard/DashboardLayout.tsx](<../../frontend/src/features/dashboard/DashboardLayout.tsx>)、[frontend/src/features/dashboard/ExpenseCategoryChart.tsx](<../../frontend/src/features/dashboard/ExpenseCategoryChart.tsx>)、[frontend/src/features/dashboard/FinancialInsights.tsx](<../../frontend/src/features/dashboard/FinancialInsights.tsx>)、[frontend/src/features/dashboard/FinancialSummary.tsx](<../../frontend/src/features/dashboard/FinancialSummary.tsx>)、[frontend/src/features/dashboard/IncomeExpenseTrend.tsx](<../../frontend/src/features/dashboard/IncomeExpenseTrend.tsx>)、[frontend/src/features/dashboard/OnThisDayCard.tsx](<../../frontend/src/features/dashboard/OnThisDayCard.tsx>)、[frontend/src/features/dashboard/QuickActions.tsx](<../../frontend/src/features/dashboard/QuickActions.tsx>)、[frontend/src/features/dashboard/RecentTransactions.tsx](<../../frontend/src/features/dashboard/RecentTransactions.tsx>)、[frontend/src/features/dashboard/TransactionCalendar.tsx](<../../frontend/src/features/dashboard/TransactionCalendar.tsx>)、[frontend/src/features/dashboard/YearCountdown.tsx](<../../frontend/src/features/dashboard/YearCountdown.tsx>)、[frontend/src/pages/DashboardPage.tsx](<../../frontend/src/pages/DashboardPage.tsx>)

**后端接口及核心服务：** 

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/DashboardValuationReuseSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/DashboardValuationReuseSqlTests.cs>)、[frontend/src/tests/DashboardLayout.test.tsx](<../../frontend/src/tests/DashboardLayout.test.tsx>)、[frontend/src/tests/DashboardSummary.test.tsx](<../../frontend/src/tests/DashboardSummary.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 预算

**功能目标：** 预算的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/dashboard/BudgetProgress.tsx](<../../frontend/src/features/dashboard/BudgetProgress.tsx>)、[frontend/src/features/planning/BudgetHistorySnapshot.tsx](<../../frontend/src/features/planning/BudgetHistorySnapshot.tsx>)、[frontend/src/features/planning/BudgetPlanningPanel.tsx](<../../frontend/src/features/planning/BudgetPlanningPanel.tsx>)、[frontend/src/pages/AnnualBudgetsPage.tsx](<../../frontend/src/pages/AnnualBudgetsPage.tsx>)、[frontend/src/pages/BudgetsPage.tsx](<../../frontend/src/pages/BudgetsPage.tsx>)、[frontend/src/tests/BudgetsPage.test.tsx](<../../frontend/src/tests/BudgetsPage.test.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/Ai/AiContextBudget.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiContextBudget.cs>)、[backend/src/PersonalFinance.Api/Application/AnnualBudgetService.cs](<../../backend/src/PersonalFinance.Api/Application/AnnualBudgetService.cs>)、[backend/src/PersonalFinance.Api/Application/BudgetAlertScheduler.cs](<../../backend/src/PersonalFinance.Api/Application/BudgetAlertScheduler.cs>)、[backend/src/PersonalFinance.Api/Application/BudgetPlanningService.cs](<../../backend/src/PersonalFinance.Api/Application/BudgetPlanningService.cs>)、[backend/src/PersonalFinance.Api/Application/BudgetTemplateAlertService.cs](<../../backend/src/PersonalFinance.Api/Application/BudgetTemplateAlertService.cs>)

**数据库模型：** AnnualBudget、AnnualBudgetAllocation、Budget、BudgetAlertSetting、BudgetAlertState、BudgetCarryover、BudgetChangeHistory、BudgetLine、BudgetTemplate、SpaceBudget、TimeBudget。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [frontend/src/tests/BudgetsPage.test.tsx](<../../frontend/src/tests/BudgetsPage.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 储蓄与现金流

**功能目标：** 储蓄与现金流的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/dashboard/CashflowOverview.tsx](<../../frontend/src/features/dashboard/CashflowOverview.tsx>)、[frontend/src/pages/CashFlowPage.tsx](<../../frontend/src/pages/CashFlowPage.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/CashFlowForecastService.cs](<../../backend/src/PersonalFinance.Api/Application/CashFlowForecastService.cs>)、[backend/src/PersonalFinance.Api/Application/CashFlowMath.cs](<../../backend/src/PersonalFinance.Api/Application/CashFlowMath.cs>)、[backend/src/PersonalFinance.Api/Application/FutureCashFlowService.cs](<../../backend/src/PersonalFinance.Api/Application/FutureCashFlowService.cs>)

**数据库模型：** CashFlowScenario、FutureCashFlowItem。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/CashFlowMathTests.cs](<../../backend/tests/PersonalFinance.Tests/CashFlowMathTests.cs>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 报表及统计口径

**功能目标：** 报表及统计口径的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/api/financialReports.ts](<../../frontend/src/api/financialReports.ts>)、[frontend/src/features/financialReports/export.ts](<../../frontend/src/features/financialReports/export.ts>)、[frontend/src/features/financialReports/ReportAi.tsx](<../../frontend/src/features/financialReports/ReportAi.tsx>)、[frontend/src/features/financialReports/sections.ts](<../../frontend/src/features/financialReports/sections.ts>)、[frontend/src/features/reports/AdvancedReports.tsx](<../../frontend/src/features/reports/AdvancedReports.tsx>)、[frontend/src/features/reports/DebtPressure.tsx](<../../frontend/src/features/reports/DebtPressure.tsx>)、[frontend/src/features/reports/ExpenseStructure.tsx](<../../frontend/src/features/reports/ExpenseStructure.tsx>)、[frontend/src/features/reports/ExportPanel.tsx](<../../frontend/src/features/reports/ExportPanel.tsx>)、[frontend/src/features/reports/FinancialHealth.tsx](<../../frontend/src/features/reports/FinancialHealth.tsx>)、[frontend/src/features/reports/FinancialReview.tsx](<../../frontend/src/features/reports/FinancialReview.tsx>)、[frontend/src/features/reports/MetricCenter.tsx](<../../frontend/src/features/reports/MetricCenter.tsx>)、[frontend/src/features/reports/NetWorthAnalysis.tsx](<../../frontend/src/features/reports/NetWorthAnalysis.tsx>)、[frontend/src/features/reports/PeriodReview.tsx](<../../frontend/src/features/reports/PeriodReview.tsx>)、[frontend/src/features/reports/sections.ts](<../../frontend/src/features/reports/sections.ts>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/Ai/AiAnalysisReport.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAnalysisReport.cs>)、[backend/src/PersonalFinance.Api/Application/AssetReportsService.cs](<../../backend/src/PersonalFinance.Api/Application/AssetReportsService.cs>)、[backend/src/PersonalFinance.Api/Application/CollaborationReports.cs](<../../backend/src/PersonalFinance.Api/Application/CollaborationReports.cs>)、[backend/src/PersonalFinance.Api/Application/ConcertReports.cs](<../../backend/src/PersonalFinance.Api/Application/ConcertReports.cs>)、[backend/src/PersonalFinance.Api/Application/CustomReportDimensionsService.cs](<../../backend/src/PersonalFinance.Api/Application/CustomReportDimensionsService.cs>)、[backend/src/PersonalFinance.Api/Application/CustomReportExportService.cs](<../../backend/src/PersonalFinance.Api/Application/CustomReportExportService.cs>)、[backend/src/PersonalFinance.Api/Application/FinancialReportCenterService.cs](<../../backend/src/PersonalFinance.Api/Application/FinancialReportCenterService.cs>)、[backend/src/PersonalFinance.Api/Application/InterestReports.cs](<../../backend/src/PersonalFinance.Api/Application/InterestReports.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollCenterReports.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollCenterReports.cs>)、[backend/src/PersonalFinance.Api/Application/PhysicalAssetReports.cs](<../../backend/src/PersonalFinance.Api/Application/PhysicalAssetReports.cs>)、[backend/src/PersonalFinance.Api/Application/ReportAggregation.cs](<../../backend/src/PersonalFinance.Api/Application/ReportAggregation.cs>)、[backend/src/PersonalFinance.Api/Application/ReportsService.cs](<../../backend/src/PersonalFinance.Api/Application/ReportsService.cs>)、[backend/src/PersonalFinance.Api/Application/TimeAssetReports.cs](<../../backend/src/PersonalFinance.Api/Application/TimeAssetReports.cs>)

**数据库模型：** AiAgentReport、CustomReportDefinition。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/FinancialReportToolsTests.cs](<../../backend/tests/PersonalFinance.Tests/FinancialReportToolsTests.cs>)、[backend/tests/PersonalFinance.Tests/ReportPeriodTests.cs](<../../backend/tests/PersonalFinance.Tests/ReportPeriodTests.cs>)、[backend/tests/PersonalFinance.Tests/ReportTerminalBoundaryTests.cs](<../../backend/tests/PersonalFinance.Tests/ReportTerminalBoundaryTests.cs>)、[frontend/src/tests/FinancialReportAi.test.tsx](<../../frontend/src/tests/FinancialReportAi.test.tsx>)、[frontend/src/tests/FinancialReportExport.test.ts](<../../frontend/src/tests/FinancialReportExport.test.ts>)、[frontend/src/tests/FinancialReports.test.tsx](<../../frontend/src/tests/FinancialReports.test.tsx>)、[frontend/src/tests/ReportAnalysisPage.test.tsx](<../../frontend/src/tests/ReportAnalysisPage.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 投资IRR/XIRR

**功能目标：** 投资IRR/XIRR的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/api/investments.ts](<../../frontend/src/api/investments.ts>)、[frontend/src/pages/InvestmentPerformancePage.tsx](<../../frontend/src/pages/InvestmentPerformancePage.tsx>)、[frontend/src/pages/InvestmentsPage.tsx](<../../frontend/src/pages/InvestmentsPage.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/InvestmentEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/InvestmentEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/InvestmentMath.cs](<../../backend/src/PersonalFinance.Api/Application/InvestmentMath.cs>)、[backend/src/PersonalFinance.Api/Application/InvestmentPerformanceService.cs](<../../backend/src/PersonalFinance.Api/Application/InvestmentPerformanceService.cs>)、[backend/src/PersonalFinance.Api/Application/InvestmentReinvestmentService.cs](<../../backend/src/PersonalFinance.Api/Application/InvestmentReinvestmentService.cs>)、[backend/src/PersonalFinance.Api/Application/InvestmentService.cs](<../../backend/src/PersonalFinance.Api/Application/InvestmentService.cs>)

**数据库模型：** InvestmentAsset、InvestmentHistory、InvestmentTrade、InvestmentValuation。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/InvestmentTests.cs](<../../backend/tests/PersonalFinance.Tests/InvestmentTests.cs>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 定存与实物资产

**功能目标：** 定存与实物资产的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/pages/ManagedAssetsPage.tsx](<../../frontend/src/pages/ManagedAssetsPage.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/AssetManagementEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/AssetManagementEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/AssetManagementService.cs](<../../backend/src/PersonalFinance.Api/Application/AssetManagementService.cs>)

**数据库模型：** ManagedAsset、ManagedAssetValuation。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** 未按名称发现专用测试，需核查共享用例

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 贷款与报销往来

**功能目标：** 贷款与报销往来的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/api/business.ts](<../../frontend/src/api/business.ts>)、[frontend/src/components/BusinessSelectors.tsx](<../../frontend/src/components/BusinessSelectors.tsx>)、[frontend/src/pages/BusinessPage.tsx](<../../frontend/src/pages/BusinessPage.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/BusinessService.cs](<../../backend/src/PersonalFinance.Api/Application/BusinessService.cs>)

**数据库模型：** Business。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** 未按名称发现专用测试，需核查共享用例

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 自动对账2.0

**功能目标：** 自动对账2.0的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/planning/DebtReconciliationPanel.tsx](<../../frontend/src/features/planning/DebtReconciliationPanel.tsx>)、[frontend/src/features/reconciliation/AllocationPanel.tsx](<../../frontend/src/features/reconciliation/AllocationPanel.tsx>)、[frontend/src/features/reconciliation/api.ts](<../../frontend/src/features/reconciliation/api.ts>)、[frontend/src/features/reconciliation/CorrectionPanel.tsx](<../../frontend/src/features/reconciliation/CorrectionPanel.tsx>)、[frontend/src/features/reconciliation/HistoryPanel.tsx](<../../frontend/src/features/reconciliation/HistoryPanel.tsx>)、[frontend/src/features/reconciliation/IssuesPanel.tsx](<../../frontend/src/features/reconciliation/IssuesPanel.tsx>)、[frontend/src/features/reconciliation/SmartOverviewPanel.tsx](<../../frontend/src/features/reconciliation/SmartOverviewPanel.tsx>)、[frontend/src/features/reconciliation/SmartWorkbench.tsx](<../../frontend/src/features/reconciliation/SmartWorkbench.tsx>)、[frontend/src/features/reconciliation/SourceTrustPanel.tsx](<../../frontend/src/features/reconciliation/SourceTrustPanel.tsx>)、[frontend/src/features/reconciliation/TaskHistoryPanel.tsx](<../../frontend/src/features/reconciliation/TaskHistoryPanel.tsx>)、[frontend/src/features/reconciliation/TaskRunControl.tsx](<../../frontend/src/features/reconciliation/TaskRunControl.tsx>)、[frontend/src/features/reconciliation/TransactionStatementLinks.tsx](<../../frontend/src/features/reconciliation/TransactionStatementLinks.tsx>)、[frontend/src/i18n/reconciliation.en.json](<../../frontend/src/i18n/reconciliation.en.json>)、[frontend/src/pages/ReconciliationPage.tsx](<../../frontend/src/pages/ReconciliationPage.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/SmartReconciliationAllocations.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationAllocations.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationEngine.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationEngine.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationIssues.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationIssues.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationOverview.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationOverview.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationRulePreview.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationRulePreview.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationService.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationService.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationTasks.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationTasks.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationTransactionLinks.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationTransactionLinks.cs>)、[backend/src/PersonalFinance.Api/Application/SmartReconciliationTrust.cs](<../../backend/src/PersonalFinance.Api/Application/SmartReconciliationTrust.cs>)

**数据库模型：** Reconciliation。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/SmartReconciliationHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/SmartReconciliationHttpTests.cs>)、[backend/tests/PersonalFinance.Tests/SmartReconciliationTests.cs](<../../backend/tests/PersonalFinance.Tests/SmartReconciliationTests.cs>)、[frontend/redesign-tests/smart-reconciliation.spec.ts](<../../frontend/redesign-tests/smart-reconciliation.spec.ts>)、[frontend/src/tests/SmartReconciliation.test.tsx](<../../frontend/src/tests/SmartReconciliation.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 导入清洗与恢复

**功能目标：** 导入清洗与恢复的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/components/TemplateImport.tsx](<../../frontend/src/components/TemplateImport.tsx>)、[frontend/src/features/fuel/FuelImportDialog.tsx](<../../frontend/src/features/fuel/FuelImportDialog.tsx>)、[frontend/src/features/fuel/import.ts](<../../frontend/src/features/fuel/import.ts>)、[frontend/src/features/imports/api412.ts](<../../frontend/src/features/imports/api412.ts>)、[frontend/src/features/imports/ImportCleaningPanel.tsx](<../../frontend/src/features/imports/ImportCleaningPanel.tsx>)、[frontend/src/features/imports/ImportDuplicateReview.tsx](<../../frontend/src/features/imports/ImportDuplicateReview.tsx>)、[frontend/src/features/imports/ImportExecutionHistory.tsx](<../../frontend/src/features/imports/ImportExecutionHistory.tsx>)、[frontend/src/features/imports/ImportJobHistory.tsx](<../../frontend/src/features/imports/ImportJobHistory.tsx>)、[frontend/src/features/imports/mapping.ts](<../../frontend/src/features/imports/mapping.ts>)、[frontend/src/features/imports/MerchantMasterPanel.tsx](<../../frontend/src/features/imports/MerchantMasterPanel.tsx>)、[frontend/src/features/payroll/Imports.tsx](<../../frontend/src/features/payroll/Imports.tsx>)、[frontend/src/mocks/imports.ts](<../../frontend/src/mocks/imports.ts>)、[frontend/src/pages/ImportPage.tsx](<../../frontend/src/pages/ImportPage.tsx>)、[frontend/src/tests/fuelImport.test.ts](<../../frontend/src/tests/fuelImport.test.ts>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/Ai/ImportRecognitionService.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/ImportRecognitionService.cs>)、[backend/src/PersonalFinance.Api/Application/FuelImport.cs](<../../backend/src/PersonalFinance.Api/Application/FuelImport.cs>)、[backend/src/PersonalFinance.Api/Application/ImportCleaningEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/ImportCleaningEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/ImportCleaningService.cs](<../../backend/src/PersonalFinance.Api/Application/ImportCleaningService.cs>)、[backend/src/PersonalFinance.Api/Application/ImportIdentityService.cs](<../../backend/src/PersonalFinance.Api/Application/ImportIdentityService.cs>)、[backend/src/PersonalFinance.Api/Application/ImportRecoveryService.cs](<../../backend/src/PersonalFinance.Api/Application/ImportRecoveryService.cs>)、[backend/src/PersonalFinance.Api/Application/ImportSuggestionService.cs](<../../backend/src/PersonalFinance.Api/Application/ImportSuggestionService.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollCenterImports.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollCenterImports.cs>)、[backend/src/PersonalFinance.Api/Application/StandardImportFields.cs](<../../backend/src/PersonalFinance.Api/Application/StandardImportFields.cs>)

**数据库模型：** ImportAttempt、ImportCleaningEvent、ImportJob、ImportRecognitionSuggestion、ImportRow、PayrollImportJob。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/FuelImportTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelImportTests.cs>)、[backend/tests/PersonalFinance.Tests/ImportCleaningIntegrationTests.cs](<../../backend/tests/PersonalFinance.Tests/ImportCleaningIntegrationTests.cs>)、[backend/tests/PersonalFinance.Tests/ImportIdentityTests.cs](<../../backend/tests/PersonalFinance.Tests/ImportIdentityTests.cs>)、[backend/tests/PersonalFinance.Tests/ImportProjectionTests.cs](<../../backend/tests/PersonalFinance.Tests/ImportProjectionTests.cs>)、[backend/tests/PersonalFinance.Tests/StandardImportTests.cs](<../../backend/tests/PersonalFinance.Tests/StandardImportTests.cs>)、[backend/tests/PersonalFinance.Tests/TransferImportTests.cs](<../../backend/tests/PersonalFinance.Tests/TransferImportTests.cs>)、[frontend/redesign-tests/standard-import.spec.ts](<../../frontend/redesign-tests/standard-import.spec.ts>)、[frontend/redesign-tests/transfer-entry-import.spec.ts](<../../frontend/redesign-tests/transfer-entry-import.spec.ts>)、[frontend/src/tests/fuelImport.test.ts](<../../frontend/src/tests/fuelImport.test.ts>)、[frontend/src/tests/FuelImportDialog.test.tsx](<../../frontend/src/tests/FuelImportDialog.test.tsx>)、[frontend/src/tests/importCleaning412.test.tsx](<../../frontend/src/tests/importCleaning412.test.tsx>)、[frontend/src/tests/importMapping412.test.ts](<../../frontend/src/tests/importMapping412.test.ts>)、[frontend/src/tests/standardImport.test.ts](<../../frontend/src/tests/standardImport.test.ts>)、[frontend/src/tests/templateImport.test.ts](<../../frontend/src/tests/templateImport.test.ts>)、[frontend/src/tests/templateImportUi.test.tsx](<../../frontend/src/tests/templateImportUi.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 周期与订阅

**功能目标：** 周期与订阅的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/pages/RecurringPage.tsx](<../../frontend/src/pages/RecurringPage.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/RecurringEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/RecurringEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/RecurringSchedule.cs](<../../backend/src/PersonalFinance.Api/Application/RecurringSchedule.cs>)、[backend/src/PersonalFinance.Api/Application/RecurringScheduler.cs](<../../backend/src/PersonalFinance.Api/Application/RecurringScheduler.cs>)、[backend/src/PersonalFinance.Api/Application/RecurringService.cs](<../../backend/src/PersonalFinance.Api/Application/RecurringService.cs>)

**数据库模型：** RecurringExecution、RecurringOccurrence、RecurringRule。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/RecurringScheduleTests.cs](<../../backend/tests/PersonalFinance.Tests/RecurringScheduleTests.cs>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## AI消费审批

**功能目标：** AI消费审批的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/pages/SpendingApprovalExtrasPanel.tsx](<../../frontend/src/pages/SpendingApprovalExtrasPanel.tsx>)、[frontend/src/pages/SpendingApprovalSettingsPanel.tsx](<../../frontend/src/pages/SpendingApprovalSettingsPanel.tsx>)、[frontend/src/pages/SpendingApprovalsPage.tsx](<../../frontend/src/pages/SpendingApprovalsPage.tsx>)、[frontend/src/tests/SpendingApprovals.test.tsx](<../../frontend/src/tests/SpendingApprovals.test.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/SpendingApprovalAi.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingApprovalAi.cs>)、[backend/src/PersonalFinance.Api/Application/SpendingApprovalExtras.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingApprovalExtras.cs>)、[backend/src/PersonalFinance.Api/Application/SpendingApprovalLease.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingApprovalLease.cs>)、[backend/src/PersonalFinance.Api/Application/SpendingApprovalRules.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingApprovalRules.cs>)、[backend/src/PersonalFinance.Api/Application/SpendingApprovalService.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingApprovalService.cs>)、[backend/src/PersonalFinance.Api/Application/SpendingApprovalSettings.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingApprovalSettings.cs>)

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/SpendingApprovalConstraintTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalConstraintTests.cs>)、[backend/tests/PersonalFinance.Tests/SpendingApprovalInstallmentTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalInstallmentTests.cs>)、[backend/tests/PersonalFinance.Tests/SpendingApprovalPersistenceTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalPersistenceTests.cs>)、[backend/tests/PersonalFinance.Tests/SpendingApprovalRulesTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalRulesTests.cs>)、[backend/tests/PersonalFinance.Tests/SpendingApprovalSchemaTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalSchemaTests.cs>)、[frontend/src/tests/SpendingApprovals.test.tsx](<../../frontend/src/tests/SpendingApprovals.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 消费评价与价值实验室

**功能目标：** 消费评价与价值实验室的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/pages/SpendingLabPage.tsx](<../../frontend/src/pages/SpendingLabPage.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/SpendingValueMath.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingValueMath.cs>)、[backend/src/PersonalFinance.Api/Application/SpendingValueService.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingValueService.cs>)

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/SpendingValueHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingValueHttpTests.cs>)、[backend/tests/PersonalFinance.Tests/SpendingValueMathTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingValueMathTests.cs>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 人生模拟器

**功能目标：** 人生模拟器的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/api/lifeSimulator.ts](<../../frontend/src/api/lifeSimulator.ts>)、[frontend/src/pages/LifeSimulatorPage.tsx](<../../frontend/src/pages/LifeSimulatorPage.tsx>)、[frontend/src/tests/LifeSimulator.test.tsx](<../../frontend/src/tests/LifeSimulator.test.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/LifeRetirementPlanning.cs](<../../backend/src/PersonalFinance.Api/Application/LifeRetirementPlanning.cs>)、[backend/src/PersonalFinance.Api/Application/LifeSimulationEngine.cs](<../../backend/src/PersonalFinance.Api/Application/LifeSimulationEngine.cs>)、[backend/src/PersonalFinance.Api/Application/LifeSimulationRisk.cs](<../../backend/src/PersonalFinance.Api/Application/LifeSimulationRisk.cs>)、[backend/src/PersonalFinance.Api/Application/LifeSimulationService.cs](<../../backend/src/PersonalFinance.Api/Application/LifeSimulationService.cs>)

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/LifeRetirementTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeRetirementTests.cs>)、[backend/tests/PersonalFinance.Tests/LifeSimulationHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeSimulationHttpTests.cs>)、[backend/tests/PersonalFinance.Tests/LifeSimulationPrivacyTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeSimulationPrivacyTests.cs>)、[backend/tests/PersonalFinance.Tests/LifeSimulationRiskTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeSimulationRiskTests.cs>)、[backend/tests/PersonalFinance.Tests/LifeSimulationTests.cs](<../../backend/tests/PersonalFinance.Tests/LifeSimulationTests.cs>)、[frontend/src/tests/LifeRetirement.test.tsx](<../../frontend/src/tests/LifeRetirement.test.tsx>)、[frontend/src/tests/LifeSimulationJournal.test.ts](<../../frontend/src/tests/LifeSimulationJournal.test.ts>)、[frontend/src/tests/LifeSimulator.test.tsx](<../../frontend/src/tests/LifeSimulator.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 演唱会专项

**功能目标：** 演唱会专项的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/concerts/api.ts](<../../frontend/src/features/concerts/api.ts>)、[frontend/src/features/concerts/ConcertDetail.tsx](<../../frontend/src/features/concerts/ConcertDetail.tsx>)、[frontend/src/features/concerts/ConcertForms.tsx](<../../frontend/src/features/concerts/ConcertForms.tsx>)、[frontend/src/features/concerts/InterestAdvice.tsx](<../../frontend/src/features/concerts/InterestAdvice.tsx>)、[frontend/src/features/concerts/interestApi.ts](<../../frontend/src/features/concerts/interestApi.ts>)、[frontend/src/features/concerts/InterestFiles.tsx](<../../frontend/src/features/concerts/InterestFiles.tsx>)、[frontend/src/features/concerts/InterestHistoryMatch.tsx](<../../frontend/src/features/concerts/InterestHistoryMatch.tsx>)、[frontend/src/features/concerts/InterestPanel.tsx](<../../frontend/src/features/concerts/InterestPanel.tsx>)、[frontend/src/features/concerts/labels.ts](<../../frontend/src/features/concerts/labels.ts>)、[frontend/src/features/concerts/ModuleSettings.tsx](<../../frontend/src/features/concerts/ModuleSettings.tsx>)、[frontend/src/features/concerts/PaymentParts.tsx](<../../frontend/src/features/concerts/PaymentParts.tsx>)、[frontend/src/pages/ConcertsPage.tsx](<../../frontend/src/pages/ConcertsPage.tsx>)、[frontend/src/tests/ConcertInterests.test.tsx](<../../frontend/src/tests/ConcertInterests.test.tsx>)、[frontend/src/tests/Concerts.test.tsx](<../../frontend/src/tests/Concerts.test.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/ConcertEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/ConcertEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/ConcertModels.cs](<../../backend/src/PersonalFinance.Api/Application/ConcertModels.cs>)、[backend/src/PersonalFinance.Api/Application/ConcertReports.cs](<../../backend/src/PersonalFinance.Api/Application/ConcertReports.cs>)、[backend/src/PersonalFinance.Api/Application/ConcertService.cs](<../../backend/src/PersonalFinance.Api/Application/ConcertService.cs>)

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/ConcertInterestHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/ConcertInterestHttpTests.cs>)、[backend/tests/PersonalFinance.Tests/ConcertTests.cs](<../../backend/tests/PersonalFinance.Tests/ConcertTests.cs>)、[frontend/redesign-tests/concerts.spec.ts](<../../frontend/redesign-tests/concerts.spec.ts>)、[frontend/src/tests/ConcertInterests.test.tsx](<../../frontend/src/tests/ConcertInterests.test.tsx>)、[frontend/src/tests/Concerts.test.tsx](<../../frontend/src/tests/Concerts.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 艺人与音乐商品

**功能目标：** 艺人与音乐商品的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** 

**后端接口及核心服务：** 

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** 未按名称发现专用测试，需核查共享用例

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 节日消费

**功能目标：** 节日消费的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/festivals/api.ts](<../../frontend/src/features/festivals/api.ts>)、[frontend/src/features/festivals/FestivalAttachments.tsx](<../../frontend/src/features/festivals/FestivalAttachments.tsx>)、[frontend/src/features/festivals/FestivalDetail.tsx](<../../frontend/src/features/festivals/FestivalDetail.tsx>)、[frontend/src/features/festivals/FestivalEditor.tsx](<../../frontend/src/features/festivals/FestivalEditor.tsx>)、[frontend/src/features/festivals/FestivalRecipients.tsx](<../../frontend/src/features/festivals/FestivalRecipients.tsx>)、[frontend/src/pages/FestivalsPage.tsx](<../../frontend/src/pages/FestivalsPage.tsx>)、[frontend/src/tests/Festivals.test.ts](<../../frontend/src/tests/Festivals.test.ts>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/FestivalAi.cs](<../../backend/src/PersonalFinance.Api/Application/FestivalAi.cs>)、[backend/src/PersonalFinance.Api/Application/FestivalAttachments.cs](<../../backend/src/PersonalFinance.Api/Application/FestivalAttachments.cs>)、[backend/src/PersonalFinance.Api/Application/FestivalEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/FestivalEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/FestivalModels.cs](<../../backend/src/PersonalFinance.Api/Application/FestivalModels.cs>)、[backend/src/PersonalFinance.Api/Application/FestivalPlanning.cs](<../../backend/src/PersonalFinance.Api/Application/FestivalPlanning.cs>)、[backend/src/PersonalFinance.Api/Application/FestivalRepeat.cs](<../../backend/src/PersonalFinance.Api/Application/FestivalRepeat.cs>)、[backend/src/PersonalFinance.Api/Application/FestivalValue.cs](<../../backend/src/PersonalFinance.Api/Application/FestivalValue.cs>)

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/FestivalFinancialTests.cs](<../../backend/tests/PersonalFinance.Tests/FestivalFinancialTests.cs>)、[backend/tests/PersonalFinance.Tests/FestivalPerformanceTests.cs](<../../backend/tests/PersonalFinance.Tests/FestivalPerformanceTests.cs>)、[backend/tests/PersonalFinance.Tests/FestivalTests.cs](<../../backend/tests/PersonalFinance.Tests/FestivalTests.cs>)、[frontend/src/tests/Festivals.test.ts](<../../frontend/src/tests/Festivals.test.ts>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 加油油耗

**功能目标：** 加油油耗的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/data/fuel-price-reference.json](<../../frontend/src/data/fuel-price-reference.json>)、[frontend/src/features/fuel/ai.ts](<../../frontend/src/features/fuel/ai.ts>)、[frontend/src/features/fuel/api.ts](<../../frontend/src/features/fuel/api.ts>)、[frontend/src/features/fuel/bulk.ts](<../../frontend/src/features/fuel/bulk.ts>)、[frontend/src/features/fuel/calculation.ts](<../../frontend/src/features/fuel/calculation.ts>)、[frontend/src/features/fuel/costs.ts](<../../frontend/src/features/fuel/costs.ts>)、[frontend/src/features/fuel/FuelAiPanel.tsx](<../../frontend/src/features/fuel/FuelAiPanel.tsx>)、[frontend/src/features/fuel/FuelBulkActions.tsx](<../../frontend/src/features/fuel/FuelBulkActions.tsx>)、[frontend/src/features/fuel/FuelCalculationDetails.tsx](<../../frontend/src/features/fuel/FuelCalculationDetails.tsx>)、[frontend/src/features/fuel/FuelDiscountFields.tsx](<../../frontend/src/features/fuel/FuelDiscountFields.tsx>)、[frontend/src/features/fuel/FuelEconomyDetails.tsx](<../../frontend/src/features/fuel/FuelEconomyDetails.tsx>)、[frontend/src/features/fuel/FuelImportDialog.tsx](<../../frontend/src/features/fuel/FuelImportDialog.tsx>)、[frontend/src/features/fuel/FuelInsightsPanel.tsx](<../../frontend/src/features/fuel/FuelInsightsPanel.tsx>)、[frontend/src/features/fuel/FuelOverviewPanel.tsx](<../../frontend/src/features/fuel/FuelOverviewPanel.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/FuelAi.cs](<../../backend/src/PersonalFinance.Api/Application/FuelAi.cs>)、[backend/src/PersonalFinance.Api/Application/FuelBulk.cs](<../../backend/src/PersonalFinance.Api/Application/FuelBulk.cs>)、[backend/src/PersonalFinance.Api/Application/FuelChronology.cs](<../../backend/src/PersonalFinance.Api/Application/FuelChronology.cs>)、[backend/src/PersonalFinance.Api/Application/FuelEconomyMath.cs](<../../backend/src/PersonalFinance.Api/Application/FuelEconomyMath.cs>)、[backend/src/PersonalFinance.Api/Application/FuelEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/FuelEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/FuelImport.cs](<../../backend/src/PersonalFinance.Api/Application/FuelImport.cs>)、[backend/src/PersonalFinance.Api/Application/FuelInsightsAnalysis.cs](<../../backend/src/PersonalFinance.Api/Application/FuelInsightsAnalysis.cs>)、[backend/src/PersonalFinance.Api/Application/FuelIntervalAnalysis.cs](<../../backend/src/PersonalFinance.Api/Application/FuelIntervalAnalysis.cs>)、[backend/src/PersonalFinance.Api/Application/FuelPeriodComparison.cs](<../../backend/src/PersonalFinance.Api/Application/FuelPeriodComparison.cs>)、[backend/src/PersonalFinance.Api/Application/FuelPriceAnalysis.cs](<../../backend/src/PersonalFinance.Api/Application/FuelPriceAnalysis.cs>)、[backend/src/PersonalFinance.Api/Application/FuelQualityAnalysis.cs](<../../backend/src/PersonalFinance.Api/Application/FuelQualityAnalysis.cs>)、[backend/src/PersonalFinance.Api/Application/FuelReceipts.cs](<../../backend/src/PersonalFinance.Api/Application/FuelReceipts.cs>)、[backend/src/PersonalFinance.Api/Application/FuelRecordRules.cs](<../../backend/src/PersonalFinance.Api/Application/FuelRecordRules.cs>)、[backend/src/PersonalFinance.Api/Application/FuelService.cs](<../../backend/src/PersonalFinance.Api/Application/FuelService.cs>)、[backend/src/PersonalFinance.Api/Application/FuelStations.cs](<../../backend/src/PersonalFinance.Api/Application/FuelStations.cs>)、[backend/src/PersonalFinance.Api/Application/FuelStrategy.cs](<../../backend/src/PersonalFinance.Api/Application/FuelStrategy.cs>)、[backend/src/PersonalFinance.Api/Application/FuelVehicleRules.cs](<../../backend/src/PersonalFinance.Api/Application/FuelVehicleRules.cs>)

**数据库模型：** FuelRecord、FuelVehicle。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/FuelBulkTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelBulkTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelChronologyTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelChronologyTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelEconomyTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelEconomyTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelImportTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelImportTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelInsightsTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelInsightsTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelIntervalAnalysisTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelIntervalAnalysisTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelMathV2Tests.cs](<../../backend/tests/PersonalFinance.Tests/FuelMathV2Tests.cs>)、[backend/tests/PersonalFinance.Tests/FuelPeriodComparisonTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelPeriodComparisonTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelPriceAnalysisTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelPriceAnalysisTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelQualityTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelQualityTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelReceiptFactsTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelReceiptFactsTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelReceiptTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelReceiptTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelStationTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelStationTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelStrategyTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelStrategyTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelTests.cs>)、[backend/tests/PersonalFinance.Tests/FuelVehicleRulesTests.cs](<../../backend/tests/PersonalFinance.Tests/FuelVehicleRulesTests.cs>)、[frontend/e2e/fuel.spec.ts](<../../frontend/e2e/fuel.spec.ts>)、[frontend/redesign-tests/fuel-history.spec.ts](<../../frontend/redesign-tests/fuel-history.spec.ts>)、[frontend/src/tests/Fuel.test.tsx](<../../frontend/src/tests/Fuel.test.tsx>)、[frontend/src/tests/FuelAiPanel.test.tsx](<../../frontend/src/tests/FuelAiPanel.test.tsx>)、[frontend/src/tests/FuelBulkActions.test.tsx](<../../frontend/src/tests/FuelBulkActions.test.tsx>)、[frontend/src/tests/fuelCalculation.test.ts](<../../frontend/src/tests/fuelCalculation.test.ts>)、[frontend/src/tests/fuelImport.test.ts](<../../frontend/src/tests/fuelImport.test.ts>)、[frontend/src/tests/FuelImportDialog.test.tsx](<../../frontend/src/tests/FuelImportDialog.test.tsx>)、[frontend/src/tests/FuelOverviewPanel.test.tsx](<../../frontend/src/tests/FuelOverviewPanel.test.tsx>)、[frontend/src/tests/FuelPricesPanel.test.tsx](<../../frontend/src/tests/FuelPricesPanel.test.tsx>)、[frontend/src/tests/FuelQualityPanel.test.tsx](<../../frontend/src/tests/FuelQualityPanel.test.tsx>)、[frontend/src/tests/FuelReceiptFields.test.tsx](<../../frontend/src/tests/FuelReceiptFields.test.tsx>)、[frontend/src/tests/FuelReceipts.test.ts](<../../frontend/src/tests/FuelReceipts.test.ts>)、[frontend/src/tests/fuelRecords.test.ts](<../../frontend/src/tests/fuelRecords.test.ts>)、[frontend/src/tests/FuelStationsPanel.test.tsx](<../../frontend/src/tests/FuelStationsPanel.test.tsx>)、[frontend/src/tests/FuelStrategyPanel.test.tsx](<../../frontend/src/tests/FuelStrategyPanel.test.tsx>)、[frontend/src/tests/FuelTrashPanel.test.tsx](<../../frontend/src/tests/FuelTrashPanel.test.tsx>)、[frontend/src/tests/fuelWorkspace.test.ts](<../../frontend/src/tests/fuelWorkspace.test.ts>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 时间资产

**功能目标：** 时间资产的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/timeAssets/api.ts](<../../frontend/src/features/timeAssets/api.ts>)、[frontend/src/features/timeAssets/SegmentsEditor.tsx](<../../frontend/src/features/timeAssets/SegmentsEditor.tsx>)、[frontend/src/features/timeAssets/TransactionSelector.tsx](<../../frontend/src/features/timeAssets/TransactionSelector.tsx>)、[frontend/src/pages/TimeAssetsPage.tsx](<../../frontend/src/pages/TimeAssetsPage.tsx>)、[frontend/src/tests/TimeAssets.test.tsx](<../../frontend/src/tests/TimeAssets.test.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/Ai/AiAgentRuntime.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAgentRuntime.cs>)、[backend/src/PersonalFinance.Api/Application/RuntimeHealth.cs](<../../backend/src/PersonalFinance.Api/Application/RuntimeHealth.cs>)、[backend/src/PersonalFinance.Api/Application/TimeAssetEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/TimeAssetEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/TimeAssetMath.cs](<../../backend/src/PersonalFinance.Api/Application/TimeAssetMath.cs>)、[backend/src/PersonalFinance.Api/Application/TimeAssetReports.cs](<../../backend/src/PersonalFinance.Api/Application/TimeAssetReports.cs>)、[backend/src/PersonalFinance.Api/Application/TimeAssetService.cs](<../../backend/src/PersonalFinance.Api/Application/TimeAssetService.cs>)、[backend/src/PersonalFinance.Api/Application/TimeOffsetConverter.cs](<../../backend/src/PersonalFinance.Api/Application/TimeOffsetConverter.cs>)

**数据库模型：** TimeActivity、TimeBudget、TimeFinanceLink、TimeProject、TimeTemplate、TimeValuation。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/RuntimeHealthTests.cs](<../../backend/tests/PersonalFinance.Tests/RuntimeHealthTests.cs>)、[backend/tests/PersonalFinance.Tests/TimeAssetsTests.cs](<../../backend/tests/PersonalFinance.Tests/TimeAssetsTests.cs>)、[frontend/src/tests/TimeAssets.test.tsx](<../../frontend/src/tests/TimeAssets.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 薪酬社保福利

**功能目标：** 薪酬社保福利的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/payroll/api.ts](<../../frontend/src/features/payroll/api.ts>)、[frontend/src/features/payroll/catalog.ts](<../../frontend/src/features/payroll/catalog.ts>)、[frontend/src/features/payroll/DeleteButton.tsx](<../../frontend/src/features/payroll/DeleteButton.tsx>)、[frontend/src/features/payroll/Forms.tsx](<../../frontend/src/features/payroll/Forms.tsx>)、[frontend/src/features/payroll/Imports.tsx](<../../frontend/src/features/payroll/Imports.tsx>)、[frontend/src/features/payroll/LegacyFundBalances.tsx](<../../frontend/src/features/payroll/LegacyFundBalances.tsx>)、[frontend/src/features/payroll/ocr.ts](<../../frontend/src/features/payroll/ocr.ts>)、[frontend/src/features/payroll/Overview.tsx](<../../frontend/src/features/payroll/Overview.tsx>)、[frontend/src/features/payroll/Payslips.tsx](<../../frontend/src/features/payroll/Payslips.tsx>)、[frontend/src/features/payroll/TaxAndPolicies.tsx](<../../frontend/src/features/payroll/TaxAndPolicies.tsx>)、[frontend/src/features/payroll/text.ts](<../../frontend/src/features/payroll/text.ts>)、[frontend/src/features/payroll/WageScenario.tsx](<../../frontend/src/features/payroll/WageScenario.tsx>)、[frontend/src/pages/PayrollCenterPage.tsx](<../../frontend/src/pages/PayrollCenterPage.tsx>)、[frontend/src/tests/PayrollCenter.test.tsx](<../../frontend/src/tests/PayrollCenter.test.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/PayrollBenefitsService.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollBenefitsService.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollCenterDeletion.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollCenterDeletion.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollCenterEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollCenterEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollCenterImports.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollCenterImports.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollCenterReports.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollCenterReports.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollCenterService.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollCenterService.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollContributionSync.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollContributionSync.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollService.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollService.cs>)、[backend/src/PersonalFinance.Api/Application/PayrollWageScenarios.cs](<../../backend/src/PersonalFinance.Api/Application/PayrollWageScenarios.cs>)

**数据库模型：** PayrollComponent、PayrollEmployer、PayrollEmployment、PayrollImportJob、PayrollPayment、PayrollRevision、PayrollStatement、PayrollTaxCalculation、PayrollTaxDeclaration、PayrollTaxRule。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/PayrollCenterTests.cs](<../../backend/tests/PersonalFinance.Tests/PayrollCenterTests.cs>)、[frontend/src/tests/PayrollCenter.test.tsx](<../../frontend/src/tests/PayrollCenter.test.tsx>)、[frontend/src/tests/payrollDelete.test.tsx](<../../frontend/src/tests/payrollDelete.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 家庭共享协作

**功能目标：** 家庭共享协作的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/collaboration/api.ts](<../../frontend/src/features/collaboration/api.ts>)、[frontend/src/features/collaboration/BookComparison.tsx](<../../frontend/src/features/collaboration/BookComparison.tsx>)、[frontend/src/features/collaboration/TransactionSharingFields.tsx](<../../frontend/src/features/collaboration/TransactionSharingFields.tsx>)、[frontend/src/pages/CollaborationPage.tsx](<../../frontend/src/pages/CollaborationPage.tsx>)、[frontend/src/tests/Collaboration.test.tsx](<../../frontend/src/tests/Collaboration.test.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/CollaborationAiEndpoint.cs](<../../backend/src/PersonalFinance.Api/Application/CollaborationAiEndpoint.cs>)、[backend/src/PersonalFinance.Api/Application/CollaborationEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/CollaborationEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/CollaborationModel.cs](<../../backend/src/PersonalFinance.Api/Application/CollaborationModel.cs>)、[backend/src/PersonalFinance.Api/Application/CollaborationReports.cs](<../../backend/src/PersonalFinance.Api/Application/CollaborationReports.cs>)、[backend/src/PersonalFinance.Api/Application/CollaborationService.cs](<../../backend/src/PersonalFinance.Api/Application/CollaborationService.cs>)

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/CollaborationHttpTests.cs](<../../backend/tests/PersonalFinance.Tests/CollaborationHttpTests.cs>)、[backend/tests/PersonalFinance.Tests/CollaborationTests.cs](<../../backend/tests/PersonalFinance.Tests/CollaborationTests.cs>)、[frontend/src/tests/Collaboration.test.tsx](<../../frontend/src/tests/Collaboration.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## AI分析Copilot

**功能目标：** AI分析Copilot的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/api/ai.ts](<../../frontend/src/api/ai.ts>)、[frontend/src/api/aiAgent.ts](<../../frontend/src/api/aiAgent.ts>)、[frontend/src/components/ai/AiAnalysisView.tsx](<../../frontend/src/components/ai/AiAnalysisView.tsx>)、[frontend/src/components/ai/AiLazyMarkdown.tsx](<../../frontend/src/components/ai/AiLazyMarkdown.tsx>)、[frontend/src/components/ai/AiMarkdown.tsx](<../../frontend/src/components/ai/AiMarkdown.tsx>)、[frontend/src/components/ai/types.ts](<../../frontend/src/components/ai/types.ts>)、[frontend/src/components/AiConversationPanel.tsx](<../../frontend/src/components/AiConversationPanel.tsx>)、[frontend/src/components/AiDraftAmount.tsx](<../../frontend/src/components/AiDraftAmount.tsx>)、[frontend/src/components/AiDraftPanel.tsx](<../../frontend/src/components/AiDraftPanel.tsx>)、[frontend/src/components/AiEvidenceCards.tsx](<../../frontend/src/components/AiEvidenceCards.tsx>)、[frontend/src/features/ai/copilotContext.tsx](<../../frontend/src/features/ai/copilotContext.tsx>)、[frontend/src/features/ai/GlobalCopilot.tsx](<../../frontend/src/features/ai/GlobalCopilot.tsx>)、[frontend/src/features/concerts/ConcertDetail.tsx](<../../frontend/src/features/concerts/ConcertDetail.tsx>)、[frontend/src/features/festivals/FestivalDetail.tsx](<../../frontend/src/features/festivals/FestivalDetail.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/Ai/AiAgentConfiguration.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAgentConfiguration.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiAgentEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAgentEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiAgentRuntime.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAgentRuntime.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiAgentService.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAgentService.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiAgentTools.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAgentTools.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiAgentWorker.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAgentWorker.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiAnalysisReport.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAnalysisReport.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiAnswerValidator.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiAnswerValidator.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiComparisonWindow.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiComparisonWindow.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiContextBudget.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiContextBudget.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiContextService.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiContextService.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiConversationService.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiConversationService.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiDraftMatchingService.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiDraftMatchingService.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiDraftService.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiDraftService.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiDraftValidator.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiDraftValidator.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiEvidenceConsistency.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiEvidenceConsistency.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiFinancialTools.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiFinancialTools.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiGatewayControl.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiGatewayControl.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiHistoryRetention.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiHistoryRetention.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiInvestigationMemory.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiInvestigationMemory.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiInvestigationPlan.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiInvestigationPlan.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiOptions.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiOptions.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiPrivacyService.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiPrivacyService.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiPrivacyText.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiPrivacyText.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiReadToolExecutor.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiReadToolExecutor.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiRequestAuditService.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiRequestAuditService.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiRequestContext.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiRequestContext.cs>)、[backend/src/PersonalFinance.Api/Application/Ai/AiStructuredOutput.cs](<../../backend/src/PersonalFinance.Api/Application/Ai/AiStructuredOutput.cs>)、[backend/src/PersonalFinance.Api/Application/AiInvestigationQueries.cs](<../../backend/src/PersonalFinance.Api/Application/AiInvestigationQueries.cs>)、[backend/src/PersonalFinance.Api/Application/CollaborationAiEndpoint.cs](<../../backend/src/PersonalFinance.Api/Application/CollaborationAiEndpoint.cs>)、[backend/src/PersonalFinance.Api/Application/FestivalAi.cs](<../../backend/src/PersonalFinance.Api/Application/FestivalAi.cs>)、[backend/src/PersonalFinance.Api/Application/FuelAi.cs](<../../backend/src/PersonalFinance.Api/Application/FuelAi.cs>)、[backend/src/PersonalFinance.Api/Application/InterestAi.cs](<../../backend/src/PersonalFinance.Api/Application/InterestAi.cs>)、[backend/src/PersonalFinance.Api/Application/MemoryAiEndpoint.cs](<../../backend/src/PersonalFinance.Api/Application/MemoryAiEndpoint.cs>)、[backend/src/PersonalFinance.Api/Application/SpendingApprovalAi.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingApprovalAi.cs>)、[backend/src/PersonalFinance.Api/Application/SpendingUncertainty.cs](<../../backend/src/PersonalFinance.Api/Application/SpendingUncertainty.cs>)、[backend/src/PersonalFinance.Api/Application/TransactionAiEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/TransactionAiEndpoints.cs>)

**数据库模型：** AiAgentEvent、AiAgentGrant、AiAgentMemory、AiAgentReport、AiAgentSetting、AiAgentStep、AiAgentTask、AiAgentWorkflow、AiConfigurationSnapshot、AiConversation、AiMessage、AiPrivacySetting、AiRequestAudit、AiToolAudit、AiTransactionDraft、AiUsageRecord。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 存在相关AI实现，仍须授权并核查工具。

**已有测试：** [backend/tests/PersonalFinance.Tests/AiAgentTests.cs](<../../backend/tests/PersonalFinance.Tests/AiAgentTests.cs>)、[backend/tests/PersonalFinance.Tests/AiAnalysisSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/AiAnalysisSqlTests.cs>)、[backend/tests/PersonalFinance.Tests/AiAnalysisTests.cs](<../../backend/tests/PersonalFinance.Tests/AiAnalysisTests.cs>)、[backend/tests/PersonalFinance.Tests/AiLiveTests.cs](<../../backend/tests/PersonalFinance.Tests/AiLiveTests.cs>)、[backend/tests/PersonalFinance.Tests/AiPhase1HttpTests.cs](<../../backend/tests/PersonalFinance.Tests/AiPhase1HttpTests.cs>)、[backend/tests/PersonalFinance.Tests/AiPhase1PerformanceTests.cs](<../../backend/tests/PersonalFinance.Tests/AiPhase1PerformanceTests.cs>)、[backend/tests/PersonalFinance.Tests/AiPhase1Tests.cs](<../../backend/tests/PersonalFinance.Tests/AiPhase1Tests.cs>)、[backend/tests/PersonalFinance.Tests/AiSafetyTests.cs](<../../backend/tests/PersonalFinance.Tests/AiSafetyTests.cs>)、[backend/tests/PersonalFinance.Tests/AiSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/AiSqlTests.cs>)、[backend/tests/PersonalFinance.Tests/AiStreamingToolsTests.cs](<../../backend/tests/PersonalFinance.Tests/AiStreamingToolsTests.cs>)、[backend/tests/PersonalFinance.Tests/AiUnifiedAcceptanceSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/AiUnifiedAcceptanceSqlTests.cs>)、[backend/tests/PersonalFinance.Tests/AiUnrestrictedTests.cs](<../../backend/tests/PersonalFinance.Tests/AiUnrestrictedTests.cs>)、[backend/tests/PersonalFinance.Tests/AuditAiQueryRegressionTests.cs](<../../backend/tests/PersonalFinance.Tests/AuditAiQueryRegressionTests.cs>)、[backend/tests/PersonalFinance.Tests/SpendingApprovalConstraintTests.cs](<../../backend/tests/PersonalFinance.Tests/SpendingApprovalConstraintTests.cs>)、[frontend/e2e/ai-center.spec.ts](<../../frontend/e2e/ai-center.spec.ts>)、[frontend/e2e/ai-phase1.spec.ts](<../../frontend/e2e/ai-phase1.spec.ts>)、[frontend/redesign-tests/ai-analysis.spec.ts](<../../frontend/redesign-tests/ai-analysis.spec.ts>)、[frontend/src/tests/AiAnalysisView.test.tsx](<../../frontend/src/tests/AiAnalysisView.test.tsx>)、[frontend/src/tests/AiConversationPrivacy.test.tsx](<../../frontend/src/tests/AiConversationPrivacy.test.tsx>)、[frontend/src/tests/aiOperationJournal.test.ts](<../../frontend/src/tests/aiOperationJournal.test.ts>)、[frontend/src/tests/AiOverview.test.tsx](<../../frontend/src/tests/AiOverview.test.tsx>)、[frontend/src/tests/AiPage.test.tsx](<../../frontend/src/tests/AiPage.test.tsx>)、[frontend/src/tests/FinancialReportAi.test.tsx](<../../frontend/src/tests/FinancialReportAi.test.tsx>)、[frontend/src/tests/FuelAiPanel.test.tsx](<../../frontend/src/tests/FuelAiPanel.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 历史上的今天

**功能目标：** 历史上的今天的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/dashboard/OnThisDayCard.tsx](<../../frontend/src/features/dashboard/OnThisDayCard.tsx>)、[frontend/src/pages/OnThisDayPage.tsx](<../../frontend/src/pages/OnThisDayPage.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/OnThisDayService.cs](<../../backend/src/PersonalFinance.Api/Application/OnThisDayService.cs>)

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** 未按名称发现专用测试，需核查共享用例

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 认证与个人设置

**功能目标：** 认证与个人设置的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/api/profile.ts](<../../frontend/src/api/profile.ts>)、[frontend/src/features/fuel/VehicleProfileCard.tsx](<../../frontend/src/features/fuel/VehicleProfileCard.tsx>)、[frontend/src/features/fuel/VehicleProfileFields.tsx](<../../frontend/src/features/fuel/VehicleProfileFields.tsx>)、[frontend/src/pages/ProfilePage.tsx](<../../frontend/src/pages/ProfilePage.tsx>)、[frontend/src/tests/ProfileRegistration.test.tsx](<../../frontend/src/tests/ProfileRegistration.test.tsx>)、[frontend/src/utils/profile.ts](<../../frontend/src/utils/profile.ts>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/AdvanceAuthorizationService.cs](<../../backend/src/PersonalFinance.Api/Application/AdvanceAuthorizationService.cs>)、[backend/src/PersonalFinance.Api/Application/AuthService.cs](<../../backend/src/PersonalFinance.Api/Application/AuthService.cs>)、[backend/src/PersonalFinance.Api/Application/AuthService.Invitations.cs](<../../backend/src/PersonalFinance.Api/Application/AuthService.Invitations.cs>)、[backend/src/PersonalFinance.Api/Application/AuthService.Profile.cs](<../../backend/src/PersonalFinance.Api/Application/AuthService.Profile.cs>)

**数据库模型：** AuthorizedPayment、PhysicalProfile。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/ProfileAvatarTests.cs](<../../backend/tests/PersonalFinance.Tests/ProfileAvatarTests.cs>)、[backend/tests/PersonalFinance.Tests/ProfileSecurityTests.cs](<../../backend/tests/PersonalFinance.Tests/ProfileSecurityTests.cs>)、[backend/tests/PersonalFinance.Tests/ProfileSessionSqlTests.cs](<../../backend/tests/PersonalFinance.Tests/ProfileSessionSqlTests.cs>)、[frontend/src/tests/ProfileRegistration.test.tsx](<../../frontend/src/tests/ProfileRegistration.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 帮助反馈后台

**功能目标：** 帮助反馈后台的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/features/admin/InvitationManagement.tsx](<../../frontend/src/features/admin/InvitationManagement.tsx>)、[frontend/src/pages/AdminPage.tsx](<../../frontend/src/pages/AdminPage.tsx>)、[frontend/src/tests/SupportAdmin.test.tsx](<../../frontend/src/tests/SupportAdmin.test.tsx>)

**后端接口及核心服务：** 

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [backend/tests/PersonalFinance.Tests/AdministrationSupportTests.cs](<../../backend/tests/PersonalFinance.Tests/AdministrationSupportTests.cs>)、[frontend/src/tests/SupportAdmin.test.tsx](<../../frontend/src/tests/SupportAdmin.test.tsx>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。

## 备份恢复运维

**功能目标：** 备份恢复运维的管理、录入或分析。

**当前状态：** 部分完成（实现存在，本次未逐域验收）。

**前端入口：** [frontend/src/components/CurrencySettingsPanel.tsx](<../../frontend/src/components/CurrencySettingsPanel.tsx>)、[frontend/src/features/concerts/ModuleSettings.tsx](<../../frontend/src/features/concerts/ModuleSettings.tsx>)、[frontend/src/features/reports/StatisticsSettings.tsx](<../../frontend/src/features/reports/StatisticsSettings.tsx>)、[frontend/src/pages/AiSettingsPage.tsx](<../../frontend/src/pages/AiSettingsPage.tsx>)、[frontend/src/pages/SettingsPage.tsx](<../../frontend/src/pages/SettingsPage.tsx>)、[frontend/src/pages/SpendingApprovalSettingsPanel.tsx](<../../frontend/src/pages/SpendingApprovalSettingsPanel.tsx>)、[frontend/src/tests/currencySettings.test.tsx](<../../frontend/src/tests/currencySettings.test.tsx>)

**后端接口及核心服务：** [backend/src/PersonalFinance.Api/Application/OperationsEndpoints.cs](<../../backend/src/PersonalFinance.Api/Application/OperationsEndpoints.cs>)、[backend/src/PersonalFinance.Api/Application/OperationService.cs](<../../backend/src/PersonalFinance.Api/Application/OperationService.cs>)、[backend/src/PersonalFinance.Api/Application/OperationsService.cs](<../../backend/src/PersonalFinance.Api/Application/OperationsService.cs>)

**数据库模型：** 经共享服务或StoredDocument持久化，具体关联需逐接口核对。

**主要流程：** 页面→前端API→领域Endpoints→服务分部/计算→FinanceDb→JSON；注册路径见05。

**规则、公式和依赖：** 认证身份、用户归属、金额精度、Version与事务；高风险约束见11，具体算法以上述服务为准，不推断所有写操作均受统一事务保护。

**AI集成：** 未确认专用AI调用；不据此排除统一Copilot读取。

**已有测试：** [frontend/src/tests/aiOperationJournal.test.ts](<../../frontend/src/tests/aiOperationJournal.test.ts>)、[frontend/src/tests/currencySettings.test.tsx](<../../frontend/src/tests/currencySettings.test.tsx>)、[frontend/src/tests/operationJournal.test.ts](<../../frontend/src/tests/operationJournal.test.ts>)

**本次验证：** 未进行此域端到端验收。

**已知问题：** 本次未确认具体运行故障；已知历史未完成范围见10。

**后续建议：** 改前读取上述实现、请求契约和测试；在隔离环境验证实际流程。对应证据为以上源码路径。


## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。

## 投资高风险算法补充

InvestmentMath：买入现金流=-(Amount+Commission+Tax+OtherFee)；卖出/股息/利息=Amount-费用；仓位调整现金流0。移动平均成本处置按Cost×卖出数量/持仓量，8位AwayFromZero，全清仓取剩余全部成本；已实现收益=卖出金额-费用-处置成本。Gross按数量×价格2位AwayFromZero。交易顺序和结算顺序均不得出现负持仓；不能简化成只验当前余额。证据：Application/InvestmentMath.cs。
