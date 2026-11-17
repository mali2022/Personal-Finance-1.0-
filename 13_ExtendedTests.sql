SET NOEXEC OFF;
USE master;
GO
IF DB_ID(N'PersonalFinance') IS NULL
BEGIN
 RAISERROR(N'测试中止：PersonalFinance不存在。',16,1);
 SET NOEXEC ON;
END;
GO
USE PersonalFinance;
GO
IF DB_NAME()<>N'PersonalFinance'
BEGIN
 RAISERROR(N'测试中止：数据库上下文错误。',16,1);
 SET NOEXEC ON;
END;
GO
SET NOCOUNT ON;
-- 在基准测试数据之后执行。正向测试在外层事务中完成，成功后回滚临时数据。
DECLARE @U BIGINT=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo'),
@C BIGINT=(SELECT CurrencyId FROM dbo.Currencies WHERE CurrencyCode='CNY'),
@Usd BIGINT=(SELECT CurrencyId FROM dbo.Currencies WHERE CurrencyCode='USD');
DECLARE @Bank BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'招商银行储蓄卡'),
@Ali BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'支付宝'),
@Reim BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'公司报销应收'),
@Debt BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'个人借款应付'),
@DebtId BIGINT=(SELECT LoanId FROM dbo.Loans WHERE UserId=@U AND Direction='Received'),
@Shop BIGINT=(SELECT CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='GeneralShopping'),
@Food BIGINT=(SELECT CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='FoodGoods'),
@Unknown BIGINT=(SELECT CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='Unknown'),
@Id BIGINT,@Entry BIGINT,@DollarAccount BIGINT,@E dbo.EntryInput;
BEGIN TRY
 BEGIN TRANSACTION;
 -- 借入与偿还本金，不应影响任何损益。
 EXEC dbo.usp_AddTransfer @U,@Debt,@Bank,400,400,'2026-10-08',@Id OUTPUT,1,1,N'借入测试','LoanReceived';
 EXEC dbo.usp_AddLoanRepayment @U,@DebtId,@Bank,150,'2026-10-09',@Id OUTPUT;
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_Loans WHERE LoanId=@DebtId AND OutstandingPrincipal=250)
 THROW 51300,N'借入/归还本金测试失败。',1;
 -- 新一轮垫付和部分报销：累计垫付800，收到620，未收180。
 EXEC dbo.usp_AddTransfer @U,@Bank,@Reim,300,300,'2026-10-08',@Id OUTPUT,1,1,NULL,'ReimbursementAdvance';
 EXEC dbo.usp_AddTransfer @U,@Reim,@Bank,120,120,'2026-10-09',@Id OUTPUT,1,1,NULL,'ReimbursementReceived';
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_Reimbursements WHERE AccountId=@Reim AND OutstandingAmount=180 AND ReceivedAmount=620 AND ExpectedAmount=800 AND FinancialStatus='Partial')
 THROW 51301,N'部分报销测试失败。',1;
 -- 多次退款，与重新分类同步。
 EXEC dbo.usp_AddExpense @U,@Ali,@Shop,60,'2026-10-08',@Id OUTPUT,N'多次退款测试';
 SELECT @Entry=EntryId FROM dbo.TransactionEntries WHERE TransactionId=@Id AND EntryKind='Expense';
 EXEC dbo.usp_AddRefund @U,@Entry,@Ali,10,'2026-10-09',@Id OUTPUT;
 EXEC dbo.usp_AddRefund @U,@Entry,@Ali,20,'2026-10-10',@Id OUTPUT;
 EXEC dbo.usp_ReclassifyExpense @U,@Entry,@Food,N'确认该购物属于食品';
 IF EXISTS(SELECT 1 FROM dbo.TransactionEntries WHERE (EntryId=@Entry OR OriginalEntryId=@Entry) AND CategoryId<>@Food)
 THROW 51302,N'原费用与退款分类迁移不一致。',1;
 IF (SELECT SUM(Amount) FROM dbo.TransactionEntries WHERE EntryId=@Entry OR OriginalEntryId=@Entry)<>30
 THROW 51303,N'多次退款净消费测试失败。',1;
 -- 不明消费可纠错，金额与余额不变。
 SELECT TOP(1) @Entry=EntryId FROM dbo.vw_PostedEntries WHERE UserId=@U AND CategoryId=@Unknown AND Amount=20;
 EXEC dbo.usp_ReclassifyExpense @U,@Entry,@Food,N'已核实为食品消费';
 IF NOT EXISTS(SELECT 1 FROM dbo.AuditLogs WHERE EntityId=@Entry AND UserId=@U AND ActionName='Reclassify')
 THROW 51304,N'纠错审计缺失。',1;
 -- 美元账户与明确汇兑费用：银行-720，美元+100(700本位币)，费用+20。
 INSERT dbo.Accounts(UserId,AccountTypeId,AccountName,CurrencyId,OpeningDate)
 SELECT @U,AccountTypeId,N'扩展测试美元账户',@Usd,'2026-01-01' FROM dbo.AccountTypes WHERE AccountTypeCode='Bank';
 SET @DollarAccount=SCOPE_IDENTITY();
 DECLARE @Fee BIGINT=(SELECT CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='Fees');
 INSERT @E VALUES(1,'Account',@Bank,NULL,@C,-720,1,NULL,NULL),(2,'Account',@DollarAccount,NULL,@Usd,100,7,NULL,NULL),(3,'Expense',NULL,@Fee,@C,20,1,NULL,NULL);
 EXEC dbo.usp_PostTransaction @U,'Exchange','2026-10-09',@E,@Id OUTPUT,N'外币兑换含明确费用';
 -- 项目、商户、标签为独立关系；与记账分录金额无重复事实。
 DECLARE @M BIGINT=(SELECT MerchantId FROM dbo.Merchants WHERE UserId=@U AND MerchantName=N'示例超市'),
 @P BIGINT=(SELECT ProjectId FROM dbo.Projects WHERE UserId=@U AND ProjectName=N'日本旅游');
 EXEC dbo.usp_AddExpense @U,@DollarAccount,@Food,10,'2026-10-10',@Id OUTPUT,N'外币项目消费',7,@M,@P;
 INSERT dbo.TransactionTags(UserId,TransactionId,TagId) SELECT @U,@Id,TagId FROM dbo.Tags WHERE UserId=@U AND TagName IN (N'工作',N'旅游');
 IF (SELECT COUNT(*) FROM dbo.TransactionTags WHERE TransactionId=@Id)<>2 THROW 51305,N'多标签测试失败。',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_IncomeExpense WHERE TransactionId=@Id AND Expense=70 AND ProjectId=@P)
 THROW 51306,N'多币种历史损益失败。',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_NetWorth WHERE UserId=@U AND MissingRateCount=1 AND NetWorth IS NULL)
 THROW 51307,N'缺失估值汇率未显式暴露。',1;
 INSERT dbo.ExchangeRates(UserId,CurrencyId,BaseCurrencyId,RateDate,ExchangeRate,RateSource)
 VALUES(@U,@Usd,@C,'2026-01-01',7.2,N'测试估值');
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_NetWorth WHERE UserId=@U AND MissingRateCount=0 AND TotalAssets=12833 AND TotalLiabilities=250 AND NetWorth=12583)
 THROW 51308,N'当前估值与历史损益区分失败。',1;
 -- 餐饮预算实际：原145 + 改类后的净消费30 + 不明20 + 美元食品70 =265。
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_BudgetPerformance b JOIN dbo.Categories c ON c.CategoryId=b.CategoryId
 WHERE b.UserId=@U AND c.CategoryCode='Food' AND b.ActualAmount=265 AND b.RemainingAmount=1735 AND b.ExecutionPercent=13.25)
 THROW 51309,N'预算范围/退款冲减失败。',1;
 DECLARE @Actual DECIMAL(19,4)=(SELECT SignedBalance FROM dbo.vw_AccountBalances WHERE AccountId=@DollarAccount);
 EXEC dbo.usp_ReconcileAccount @U,@DollarAccount,'2026-10-10T23:59:59',@Actual;
 IF NOT EXISTS(SELECT 1 FROM dbo.AccountReconciliations WHERE AccountId=@DollarAccount AND Status='Matched' AND Difference=0)
 THROW 51310,N'对账测试失败。',1;
 -- 对账差异只记录、不自动变成收益。
 EXEC dbo.usp_ReconcileAccount @U,@DollarAccount,'2026-10-11',120;
 IF NOT EXISTS(SELECT 1 FROM dbo.AccountReconciliations WHERE AccountId=@DollarAccount AND Difference=30 AND Status='Open')
 THROW 51311,N'对账差额测试失败。',1;
 IF EXISTS(SELECT TransactionId FROM dbo.vw_PostedEntries GROUP BY TransactionId HAVING SUM(BaseCurrencyAmount)<>0)
 THROW 51312,N'扩展分录不平衡。',1;
 ROLLBACK TRANSACTION;
 SELECT N'扩展正向测试通过，临时数据已回滚' AS TestResult;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
