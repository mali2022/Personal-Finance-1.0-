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
-- MODULE 08_Views
CREATE VIEW dbo.vw_PostedEntries AS
SELECT e.*, t.TransactionDate,t.BaseCurrencyId,t.TransactionTypeId,t.MerchantId,t.ProjectId,t.CounterpartyId
FROM dbo.TransactionEntries e JOIN dbo.Transactions t ON t.TransactionId=e.TransactionId
WHERE t.Status='Confirmed' AND t.IsDeleted=0;
GO
CREATE VIEW dbo.vw_AccountBalances AS
SELECT a.AccountId,a.UserId,a.AccountName,a.CurrencyId,a.AccountTypeId,at.BalanceNature,at.IsLiquid,at.IsCreditCard,
 a.IncludeInNetWorth,a.IncludeInStatistics,a.IsActive,a.IsDeleted,
 COALESCE(SUM(e.Amount),CONVERT(DECIMAL(38,4),0)) AS SignedBalance,
 CASE WHEN at.BalanceNature='Liability' THEN -COALESCE(SUM(e.Amount),0) ELSE COALESCE(SUM(e.Amount),0) END AS DisplayBalance
FROM dbo.Accounts a JOIN dbo.AccountTypes at ON at.AccountTypeId=a.AccountTypeId
LEFT JOIN dbo.vw_PostedEntries e ON e.AccountId=a.AccountId
GROUP BY a.AccountId,a.UserId,a.AccountName,a.CurrencyId,a.AccountTypeId,at.BalanceNature,at.IsLiquid,at.IsCreditCard,
 a.IncludeInNetWorth,a.IncludeInStatistics,a.IsActive,a.IsDeleted;
GO
CREATE VIEW dbo.vw_IncomeExpense AS
SELECT e.*,c.CategoryName,c.CategoryType,c.IsConsumption,
 COALESCE(c.ParentCategoryId,c.CategoryId) AS RootCategoryId,
 CASE WHEN e.EntryKind='Income' THEN -e.BaseCurrencyAmount ELSE CONVERT(DECIMAL(19,4),0) END AS Income,
 CASE WHEN e.EntryKind='Expense' THEN e.BaseCurrencyAmount ELSE CONVERT(DECIMAL(19,4),0) END AS Expense,
 CASE WHEN e.EntryKind='Expense' AND c.IsConsumption=1 THEN e.BaseCurrencyAmount ELSE CONVERT(DECIMAL(19,4),0) END AS Consumption
FROM dbo.vw_PostedEntries e JOIN dbo.Categories c ON c.CategoryId=e.CategoryId
WHERE e.EntryKind IN ('Expense','Income');
GO
CREATE VIEW dbo.vw_MonthlyIncomeExpense AS
SELECT UserId,BaseCurrencyId,DATEFROMPARTS(YEAR(TransactionDate),MONTH(TransactionDate),1) AS MonthStart,
 SUM(Income) AS Income,SUM(Expense) AS Expense,SUM(Consumption) AS Consumption,
 SUM(Income-Expense) AS Surplus FROM dbo.vw_IncomeExpense
GROUP BY UserId,BaseCurrencyId,DATEFROMPARTS(YEAR(TransactionDate),MONTH(TransactionDate),1);
GO
CREATE VIEW dbo.vw_MonthlyCategoryExpense AS
SELECT UserId,BaseCurrencyId,DATEFROMPARTS(YEAR(TransactionDate),MONTH(TransactionDate),1) AS MonthStart,
 RootCategoryId,CategoryId,SUM(Expense) AS Expense,SUM(Consumption) AS Consumption
