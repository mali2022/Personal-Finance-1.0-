SET NOEXEC OFF;
USE master;
GO
IF DB_ID(N'PersonalFinance') IS NULL
BEGIN
 RAISERROR(N'中止：PersonalFinance不存在，禁止在系统数据库执行模块。',16,1);
 SET NOEXEC ON;
END;
GO
USE PersonalFinance;
GO
IF DB_NAME()<>N'PersonalFinance'
BEGIN
 RAISERROR(N'中止：当前数据库不是PersonalFinance。',16,1);
 SET NOEXEC ON;
END;
GO
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO
-- MODULE 12_Reports
DECLARE @U BIGINT=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo');
DECLARE @Today DATE=CONVERT(DATE,SYSDATETIMEOFFSET() AT TIME ZONE 'China Standard Time');
DECLARE @Month DATE=DATEFROMPARTS(YEAR(@Today),MONTH(@Today),1),@Next DATE;
SET @Next=DATEADD(MONTH,1,@Month);
-- 今天费用及消费（损失单列）；退款按退款发生日冲减。
SELECT COALESCE(SUM(Expense),0) AS TodayExpense,COALESCE(SUM(Consumption),0) AS TodayConsumption
FROM dbo.vw_IncomeExpense WHERE UserId=@U AND TransactionDate>=@Today AND TransactionDate<DATEADD(DAY,1,@Today);
-- 本月支出、收入、结余
EXEC dbo.usp_GetMonthlyReport @U,@Month;
-- 一级分类
SELECT c.CategoryName,SUM(e.Expense) AS Expense,SUM(e.Consumption) AS Consumption
FROM dbo.vw_IncomeExpense e JOIN dbo.Categories c ON c.CategoryId=e.RootCategoryId
WHERE e.UserId=@U AND e.EntryKind='Expense' AND e.TransactionDate>=@Month AND e.TransactionDate<@Next GROUP BY c.CategoryName;
-- 二级分类；直接录入一级分类时显示“未细分”
SELECT p.CategoryName AS PrimaryCategory,CASE WHEN c.CategoryLevel=2 THEN c.CategoryName ELSE N'未细分' END AS SecondaryCategory,SUM(e.Expense) AS Expense
FROM dbo.vw_IncomeExpense e JOIN dbo.Categories c ON c.CategoryId=e.CategoryId JOIN dbo.Categories p ON p.CategoryId=e.RootCategoryId
WHERE e.UserId=@U AND e.EntryKind='Expense' AND e.TransactionDate>=@Month AND e.TransactionDate<@Next
GROUP BY p.CategoryName,c.CategoryLevel,c.CategoryName;
SELECT * FROM dbo.vw_MonthlyIncomeExpense WHERE UserId=@U ORDER BY MonthStart;
SELECT * FROM dbo.vw_AccountBalances WHERE UserId=@U;
SELECT TotalAssets,TotalLiabilities,NetWorth,MissingRateCount FROM dbo.vw_NetWorth WHERE UserId=@U;
-- 最近50笔按交易头分页，再取分录，避免把50条分录误称50笔交易。
WITH Latest AS (SELECT TOP(50) TransactionId FROM dbo.Transactions WHERE UserId=@U AND IsDeleted=0 AND Status='Confirmed' ORDER BY TransactionDate DESC,TransactionId DESC)
SELECT d.* FROM Latest x JOIN dbo.vw_TransactionDetails d ON d.TransactionId=x.TransactionId ORDER BY d.TransactionDate DESC,d.TransactionId DESC,d.EntryId;
DECLARE @Merchant BIGINT=(SELECT MerchantId FROM dbo.Merchants WHERE UserId=@U AND MerchantName=N'示例超市'),
@Category BIGINT=(SELECT CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='Food'),
@Project BIGINT=(SELECT ProjectId FROM dbo.Projects WHERE UserId=@U AND ProjectName=N'日本旅游');
-- 退款商户继承原消费，避免退款头没有商户而导致商户净消费夸大。
SELECT SUM(e.Expense) AS MerchantNetExpense FROM dbo.vw_IncomeExpense e
LEFT JOIN dbo.TransactionEntries oe ON oe.EntryId=e.OriginalEntryId LEFT JOIN dbo.Transactions ot ON ot.TransactionId=oe.TransactionId
WHERE e.UserId=@U AND e.EntryKind='Expense' AND COALESCE(ot.MerchantId,e.MerchantId)=@Merchant;
SELECT e.TransactionDate,e.CategoryName,e.Expense FROM dbo.vw_IncomeExpense e WHERE e.UserId=@U
AND (e.CategoryId=@Category OR e.RootCategoryId=@Category) AND e.EntryKind='Expense'
AND e.TransactionDate>=DATEADD(YEAR,-1,@Today) AND e.TransactionDate<DATEADD(DAY,1,@Today) ORDER BY e.TransactionDate;
SELECT SUM(e.Expense) AS ProjectNetExpense FROM dbo.vw_IncomeExpense e
LEFT JOIN dbo.TransactionEntries oe ON oe.EntryId=e.OriginalEntryId LEFT JOIN dbo.Transactions ot ON ot.TransactionId=oe.TransactionId
WHERE e.UserId=@U AND e.EntryKind='Expense' AND COALESCE(ot.ProjectId,e.ProjectId)=@Project;
SELECT * FROM dbo.vw_Reimbursements WHERE UserId=@U AND OutstandingAmount>0;
SELECT * FROM dbo.vw_Receivables WHERE UserId=@U;
SELECT * FROM dbo.vw_Payables WHERE UserId=@U;
SELECT * FROM dbo.vw_BudgetPerformance WHERE UserId=@U;
GO
