# AI 消费审批中心 1.1 深度完善与验收报告

状态：部分实现，尚未满足完整核心版本验收条件，未发布1.1。

## 基线核对

已读取上一版开发与验收报告、SpendingApprovalRules、SpendingApprovalAi、既有真实模型测试及密钥读取机制。公开线上 release-info.json 本次核对为 2026.10.29.5。未变更正式账务或线上部署。

## 本次实际修改

- backend/src/PersonalFinance.Api/Application/SpendingApprovalRules.cs：新增 AssessUnreconciled，在不能证明约束互斥时，给出可用资金上下界；不把目标预留、应急储备、未来付款的简单累加认定为确定扣除额。重叠不明时不输出伪精确自由现金；即使按最大重叠仍不足时才确认现金约束违规。
- backend/src/PersonalFinance.Api/Application/SpendingApprovalAi.cs：真实证据聚合采用上述规则，披露 RESERVATION_OVERLAP_UNRESOLVED；摘要授权也携带约束上下界，仍不发送交易和账户明细。
- backend/tests/PersonalFinance.Tests/SpendingApprovalConstraintTests.cs：新增6项重叠矩阵测试。
- backend/tests/PersonalFinance.Tests/AiLiveTests.cs：新增真实Provider申请提取及五种结论场景测试；显式启用后调用现有模型和受保护密钥，未打印或复制密钥。

没有新增数据库迁移。本次只修正计算与扩展验收，不改表结构。

## 实际验证

1. `dotnet test backend/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj --filter FullyQualifiedName~SpendingApprovalConstraintTests --no-restore --verbosity quiet`：6通过，0失败。覆盖单项约束、双项重叠、三项重叠、不确定短缺、确定短缺、缺失估值。
2. 设置 PF_AI_LIVE_ENABLED=true、PF_AI_APP_ROOT 为现有后端源码目录后，执行 `dotnet test backend/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj --filter FullyQualifiedName~SpendingApprovalExtractionUsesActualProvider --no-restore --logger 'console;verbosity=normal'`：1通过，0失败。真实模型提取手机、5000元、CNY。
3. 同样显式启用后执行 `dotnet test backend/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj --filter FullyQualifiedName~SpendingApprovalVerdictsUseActualProvider --no-restore --logger 'console;verbosity=normal'`：5通过，0失败，实际Provider分别返回 APPROVED、CONDITIONAL_APPROVAL、DEFERRED、NOT_RECOMMENDED、NEEDS_INFORMATION。

真实模型测试使用明确标记的合成场景，不使用 Mock HTTP 或 Mock Provider，也未发送真实用户财务信息。五场景测试检验模型分类和后端Schema，不代表完整HTTP审批、真实数据库聚合、授权变化和失败恢复全链路已经通过。

## 状态分级

| 项目 | 状态 |
| --- | --- |
| 实际模型申请提取及五结论场景 | 完全实现且已验证（限上述场景） |
| 未核实重叠约束的上下界计算 | 完全实现且已验证（纯规则矩阵） |
| 新规则接入真实财务证据聚合 | 已实现但尚未验证（本轮未运行隔离SQL全链路） |
| 约束归属自动核实、精确去重 | 部分实现：当前明确披露不确定性，不猜测重叠金额 |
| 完整真实AI HTTP路径、授权变更、超时、网络错误、空响应、注入攻击矩阵 | 尚未完成本轮验收 |
| 图片附件、安全商品解析、独立多轮追问、分期完整成本 | 尚未实现 |
| 多商品分摊、退款完整矩阵、未记账购买状态、复盘比较 | 尚未完成 |
| 多实例并发、分布式租约、后台冷静期恢复 | 尚未实现 |
| UI深度完善、移动与深色主题完整验收 | 尚未执行 |

## 风险、清理与后续

现有基础版本不能据此标记为1.1完整核心版。还需完成以上P0功能及隔离数据库、HTTP、浏览器、交易一致性和多实例验收。实际模型调用的成功不证明模型永远遵守约束，仍需保留后端验证。

本次未产生测试账务、测试数据库、重复备份或独立密钥副本。既有有效备份与正式用户数据未改动。未修改公开版本号、未执行生产发布。

## 后续开发与本次增量发布记录（本节更新前述阶段状态）

本次增量候选：6.17.1 / 2026.10.29.6。仍不标记1.1完整核心版本。

### 实际新增能力

- SpendingApprovalExtras.cs：同用户归属的图片上传与下载、独立问答、分期计划。PNG/JPEG最大2MB，经Skia解码、尺寸检查、重新编码剥离元数据；不执行远程商品链接抓取，不声称已识别图片。
- 分期计算验证首付加本金等于商品价，费用必须明确；计算全期总成本、常规期款及末期分位调整。旧价格对应的计划会提示重新核实。分期与既有付款承诺的归属未核实则标记信息缺口，不冒充精确合同现金流。
- 新增 SpendingApprovalLease.cs：SQL Server会话级应用锁取代单进程互斥。模型调用期间没有持有数据库事务或业务表锁；结束释放会话锁。
- SpendingApprovalService.cs：读取真实全额/部分/多次退款，处理净成本；支持同一交易的商品金额分摊，后端用户级写入锁下验证分摊总额。共享交易部分退款归属未知时只显示范围；交易金额变更导致分摊失效时不继续标记为已核实。
- 新增 PURCHASED_UNRECORDED 状态，表示真实购买已声明但尚未记账，不创建真实交易。
- SpendingApprovalExtrasPanel.tsx：新增补充回答、分期、图片上传下载；主页面增加分摊金额、退款与未核实提示。扩展 operationJournal 支持新增写入的重试核实路径。

