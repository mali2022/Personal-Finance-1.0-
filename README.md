<img width="2560" height="1755" alt="9569a52f-78a6-4233-90a7-98ad494a16c3" src="https://github.com/user-attachments/assets/349e6107-8595-4ad4-9910-7393f684826c" />
<img width="2560" height="4598" alt="29436548-26d2-41d1-8b7b-07ab4d889a56" src="https://github.com/user-attachments/assets/2757ec5c-a126-4fe1-b6e7-f25e2d00b802" />
<img width="2560" height="1305" alt="2035b6d9-79b1-4a22-bbf9-7f3e8f305bac" src="https://github.com/user-attachments/assets/228a658b-a6f0-44a1-bf0d-27b25bf4103e" />
<img width="2560" height="1305" alt="876eb549-834f-4a73-8767-f985336d4247" src="https://github.com/user-attachments/assets/4d5b0618-25d8-43e4-9916-fd6a4714515d" />
<img width="2560" height="1305" alt="2445a5b5-d99f-449f-b175-c147129588b5" src="https://github.com/user-attachments/assets/55d472a3-025c-40f3-8020-c0e1f069005d" />
<img width="2560" height="1305" alt="538dc9c8-68fd-4958-a793-7c483b3ae127" src="https://github.com/user-attachments/assets/69acc70a-bc5b-4a40-8a6b-85b6d3857132" />
<img width="2560" height="1305" alt="cbc0f4e9-355c-44f0-b752-ce70365b1dc0" src="https://github.com/user-attachments/assets/87d06e86-2554-4488-a58d-9b9ed2e0795b" />
<img width="2560" height="1305" alt="c0a4cbbb-8870-42e1-bbd8-83c40237d508" src="https://github.com/user-attachments/assets/ecf7103a-35b2-49cd-a915-f3ff964df31f" />
<img width="2560" height="1305" alt="e091fb70-fdbe-41d8-a725-f14c0201c5ab" src="https://github.com/user-attachments/assets/e061a7d8-2881-47a6-9fbb-5776b3a5a8d1" />
<img width="2560" height="1305" alt="39780472-6f2a-42af-82d2-d4b79e2abd82" src="https://github.com/user-attachments/assets/0ede395c-f8e2-4084-9e5f-858a5ac0bffe" />


个人记账与个人财务管理数据库

> 日常使用为本地账本（2026-11-14 起已与云服务器断开、完全本地化）：双击 `打开PersonalFinance.bat` 或 `启动PersonalFinance.bat`，在 http://127.0.0.1:5085/ 进入，数据只在本机 SQL Server 默认实例 `.` 的 `PersonalFinanceWeb` 库。云端启动/备份入口、部署产物与 `deploy/` 目录（含云端恢复脚本与连接信息模板）已于 2026-11-18 按用户决定全部删除，不再保留任何云端连接或恢复通道；历史云端说明已在 1.0 精简中并入 [版本历史（1.0）](<docs/版本历史-1.0.md>)（已停用，仅作记录）。
>
> React + ASP.NET Core + EF Core + SQL Server 应用架构见 [backend/README.md](<backend/README.md>)。本文与 sql/ 描述原数据库设计方案。

## 当前应用功能文档

当前版本：**Personal Finance 1.0.0 正式版**（发布号 2026.11.18.1，频道 stable）。功能演进、历次发布内容与测试期文档索引见 [版本历史（1.0）](<docs/版本历史-1.0.md>)；启动、备份恢复、更新回滚与核算规则见 [维护手册（1.0）](<docs/维护手册-1.0.md>)；应用内更新入口为 `/settings/updates`（公开页 `/updates`）。

## 第一部分：总体架构与唯一底层模型

采用 **Signed Amount 平衡分录模型**。它使用复式账本的完整性原则，但不保存 Debit/Credit 两列，也不引入第二套符号规则。每笔已确认交易按交易时本位币换算后分录之和必须为零。

这里的 Signed Amount 不是“账户变化 + 一个分类标签”的不完整流水模型。所有财务事件都必须有对方分录；账户、费用、收入、权益属于同一个分录集合。

