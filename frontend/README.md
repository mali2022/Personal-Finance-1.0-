<!-- version-catalog: 1.0.0; sequence: 4 -->
> 归档版本：Personal Finance 测试版 1.0.0；顺序：004；时间依据：2026-10-07。原文中的旧版本、阶段号及验收状态保留用于追溯。

# Personal Finance · 前端 1.0.0

> 说明：本文引用的《Personal Finance 测试版 …》系列过程文档已在 1.0 正式版整理时合并删除，内容现见 docs/版本历史-1.0.md 与 docs/维护手册-1.0.md。

React + TypeScript + Vite + Ant Design + React Router + TanStack Query + Axios + ECharts，按四阶段实现个人财务前端，最终阶段完成质量收尾。真实数据库访问必须经过 ASP.NET Core Web API；本目录没有数据库驱动、SQL Server 凭据或连接串。

**真实 ASP.NET Core / EF Core / SQL Server 服务现已实现并完成本机联调。启动与登录说明见 [后端手册](<../backend/README.md>)。默认开发模式仍使用 Mock；`pnpm dev:api` 在 5174 端口连接真实 API。**

## 近期功能补充文档

- 统一功能索引
- 手机端商户下拉选择
- 首页交易日历、每日收支与卡片对齐
- 首页 AI 财务洞察、授权与验证边界
- 后台管理与帮助反馈
- 薪酬与社保中心

以下早期阶段说明保留原记录；近期新增行为以对应补充文档为准。

## 启动

已验证环境：Node 24、pnpm 11.19.0、Chromium。

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:5173。开发默认开启 MSW 演示账本；任意有效邮箱和非空密码可演示登录。账本、导入任务与附件在内存中，页面刷新重置。真实账户默认值从账户列表选取，不依赖演示 ID。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm verify:build
pnpm exec playwright install chromium
pnpm e2e
pnpm preview
```

E2E 会启动开发服务和生产预览服务；生产会话用可控 HTTP 测试响应验证，不等同于 ASP.NET Core 联调。账期固定为 2026-10-07，时区 Asia/Shanghai，不冻结动画/网络定时器。若已启动预览，请先构建，确保读取最新 dist。受本机目录读取约束，Vite 使用 `--configLoader runner`；也可直接执行 `node_modules/.bin` 中的工具。

## 已实现

- 首页：七个独立组件、财务概览与上月变化、账户、预算剩余、分类/趋势图、最近交易和快捷操作。
- 日常交易：支出、收入、转账、退款、信用卡还款、拆分、编辑、软删除与恢复，快速连续记账、模板与商户分类推荐。
- 查询：全局搜索，日期/币种/账户/一级或二级分类/商户/项目/标签/金额/状态筛选，URL 收藏、分页及金额/日期排序，历史停用分类可查。
- 业务：报销垫付与到账、借出与借入、分次归还、项目、商户、标签、预算、信用卡账期；独立资产损失及专用账户对账。
- 数据：CSV/XLSX 与支付账单映射、预览、去重、分类建议、确认入账；JPG/PNG/PDF 附件；后端接口生成 CSV/Excel 导出。
- 分析：收支/分类/净资产、商户/账户/项目统计、账户余额趋势、分类下钻、统计规则设置。
- 使用体验：桌面/平板/手机导航、手机数字键盘、浅色/深色/系统主题、隐私金额遮罩、键盘快捷键、空态、中文错误与可展开详情。
- 交付：JWT 内存令牌、Cookie 刷新、会话切换缓存清理、并发刷新与迟到响应保护；生产 PWA 静态缓存；Docker/Nginx 模板、CI 模板、完整源码册。

N/E 支出，I 收入，T 转账，/ 搜索；输入与弹窗聚焦时不触发记账快捷键。

## 接入真实后端

复制 `.env.example` 为 `.env.development.local`，保持 `VITE_ENABLE_MOCK=false`，配置 `VITE_API_BASE_URL=/api` 或后端公开 API URL，再重启 Vite。生产默认禁用 Mock。同源部署推荐 `/api` 反向代理；跨源 Cookie/CORS/CSRF 必须由服务端准确配置。Token 不写 localStorage。

接口与 DTO 见 `docs/02-API契约.md` 和 `src/types/index.ts`。真实服务必须实现当前用户授权、服务端分页、Decimal 精度、原子账务事务、版本与幂等唯一约束、导入持久任务及文件安全。金额计算最终以后端为准。

## 边界

PWA 缓存应用资源，不缓存财务 API，不支持离线财务写入或自动排队。多币种按 CNY/USD/HKD 分别统计，缺少估值汇率时不合并净资产。当前没有银行分期/利息接口、借贷分期/利息或跨币种归还，也不自动转换已有普通消费为报销垫付。分类拼音搜索、个人账本服务端偏好、可配置日期格式为后续增强项。

Mock 导入最多 5MB/2000 行，支持 .xlsx 首工作表，不支持旧 .xls、加密工作簿和 1904 日期系统；附件每笔 5 个、每个 10MB；Mock 导出上限 10000 条。生产大规模任务由后端实现。导出不是包括关系、附件与审计的完整数据库备份。

## 交付文档

- 最终交付
- 部署与后端联调手册
- 最终验证记录
- 架构与页面设计
- API 契约
- 30 项验收清单
- 按文件路径列出的完整源码

历史各阶段交付记录保留用于追溯；当前范围以最终交付与验收清单为准。执行 `pnpm docs:source` 可重新生成源码册。