GO
-- 去重：第二次过账必须失败；入口的ROLLBACK会回滚整个外层事务。
DECLARE @U BIGINT=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo'),
@C BIGINT=(SELECT CurrencyId FROM dbo.Currencies WHERE CurrencyCode='CNY');
DECLARE @A BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'支付宝'),
@Cat BIGINT=(SELECT CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='Lunch'),
@BeforeCount BIGINT=(SELECT COUNT_BIG(*) FROM dbo.Transactions),@Id BIGINT,@E dbo.EntryInput;
INSERT @E VALUES(1,'Account',@A,NULL,@C,-1,1,NULL,NULL),(2,'Expense',NULL,@Cat,@C,1,1,NULL,NULL);
BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_PostTransaction @U,'Expense','2026-10-11',@E,@Id OUTPUT,NULL,NULL,NULL,NULL,'CSV',@A,N'EXTENDED-TEST-UNIQUE';
 EXEC dbo.usp_PostTransaction @U,'Expense','2026-10-11',@E,@Id OUTPUT,NULL,NULL,NULL,NULL,'CSV',@A,N'EXTENDED-TEST-UNIQUE';
 THROW 51313,N'重复导入竟然成功。',1;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 IF ERROR_NUMBER() NOT IN (2601,2627) THROW;
END CATCH;
IF (SELECT COUNT_BIG(*) FROM dbo.Transactions)<>@BeforeCount THROW 51314,N'重复导入失败后存在残留交易。',1;
SELECT N'重复导入负向测试通过' AS TestResult;
GO
