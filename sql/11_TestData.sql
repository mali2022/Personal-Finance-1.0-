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
-- MODULE 11_TestData
-- 固定日期保证可复现；示例期初现金1000、银行卡2000、支付宝500，不作为收入。
DECLARE @U BIGINT=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo'),@C BIGINT=(SELECT CurrencyId FROM dbo.Currencies WHERE CurrencyCode='CNY');
DECLARE @Cash BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'现金'),
@Bank BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'招商银行储蓄卡'),
@Ali BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'支付宝'),
@Card BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'信用卡'),
@Loan BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'张三借款应收'),
@Reim BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE UserId=@U AND AccountName=N'公司报销应收'),
@LoanId BIGINT=(SELECT LoanId FROM dbo.Loans WHERE UserId=@U AND Direction='Given'),
@Id BIGINT,@Original BIGINT,@Cat BIGINT,@E dbo.EntryInput;
INSERT @E VALUES(1,'Account',@Cash,NULL,@C,1000,1,NULL,NULL),(2,'Equity',NULL,NULL,@C,-1000,1,NULL,NULL);
EXEC dbo.usp_PostTransaction @U,'OpeningBalance','2026-01-01',@E,@Id OUTPUT;
DELETE @E;
INSERT @E VALUES(1,'Account',@Bank,NULL,@C,2000,1,NULL,NULL),(2,'Equity',NULL,NULL,@C,-2000,1,NULL,NULL);
EXEC dbo.usp_PostTransaction @U,'OpeningBalance','2026-01-01',@E,@Id OUTPUT;
DELETE @E;
INSERT @E VALUES(1,'Account',@Ali,NULL,@C,500,1,NULL,NULL),(2,'Equity',NULL,NULL,@C,-500,1,NULL,NULL);
EXEC dbo.usp_PostTransaction @U,'OpeningBalance','2026-01-01',@E,@Id OUTPUT;
SELECT @Cat=CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='Lunch';
EXEC dbo.usp_AddExpense @U,@Ali,@Cat,25,'2026-10-07T12:00:00',@Id OUTPUT,N'午餐';
SELECT @Cat=CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='Salary';
EXEC dbo.usp_AddIncome @U,@Bank,@Cat,10000,'2026-10-01',@Id OUTPUT,N'工资';
EXEC dbo.usp_AddTransfer @U,@Bank,@Ali,500,500,'2026-10-02',@Id OUTPUT;
SELECT @Cat=CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='GeneralShopping';
EXEC dbo.usp_AddExpense @U,@Card,@Cat,300,'2026-10-03',@Id OUTPUT,N'信用卡购物';
EXEC dbo.usp_AddCreditCardPayment @U,@Bank,@Card,300,'2026-10-04',@Id OUTPUT;
EXEC dbo.usp_AddLoanGiven @U,@LoanId,@Bank,1000,'2026-10-04',@Id OUTPUT;
EXEC dbo.usp_AddLoanRepayment @U,@LoanId,@Bank,500,'2026-10-05',@Id OUTPUT;
DELETE @E;
INSERT @E VALUES(1,'Account',@Ali,NULL,@C,-200,1,NULL,NULL);
INSERT @E SELECT x.LineNumber,'Expense',NULL,c.CategoryId,@C,x.Amount,1,NULL,NULL FROM
(VALUES(2,'FoodGoods',CONVERT(DECIMAL(19,4),120)),(3,'DailyGoods',50),(4,'PetGoods',30)) x(LineNumber,Code,Amount)
JOIN dbo.Categories c ON c.UserId=@U AND c.CategoryCode=x.Code;
DECLARE @M BIGINT=(SELECT MerchantId FROM dbo.Merchants WHERE UserId=@U AND MerchantName=N'示例超市');
EXEC dbo.usp_PostTransaction @U,'Expense','2026-10-05',@E,@Id OUTPUT,N'超市拆分',@M;
EXEC dbo.usp_AddExpense @U,@Ali,@Cat,100,'2026-10-05',@Id OUTPUT,N'可部分退款购物';
SELECT @Original=EntryId FROM dbo.TransactionEntries WHERE TransactionId=@Id AND EntryKind='Expense';
EXEC dbo.usp_AddRefund @U,@Original,@Ali,30,'2026-10-06',@Id OUTPUT;
EXEC dbo.usp_AddTransfer @U,@Bank,@Reim,500,500,'2026-10-05',@Id OUTPUT,1,1,N'公司费用垫付','ReimbursementAdvance';
EXEC dbo.usp_AddTransfer @U,@Reim,@Bank,500,500,'2026-10-06',@Id OUTPUT,1,1,N'公司报销','ReimbursementReceived';
SELECT @Cat=CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='CashLoss';
DELETE @E;
INSERT @E VALUES(1,'Account',@Cash,NULL,@C,-200,1,NULL,NULL),(2,'Expense',NULL,@Cat,@C,200,1,NULL,NULL);
EXEC dbo.usp_PostTransaction @U,'AssetLoss','2026-10-06',@E,@Id OUTPUT,N'现金遗失';
SELECT @Cat=CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='Unknown';
EXEC dbo.usp_AddExpense @U,@Bank,@Cat,20,'2026-10-07',@Id OUTPUT,N'待查不明消费';
-- 正向断言
IF NOT EXISTS(SELECT 1 FROM dbo.vw_MonthlyIncomeExpense WHERE UserId=@U AND MonthStart='2026-10-01' AND Income=10000 AND Expense=815 AND Consumption=615 AND Surplus=9185)
THROW 51200,N'月收支断言失败。',1;
IF EXISTS(SELECT 1 FROM dbo.vw_AccountBalances WHERE UserId=@U AND
((AccountId=@Cash AND SignedBalance<>800) OR (AccountId=@Bank AND SignedBalance<>10680) OR
 (AccountId=@Ali AND SignedBalance<>705) OR (AccountId=@Card AND SignedBalance<>0) OR
 (AccountId=@Loan AND SignedBalance<>500) OR (AccountId=@Reim AND SignedBalance<>0)))
THROW 51201,N'账户余额断言失败。',1;
IF NOT EXISTS(SELECT 1 FROM dbo.vw_NetWorth WHERE UserId=@U AND TotalAssets=12685 AND TotalLiabilities=0 AND NetWorth=12685)
THROW 51202,N'净资产断言失败。',1;
IF NOT EXISTS(SELECT 1 FROM dbo.vw_MonthlyCashFlow WHERE UserId=@U AND MonthStart='2026-10-01' AND NetCashFlow=8685)
THROW 51203,N'现金流断言失败。',1;
IF EXISTS(SELECT TransactionId FROM dbo.vw_PostedEntries GROUP BY TransactionId HAVING SUM(BaseCurrencyAmount)<>0)
THROW 51204,N'分录平衡断言失败。',1;
-- 负向断言：超额退款与超额本金归还必须失败且不得产生半笔交易。
BEGIN TRY
 EXEC dbo.usp_AddRefund @U,@Original,@Ali,71,'2026-10-07',@Id OUTPUT;
 THROW 51205,N'超额退款竟然成功。',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>51025 THROW; END CATCH;
BEGIN TRY
 EXEC dbo.usp_AddLoanRepayment @U,@LoanId,@Bank,501,'2026-10-07',@Id OUTPUT;
 THROW 51206,N'超额还款竟然成功。',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>51026 THROW; END CATCH;
SELECT N'基准断言通过' AS TestResult;
GO
