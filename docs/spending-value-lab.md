# 消费价值决策实验室：第一阶段交付

入口 `/planning/spending-value`。独立模拟，不创建正式交易。发布候选：6.14.0 / 2026.10.29.1。

## 源码审计与复用
交易与账户沿用 FinanceService、FinanceEndpoints 的身份、写入事务、幂等和版本保护；预算沿用现有模块，本实验室只管理独立分配预算。现金流复用已有资金口径，不新增预测系统。LifeSimulationService 的财务快照提供本人同币种可用现金和历史月收入费用建议，用户仍需复核未来假设。储蓄目标、生活成本、实物资产、时间资产与 AI 都保留现有业务流程。本实验室只增加方案比较及复盘关联，物品和时间均验证本人所有权。

## 修改文件与数据模型
SpendingValueMath.cs：decimal 计算、约束、偏好排序、Pareto 和权重敏感性。
SpendingValueService.cs：决策保存、历史、关联选择、复盘真实成本；FinanceEndpoints.cs 注册 API。
SpendingValuePage.tsx、SpendingValueDetails.tsx：编辑、对比、图表、历史和复盘；routes/index.tsx 与 design/navigation.ts 注册入口；operationJournal.ts 接入写入恢复白名单。
SpendingValueMathTests.cs 与 SpendingValueHttpTests.cs：数学和 SQL HTTP 集成；integration/spending-value.spec.ts：真实浏览器。
releases.json 与 package.json：版本公告和产品版本。

复用 StoredDocument，Kind=SpendingValueDecision，不增加表或迁移。保存币种与统一起止期限、维度权重、方案分项及后续成本、时间和次数、评分确认、硬约束及关联复盘。创建 If-Match=0，更新需当前版本；写入需 Idempotency-Key，产生审计记录。真实交易金额不允许由客户端提供给复盘汇总。

## API
GET /api/spending-value：分页历史；GET /{id}：详情、计算与真实关联成本。
POST /api/spending-value 与 PUT /{id}：创建、版本保护更新。
POST /compare：纯计算；POST /sensitivity：权重±50%排序变化、并列领头方案。
GET /choices?currency=CNY&keyword=...：最多50笔本人同币种已确认支出及最多100个实物、时间记录。
账本基准使用现有 POST /api/life-simulator/snapshots。

## 算法与界面
总拥有成本=全部分项金额+统一期限内后续成本；剩余资金=预算-总成本。按期初支付全部成本检查现金安全底线，未计未来收入；成本也作为该方案的现金流出。先检查预算、时间、安全底线、最低剩余和必需价值维度，再对可行且确认评分的方案比较加权偏好。现金或时间未知不判为可行，评分未确认不提供偏好分。完全相同评分允许并列；Pareto 同时比较成本、小时和偏好。组合消费不混合不相关次数分母。更改分项后需重新确认评分。

储蓄恢复月数=ceil(成本/用户确认的正月净储蓄)，仅为机会成本参照；缺少正月储蓄时显示数据不足。不能据此推断某个储蓄目标的真实完成日期。真实成本仅汇总有效关联支出；关联记录失效时标注缺失并将完整实际成本置为未知。复盘保存真实次数、满意度、说明，可关联本人实物和时间记录。中英并列文案、Ant Design 主题、ECharts 与窄屏横向结果表。

## 验证记录
- 8项数学及隔离 SQL HTTP 集成通过：后续成本、组合剩余、约束优先、确认评分、Pareto、并列和敏感性、保存、越权拦截、版本冲突、真实成本、审计及不写入账务。
- 隔离库生成100万条交易后，候选、详情与历史3个API合计读取200ms；造数耗时不计入查询性能。
- 360px、1440px Chromium 真实API流程通过：组合分项、预算剩余、比较、敏感性、保存、历史与无页面横向溢出。
- 发布与操作恢复146项前端测试通过。
- 最终构建、备份、部署和线上验证结果以发布执行记录为准。

## 已知边界与后续阶段
本阶段不运行自动组合优化或个性化AI建议，不将模型建议写入金额或自动确认偏好。资金检查是保守总量约束，不能替代现有逐日现金流预测；目标具体完成日期显示数据不足。预计次数和使用时间是用户假设，资产折旧、退款分摊等仍使用原有模块。本次未新增生产数据库迁移，测试仅使用明确命名的隔离库，正式账务统计不含模拟文档。

## 实际发布验收（2026-10-29，Asia/Shanghai）
生产构建、产物分包与PWA检查、源代码与341个产物完整性校验通过。首次静态导入导致Chart分包检查失败，修正为lazy路由后通过，失败产物未上线。
线上发布完成：产品6.14.0，公告2026.10.29.1。/api/health=200 healthy/READY；/api/version与/release-info.json一致；页面入口200；未登录的决策API=401。未进行真实用户账务写入测试。更新流程检查后确认没有迁移需要应用。
最终360px与1440px真实浏览器各1项通过，包含亮暗主题切换。生产备份经RESTORE VERIFYONLY校验，轮转后仅保留1份。
测试清理：关闭本次本地API，删除本次隔离RestoreCheck数据库（包括100万测试交易）、本地测试凭据和API日志。保留必要测试与发布执行记录。生产测试未创建任何账务记录。
