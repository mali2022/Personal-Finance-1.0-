# 历史文档索引

生成日期：2026-11-18
分支：main
Commit：见 `git log -1`（本索引不锁定提交）
目的：登记仓库现存文档，供接手人按目录定位证据。

> 2026-11-18 重建说明：旧版由脚本生成的整表有 304 行，其中 243 行指向已不存在的文件（含 8 个已删除的文档目录产物），索引因此失效。本版只登记当前真实存在的文件，逐条用 `existsSync` 校验过；已删除路径不再保留，需要追溯时查 git 历史。行数按文件实际换行统计。

## 1.0 发布文档（2026-11-18 合并生成）

| 文档 | 仓库相对路径 | 行数 | 一级标题 / 说明 |
|---|---|---|---|
| [版本历史-1.0.md](<../../docs/版本历史-1.0.md>) | docs/版本历史-1.0.md | 874 | Personal Finance 版本历史（1.0 正式版） |
| [维护手册-1.0.md](<../../docs/维护手册-1.0.md>) | docs/维护手册-1.0.md | 860 | 维护手册（1.0 正式版） |

| 归档数据 | 仓库相对路径 | 大小 | 说明 |
|---|---|---|---|
| [releases-history-previously-published.json](<../../docs/archive/releases-history-previously-published.json>) | docs/archive/releases-history-previously-published.json | 187588 字节 | 117 篇旧发布文档合并前、102 条公告目录的原文备份，只读参考，不参与构建 |

## 交接文档（docs/ai-handover，20 篇）

| 文档 | 仓库相对路径 | 行数 | 一级标题 / 说明 |
|---|---|---|---|
| [00-START-HERE.md](<../../docs/ai-handover/00-START-HERE.md>) | docs/ai-handover/00-START-HERE.md | 44 | 新智能体五分钟入口 |
| [01-PROJECT-OVERVIEW.md](<../../docs/ai-handover/01-PROJECT-OVERVIEW.md>) | docs/ai-handover/01-PROJECT-OVERVIEW.md | 36 | 项目概况与目录 |
| [02-ARCHITECTURE.md](<../../docs/ai-handover/02-ARCHITECTURE.md>) | docs/ai-handover/02-ARCHITECTURE.md | 43 | 架构及业务调用链 |
| [03-FEATURE-INVENTORY.md](<../../docs/ai-handover/03-FEATURE-INVENTORY.md>) | docs/ai-handover/03-FEATURE-INVENTORY.md | 748 | 功能盘点档案 |
| [04-DATABASE.md](<../../docs/ai-handover/04-DATABASE.md>) | docs/ai-handover/04-DATABASE.md | 227 | 数据库交接 |
| [05-API-AND-ROUTES.md](<../../docs/ai-handover/05-API-AND-ROUTES.md>) | docs/ai-handover/05-API-AND-ROUTES.md | 795 | API与路由清单 |
| [06-AI-INTEGRATION.md](<../../docs/ai-handover/06-AI-INTEGRATION.md>) | docs/ai-handover/06-AI-INTEGRATION.md | 27 | AI专项交接 |
| [07-LOCAL-DEVELOPMENT.md](<../../docs/ai-handover/07-LOCAL-DEVELOPMENT.md>) | docs/ai-handover/07-LOCAL-DEVELOPMENT.md | 60 | 环境与运行 |
| [08-TESTING-AND-QUALITY.md](<../../docs/ai-handover/08-TESTING-AND-QUALITY.md>) | docs/ai-handover/08-TESTING-AND-QUALITY.md | 519 | 测试和质量 |
| [09-CURRENT-STATUS.md](<../../docs/ai-handover/09-CURRENT-STATUS.md>) | docs/ai-handover/09-CURRENT-STATUS.md | 1235 | 当前Git与开发状态 |
| [10-BACKLOG-AND-ROADMAP.md](<../../docs/ai-handover/10-BACKLOG-AND-ROADMAP.md>) | docs/ai-handover/10-BACKLOG-AND-ROADMAP.md | 358 | 待办与下一步 |
| [11-RISKS-AND-GUARDRAILS.md](<../../docs/ai-handover/11-RISKS-AND-GUARDRAILS.md>) | docs/ai-handover/11-RISKS-AND-GUARDRAILS.md | 26 | 风险与护栏 |
| [12-DOCUMENT-INDEX.md](<../../docs/ai-handover/12-DOCUMENT-INDEX.md>) | docs/ai-handover/12-DOCUMENT-INDEX.md | 322 | 历史文档索引 |
| [13-DECISION-LOG.md](<../../docs/ai-handover/13-DECISION-LOG.md>) | docs/ai-handover/13-DECISION-LOG.md | 28 | 技术决策 |
| [14-HANDOVER-VALIDATION.md](<../../docs/ai-handover/14-HANDOVER-VALIDATION.md>) | docs/ai-handover/14-HANDOVER-VALIDATION.md | 38 | 交接真实性验收 |
| [15-CHANGELOG-SINCE-HANDOVER.md](<../../docs/ai-handover/15-CHANGELOG-SINCE-HANDOVER.md>) | docs/ai-handover/15-CHANGELOG-SINCE-HANDOVER.md | 425 | 增量变更记录 |
| [16-CANDIDATE-VERIFICATION-20261031.md](<../../docs/ai-handover/16-CANDIDATE-VERIFICATION-20261031.md>) | docs/ai-handover/16-CANDIDATE-VERIFICATION-20261031.md | 150 | 可复现候选与隔离库回归验证 |
| [DATABASE-SCHEMA-REFERENCE.md](<../../docs/ai-handover/DATABASE-SCHEMA-REFERENCE.md>) | docs/ai-handover/DATABASE-SCHEMA-REFERENCE.md | 4814 | 模型字段、键、索引与关系参考 |
| [NEW-AGENT-PROMPT.md](<../../docs/ai-handover/NEW-AGENT-PROMPT.md>) | docs/ai-handover/NEW-AGENT-PROMPT.md | 19 | 通用新智能体启动提示词 |
| [SESSION-HANDOFF-TEMPLATE.md](<../../docs/ai-handover/SESSION-HANDOFF-TEMPLATE.md>) | docs/ai-handover/SESSION-HANDOFF-TEMPLATE.md | 24 | 会话交接模板 |