### 模型选择论证

| 维度 | 标准 Debit/Credit | 本系统 Signed Amount |
|---|---|---|
| 可理解性 | 需了解不同账户的借贷方向、正常余额 | 正负表达净资产方向，普通录入通过简单过程完成 |
| 正确性 | 本位币借方合计=贷方合计 | 本位币有符号分录合计=0；完整性同样严格 |
| 账户余额 | 根据账户性质计算借贷净额 | 所有账户直接 SUM(Amount)；负债展示时取反 |
| 转账 | 借入账账户、贷出账账户 | 出账负数、入账正数；无收支分录 |
| 信用卡 | 消费贷记负债、借记费用 | 信用卡消费负数、费用正数；还款信用卡正数 |
| 借贷 | 需区分资产、负债的正常余额 | 应收正数、应付负数；本金移动无费用/收入 |
| 报销 | 先借记应收，结算时冲回 | 垫付增加应收，报销减少应收；不经过收支 |
| 退款 | 冲回原费用，可能需红字/反方向记账 | 负费用，关联原费用分录，支持多次部分退款 |
| 多币种 | 同样需要原币、本位币、历史汇率及差额分录 | 每条分录分别保存原币与汇率，只要求本位币平衡 |
| 统计 | 通过损益账户和借贷方向统计 | 通过 Income/Expense 分录统计，不能按账户方向统计 |
| 未来扩展 | 企业财务接口、法定账簿更自然 | 可扩展投资、应收、应付、估值；需要企业凭证时可映射正负为借贷 |
| SQL复杂度 | 通常需 CASE 合并 Debit/Credit | 余额一个 SUM；收入对 Income 金额取负，费用直接 SUM |

Signed Amount 的核心优点是减少个人录入和余额查询的认知负担。其正确性来自完整对方分录、精确平衡、约束和唯一过账入口，而不是来自金额字段的名字。

### 全系统统一符号

| EntryKind | 正数 | 负数 |
|---|---|---|
| Account，资产 | 资产增加 | 资产减少 |
| Account，负债 | 负债减少/信用卡还款 | 负债增加/信用卡消费 |
| Expense | 费用确认 | 原费用冲减 |
| Income | 收入冲减，仅明确调整允许 | 收入确认 |
| Equity | 权益减少对应项 | 权益增加对应项，例如正资产期初的对方 |

负债的余额是负数：欠信用卡300元时 SignedBalance=-300、DisplayBalance=300。信用卡多还100元则 SignedBalance=100，该余额在净资产中算资产。资产账户透支则作为负债展示。账户类型用于业务属性和正常余额方向，净资产按实际余额符号拆分，避免负资产或负负债掩盖透支和溢缴款。

### 四个核心实体

* Transactions 是业务凭证头：用户、日期、交易类型、商户、交易对象、项目、来源、状态、备注。
* TransactionEntries 是不可缺少的财务事实：账户或损益分类、原币金额、汇率、本位币金额、原退款费用引用。头本身不存一个含义模糊的总金额。
* Accounts 保存资金、债权、债务账户属性。账户币种固定。余额来自已确认分录，不存在可随意写入的 CurrentBalance。
* Categories 只组织 Income/Expense 损益分录，最多两层。转账、资产和负债使用账户、业务类型和合同属性，不混入消费分类。

一条分录只能关联账户或分类或期初权益，不能同时关联账户和分类。比如午餐：支付宝账户 -25、午餐费用 +25。拆分超市购物：支付宝 -200、食品费用 +120、日用品费用 +50、宠物用品费用 +30。

### 财务事件与统计

