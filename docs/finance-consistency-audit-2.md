# 财务一致性审计 2.0：审计与交付记录

日期：2026-10-28。交付状态：已部署 2026.10.28.4（产品 6.13.3）。下文保留阶段记录，最终结果见末尾；真实模型在线测试与外部事实核验限制见风险说明。

## 已定位的计算入口

|指标|事实来源及公式|依赖与验证入口|
|---|---|---|
|账户余额|OpeningBalance + 非 Deleted 交易 Account 分录合计|TransactionRunningBalances / RunningBalanceRangeSqlTests|
|期间收入|Income 分录金额取负后合计|ReportAggregation / ReportPeriodTests|
|期间支出|Expense 分录合计，按统计策略加入资产损失和调减|ReportAggregation / StatisticsPolicyTests|
|报表净资产|所选币种账户余额之和；资产为正余额之和，负债为负余额绝对值之和|ReportAggregation；投资估值和实物资产是否齐全仍待核对|
|投资持仓|Active 买入及增仓数量减卖出及减仓数量|InvestmentMath / InvestmentTests|
|投资成本与已实现收益|移动平均成本，卖出所得减费用减分摊成本|InvestmentMath / AuditFinanceRulesTests|
|投资分红利息|金额减佣金、税及其他费用|InvestmentMath|
|现金流|期初 + 区间流入 - 区间流出；结束日不含|CashFlowMath / CashFlowMathTests|
|流动资金|Cash、Bank、Alipay、WeChat、ElectronicWallet|AccountKinds / AuditFinanceRulesTests|

## 本次实际修复

ReportPeriods 在合法的 9999 年末日期区间内计算下一个周期会溢出，造成报告失败。现在将最后一个周期截断到请求结束时间，并直接处理单时间点区间；未改写原始交易。新增四种粒度的边界回归测试。

## 验收缺口

信用卡账单与利息、退款冲正、多币种历史汇率、预算及人生模拟器口径尚未完成逐项审计。自动对账写入到 AI 分析及投资到人生模拟的完整闭环尚未执行。统一异常诊断机制尚未交付。备份恢复、跨模块 SQL 隔离测试及大规模性能测试尚未执行；不存在可报告的实测性能结论。AI 工具证据完整性尚未验收。

工作区已有大量未提交变更，既有 AuditFinance 等文件不能算作本次新实现。当前变更仅构成首批边界修复，不能称为财务一致性专项工程完成。

## 本次验证记录

定向回归：75 通过、0 失败、0 跳过，测试运行器报告 98 ms（不是业务性能基准）。非增量编译成功，16.94 秒，存在一条既有 xUnit2031 警告。首次增量运行读取旧 API 产物导致新增 4 例失败；非增量重建后全部通过。生产构建、发布记录和部署尚未执行，未发布本次修复。

## 第二批审计：规则与依赖

|范围|统一事实和公式|主要入口|对应回归|
|---|---|---|---|
|收入、支出、退款|Income 分录取负；Expense 有符号合计，退款抵减原支出；费用开关保持现有语义|ReportsService.Totals / StatisticalExpenses、ReportAggregation|StatisticsPolicyTests、CategoryStatisticsTests、FinancialConsistency20SqlTests|
|内部转账、信用卡还款|资金两端过账；本金不生成消费支出，费用单列|记账分录生成、CashFlowMath.Commitment|FinanceRulesTests、AuditFinanceSqlTests|
|余额与历史修改|期初加有效 Account 分录；按发生时间、创建时间和 ID 确定余额顺序|Balance、CurrentAccountBalances、TransactionRunningBalances|RunningBalanceRangeSqlTests、EntryWorkflowSqlTests|
|信用卡、利息与借贷|信用卡以负余额表示负债；利息费用属于支出；还本金不等于消费|CreditStatementWindow、DebtSchedule、LoanSchedule|CreditStatementWindowTests、DebtScheduleTests、LoanScheduleTests|
|账本净资产|按币种账户正余额为资产，负余额为负债；净资产为余额和|Worth / AggregateReportPoints|DashboardValuationReuseSqlTests、ReportPeriodTests|
|综合估值净资产|CashOnly 加证券估值；TotalAssets 不再加证券；Unknown 明示缺失；专用实物账户不重复计数|AssetReportsService.AssetAllocation|Asset、PhysicalAsset、LifeSimulation 相关测试|
|投资现金|买入负金额含费用；卖出及分红利息为金额减费用；独立费用负金额；持仓调整现金为零|InvestmentMath.CashMovement，写入与 InvestmentPerformance 共同调用|InvestmentCashFactTests|
|投资收益|卖出净额减移动平均分摊成本；分红利息单列；费用已进成本或净额不二次扣除；本金不是收益|InvestmentMath.Calculate、InvestmentPerformance|InvestmentTests、AuditFinanceRulesTests|
|对账|账单事实与内部交易关联，匹配状态及差异不直接创建第二笔交易|SmartReconciliationService|SmartReconciliationTests、SmartReconciliationHttpTests|
|预算|复用 Totals 与统计策略；目前预算主口径 CNY|ReportsService.Budget|Budgets、StatisticsPolicy 相关测试|
|现金预测|实时余额为期初，未来计划为增减；内部流动资金转账抵销本金，保留费用；实际关联后不重复计计划|CashFlowForecastService / CashFlowMath|CashFlowMathTests、AuditFinanceSqlTests|
|人生模拟|从 AssetAllocation 建快照，预留及冻结扣减可用现金；历史六个完整月收支仅作为需确认的建议|LifeSimulationService.CreateLifeSnapshot|LifeSimulationHttpTests、LifeSimulationTests、AiUnifiedAcceptanceSqlTests|
|多币种|账本按原币统计；综合估值用不晚于估值日期的直接汇率，缺失不猜测；不等同交易时点汇兑损益|FxRateSelection / AssetReportsService|CurrencyWorkflowTests、LiveFxTests|
|AI依据|工具调原财务服务，返回 Source/Data；授权、撤销及用户边界复查；答案数字校验属于保守检查，不是语义证明|AiFinancialTools、DeepSeekToolDispatcher、AiAnswerValidator|AiUnifiedAcceptanceSqlTests、AuditAiQueryRegressionTests、AiSafetyTests|