## 产品与验收报告（docs/，43 篇）

| 文档 | 仓库相对路径 | 行数 | 一级标题 / 说明 |
|---|---|---|---|
| [AI分析体系升级-审计与验收-20261028.md](<../../docs/AI分析体系升级-审计与验收-20261028.md>) | docs/AI分析体系升级-审计与验收-20261028.md | 151 | AI 分析体系升级：审计与验收 |
| [AI工具参数兼容修复-6.13.1-20261028.md](<../../docs/AI工具参数兼容修复-6.13.1-20261028.md>) | docs/AI工具参数兼容修复-6.13.1-20261028.md | 28 | AI 工具参数兼容修复验收 |
| [Apple-首页与仪表盘重构-开发与验收报告-20261031.md](<../../docs/Apple-首页与仪表盘重构-开发与验收报告-20261031.md>) | docs/Apple-首页与仪表盘重构-开发与验收报告-20261031.md | 408 | Apple Design 首页与仪表盘重构 — 开发与验收报告 |
| [LIFE-SIMULATOR-CONTINUATION-20261028.md](<../../docs/LIFE-SIMULATOR-CONTINUATION-20261028.md>) | docs/LIFE-SIMULATOR-CONTINUATION-20261028.md | 47 | 人生财务模拟器续作与发布验收（2026-10-28） |
| [LIFE-SIMULATOR-DELIVERY.md](<../../docs/LIFE-SIMULATOR-DELIVERY.md>) | docs/LIFE-SIMULATOR-DELIVERY.md | 240 | 人生财务决策模拟器：实现与验收记录 |
| [ai-6132-final-acceptance-20261028.md](<../../docs/ai-6132-final-acceptance-20261028.md>) | docs/ai-6132-final-acceptance-20261028.md | 101 | Personal Finance 6.13.2 — 最终验收与发布准备报告 |
| [ai-6132-release-checklist.md](<../../docs/ai-6132-release-checklist.md>) | docs/ai-6132-release-checklist.md | 41 | Personal Finance 6.13.2 发布检查清单与健康检查方案 |
| [ai-unrestricted-acceptance-20261028.md](<../../docs/ai-unrestricted-acceptance-20261028.md>) | docs/ai-unrestricted-acceptance-20261028.md | 64 | AI 全功能与统一财务读取授权开发验收报告 |
| [finance-consistency-audit-2.md](<../../docs/finance-consistency-audit-2.md>) | docs/finance-consistency-audit-2.md | 86 | 财务一致性审计 2.0：审计与交付记录 |
| [music-interest-delivery-20261029.md](<../../docs/music-interest-delivery-20261029.md>) | docs/music-interest-delivery-20261029.md | 68 | 艺人与品牌长期消费扩展交付记录 |
| [shared-finance-centers.md](<../../docs/shared-finance-centers.md>) | docs/shared-finance-centers.md | 57 | 账本中心与家庭中心 |
| [spending-value-lab-v2.md](<../../docs/spending-value-lab-v2.md>) | docs/spending-value-lab-v2.md | 131 | 消费价值决策实验室 2.0：第二阶段交付与验收 |
| [spending-value-lab.md](<../../docs/spending-value-lab.md>) | docs/spending-value-lab.md | 43 | 消费价值决策实验室：第一阶段交付 |
| [专项记账候选模块清单-20261116.md](<../../docs/专项记账候选模块清单-20261116.md>) | docs/专项记账候选模块清单-20261116.md | 67 | 专项记账候选模块清单（2026-11-16） |
| [全部交易工作台-审计与验证-20261023.md](<../../docs/全部交易工作台-审计与验证-20261023.md>) | docs/全部交易工作台-审计与验证-20261023.md | 73 | 全部交易工作台：审计、实现与验证 |
| [全部交易性能对比-20261023.md](<../../docs/全部交易性能对比-20261023.md>) | docs/全部交易性能对比-20261023.md | 22 | 全部交易性能验证 2026-10-23 |
| [全部异常超时修复-20261023.md](<../../docs/全部异常超时修复-20261023.md>) | docs/全部异常超时修复-20261023.md | 13 | 全部异常超时修复验证 |
| [前端页面重构方案-20261103.md](<../../docs/前端页面重构方案-20261103.md>) | docs/前端页面重构方案-20261103.md | 680 | 个人记账 · 前端页面重构方案（允许完全重构） |
| [历史上的今天-6.4.0-重构与验证.md](<../../docs/历史上的今天-6.4.0-重构与验证.md>) | docs/历史上的今天-6.4.0-重构与验证.md | 62 | 历史上的今天 / 消费时光机重构 |
| [实物资产中心-6.7.0.md](<../../docs/实物资产中心-6.7.0.md>) | docs/实物资产中心-6.7.0.md | 34 | 实物资产中心 6.7.0 |
| [性能审计报告-20261023.md](<../../docs/性能审计报告-20261023.md>) | docs/性能审计报告-20261023.md | 166 | 性能审计报告 |
| [投资收益率2.0-功能与验收报告.md](<../../docs/投资收益率2.0-功能与验收报告.md>) | docs/投资收益率2.0-功能与验收报告.md | 161 | 投资收益率分析2.0：功能、算法与验收交付 |
| [投资收益率2.0-实施进度.md](<../../docs/投资收益率2.0-实施进度.md>) | docs/投资收益率2.0-实施进度.md | 74 | 投资收益率分析2.0实施进度 |
| [投资收益率2.0-缓存与迁移.md](<../../docs/投资收益率2.0-缓存与迁移.md>) | docs/投资收益率2.0-缓存与迁移.md | 33 | 投资收益率2.0：缓存与迁移 |
| [智能自动对账2.0-6.11.0-开发与验收报告-20261027.md](<../../docs/智能自动对账2.0-6.11.0-开发与验收报告-20261027.md>) | docs/智能自动对账2.0-6.11.0-开发与验收报告-20261027.md | 235 | 智能自动对账 2.0 — 6.11.0 开发与验收报告 |
| [智能自动对账2.0-6.11.0-线上发布记录-20261027.md](<../../docs/智能自动对账2.0-6.11.0-线上发布记录-20261027.md>) | docs/智能自动对账2.0-6.11.0-线上发布记录-20261027.md | 59 | 智能自动对账2.0 — 6.11.0 线上发布记录 |
| [本地启动与跨设备说明.md](<../../docs/本地启动与跨设备说明.md>) | docs/本地启动与跨设备说明.md | 99 | 本地启动与跨设备说明 |
| [标准CSV导入说明.md](<../../docs/标准CSV导入说明.md>) | docs/标准CSV导入说明.md | 25 | 标准收支 CSV 导入 |
| [演唱会专项记账-20261021.md](<../../docs/演唱会专项记账-20261021.md>) | docs/演唱会专项记账-20261021.md | 50 | 演唱会专项记账 |
| [演唱会专项记账3.0-P1实施进度.md](<../../docs/演唱会专项记账3.0-P1实施进度.md>) | docs/演唱会专项记账3.0-P1实施进度.md | 49 | P1实施与验收 |
| [演唱会专项记账3.0-功能实施矩阵.md](<../../docs/演唱会专项记账3.0-功能实施矩阵.md>) | docs/演唱会专项记账3.0-功能实施矩阵.md | 68 | 演唱会专项记账3.0：功能实施矩阵 |
| [演唱会专项记账3.0-开发记录.md](<../../docs/演唱会专项记账3.0-开发记录.md>) | docs/演唱会专项记账3.0-开发记录.md | 241 | 开发记录 |
| [演唱会专项记账3.0-未完成项与后续规划.md](<../../docs/演唱会专项记账3.0-未完成项与后续规划.md>) | docs/演唱会专项记账3.0-未完成项与后续规划.md | 69 | 演唱会专项记账3.0：未完成项与后续规划 |
| [演唱会专项记账3.0-架构与数据模型.md](<../../docs/演唱会专项记账3.0-架构与数据模型.md>) | docs/演唱会专项记账3.0-架构与数据模型.md | 61 | 演唱会专项记账3.0：架构与数据模型 |
| [演唱会专项记账3.0-测试与验收报告.md](<../../docs/演唱会专项记账3.0-测试与验收报告.md>) | docs/演唱会专项记账3.0-测试与验收报告.md | 273 | 演唱会专项记账3.0：测试与验收报告 |
| [演唱会专项记账3.0-项目现状审计.md](<../../docs/演唱会专项记账3.0-项目现状审计.md>) | docs/演唱会专项记账3.0-项目现状审计.md | 115 | 演唱会专项记账 3.0：首轮源码审计 |
| [独立记账中心-6.12.0-线上发布记录-20261027.md](<../../docs/独立记账中心-6.12.0-线上发布记录-20261027.md>) | docs/独立记账中心-6.12.0-线上发布记录-20261027.md | 20 | 独立记账中心 6.12.0 线上发布记录 |
| [百万级全功能测试与全局优化-20261026.md](<../../docs/百万级全功能测试与全局优化-20261026.md>) | docs/百万级全功能测试与全局优化-20261026.md | 63 | 百万级账本测试与全局优化（2026-10-26） |
| [百万级复杂查询专项优化-20261026.md](<../../docs/百万级复杂查询专项优化-20261026.md>) | docs/百万级复杂查询专项优化-20261026.md | 72 | 百万级复杂查询专项优化（2026-10-26） |
| [记账与资金往来优化-20261025.md](<../../docs/记账与资金往来优化-20261025.md>) | docs/记账与资金往来优化-20261025.md | 32 | 记账与资金往来操作优化 — 2026.10.25.1 |
| [财务统计口径管理-6.5.0.md](<../../docs/财务统计口径管理-6.5.0.md>) | docs/财务统计口径管理-6.5.0.md | 26 | 财务统计口径管理（6.5.0） |
| [财务统计口径管理-6.6.0.md](<../../docs/财务统计口径管理-6.6.0.md>) | docs/财务统计口径管理-6.6.0.md | 64 | 十模块财务统计口径管理（6.6.0） |
| [项目全部功能报告-2026-10-25.md](<../../docs/项目全部功能报告-2026-10-25.md>) | docs/项目全部功能报告-2026-10-25.md | 371 | Personal Finance 项目全部功能报告 |