| 事件 | 账户分录 | 对方/分类分录 | 收支影响 |
|---|---|---|---|
| 午餐25 | 支付宝-25 | 午餐费用+25 | 费用25 |
| 工资10000 | 银行+10000 | 工资收入-10000 | 收入10000 |
| 银行转支付宝500 | 银行-500、支付宝+500 | 无 | 无 |
| 信用卡消费300 | 信用卡-300 | 购物费用+300 | 费用300 |
| 信用卡还款300 | 银行-300、信用卡+300 | 无 | 无 |
| 借给朋友1000 | 银行-1000、合同应收+1000 | 无 | 无 |
| 朋友归还500 | 银行+500、合同应收-500 | 无 | 无 |
| 借入1000 | 银行+1000、合同应付-1000 | 无 | 无 |
| 偿还本金 | 银行-本金、合同应付+本金 | 无 | 无 |
| 利息/手续费 | 资金账户-金额 | 对应费用+金额 | 费用；收到利息则收入 |
| 报销垫付500 | 银行-500、报销应收+500 | 无 | 无 |
| 报销到账500 | 银行+500、报销应收-500 | 无 | 无 |
| 消费100后退款30 | 收款账户+30 | 原消费分类-30，引用原费用 | 净费用70 |
| 现金遗失200 | 现金-200 | 资产损失+200 | 总费用200，默认消费0 |
| 不明消费20 | 银行-20 | 不明消费+20 | 消费20，可审计重分类 |
| 买储值卡 | 银行-金额、储值账户+金额 | 无 | 无；之后用卡消费才确认费用 |
| 买入投资 | 银行-金额、投资账户+金额 | 无 | 无；成本/市值调整另记明确交易 |

红包、礼金按财务实质处理：收到礼金是真收入，送出礼金是社交费用；自己的账户之间红包移动是转账。赔偿若超过原消费或与原消费无关，超出部分是其他收入，不使用“退款补偿”合并分类。

交易类型只有15种；它描述业务语义，不替代分录。CreditCardPurchase 使用 Expense，不另增类型。DebtAdjustment 使用 Adjustment，必须说明原因和对方分录。金额损失可通过费用分类排除消费，但不能排除净资产损失。

收入=负的 Income 本位币金额；总费用=Expense 本位币金额；消费=IsConsumption=1的费用；结余=收入-总费用。默认预算只衡量消费。分类的 IsConsumption 是全历史查询政策，改变它会重新解释历史；若需要按年份冻结口径，可后续新增政策版本维表，不应悄悄修改历史金额。

净现金流定义为所有 IsLiquid=1 且 IncludeInStatistics=1 账户的已确认变动，不含期初。银行→支付宝抵消；银行→信用卡还款减少现金；借款到账增加现金但不增加收入；借出本金减少现金但不增加费用。改变账户范围会改变现金流边界，范围外账户之间的资金移动不再必然抵消。收入费用是损益口径，现金流是流动资金口径，二者不要求相等。IncludeInStatistics控制资金流范围，不用于隐瞒已确认的收入费用；收入费用由分类统计政策决定。

净资产按当前原币余额和最近有效估值汇率计算；收入费用按交易历史汇率计算。未实现汇兑/投资估值会导致净资产变化不等于损益结余，不能用“强行相等”作为检查条件。无估值汇率时净资产返回NULL并列出 MissingRateCount，禁止悄悄当作零或一。

### 期初、多币种与精度

Accounts.OpeningBalance 是期初分录的只读业务镜像，不是另一个可独立修改的余额。新增有余额账户，先插入 OpeningBalance=0 的账户，再通过 usp_PostTransaction 的 OpeningBalance 类型录入一条账户和一条 Equity 分录。过程只允许账户尚无正式交易时录入一次期初，并更新镜像。零期初不录零金额分录。

余额公式为“期初账户分录 + 非期初账户分录”。vw_AccountBalances 直接汇总全部已确认账户分录，不再额外加 Accounts.OpeningBalance。这与 OpeningBalance+后续变动等价且更不易重复。历史时点余额同样包含期初。

每个用户有一个固定本位币。Transactions 的复合外键绑定 Users.DefaultCurrencyId，第一笔交易后禁止直接改变本位币；迁移应创建新账簿或进行完整历史重算。不同用户可选不同本位币。

金额 DECIMAL(19,4)，汇率 DECIMAL(19,8)，本位币 ROUND(Amount*ExchangeRate,4)，严格平衡到四位小数。原币按 Currencies.DecimalPlaces 检查。用户界面可按币种精度展示，但平衡判断不得容许隐性差额。汇率舍入差异、兑换手续费和汇兑损益必须显式记入费用/收入分录。Exchange 类型支持多币种账户和损益对方，Transfer 只允许平衡的纯账户移动。