## 第二批实际问题与代码变更

1. 按账户筛选收入：总计按交易主账户，趋势按分录账户；总计改为分录 AccountId 回退交易 AccountId，与趋势一致。
2. 投资写入与报表各自实现现金公式：提取 InvestmentMath.CashMovement，含无现金持仓调整。
3. 分类诊断仅判断记录存在，漏检收入分类误用于支出：SQL 批量诊断和 LINQ 单条诊断均增加 Kind 一致性检查。
4. 写入后同一服务实例的异常缓存可能残留：提交后清空；统一诊断每次重新读取。
5. 新增已授权只读 GET /api/financial-diagnostics：输出交易异常原因、影响、建议、当前复核状态；负债正余额仅提示可能溢缴，投资检查双时序持仓合法性与资金关联净额。不会自动修复原始记录。

## 风险边界

账本净资产与综合估值净资产是两个明确保留的兼容口径，不能把差额直接称为错误。历史账户期初及归档缺少完整有效期，不能重建不存在的历史事实。外部银行账单、券商实际持仓及汇率准确性需要原始凭据复核。诊断的 Passed 仅表示该规则未检出，不能证明全部账务正确。AI数字校验不能证明模型的因果或投资建议正确。投资诊断使用批量流水聚合，最多十万条有效投资交易，超限明确拒绝，避免静默漏检。

## 补充闭环验证和测量

- 新增真实服务链：投资买入 10 份（100+1 费用）→卖出 4 份（48-1 费用）→剩余 6 份→价格12估值72→现金946→综合净资产1018→人生模拟资产快照。已通过；本金不进入普通收入，已实现收益6.6。
- 新增真实记账链：支出10→退款3→内部转账100→账户893和1100→预算净支出7→报表净支出7→每日点合计7、净资产1993。已通过。
- 已有隔离 SQL 回归覆盖历史修改、跨币种转入、对账匹配与幂等、AI全量工具读取、撤销授权及跨用户隔离；最终启用额外 SQL 连接测试以补足初轮跳过项。
- 前端全量：72 文件、496 项通过，515.18秒；发布公告定向10项通过。部署完整性测试5项通过。
- 十万交易、二十万分录、100账户：支出1000000、净资产-900000，期间点与总计相同。单样本本地 SQL 查询6102.1093ms；客户端托管分配6037792字节，CPU1296.875ms，工作集164569088字节。并发1，未测服务器资源和生产容量，不提供p95或吞吐外推。原始结果见 verification/finance-consistency-20-performance.json。
- 失败记录：首次大数据准备超出30秒命令超时，未进入被测查询；仅将测试数据准备命令的超时调整为180秒后完成。前端 pnpm 入口因依赖目录确认失败，改用现有本地 vitest直接运行，无依赖重装。
- 云端初次备份因空间不足失败。按用户明确要求删除旧备份并保留校验通过的一份后，重新备份并完成隔离恢复演练；还原后内容核对通过，临时库已删除。发布流程及日常备份默认保留一份。

诊断现还包括历史对账快照差额、当前月收支总计与每日点合计复核、综合估值数据缺口提示。投资关联批量聚合读取，限制十万条有效投资交易；非自动修复。外部账单、外部券商实际持仓、历史期初准确性、模型回答语义仍需凭据或人工判断，这些不以规则 Passed 代替。

## 最终回归状态（构建前）

后端启用隔离 SQL 集成项：646通过、0失败、12跳过，3分27秒；跳过项全部为需要真实模型连接的 AiLiveTests，未将其记为通过。最后诊断扩展定向14项通过；一项旧坏数据用例最初被数据库类型约束拒绝，改为符合数据库约束的历史超卖后通过。前端496通过，公告10通过。剩余既有编译警告xUnit2031一条。

当前交付以确定性账本计算、跨模块复核、隔离测试及恢复演练为验收边界。未验证真实模型服务在线回答质量，未提供生产环境性能承诺，未伪造历史期初日期；这些作为实际限制保留。此前“首批检查未完成”段落是阶段记录，以本节及后续部署记录为准。

## 部署与收尾

2026-10-28 发布 2026.10.28.4，产品6.13.3。生产构建、公告校验、产物源码指纹及发布包校验通过；健康READY，前端HTTP200；前后端发布号一致；诊断接口未登录401。未新增数据库迁移，未改写历史原始交易。复用本轮已通过校验与恢复演练的备份，未重复备份；云端仅保留一份完整备份。

本次隔离数据库已删除；未完成的备份下载、云端临时归档和上传发布文件已清理。自动审批两次拒绝删除 verification/audit20-build 与 verification/audit20-last 测试构建目录（blocked by policy，无具体理由），因此保留，未换工具绕过。测试及失败记录作为本专项必要审计证据保留。