## 其他目录文档（7 篇）

| 文档 | 仓库相对路径 | 行数 | 一级标题 / 说明 |
|---|---|---|---|
| [README.md](<../../backend/README.md>) | backend/README.md | 142 | Personal Finance · 真实后端 |
| [README.md](<../../backend/tools/DirectorySeed/README.md>) | backend/tools/DirectorySeed/README.md | 31 | DirectorySeed 本地运营工具 |
| [README.md](<../../backend/docs/personal-finance-4.0-phase0/README.md>) | backend/docs/personal-finance-4.0-phase0/README.md | 27 | Personal Finance 4.0 — Phase 0 项目审计 |
| [README.md](<../../backend/docs/personal-finance-4.0-phase1/README.md>) | backend/docs/personal-finance-4.0-phase1/README.md | 59 | Personal Finance 4.0 — Phase 1 核心首批交付 |
| [README.md](<../../backend/docs/stage-ai/README.md>) | backend/docs/stage-ai/README.md | 104 | 阶段 AI：DeepSeek 首批实现与验收 |
| [README.md](<../../backend/docs/stage-z-maintenance/README.md>) | backend/docs/stage-z-maintenance/README.md | 20 | Personal Finance 3.0 长期维护文档 |
| [README.md](<../../frontend/README.md>) | frontend/README.md | 81 | Personal Finance · 前端 1.0.0 |