例：付出720 CNY买入100 USD，以7.00000000 CNY/USD记账：CNY账户-720，USD账户+100（本位币+700），汇兑/手续费费用+20 CNY。美元退款快捷过程沿用原消费汇率：若实际到账的本位币价值不同，应在同一次自定义分录过账中记录负原费用、实际收款、显式汇兑费用/收益。本版本 Refund 类型为同历史汇率消费冲回，复杂汇差需另记 Adjustment 的损益分录，并在 Notes 关联退款凭证；不能把汇差塞进退款金额。该限制保证简单退款口径确定。

快捷收入/支出和转账过程只对本位币自动使用汇率1，外币必须明确输入汇率。信用卡还款、借出、归还本金的单金额快捷过程限定本位币；外币业务调用 usp_AddTransfer 并传入双方实际金额与汇率，或调用统一分录入口。不能默认将USD与CNY当作1:1。

### 历史、主数据与业务明细

商户与交易对象分表。Merchants 用于消费分析和默认分类，Counterparties 用于人员/机构与合同关系。一个公司可同时在两张表出现，这是不同业务角色，不重复保存同一账务事实。名称改变更新主数据，历史交易保留ID。需要当时名称证据时使用原始账单附件，不把自由文本名称当关联键。

贷款与报销每个业务对象对应一个专用应收/应付账户。Loans 保存合同、方向、对象、期限和利率，不存余额；Reimbursements 保存提交/办理状态，不手工维护 ExpectedAmount/ReceivedAmount。金额通过账户分录推导，支持部分报销与多次归还。不得让一个账户同时登记为贷款和报销账户，也不得混入其他项目的应收。专用账户设计适合个人规模；如果将来有数万笔应收合同，可改为分录增加业务明细维度并保留同一账本。

不再报销：以 Expense 类型记录“报销应收 -余额，个人费用/损失 +余额”，再将 WorkflowStatus 更新为 Abandoned。不仅改变状态，否则应收仍虚增资产。预计报销金额就是实际已垫付金额；未发生垫付的申请估计不能算应收资产，可仅存在申请说明。

历史记录不因主数据 IsDeleted/IsActive 被视图排除。账户关闭、分类停用只阻止新录入，退款可引用停用历史分类。外键一律不级联删除。交易分录从属于交易头，不单独软删除。Confirmed 交易不可标记删除；删除草稿可以使用 Pending/Cancelled+IsDeleted。正式金额改错使用有明确对方的 Adjustment 冲销和新凭证，不直接改账。消费分类纠错用 usp_ReclassifyExpense，同时迁移已发生退款分类并记录 AuditLogs。分类树最多两层由复合自引用外键与CHECK硬约束，无触发器。

本方案主数据唯一名称/编码保留停用记录，不自动重新使用已删除名称，避免导入历史意外关联到新对象。真正重复交易通过凭证号与导入哈希唯一索引防止；同日同金额不是重复的充分证据。导入哈希应由稳定的来源记录字段计算，而不是可修改的分类/备注。

### 信用卡、对账、预算、定期规则

信用卡账户记录额度、账单日、还款日。usp_GetCreditCardPeriod 接收银行实际账单区间，给出本期消费、退款、期间还款、期末欠款与当前欠款。当前未还款=max(CurrentDebt,0)。期间还款不等于“核销了某一期账单的金额”，有分期、最低还款、利息和提前还款时需要银行账单与核销分配模块。基础版不建 CreditCardStatements，避免伪造银行精确账单；后续可增加外部账单和到账分录分配表，不重复维护账户余额。31日遇小月应由界面或调度器取月末，账单截止时间由实际账单明确。

