# AI专项交接

生成日期：2026-10-31（Asia/Shanghai）

分支：`main`；Commit：`91bbbdff824bbded9f0e81da29cee6c3df6d19ef`。包含原有未提交实现，HEAD不足以复现。

目的：AI专项交接。

IAiProvider在AiGatewayControl.cs定义，DeepSeekClient实现。AiOptions默认DeepSeek、deepseek-chat/deepseek-reasoner，Models登记支持模型能力配置。DeepSeekOptions.ValidateUrl限定官方HTTPS、443、根或/v1；不是任意兼容地址。

DeepSeekUsageService.CheckLimit直接完成，Reserve保留ConsentVersion与usage预留；旧日/月费用和任务预算字段存在不代表仍执行费用配额。AiGatewayControl保留并发信号量，Program保留HTTP限流；超时、上下文、输出容量、重复查询保护仍有效。全功能不等于无限资源。

FullFinancialAccess默认关闭，AiPrivacyService/AiContextService/AiRequestContext管理范围与授权版本，Agent grant/plan管理写入。读授权不能授予自动记账。撤权需要阻断旧任务、缓存与工具。Token/可选费用仍记录，未知usage不等于0。

Prompt主要内联于Application/Ai/的DeepSeekChatService、AiAgentService、工具定义及领域*Ai.cs；先搜索system/prompt/messages/JsonSchema。AiReadToolExecutor、AiStructuredOutput、AiAnswerValidator、AiEvidenceConsistency、AiAnalysisReport负责工具、结构和事实证据。模型文本不是财务事实权威，不允许任意SQL或模型指定UserId。

复用领域包括审批、报告、加油、节日和协作；改主聊天不能代替所有AI功能回归。

配置名：Ai__Enabled、Ai__DeepSeek__ApiKey、Ai__DeepSeek__Model、Ai__DeepSeek__ReasoningModel。Program提供--protect-deepseek-key-stdin，保护文件依赖DataProtection__KeyPath/.keys；DPAPI跨机需专门迁移。密钥不能写文档、命令参数或Git。

DeepSeekOptions含TimeoutSeconds、MaxRetries、MaxOutputTokens；重试错误分类看DeepSeekClient，网关指纹排除秘密与用户内容。日志可能含上下文，外发前脱敏。Provider真实联调、模型余额与上游限流本次未执行。

最低回归：默认拒绝、跨用户、撤权/版本变化、缓存、结构化工具、超时、重复查询、写入独立确认、usage缺失和模型能力。关键证据：[backend/src/PersonalFinance.Api/Application/Ai](<../../backend/src/PersonalFinance.Api/Application/Ai>)。

## 未验证事项

本次未逐业务端到端验收；数据库实态、生产、外部AI及历史报告适用性见 [验收记录](14-HANDOVER-VALIDATION.md)。
