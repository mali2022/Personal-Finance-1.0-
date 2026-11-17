# AI 消费审批中心开发与验收报告

发布候选：Personal Finance 6.17.0 / 2026.10.29.5。当前交付为基础闭环，完整提示词的全部 P0/P1/P2 尚未全部实现；不得将此报告解释为全项验收通过。

## 实际功能与验证状态

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 申请创建、读取、编辑、删除 | 已实现且已验证 | 真实 SQL 持久化；版本校验；删除只允许草稿、取消或放弃状态 |
| 提交、冷静期、购买决定、关联、解绑、基础复盘 | 已实现且已验证 | 隔离 SQL 生命周期测试；浏览器验证至购买决定 |
| 真实财务聚合 | 已实现且已验证 | SQL 测试验证现金与应急设置；复用预算、现金流、资产估值和直接汇率机制 |
| 导航、首页快捷入口、设置面板、交易候选选择 | 已实现且已验证 | 类型检查和组件测试；主流程浏览器测试 |
| 自然语言提取、真实 AI 评估 | 已实现但未验证 | 接入现有 IAiProvider 和隐私授权；未向真实模型发送验收数据 |
| 五种结论及 AI Schema | 已实现且已验证 | 格式、枚举、空值、伪造金额拒绝测试；财务约束独立覆盖模型建议 |
| 评估期间数据变化及并发防护 | 部分实现 | 单进程用户互斥、结果持久化版本校验、财务证据刷新比较；未完成多实例并发测试 |
| 图片申请、完整分期成本分析、独立追问记录 | 尚未实现 | 可通过购买理由补充回答；没有独立附件或问答实体 |
| 消费辩论、多方案和购买时机深度集成 | 尚未实现 | 报告含支持/反对观点和替代建议，不等同于独立多阶段辩论功能 |
| 到期自动通知、长期记忆与偏好学习 | 尚未实现 | 冷静期时间真实保存，打开应用可查看；没有后台推送 |

## 新增与修改文件

后端新增：Application/SpendingApprovalRules.cs、SpendingApprovalService.cs、SpendingApprovalAi.cs、SpendingApprovalSettings.cs；修改 Application/FinanceEndpoints.cs 和 Infrastructure/FinanceDb.cs。

迁移：Infrastructure/Migrations/20261028213038_SpendingApprovalDocumentLookup.cs 及 Designer，更新 FinanceDbModelSnapshot。复用已有 StoredDocument，不新增第二套账本或账户表。索引为 Documents(UserId,Kind,CreatedAt,Id)，包含 Name；迁移在隔离数据库实际应用通过。

前端新增：pages/SpendingApprovalsPage.tsx、SpendingApprovalSettingsPanel.tsx；修改 routes/index.tsx、design/navigation.ts、features/dashboard/QuickActions.tsx、stores/operationJournal.ts、data/releases.json 和 package.json。

测试新增：SpendingApprovalRulesTests.cs、SpendingApprovalSchemaTests.cs、SpendingApprovalPersistenceTests.cs、frontend/src/tests/SpendingApprovals.test.tsx、frontend/integration/spending-approvals.spec.ts。隔离浏览器运行器：tools/verify-spending-approvals.ps1。

## API 与持久化

所有路由位于认证组 /api/spending-approvals：

- GET、POST /：分页列表和创建。
- GET、PUT /{id}：详情和修订。
- POST /{id}/delete：受状态约束的删除。
- POST /{id}/actions：SUBMIT、COOLDOWN、END_COOLDOWN、BUY、ABANDON、LINK、UNLINK、REVIEW、CANCEL。
- POST /parse：AI提取，必须用户确认后保存。
- POST /{id}/evaluate、GET /{id}/evaluations：AI评估及最近五十份历史报告。
- GET /{id}/transaction-candidates：同用户、同币种、有效支出的分页候选。
- GET、PUT /settings：审批风格、应急储备和主动偏好。

业务写入复用 FinanceService.Write 的用户级数据库锁、幂等记录、事务与审计；If-Match 控制并发，Idempotency-Key 支持重试核实。AI网络调用在写入事务之外执行。当前单进程互斥不代表跨实例调度能力。

## 财务计算与状态边界

同币种活动流动账户的真实余额扣除已登记定期本金和冻结资金；信用额度不计现金。进一步扣除目标预留、应急储备和未来付款承诺，采用保守口径；重叠预留可能导致偏保守结论，不宣称精确自由现金。

