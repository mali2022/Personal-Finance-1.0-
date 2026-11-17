# Festival Finance Implementation

已实现：节日计划创建/修改/取消/隐藏、分类预算、采购清单及状态、送礼对象档案、采购图片与凭据、真实支出/拆分分录/退款归属及撤销、跨币种归属、预算历史与关联审计、三种AI建议及调整、确认采纳采购意向、原消费审批草稿适配、原消费价值比较、复盘快照、跨年比较、提前储蓄建议、站内提醒、财务日历接入、年度确认续建。

前端新增 `/festivals`，导航位于预算与计划；详情为总览、预算、采购、AI、真实流水、复盘六个标签页。具备加载、空状态、错误重试、表单校验、撤销确认和保存反馈。跟随现有深色主题与金额隐藏状态。

新增代码：
- backend/src/PersonalFinance.Api/Application/Festival*.cs（领域契约、规则、API、归属核算、规划、续建、AI、价值比较、附件）
- backend/tests/PersonalFinance.Tests/Festival*.cs（规则、持久化、拆分与外币、性能）
- frontend/src/features/festivals/*、frontend/src/pages/FestivalsPage.tsx
- frontend/src/tests/Festivals.test.ts、frontend/integration/festivals.spec.ts
- tools/verify-festivals-sql.ps1、tools/verify-festivals-browser.ps1

修改：FinanceEndpoints.cs、PlanningCalendarService.cs、frontend/src/routes/index.tsx、design/navigation.ts、stores/operationJournal.ts，以及版本公告与package版本。既有工作区修改保留。

无数据库结构迁移。禁止把计划预留、未执行采购、待返现视为真实资产或支出。生产数据未用于自动化写入测试。
