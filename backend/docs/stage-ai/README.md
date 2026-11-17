<!-- version-catalog: 2.2.0; sequence: 71 -->
> 归档版本：Personal Finance 测试版 2.2.0；顺序：071；时间依据：2026-10-12。原文中的旧版本、阶段号及验收状态保留用于追溯。

# 阶段 AI：DeepSeek 首批实现与验收

> 说明：本文引用的《Personal Finance 测试版 …》系列过程文档已在 1.0 正式版整理时合并删除，内容现见 docs/版本历史-1.0.md 与 docs/维护手册-1.0.md。

验收日期：2026-10-12（Asia/Shanghai）。本交付是 AI 基础、财务问答与自然语言草稿的增量实现；AI1—AI12 目标均保留，未实现部分明确列出，不宣称全部阶段完成。

运行状态更新：2026-10-12 21:04，正式本地实例已完成 AI 增量迁移、Debug 后端重建和前后端重启，经 5174 代理验证 AI 接口返回 HTTP 200。后文“尚未迁移升级”属于初次开发验收时点；当前状态及数据完整性证据见运行修复记录。

## 依赖盘点

| 复用模块 | AI 如何使用 |
| --- | --- |
| `FinanceService.Report / Accounts / Budget / CardStatement` | 收支、分类、账户余额、预算和真实信用卡账单 |
| `NetWorthAnalysis / InvestmentPerformance / CashFlowForecast / DebtPressure` | 净资产、投资收益、现金流、已登记债务计划；保留原服务限制 |
| `PayrollSummary / ContributionSummary / FundStatus / PromotionReport` | 工资社保、冻结可用资金和优惠分析；工资单独授权 |
| `Goals / PeriodReview / Prepayments / Advances` | 储蓄目标、月年复盘、押金预付款与家庭代付 |
| JWT + Session 验证 | 每次调用从认证会话确定用户，不接受模型指定用户 |
| `QuickEntry / transactionApi / FinanceService.Write` | 草稿送入原 Drawer，用户明确提交后沿用幂等、版本与资金审计 |
| 既有导入、附件、自动分类和专项流程 | 保留原模块；没有创建第二套账本、统计或导入引擎 |

新增适配层：`Application/Ai` 下的 DeepSeek HTTP 客户端、对话编排、工具白名单与调度、授权、短时上下文、Token/费用统计、草稿与数值校验、受保护密钥存储。新增 SQL 表仅为 `AiPrivacySetting / AiUsageRecord / AiToolAudit`。不保存密钥或完整会话原文。

## 已实现功能

- `/ai`：财务问答、流式回复、停止、短时多轮主题、依据展开、原报表入口、自然语言草稿、校对过的识别文字入口。
- `/settings/ai`：服务端密钥配置状态、模型、连接测试、分项云端授权、关闭开关和最近100次调用用量。
- 19 个只读工具，均进入现有领域服务；原备注、商户、个人姓名、合同/卡号不传给模型。分类标签作为不可信数据发送，已在授权范围说明。
- 汇总查询不传交易备注、逐笔交易、逐笔预测事件和商户细节；交易/押金明细、工资、家庭代付分别授权。所有工具拒绝多余字段、用户ID、SQL、未知工具、超范围日期和重复 JSON 键。
- 时间范围最多366天、明细默认50条、模型工具最多4轮、每轮最多8个工具、模型输出默认4096 Token、SQL 单条命令15秒、模型超时60秒、用户每分钟20个 AI HTTP 请求、每日100次模型尝试。
- 有限退避只用于上游429/5xx模型请求。401、402、无效参数、超时、网络故障、无效 JSON 和流式中断均不自动重放。财务写入不在模型重试循环里。
- 会话只在服务端内存保留最近8次用户提问，30分钟绝对过期、重启失效；历史财务答案不作为新一轮事实。每轮查询重新读取领域服务。
- 模型生成未知数值时保守拦截；该检查不能证明整段文字的语义准确性，UI 同时展示权威数据供核对。
- 普通收支草稿用本地现有账户/分类做精确唯一匹配；账户未匹配时不自动选择默认账户。专项业务或优惠/红包歧义阻止作为普通收支打开表单。
- 用户最终提交原记账 API 后资金审计来源为 `AiConfirmed`，包括原有幂等恢复机制。没有新增 AI 资金写入 API。
- OCR/ASR/文档文字必须单独授权并先校对；来源和提供的识别置信度保留。此入口只处理已识别文字，不是假装完成原始文件识别。