月度及分类预算沿用现有 CNY 口径；其他币种显示预算缺失，不编造转换预算。资产估值独立复用指定日期直接汇率；缺失汇率标记未完整估值，不把跨币种资产估值当作可直接支付现金。未来九十天现金流含已有借贷计划，未知付款来源披露为缺失。

可用信息通过安全检查后，模型仍需分析消费价值；预算或储备不足强制建议暂缓，关键数据缺失要求补充。规则通过本身不是批准。

业务状态 DRAFT、SUBMITTED、NEEDS_INFORMATION、EVALUATED、COOLING_DOWN、DECIDED、PURCHASED、ABANDONED、CANCELLED 与 AI 建议独立。用户可不采纳建议。申请修订返回草稿；旧评估保存原申请、证据、时间及版本。状态历史保留操作者与理由，审计另存。

关联已有交易不写入交易或分录。同一交易限制关联一个申请；交易删除或撤销后详情显示未核实及关联失效，不继续显示为已核实购买。交易金额变化按实时值展示。尚未完成退款分摊及全量统计验证。

## 安全与验证证据

所有新查询以当前用户过滤；关联校验交易归属、状态、类型和币种；商品链接只保存并验证 http/https，不由服务端抓取。AI无工具或账本写权限，商品和申请内容视为不可信数据。发送前后检查授权版本；无效JSON、无效结论和未验证金额声明拒绝保存。

实际执行：

1. `dotnet test backend/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj --filter 'FullyQualifiedName~SpendingApproval|FullyQualifiedName~SpendingValueMathTests|FullyQualifiedName~LifeSimulationTests' --no-restore --logger 'console;verbosity=normal'`：45 通过、0 失败、0 跳过。使用显式随机命名隔离数据库。
2. `node node_modules/vitest/vitest.mjs run src/tests/SpendingApprovals.test.tsx src/tests/operationJournal.test.ts src/tests/Releases.test.tsx --configLoader runner`（frontend）：155 通过、0 失败。
3. `powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify-spending-approvals.ps1`：真实 API 与浏览器，1 通过、0 失败。
4. `node node_modules/typescript/bin/tsc -b`（frontend）：通过。
5. `node frontend/scripts/validate-releases.mjs`：候选版本校验通过。
6. 10,001 条审批分页读取：40 毫秒，通过五秒阈值。此结果不代表百万交易、并发模型调用或冷静任务扫描性能。

曾出现一项测试预期事件数量写错，已改为验证完整事件序列后通过；没有放宽业务校验。隔离 SQL 实际验证交易数量、分录数量及账户期初余额未受审批影响，包含失效交易关联处理和删除申请。未执行完整退款矩阵、所有账户资金组合、生产用户流程或真实模型调用验收。

## 清理与发布

隔离 SQL 数据库均在 finally 中删除；浏览器 API 子进程和本次临时密钥、日志目录已清理。未删除正式业务数据、既有工作区修改或旧有效备份。没有为本次开发创建重复数据库备份。

生产构建、云端备份、部署及线上健康验收结果将在执行后补充。当前公告明确基础版本范围及尚未提供的高级能力。完整需求仍有缺项，下一阶段应优先完成真实模型验收、完整 P0 字段与附件、安全并发矩阵，再开发 P1/P2，不能仅凭现有测试宣称完整开发完成。

发布前授权复核修复：摘要授权模式剔除交易样本、账户名称和事件明细，完整授权才发送详情。新增专项测试，Schema与授权裁剪测试共12项通过；新增审批相关测试累计20项，结合之前回归共46项不同后端用例通过。修复后仅重建受影响后端，复用未变更且已验证的前端产物，并重新封存源码与构建指纹。

## 实际线上发布结果

2026-10-29 已发布 6.17.0 / 2026.10.29.5。生产构建、产物校验、源码指纹封存、云端数据库备份验证、索引迁移及部署成功。线上 API 健康状态 healthy / READY，无待应用迁移；审批入口 HTTP 200；匿名审批 API 返回401；公开版本读取正确。未使用正式账户创建测试消费或交易。本次发布是报告所列基础版本，不代表尚未实现的 P0扩展项或 P1/P2 已完成。

清理遗留：自动审批策略拒绝删除 deploy/out/update-stage 发布暂存目录，未提供具体原因，故目录保留。未尝试绕过策略。隔离数据库、浏览器 API 子进程及本次测试临时密钥与日志已清理。