Pending 是草稿，不进入余额；Confirmed 已过账；Cancelled 草稿取消。Reconciled 是账户分录与外部对账一致的事实，并非整个交易头状态。一个转账的两个账户可能在不同日期对账，因此 ReconciledEntries 单独记录分录核验。usp_ReconcileAccount 保存当时计算余额快照及差额，StatementBalance使用原币有符号余额：信用卡欠款300输入-300，不输入展示用的+300。差额不自动转收入；确认错误来源后才补充费用/收入/调整。Matched 对账期间禁止追加回溯分录，重新打开对账必须同步移除核验关联并重新对账。对账快照是有意义的外部核验记录，不是余额唯一来源。

预算按月、按一级或二级费用分类。预算币种通过复合外键强制等于用户本位币，BudgetItems同样通过外键强制引用费用分类。不要同一预算同时把父分类与子分类的预算相加当作总预算，这两种范围重叠。ActualAmount 查询推导；零预算执行率返回NULL。分类类型与分录EntryKind也使用复合外键一致性检查，避免仅依靠过程验证。

定期规则与模板分录单独存储，支持日、周、月、季、年。只保存计划，不靠SQL Server Agent自动确认扣款。执行器根据规则生成待审核数据，经统一入口确认；RecurringOccurrences 的规则+到期日唯一键防止重复发生。同一事务中写凭证与发生记录，发生键冲突时回滚整个操作。假日、月末、闰年和跳过规则由执行器明确实现，不能假定一个月总是30天。

### 审计、安全、事务

核心实体有 CreatedAt/UpdatedAt，主要可修改实体增加 CreatedBy/UpdatedBy、软删除。时间审计使用UTC；TransactionDate 是用户本地业务时间，本版本约定Asia/Shanghai。日报用 SQL Server 'China Standard Time' 得到中国日期。将来跨时区应为用户增加时区属性并明确报表转换，不能混用UTC业务日期。

无触发器。UpdatedAt/UpdatedBy 不是自动更新时间：主数据由管理员编辑时必须同步更新。正式记账与分类纠错过程负责自己的更新时间。完整主数据历史可后续用Temporal Table：适合保留分类/商户/账户属性修改，不替代凭证纠错、审计操作者和来源证据。本版不默认启用，减少历史存储与迁移成本。AuditLogs仅覆盖允许的分类纠错，不宣称完整审计所有管理员行为。

统一过账过程参数化，业务记账无动态SQL；XACT_ABORT、TRY/CATCH、BEGIN/COMMIT/ROLLBACK保证多表一致性。快捷过程只组装TVP并调用统一入口，没有独立持久化写入，因此事务由真正写入的入口统一管理。按用户 sp_getapplock 串行化记账、退款额度和合同余额检查，足以适应个人系统的低并发。该锁只保护遵守入口的写入者，不保护sysadmin直接SQL。

FinanceApp角色允许视图读取与过程执行、拒绝直接表DML。SSMS管理员可初始化和维护主数据，但不得直接篡改已确认账本。把实际应用登录映射到该角色，严禁以db_owner运行应用。UserId是数据隔离维度，不是身份认证；本版本是个人/可信服务数据库，共享登录能够读取所有用户。多租户对外部署必须加认证授权或数据库RLS与独立登录映射后再开放，不能把参数UserId当安全边界。

BEGIN TRANSACTION支持嵌套，但CATCH的ROLLBACK会回滚调用方整个事务。调用方批量导入应整体重试，不能期待坏行失败后外层事务仍可继续。数据库管理员可重新分类已核验交易，因为分类更正不改变余额，但必须保留纠错理由。

## 第二部分：ER模型

```text
Currencies ──< Users(DefaultCurrencyId)
Users
 ├──< Accounts >── AccountTypes
 │     ├──< TransactionEntries(AccountId,CurrencyId)
 │     ├──1 Loans >── Counterparties
 │     ├──1 Reimbursements >── Counterparties
 │     └──< AccountReconciliations ──< ReconciledEntries >── TransactionEntries
 ├──< Categories ──< Categories(ParentCategoryId, 最多2层)
 │     ├──< TransactionEntries(CategoryId)
 │     ├──< BudgetItems
 │     └──< Merchants(DefaultCategoryId)
 ├──< Merchants ──< Transactions
 ├──< Counterparties ──< Transactions
 ├──< Projects ──< Transactions
 ├──< Transactions >── TransactionTypes / Sources / Currencies(本位币)
 │     ├──< TransactionEntries >── Currencies(原币)
 │     │     └──< TransactionEntries(OriginalEntryId,部分/多次退款)
 │     ├──< TransactionTags >── Tags
 │     ├──< Attachments
 │     └──1 RecurringOccurrences >── RecurringTransactions
 ├──< Budgets ──< BudgetItems >── Categories
 ├──< RecurringTransactions ──< RecurringEntries >── Accounts / Categories / Currencies
 ├──< ExchangeRates >── Currencies(原币/本位币)
 └──< AuditLogs
```