## DeepSeek 官方能力与实测

官方核查来源：

- [模型与计费](https://api-docs.deepseek.com/quick_start/pricing/)
- [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)
- [工具调用](https://api-docs.deepseek.com/guides/tool_calls/)
- [思考模式与工具约束](https://api-docs.deepseek.com/guides/thinking_mode/)
- [错误码](https://api-docs.deepseek.com/quick_start/error_codes/)

2026-10-12 的官方模型表推荐 `deepseek-flash` / `deepseek-v4-pro`，上下文标为1M；真实 `/models` 同样返回这两个名称。用户要求的 `deepseek-chat` 实际调用成功，因此保留为默认模型，不假设旧别名永久可用。配置可更新。`deepseek-reasoner` 尚未真实联调，推理工具调用默认禁用；当前官方文档要求带工具的思考模式完整回传 `reasoning_content`，实现保留本轮助手消息全部字段，但该模式尚未验收。

已真实验证 `deepseek-chat`：连接、普通聊天、多轮、Function Calling、JSON 对象输出、SSE、Usage、隔离 SQL 真实金额、金额歧义草稿。不是用 Mock 代替真实模型。

官方价格含缓存命中和高峰/低峰费率；本应用不会把某个费率永久写死。旧模型别名的实际收费映射未独立核验，因此价格默认空，显示 Token 与“费用待估算”。管理员可设置 `Ai:InputPricePerMillion / CachedInputPricePerMillion / OutputPricePerMillion / PriceCurrency / PriceEffectiveDate`。估算不等于上游账单。思考 Token 采用上游 `completion_tokens`，不自行再次相加。

当前官方模型有图片能力差异，但本应用没有把文本模型当作 OCR/ASR：图片、PDF及音频原文件处理尚未配置独立识别引擎；不上传这些文件到 DeepSeek。上下文1M和最大输出属于官方文档声明，未做极限容量实测。

## 密钥与部署

真实密钥已使用 ASP.NET Core Data Protection 存为服务器 `.keys/deepseek-api-key.protected`。Windows 密钥环受当前服务账户 DPAPI 保护。该文件不进入 Git、前端、日志、普通数据库或发布产物。环境变量或 User Secrets 可覆盖受保护文件。切换正式服务账户时，应在该账户下重新保护密钥，并限制密钥目录 ACL；开发账户的保护文件不能当作所有 Windows 服务账户通用文件。

开发环境 `Ai:Enabled=true`，正式默认关闭。每位用户默认所有授权关闭；服务端启用不等于用户授权上传数据。正式实例尚未升级，也没有应用 AI 迁移到正式数据库。

开发环境可使用 .NET User Secrets（不能把真实值放入共享文档）：

```powershell
dotnet user-secrets set 'Ai:DeepSeek:ApiKey' '<仅在本机填写>' --project backend/src/PersonalFinance.Api
```

Windows 受保护存储命令：在服务账户的临时环境变量 `Ai__DeepSeek__ApiKey` 中提供密钥，从 API 工作目录执行 `dotnet PersonalFinance.Api.dll --protect-deepseek-key`，然后清除该变量。命令不接受密钥命令行参数，也不回显密钥。保护文件失效只表现为 AI 未配置，不使核心财务服务停机。

迁移：`20261012122849_AiFoundation`。已在随机隔离库应用成功，模型快照无待生成变更。正式部署应沿用项目既有备份、恢复验证和迁移发布流程；不要将本次测试数据库或 `.keys` 复制成正式账本。

## 验收证据

| 检查 | 结果 |
| --- | --- |
| AI 安全、客户端及隔离 SQL | 54项通过，含5项真实 SQL 集成 |
| 真实 DeepSeek | 6项通过，运行日志只保留模型、时间、Usage及状态 |
| 独立 HTTP + 真实模型 + 随机 SQL 库 | 10项通过：密钥不外泄、默认拒绝、连接、草稿不入账、原API确认/幂等/审计、真实SSE金额、用户隔离、关闭AI仍能记账、Token统计 |
| 后端全套基线 | 217通过，15个需要专用SQL环境的用例跳过；AI的5个SQL用例已另行执行通过 |
| 前端全套 | 197通过；以单工作进程、15秒用例时限执行。原分类UI用例超过默认5秒时限，未修改产品代码或原测试断言 |
| TypeScript、Vite、.NET | 构建通过 |

证据文件：`backend/tests/PersonalFinance.Tests/TestResults/ai-validation.trx`、`ai-live-deepseek.trx`、`ai-regression.trx`；`backend/test-results/ai-http-result.json`、`ai-frontend-regression.json`。HTTP测试新建库已删除，证据保留；旧恢复验证库内的 SQL 用例全部回滚。既有运行中的正式服务未中断。

HTTP验收发现并修复了 SSE 重复修改已发送响应头的问题，随后重新运行完整 HTTP 链路通过。流式最终回复会在工具查询后单独生成一次，因而比非流式问答多一次模型生成调用；所有尝试都计入用量，需留意调用成本。

## AI1—AI12 保留目标及未完成项

| 阶段 | 本次完成范围 | 后续仍需完成 |
| --- | --- | --- |
| AI1 | DeepSeek、保护密钥、授权、审计、只读工具、额度计数 | 用户可设的单次/日/月费用预算与多实例额度协调、更细的数据留存管理 |
| AI2 | 自然语言问答、会话主题、来源、真实数据、多轮重新查询 | 更多筛选条件、商户授权、历史上的今日与生活成本指数工具 |
| AI3 | JSON草稿、特殊业务和歧义保护、原Drawer及原API | 专项草稿深度联动、分类规则优先建议、更多字段解析 |
| AI4 | 已识别文字→授权校对→草稿 | 真正的图片/PDF OCR、附件任务、字段置信度、去重候选和未知账单映射 |
| AI5 | 保留现有待整理、去重和对账模块 | 确定性候选到AI解释、异常问题状态与修正草稿 |
| AI6 | 现有月年复盘的AI查询与解释 | 独立报告版本、保存、导出和过期提示 |
| AI7 | 预算、储蓄、现金流权威工具和解释 | 预算/目标结构化规划草稿、情景模拟联动 |
| AI8 | 账单、已登记债务计划、投资收益解释 | 还款策略、资产配置和完整实际债务联动；不承诺收益 |
| AI9 | 工资社保、冻结、押金、家庭代付、优惠工具 | 生活成本指数及更完整专项分析交互 |
| AI10 | 已转录文字输入、未配置识别的清晰降级 | 实际 ASR、浏览器麦克风授权、语音问答与全局快捷入口 |
| AI11 | 无隐式长期事实记忆 | 可编辑长期偏好、规则建议草稿、主动提醒和偏好删除 |
| AI12 | 本报告的代码、Mock、SQL、真实模型与HTTP验收 | OCR/ASR及剩余高级功能验收、推理模型联调、完整浏览器E2E、质量评估集 |

知识库、报告导出、偏好及主动提醒仍保留原任务书要求，没有伪造为已实现。AI关闭不会影响已有账本、预算、投资、导入和自动化服务。