FROM dbo.vw_IncomeExpense WHERE EntryKind='Expense'
GROUP BY UserId,BaseCurrencyId,DATEFROMPARTS(YEAR(TransactionDate),MONTH(TransactionDate),1),RootCategoryId,CategoryId;
GO
-- 当前市值口径：每个用户/币种最新汇率；缺失任何必要汇率时净资产返回 NULL。
CREATE VIEW dbo.vw_NetWorth AS
WITH Valued AS (
 SELECT b.*,u.DefaultCurrencyId,
 CASE WHEN b.CurrencyId=u.DefaultCurrencyId THEN CONVERT(DECIMAL(19,8),1) ELSE r.ExchangeRate END AS Rate
 FROM dbo.vw_AccountBalances b JOIN dbo.Users u ON u.UserId=b.UserId
 OUTER APPLY(SELECT TOP(1) ExchangeRate FROM dbo.ExchangeRates r
 WHERE r.UserId=b.UserId AND r.CurrencyId=b.CurrencyId AND r.BaseCurrencyId=u.DefaultCurrencyId
 AND r.RateDate<=CONVERT(DATE,SYSDATETIMEOFFSET() AT TIME ZONE 'China Standard Time') ORDER BY RateDate DESC) r
 WHERE b.IncludeInNetWorth=1
), Totals AS (
 SELECT UserId,DefaultCurrencyId, SUM(CASE WHEN Rate IS NULL AND SignedBalance<>0 THEN 1 ELSE 0 END) AS MissingRateCount,
 SUM(CASE WHEN SignedBalance>0 THEN CONVERT(DECIMAL(28,4),SignedBalance*Rate) ELSE 0 END) AS Assets,
 SUM(CASE WHEN SignedBalance<0 THEN CONVERT(DECIMAL(28,4),-SignedBalance*Rate) ELSE 0 END) AS Liabilities
 FROM Valued GROUP BY UserId,DefaultCurrencyId
)
SELECT UserId,DefaultCurrencyId,MissingRateCount,
 CASE WHEN MissingRateCount=0 THEN Assets END AS TotalAssets,
 CASE WHEN MissingRateCount=0 THEN Liabilities END AS TotalLiabilities,
 CASE WHEN MissingRateCount=0 THEN Assets-Liabilities END AS NetWorth FROM Totals;
GO
CREATE VIEW dbo.vw_Receivables AS
SELECT b.* FROM dbo.vw_AccountBalances b JOIN dbo.AccountTypes at ON at.AccountTypeId=b.AccountTypeId
WHERE at.AccountTypeCode='Receivable' AND b.SignedBalance>0;
GO
CREATE VIEW dbo.vw_Payables AS
SELECT b.* FROM dbo.vw_AccountBalances b WHERE b.SignedBalance<0;
GO
CREATE VIEW dbo.vw_Reimbursements AS
SELECT r.*,b.CurrencyId,b.SignedBalance AS OutstandingAmount,
 COALESCE(x.ExpectedAmount,0) AS ExpectedAmount,COALESCE(x.ReceivedAmount,0) AS ReceivedAmount,
 CASE WHEN r.WorkflowStatus='Abandoned' THEN 'Abandoned' WHEN b.SignedBalance=0 THEN 'Paid'
 WHEN COALESCE(x.ReceivedAmount,0)>0 THEN 'Partial' ELSE 'Waiting' END AS FinancialStatus
FROM dbo.Reimbursements r JOIN dbo.vw_AccountBalances b ON b.AccountId=r.AccountId
OUTER APPLY(SELECT SUM(CASE WHEN e.Amount>0 THEN e.Amount ELSE 0 END) AS ExpectedAmount,
 SUM(CASE WHEN tt.TransactionTypeCode='ReimbursementReceived' THEN -e.Amount ELSE 0 END) AS ReceivedAmount
 FROM dbo.vw_PostedEntries e JOIN dbo.TransactionTypes tt ON tt.TransactionTypeId=e.TransactionTypeId WHERE e.AccountId=r.AccountId) x;
