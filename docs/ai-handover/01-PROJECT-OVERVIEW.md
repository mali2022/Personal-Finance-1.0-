# 项目概况与目录

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：项目概况与目录。

Personal Finance为个人财务管理Web单仓库，28业务域见03。前端package版本6.20.0，公告2026.10.31.1；两者不是生产已部署证明。

React19、TypeScript5.9、Vite7、Ant Design5、TanStack Query5、Zustand5、ECharts6；C#/ASP.NET Core10、EF Core10.0.12、SQL Server。前端声明版本范围不等于已安装精确版本，pnpm-lock.yaml是锁定证据。

|路径|作用/依赖|核心/生成/数据|影响|
|---|---|---|---|
|frontend/src/main.tsx|SPA入口、Query缓存与主题|核心源码|全部页面|
|frontend/src/routes|认证路由|核心源码|导航权限|
|frontend/src/pages、features|页面组件|业务源码|对应业务域|
|frontend/src/api、types|HTTP和契约|核心源码|前后端兼容|
|frontend/src/data/releases.json|公告并嵌入后端|公开源码|发布|
|backend/src/PersonalFinance.Api/Program.cs|DI、中间件、启动|核心源码|全系统|
|backend/src/PersonalFinance.Api/Application|Minimal API和服务分部|核心源码|领域规则|
|backend/src/PersonalFinance.Api/Domain、Contracts|实体、请求DTO|核心源码|迁移和API|
|backend/src/PersonalFinance.Api/Infrastructure|FinanceDb、Bootstrap、Migrations|核心源码/关联真实库|数据结构|
|backend/tests、frontend/src/tests、frontend/e2e|xUnit/Vitest/Playwright|测试源码|质量|
|scripts、tools|Windows启动、运维、性能|可操作真实数据|运维|
|sql、Build.sql|历史数据库方案|非现行迁移|禁止混用|
|docs、backend/docs|历史报告与设计|文档|知识依据|
|node_modules、bin、obj、dist|依赖/构建|生成可重建|不当源码交接|
|.keys、appsettings.Local.json|本机配置和保护密钥|敏感/不可随意重建|认证和AI|
|数据库、附件、备份|独立数据交接|真实业务/不可随意重建|数据恢复|

目录按层索引，不逐一列普通依赖。入口、接口、模型、测试和历史文档分别在02/04/05/08/12。

## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。
