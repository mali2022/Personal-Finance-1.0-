# AI 工具参数兼容修复验收

发布日期：2026-10-28。产品版本：6.13.1；公告版本：2026.10.28.2。

## 根因与修改

真实 DeepSeek 请求返回 HTTP 400：GetFinanceCatalog 的参数 Schema 根节点必须为 object，但 .NET 导出为 [object, null]。前端将该上游参数错误归类为“模型名称或请求参数不受支持”。此前真实协议测试未覆盖完整 Agent 工具注册表。

唯一运行时代码修改为 backend/src/PersonalFinance.Api/Application/Ai/AiAgentTools.cs：工具参数根类型显式固定为 object，保留内部字段可空类型、解析校验、身份隔离和服务端授权。本补丁不改变财务计算、写入确认或高风险操作权限。

AiAgentTests、AiAnalysisTests 增加注册表根类型断言；AiLiveTests 增加完整只读工具集与服务端工具历史的真实流式及非流式兼容验证，仅使用合成财务数据。前端发布公告筛选测试同步适配实际公告内容。版本及双语公告已更新。

## 验证结果

- 相关 SQL 后端回归：237 通过、10 个外部服务测试跳过、0 失败。
- 单独启用真实提供商验证：3 通过，覆盖完整工具集、流式与非流式请求、结构化分析协议及用量。
- AI 前端相关测试：22 通过；发布公告测试：10 通过；发布完整性测试：5 通过。
- 生产后端发布、TypeScript 检查、Vite 构建、版本校验、PWA 校验及发布包封存校验通过。
- 标准发布流程确认数据库备份成功；无需新增数据库迁移。
- 线上 release-info.json 返回 6.13.1 / 2026.10.28.2，响应 Cache-Control 为 no-cache。
- 线上健康检查 READY；buildId 为 22FC3519C56BD9302F1E540D9BC9FFD7EF5AA211D8B1DCE7CC5396F4772AF331，与本地发布 DLL SHA256 一致。
- /updates、/settings/updates 返回 200；未认证 /api/ai/settings 返回 401。

证据日志位于 verification/ai-tool-schema-*20261028.log；原始失败复现为 verification/ai-parameters-diagnostic-20261028.log。

## 验证边界

本次未使用正式用户账务执行已登录的线上分析。真实提供商兼容测试使用合成证据；线上验证覆盖发布版本、构建指纹、健康状态及匿名认证边界。用户刷新页面后可重试原问题。