GO
CREATE VIEW dbo.vw_Loans AS
SELECT l.*,b.CurrencyId,b.DisplayBalance AS OutstandingPrincipal
FROM dbo.Loans l JOIN dbo.vw_AccountBalances b ON b.AccountId=l.AccountId;
GO
CREATE VIEW dbo.vw_BudgetPerformance AS
SELECT b.UserId,b.BudgetId,b.BudgetPeriod,b.CurrencyId,i.CategoryId,i.BudgetAmount,
 CASE WHEN b.CurrencyId=u.DefaultCurrencyId THEN COALESCE(x.ActualAmount,0) END AS ActualAmount,
 CASE WHEN b.CurrencyId=u.DefaultCurrencyId THEN i.BudgetAmount-COALESCE(x.ActualAmount,0) END AS RemainingAmount,
 CASE WHEN b.CurrencyId=u.DefaultCurrencyId THEN CONVERT(DECIMAL(19,4),100.0*COALESCE(x.ActualAmount,0)/NULLIF(i.BudgetAmount,0)) END AS ExecutionPercent
FROM dbo.Budgets b JOIN dbo.BudgetItems i ON i.BudgetId=b.BudgetId JOIN dbo.Users u ON u.UserId=b.UserId
OUTER APPLY(SELECT SUM(e.Consumption) AS ActualAmount FROM dbo.vw_IncomeExpense e
 WHERE e.UserId=b.UserId AND e.BaseCurrencyId=b.CurrencyId AND e.TransactionDate>=b.BudgetPeriod
 AND e.TransactionDate<DATEADD(MONTH,1,b.BudgetPeriod)
 AND (e.CategoryId=i.CategoryId OR e.RootCategoryId=i.CategoryId)) x WHERE b.IsDeleted=0;
GO
CREATE VIEW dbo.vw_MonthlyCashFlow AS
SELECT e.UserId,e.BaseCurrencyId,DATEFROMPARTS(YEAR(e.TransactionDate),MONTH(e.TransactionDate),1) AS MonthStart,
 SUM(e.BaseCurrencyAmount) AS NetCashFlow
FROM dbo.vw_PostedEntries e JOIN dbo.Accounts a ON a.AccountId=e.AccountId JOIN dbo.AccountTypes at ON at.AccountTypeId=a.AccountTypeId
JOIN dbo.TransactionTypes tt ON tt.TransactionTypeId=e.TransactionTypeId
WHERE at.IsLiquid=1 AND a.IncludeInStatistics=1 AND tt.TransactionTypeCode<>'OpeningBalance'
GROUP BY e.UserId,e.BaseCurrencyId,DATEFROMPARTS(YEAR(e.TransactionDate),MONTH(e.TransactionDate),1);
GO
CREATE VIEW dbo.vw_TransactionDetails AS
SELECT e.UserId,e.TransactionId,e.EntryId,e.TransactionDate,tt.TransactionTypeName,a.AccountName,
 COALESCE(p.CategoryName,c.CategoryName) AS PrimaryCategory,
 CASE WHEN c.ParentCategoryId IS NOT NULL THEN c.CategoryName END AS SecondaryCategory,
 e.EntryKind,e.Amount,e.CurrencyId,e.ExchangeRate,e.BaseCurrencyAmount,e.OriginalEntryId,
 m.MerchantName,cp.CounterpartyName,t.ProjectId,t.Description,t.Notes,g.TagNames
FROM dbo.vw_PostedEntries e JOIN dbo.Transactions t ON t.TransactionId=e.TransactionId
JOIN dbo.TransactionTypes tt ON tt.TransactionTypeId=t.TransactionTypeId
LEFT JOIN dbo.Accounts a ON a.AccountId=e.AccountId LEFT JOIN dbo.Categories c ON c.CategoryId=e.CategoryId
LEFT JOIN dbo.Categories p ON p.CategoryId=c.ParentCategoryId LEFT JOIN dbo.Merchants m ON m.MerchantId=t.MerchantId
LEFT JOIN dbo.Counterparties cp ON cp.CounterpartyId=t.CounterpartyId
OUTER APPLY(SELECT STRING_AGG(CONVERT(NVARCHAR(MAX),tg.TagName),N'、') AS TagNames
 FROM dbo.TransactionTags x JOIN dbo.Tags tg ON tg.TagId=x.TagId WHERE x.TransactionId=t.TransactionId) g;
GO