## 根目录文档（12 篇）

| 文档 | 仓库相对路径 | 行数 | 一级标题 / 说明 |
|---|---|---|---|
| [AGENTS.md](<../../AGENTS.md>) | AGENTS.md | 21 | 项目协作要求 |
| [AI消费审批中心-开发与验收报告.md](<../../AI消费审批中心-开发与验收报告.md>) | AI消费审批中心-开发与验收报告.md | 84 | AI 消费审批中心开发与验收报告 |
| [AI消费审批中心1.1-深度完善与验收报告.md](<../../AI消费审批中心1.1-深度完善与验收报告.md>) | AI消费审批中心1.1-深度完善与验收报告.md | 106 | AI 消费审批中心 1.1 深度完善与验收报告 |
| [FESTIVAL-FINANCE-ACCEPTANCE.md](<../../FESTIVAL-FINANCE-ACCEPTANCE.md>) | FESTIVAL-FINANCE-ACCEPTANCE.md | 28 | Festival Finance Acceptance |
| [FESTIVAL-FINANCE-API.md](<../../FESTIVAL-FINANCE-API.md>) | FESTIVAL-FINANCE-API.md | 30 | Festival Finance API |
| [FESTIVAL-FINANCE-ARCHITECTURE.md](<../../FESTIVAL-FINANCE-ARCHITECTURE.md>) | FESTIVAL-FINANCE-ARCHITECTURE.md | 24 | Festival Finance Architecture |
| [FESTIVAL-FINANCE-IMPLEMENTATION.md](<../../FESTIVAL-FINANCE-IMPLEMENTATION.md>) | FESTIVAL-FINANCE-IMPLEMENTATION.md | 16 | Festival Finance Implementation |
| [FESTIVAL-FINANCE-TEST-REPORT.md](<../../FESTIVAL-FINANCE-TEST-REPORT.md>) | FESTIVAL-FINANCE-TEST-REPORT.md | 26 | Festival Finance Test Report |
| [README.md](<../../README.md>) | README.md | 253 | 个人记账与个人财务管理数据库 |
| [代码审查报告-20261028.md](<../../代码审查报告-20261028.md>) | 代码审查报告-20261028.md | 347 | 个人记账项目 · 全部源码只读审查报告 |
| [加油与油耗2.0-开发与验收报告.md](<../../加油与油耗2.0-开发与验收报告.md>) | 加油与油耗2.0-开发与验收报告.md | 71 | 加油与油耗 2.0 开发与验收报告 |
| [项目问题清单-20261111.md](<../../项目问题清单-20261111.md>) | 项目问题清单-20261111.md | 384 | 个人记账项目 · 问题清单（2026-11-11） |

## 目录入口（非单篇文档）

- `sql/`
- `scripts/`
- `tools/`
- `frontend/`
- `backend/`
- `docs/archive/`
- `docs/frontend-v2-preview/`
- `docs/项目功能检查证据-2026-10-25/`

## 未验证事项

- 本索引只校验文件是否存在并登记一级标题与行数，没有逐篇核对内容是否仍与当前实现一致。
- `docs/frontend-v2-preview/` 与 `docs/项目功能检查证据-2026-10-25/` 只登记目录，未逐文件展开。
- `docs/archive/releases-history-previously-published.json` 未做条数与字段完整性校验，只登记文件大小。
- 1.0 两篇文档的行数沿用会话记录（874 / 864），按换行统计为 873 / 864，差异来自末行换行计数口径；维护手册在 2026-11-18 增补 4.7「复制或移动目录后启动失败」后由 852 行增至 860 行，随后改为端口 5085 时增至 864 行。
- 根目录说明文档是否为最新状态未验证；`deploy/`（`CLEANUP.md`、`SNAPSHOT-READS.md`、`scripts/pull-cloud-to-local.ps1`、`阿里云连接信息.txt`）已于 2026-11-18 按用户决定整目录删除，本索引不再登记。

