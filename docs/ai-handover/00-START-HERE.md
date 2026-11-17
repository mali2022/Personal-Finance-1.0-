# 新智能体五分钟入口

生成日期：2026-10-31（Asia/Shanghai）

2026-11-18 更新（官方 1.0 精简发布）：当前发布版本 Personal Finance 1.0.0（发布号 2026.11.18.1，频道 stable，本地站点端口 5085）；公告只有 1 条「1.0 正式版发布：全部功能一览」，端口 5085 与启动修复都写在这条公告里，没有单独的 1.0.1 条目；2026-11-18 及以前本副本端口为 5080；117 篇旧发布文档已合并为 [版本历史-1.0](../版本历史-1.0.md) 与 [维护手册-1.0](../维护手册-1.0.md)，102 条旧公告归档在 [releases-history-previously-published.json](../archive/releases-history-previously-published.json)。本副本为正式版交付件，不含 .git；完整提交历史见原项目目录「个人记账」。

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：新智能体五分钟入口。

React19/TypeScript/Vite + ASP.NET Core10/EF Core/SQL Server个人财务Web单仓库，DeepSeek AI；28个业务域存在代码，本次未逐域动态验收。大量功能尚在工作区，克隆HEAD不足以接手。

先读根AGENTS→09当前状态→10待办→11保护规则。10 的首项任务（独立可复现候选与隔离库回归）已在 2026-10-31 第二轮实测完成主体：隔离 LocalDB 上 93/93 迁移、后端 836 项测试 821 通过/1 失败/14 跳过、前端 606 项 605 通过/1 失败、生产构建通过；两个失败项属口径/文案漂移，需授权后处理。可重跑命令与证据见 [16-CANDIDATE-VERIFICATION-20261031.md](16-CANDIDATE-VERIFICATION-20261031.md)。真实库迁移已补齐（2026-11-18 核对：源码 95 个迁移文件，__EFMigrationsHistory 95 条，最新 20261115233000_ZeroAmountTransactions）；仍不要在本机之外初始化应用库。

关键入口frontend/src/main.tsx、frontend/src/routes/index.tsx、后端Program.cs、FinanceEndpoints.cs和FinanceDb.cs。旧根README/sql设计不可直接套用EF应用。

启动条件及命令见07：Node>=24、.NET10、声明pnpm11.19.0，前端5173代理5085（2026-11-18 及以前为 5080）。先确认数据库；2026-11-14 起默认 Windows 启动器只启动本地（`Server=.` / `PersonalFinanceWeb`），云端入口与部署物已删除，见09的「完全本地化」一节。

2026-11-18（官方 1.0 精简发布）：公告校验 exit 0（1 条公告，2026.11.18.1）、Releases.test.tsx 10 passed、verify-build exit 0、前端生产构建 exit 0、wwwroot 静态冒烟 / 与 /updates 返回 200；前端全量 vitest 106 文件 / 717 用例（711 通过 / 6 失败，与原项目重跑一致，属既有红灯），后端未连真实库，E2E 浏览器、真实 AI、备份恢复未验收。两个历史失败项（后端日历断言、前端 Fuel 文案漂移）仍未修复。不是100%无损承诺。

## 文档索引

- [01-PROJECT-OVERVIEW.md](01-PROJECT-OVERVIEW.md)
- [02-ARCHITECTURE.md](02-ARCHITECTURE.md)
- [03-FEATURE-INVENTORY.md](03-FEATURE-INVENTORY.md)
- [04-DATABASE.md](04-DATABASE.md)
- [05-API-AND-ROUTES.md](05-API-AND-ROUTES.md)
- [06-AI-INTEGRATION.md](06-AI-INTEGRATION.md)
- [07-LOCAL-DEVELOPMENT.md](07-LOCAL-DEVELOPMENT.md)
- [08-TESTING-AND-QUALITY.md](08-TESTING-AND-QUALITY.md)
- [09-CURRENT-STATUS.md](09-CURRENT-STATUS.md)
- [10-BACKLOG-AND-ROADMAP.md](10-BACKLOG-AND-ROADMAP.md)
- [11-RISKS-AND-GUARDRAILS.md](11-RISKS-AND-GUARDRAILS.md)
- [12-DOCUMENT-INDEX.md](12-DOCUMENT-INDEX.md)
- [13-DECISION-LOG.md](13-DECISION-LOG.md)
- [15-CHANGELOG-SINCE-HANDOVER.md](15-CHANGELOG-SINCE-HANDOVER.md)
- [16-CANDIDATE-VERIFICATION-20261031.md](16-CANDIDATE-VERIFICATION-20261031.md)
- [DATABASE-SCHEMA-REFERENCE.md](DATABASE-SCHEMA-REFERENCE.md)
- [NEW-AGENT-PROMPT.md](NEW-AGENT-PROMPT.md)
- [SESSION-HANDOFF-TEMPLATE.md](SESSION-HANDOFF-TEMPLATE.md)

## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。

- [14-HANDOVER-VALIDATION.md](14-HANDOVER-VALIDATION.md)