无新增迁移，复用既有 StoredDocument 和索引。没有第二套账本写入。

### 最新验证结果

- 后端审批相关测试：31通过，0失败，2组真实模型测试在未显式启用的本次回归中跳过。真实模型提取1项和五结论5项已经在上一阶段显式启用并实际调用通过，不能把本次跳过重复计为通过。
- 新增 SpendingApprovalInstallmentTests：5项，覆盖全费用、末期精度和非法参数。
- 隔离SQL生命周期测试扩展：独立问答、分期持久化；两条独立SQL连接上的会话锁竞争与释放恢复；多次部分退款及全额退款；交易失效和审批删除；真实交易与分录计数不受审批操作影响。
- 10,001条审批分页：53毫秒。本结果不代表百万交易候选匹配或多API实例并发性能。
- 前端 SpendingApprovals及operationJournal：145通过，0失败。类型检查通过。
- 浏览器实际API流程：1通过，覆盖独立回答、分期保存、真实PNG上传、冷静期及已购买未记账状态。首次测试在页面更新前操作旧文件输入导致超时，增加明确版本可见性断言后通过；未降低后端校验。

命令沿用报告前文，新增：

`dotnet test backend/tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj --filter FullyQualifiedName~SpendingApproval --no-restore --logger 'console;verbosity=normal'`

`node node_modules/vitest/vitest.mjs run src/tests/SpendingApprovals.test.tsx src/tests/operationJournal.test.ts --configLoader runner`

`powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify-spending-approvals.ps1`

### 尚未完成的验收与风险

- 多条SQL连接验证不等于多API进程的完整并发审批验收；多实例全链路、崩溃中断及全部幂等矩阵尚未完成。
- 图片自动识别、安全远程商品页面解析、多轮AI主动追问协议、自动冷静期任务恢复尚未完整实现。
- 网络超时、空响应、授权变更和提示注入的审批专用完整矩阵尚未完成；已有Provider探测不代表完整HTTP路径验收。
- 多商品分摊及不确定退款范围已实现，复杂退款归属的完整场景测试仍不足；不会自动生成退款或财务分录。
- 移动端、深色主题和完整UI重设计尚未专项验收。

本次仅发布经过已述验证的增量，不宣称用户要求的1.1全部任务已经完成。隔离测试数据库及临时服务均由finally清理，失败浏览器追踪仅用于诊断；未操作生产用户交易。

发布前最终复核：冻结后的可用现金与原始流动现金分别保留；重叠区间以未冻结前流动现金及有效冻结差额为输入，防止冻结与目标、应急、未来承诺再次机械重复扣除。受影响后端重新发布构建，复用前端产物并重新封存源码指纹。

## 已执行的线上部署

2026-10-29，6.17.1 / 2026.10.29.6 已部署成功。生产构建与源码指纹检查通过，云端数据库备份验证完成，运行权限检查通过，服务健康状态 healthy / READY、无待执行迁移。公开版本、审批入口HTTP200及匿名API401均经本次读取验证。正式用户账务未用于测试。

本次增量已上线，但1.1完整核心版本仍未通过全项验收；前述多实例全链路、后台恢复和完整异常矩阵等缺项继续有效，不得标记为全部完成。

## 自然语言申请修复及真实多实例验收（最新进展，更新前述未验证状态）

候选版本6.17.2 / 2026.10.29.7。修复 SpendingApprovalsPage 的静态Modal.confirm与message调用，改用页面上下文hook，适配React19和现有主题；提取失败显示持久页面错误，重新调用清除旧错误。服务端不再因模型改写未明确给出的名称或理由而拒绝整份草稿，改为将对应字段留空并要求确认，仍不接受猜测事实。

组件测试3项通过；扩展 tools/verify-spending-approvals.ps1 -LiveAi，使用受保护的现有Provider密钥和随机隔离数据库，启动5293与5294两个独立API进程，实际浏览器流程1项通过（30.1秒）：授权关闭后提取显示错误；开启授权后实际模型提取5000元并预填申请；真实财务证据经真实模型生成审批；两个API进程对同一申请同时调用评估，结果为一个200、一个409；随后完成冷静期、补充问答、分期、图片和未记账购买状态。两个进程的verification-context均检查为同一随机隔离数据库。测试未使用Mock Provider或Mock HTTP，未读取正式用户账务。

已实现且已验证：上述点击、提取、正常真实AI审批HTTP路径、授权关闭和开启、两个独立API进程的互斥争用。部分实现：完整幂等与故障恢复矩阵、多实例崩溃和会话失联、退款归属完整矩阵。尚未实现或专项验收：后台冷静期任务恢复、图片自动识别、安全远程商品页面解析、完整移动端及深色主题验收。不能据此次单条端到端场景宣布1.1全项验收完成。

初次真实测试暴露模型未知字段导致整份提取被拒绝，已修复。测试也曾因金额显示5000.00与字符串5000比较失败，已改为核实金额数值属性，未放宽业务规则。隔离数据库、两个API测试进程及临时日志由finally清理，失败追踪仅用于诊断，不作为通过证据。

2026-10-29已实际发布6.17.2 / 2026.10.29.7。云端备份验证、构建产物核验及部署成功；线上公开版本正确，健康状态READY，审批入口HTTP200。本次无数据库结构变更。真实模型测试使用随机隔离库，两个测试API进程和测试库已清理，未写入正式用户财务数据。1.1其余缺项继续保留，不宣称全部完成。