`──<`表示一对多；`──1`表示可选一对一。所有用户私有实体使用复合外键防止跨用户关联。非零OriginalEntryId必须引用同用户的已确认正费用分录，且退款累计不得超过原消费。

## 第三部分：完整表结构

逐表字段字典（数据类型、NULL、默认值、列级与表级主键/外键/唯一/CHECK、索引原文）原为测试版文档 002 - Schema.md，已在 1.0 精简中删除，条目保留在 [版本历史（1.0）](<docs/版本历史-1.0.md>) 附录 B；DDL 以 `sql/` 下脚本为准，不手工维护第二份 DDL。

关键分表取舍：OriginalAmount/CurrencyId/ExchangeRate属于分录；头只存BaseCurrencyId。ReimbursementStatus属于报销业务；RelatedTransactionId改为费用分录OriginalEntryId，才能准确控制拆分消费退款。收入与费用分类不复制在凭证头。附件只保存路径、哈希等元数据，不存大文件；本规模无需FILESTREAM。贷款不另建重复金额的LoanTransactions，直接查合同账户分录。

## 第四部分：完整可执行脚本与运行

1. 由Windows服务管理器或SQL Server Configuration Manager启动你的SQL Server实例。
2. 在SSMS连接实例，例如`.\SQLEXPRESS`，使用有建库权限的登录。
3. 首次安装打开 [Build.sql](Build.sql)，**整个文件**执行；无需SQLCMD模式。它创建PersonalFinance、全部对象、示例用户、初始化分类账户、13个场景和报告。
4. 最后应看到“基准断言通过”。若有任何SQL错误，应先停止后续执行并检查，不能把剩余部分执行成功误认为安装成功。
5. 按顺序打开 [13_ExtendedTests.sql](13_ExtendedTests.sql)、[14_IntegrityTests.sql](14_IntegrityTests.sql)执行额外测试；成功测试会回滚临时数据。

这是一套首次安装脚本，表与种子数据部分不支持重复执行。数据库存在时不会删除数据库，但若已有同名表会报错。不要在存有真实账务的数据库反复执行安装文件。示例UserName=demo，正式使用新建自己的用户与账户；测试数据与报告明确按UserId隔离。Build.sql包括示例交易，不应当把示例用户直接当作真实账簿。

`sql/00_CreateDatabase.sql` 到 `sql/12_Reports.sql` 与Build.sql内容相同，可按编号分别在SSMS执行。除00外，每个文件自行USE PersonalFinance。**二选一执行单文件或分模块，不能两套都执行。**GO是SSMS/sqlcmd批次分隔符，不是T-SQL；Python/Web API初始化工具需分批处理GO，正式业务直接调用存储过程。

### 索引与百万分录规模

| 索引 | 目的 |
|---|---|
| Transactions(UserId,TransactionDate,TransactionId)已确认过滤索引 | 月报、日查询、最近交易、游标分页；覆盖类型、项目、商户 |
| Transactions(UserId,MerchantId,TransactionDate) | 某商户消费范围查询 |
| Entries(UserId,AccountId,TransactionId) INCLUDE金额 | 账户余额、对账、账户明细 |
| Entries(UserId,CategoryId,TransactionId) INCLUDE损益 | 分类分析与预算 |
| Entries(OriginalEntryId)非空过滤索引 | 多次退款额度检查和关联 |
| Transactions来源账户外部号/哈希唯一索引 | 来源内去重，不因软删除而允许重复导入 |
| TransactionTags(UserId,TagId,TransactionId) | 标签反查交易 |
| ExchangeRates(UserId,BaseCurrencyId,CurrencyId,RateDate DESC) | 最新汇率估值 |

