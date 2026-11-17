# Festival Finance Architecture

## 实际能力矩阵
|能力|当前项目|本次复用 / 处理|
|---|---|---|
|前端|React 19、TypeScript、Ant Design、React Query|现有布局、导航、主题、隐私模式及 API 客户端|
|后端与数据库|ASP.NET Core / EF Core / SQL Server；finance schema|FinanceService、StoredDocument、用户隔离与 Version|
|真实记账|FinanceTransaction / Entry；退款引用原交易|只新增归属记录，绝不新建资金分录|
|预算|月度、年度预算已有|独立节日口径；AI上下文读现有预算，页面提供原模块入口|
|项目和标签|已有目录及交易关联|原交易保持不变；节日归属为额外分析维度|
|AI审批|SpendingApproval已有|创建原审批中心草稿，用户提交与决定|
|消费价值|SpendingValueMath已有|调用原 Compare 核算，不编造主观评分|
|现金流及目标|CashFlowForecast、GoalAllocation已有|AI复用授权财务证据；储蓄登记仅为计划|
|优惠权益|PromotionJson、CashbackReceivable已有|实际支付沿用原交易；价格调整返现到账后为原系统 Refund，需明确关联；奖励收入不伪装冲减支出|
|日历与提醒|CalendarEvents / PlanningSummary|增加节日事件和确定性ID的站内提醒，无第二套消息中心|

## 持久化与事务
复用 Documents 表：FestivalEvent、FestivalAllocation、FestivalHistory、FestivalRecipient、FestivalAiPlan、FestivalReview、FestivalAttachment。没有新增物理表或数据库迁移。原有 Documents 索引及 TransactionId 外键继续有效；JSON 内部关联在服务层核实所有权。

全部财务归属写入复用 FinanceService.Write 的用户级 SQL sp_getapplock、事务、幂等记录及审计。更新携带 If-Match，冲突返回409。年度汇总批量读取关联记录及相关流水；不会为每个节日扫描整个交易表。

金额输入使用精确 decimal；持久化计划金额采用校验后的十进制字符串。跨币种汇率保留8位精度、日期与用户确认来源；报告按归属汇率舍入至2位。退款按原归属汇率冲减；原系统单独处理汇兑损益。

日期为 DateOnly，倒计时和提醒采用 Asia/Shanghai；农历使用 .NET ChineseLunisolarCalendar，闰月明确校验。内置规则覆盖公历、农历和美国第四个星期四；不以近似清明日期替代历表。