未为每个外键和IsDeleted单独建索引。交易类型与项目过滤目前先利用日期索引；只有真实执行计划证明需要才增加专用索引。范围查询使用 >=开始 AND <结束，不在过滤列上调用YEAR/MONTH。后续分页用 `(TransactionDate,TransactionId)` 游标，避免深OFFSET。百万分录余额汇总仍可使用覆盖索引；若实际耗时需要快照，增加“用户+账户+截止时点”快照和其后的增量分录，禁止维护无来源的唯一当前余额。快照必须在回溯写入后失效或锁定截止期间。

默认使用数据库继承的排序规则，NVARCHAR保证中文。唯一名称大小写/重音敏感性由数据库排序规则决定；不依赖中文文本作为业务代码。CurrencyCode、CategoryCode、类型及来源代码是稳定编码。

### 验证结果与预期数值

13个要求场景，另加期初3500。2026-10收入10000；消费615；现金损失200；总费用815；结余9185。现金800、银行10680、支付宝705、信用卡0、借款应收500、报销应收0。总资产12685、负债0、净资产12685。净现金流8685，比结余少500，因为仍有借给朋友的500应收。

退款在发生月份冲减费用：原交易和退款跨月时不会重写已经发布的原月账。分析“原消费最终净额”时用OriginalEntryId归集到原交易，而不是再次计为收入。报表同时提供总费用和消费，避免钱财遗失被隐藏。

Build.sql含余额、月报、现金流、净资产、全账平衡、超额退款和超额还款断言。13_ExtendedTests.sql补充借入/偿还、多次退款、部分报销、多币种、标签、项目、预算、重分类、对账及去重约束测试。所有测试应在测试数据库执行。

本次环境验证：使用SSMS自带ScriptDom TSql150Parser（SQL Server 2019语法）解析Build.sql及测试脚本。SQL Server本机服务处于停止状态，当前进程未能启动服务；用户级MSSQLLocalDB也未能启动，因此**没有宣称实际执行建库或数据库断言已通过**。语法解析不能代替SQL Server编译、对象绑定和真实数据执行；请在实例启动后运行随附脚本。

14_IntegrityTests.sql额外检查：不平衡交易、跨用户引用、停用账户、停用历史分类退款、非法第三层分类及已核验期间回溯入账。

### 25项质量检查

| 要求 | 实现 |
|---|---|
| 消费、收入 | Account+Expense/Income；金额方向验证 |
| 转账不进收支 | 两个账户分录，没有损益分录 |
| 信用卡不重复 | 消费Expense；还款CreditCardPayment只移动账户 |
| 退款、部分、多次 | OriginalEntryId+累计限额+历史汇率 |
| 多分类拆分 | 一账户、多费用分录；严守本位币平衡 |
| 借款不计收入、借出不计支出 | 专用合同应收/应付账户；本金不进损益 |
| 还款 | 合同方向检查，禁止本金余额越过零 |
| 报销 | 专用应收，ReceivedAmount查询推导 |
| 余额、净资产 | 全部分录汇总；估值缺失显式返回NULL |
| 分类修改、账户停用 | 稳定外键；历史视图不按主数据停用排除 |
| 多币种 | 逐分录币种汇率、历史损益与当前估值分离 |
| 商户、标签、项目 | 独立维表、标签多对多 |
| 预算 | 月度分类范围，实际查询推导 |
| 附件 | 外部文件元数据 |
| 来源、去重 | 来源码、来源账户外部号、哈希唯一索引 |
| 对账 | 外部余额快照、分录核验、已匹配期间写入保护 |
| 扩展 | 入口集中、主数据分离、合同属性不重复记余额 |

生产维护中的边界：FinanceApp不允许直接维护主数据；当前初始化/停用/重命名由可信SSMS管理员执行并更新审计字段。尚未加入用户管理、主数据CRUD、附件文件访问授权、自动定期生成器、银行账单分配和证券持仓数量模型。这些不影响已提供个人账务数据库在SSMS中的使用，但未来前端需要对应服务层或额外参数化过程。财务账本不依赖任何具体前端。

## 安装失败修复说明

用户运行截图显示：CREATE DATABASE报5133/1802，实例默认文件目录D:\个人财务管理系统\不存在；随后USE PersonalFinance报911。SSMS在GO之后继续执行，可能将业务对象与示例账务写入master。因此基准断言通过不能证明目标库安装成功。

已修复：00模块读取sys.master_files中的master数据文件和日志文件目录，显式指定新库物理文件路径，不使用失效的实例默认目录。仅建库DDL使用sp_executesql，路径来自SQL Server元数据并进行引号转义。此目录是SQL Server服务端目录，不是运行SSMS客户端的目录。文件已经存在或服务账号无法新建文件时仍会报错，不会覆盖或删除现有文件。

完整安装、分模块和附加测试均检查目标库存在且数据库上下文正确；失败时SET NOEXEC ON保护后续GO批次。完整安装还会拒绝在已有业务表的目标库重复执行。仅THROW/RAISERROR不能阻止SSMS继续后续批次，这次已经加入执行保护。必须执行整个文件，不要只选中中间DDL绕过检查。NOEXEC不会阻止所有编译诊断；保护目的是阻止后续写入，不宣称之后完全没有错误消息。

先运行15_DiagnoseInstallation.sql查看目标库与master中的本项目表。该脚本只读，不进行自动清理。不要删除master数据库，也不要凭名称盲目删除其中对象；任何清理都必须先核对对象、依赖和数据并备份。修复后的Build.sql创建独立PersonalFinance，不迁移或删除master中的残留对象。

这次修复后17个SQL文件通过SQL Server 2019语法解析。开发工具连接localhost遇到加密/SSPI连接失败，未从工具执行修复后的数据库安装；用户需在已连接的SSMS执行诊断与修复脚本验证。

## 文档与版本历史

版本演进见 [版本历史（1.0）](<docs/版本历史-1.0.md>)，运行维护见 [维护手册（1.0）](<docs/维护手册-1.0.md>)，交接资料见 [docs/ai-handover/00-START-HERE.md](<docs/ai-handover/00-START-HERE.md>)。
## 公开仓库说明（源码快照）

本仓库是 Personal Finance 1.0.0 正式版（发布号 2026.11.18.1）的源码快照，由本地交付目录整理而来，与可运行交付件的差异如下：

- 已排除本机密钥与配置：`.keys/`（ASP.NET 数据保护密钥）、`appsettings.Local.json`（`Auth.SigningKey` 登录签名密钥）、`scripts/local-runtime.json`（本机 node / dotnet 绝对路径）。本地启动前需自备 SQL Server 连接串与签名密钥，步骤见 [维护手册（1.0）](<docs/维护手册-1.0.md>)。
- 已排除构建与测试产物：`bin/`、`obj/`、`backend/src/PersonalFinance.Api/wwwroot/`、`frontend/dist/`、`**/TestResults/*.trx`、`verification/`、`.local-run/`。前端需先 `pnpm install && pnpm build`，后端需 `dotnet build`。
- 文档中的旧服务器地址与域名已替换为保留示例值（`192.0.2.1`、`personalfinance.invalid`）；云端服务已于 2026-11-14 停用，仓库内不含任何可用连接信息。
- 不含真实账务数据：没有数据库文件、备份或导出表，`*.csv` 仅为导入模板与代码清单。
- `frontend/public/ocr/`（约 33 MB）为离线 OCR 所需的第三方产物，各自 LICENSE 随目录附带。
- GitHub Actions：`.github/workflows/frontend.yml` 强制 lint、单元测试、生产构建与构建校验；`.github/workflows/backend.yml` 在一次性 SQL Server 容器里跑全部后端测试。浏览器端到端套件（`pnpm e2e`）需要连本机后端与带数据的数据库，默认不在 CI 运行，设置仓库变量 `PF_E2E=true` 才会执行；本地按维护手册启动后在 frontend 目录运行 `pnpm e2e` 即可。

