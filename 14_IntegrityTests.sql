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
-- 所有验证数据回滚，仅在安装完成的测试库执行。
DECLARE @U BIGINT=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo'),
@C BIGINT=(SELECT CurrencyId FROM dbo.Currencies WHERE CurrencyCode='CNY'),
@A BIGINT=(SELECT AccountId FROM dbo.Accounts WHERE AccountName=N'支付宝' AND UserId=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo')),
@Cat BIGINT=(SELECT CategoryId FROM dbo.Categories WHERE CategoryCode='Lunch' AND UserId=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo')),
@Id BIGINT,@E dbo.EntryInput;
-- 不平衡不得入账。
INSERT @E VALUES(1,'Account',@A,NULL,@C,-10,1,NULL,NULL),(2,'Expense',NULL,@Cat,@C,9,1,NULL,NULL);
BEGIN TRY
 EXEC dbo.usp_PostTransaction @U,'Expense','2026-10-12',@E,@Id OUTPUT;
 THROW 51400,N'不平衡交易竟然成功。',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>51002 THROW; END CATCH;
DELETE @E;
-- 同用户分类外键之外，入口也禁止跨用户分类引用。
BEGIN TRY
 BEGIN TRANSACTION;
 INSERT dbo.Users(UserName,DisplayName,DefaultCurrencyId) VALUES(N'integrity-temporary',N'临时跨用户测试',@C);
 DECLARE @Other BIGINT=SCOPE_IDENTITY(),@OtherCategory BIGINT;
 INSERT dbo.Categories(UserId,CategoryName,CategoryType,CategoryCode,CategoryLevel) VALUES(@Other,N'临时费用','Expense','Test',1);
 SET @OtherCategory=SCOPE_IDENTITY();
 INSERT @E VALUES(1,'Account',@A,NULL,@C,-10,1,NULL,NULL),(2,'Expense',NULL,@OtherCategory,@C,10,1,NULL,NULL);
 EXEC dbo.usp_PostTransaction @U,'Expense','2026-10-12',@E,@Id OUTPUT;
 THROW 51401,N'跨用户分类竟然成功。',1;
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; IF ERROR_NUMBER()<>51007 THROW; END CATCH;
DELETE @E;
-- 停用账户的历史余额仍存在，但新录入失败。
BEGIN TRY
 BEGIN TRANSACTION;
 UPDATE dbo.Accounts SET IsActive=0,UpdatedAt=SYSUTCDATETIME() WHERE AccountId=@A;
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_AccountBalances WHERE AccountId=@A AND SignedBalance=705)
 THROW 51402,N'停用账户的历史余额消失。',1;
 EXEC dbo.usp_AddExpense @U,@A,@Cat,1,'2026-10-12',@Id OUTPUT;
 THROW 51403,N'停用账户竟然能消费。',1;
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; IF ERROR_NUMBER()<>51005 THROW; END CATCH;
-- 停用历史分类仍允许原消费退款；测试后回滚。
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @Shopping BIGINT=(SELECT CategoryId FROM dbo.Categories WHERE UserId=@U AND CategoryCode='GeneralShopping'),@Original BIGINT;
 SELECT TOP(1) @Original=EntryId FROM dbo.vw_PostedEntries WHERE UserId=@U AND CategoryId=@Shopping AND Amount=100;
 UPDATE dbo.Categories SET IsActive=0,UpdatedAt=SYSUTCDATETIME() WHERE CategoryId=@Shopping;
 EXEC dbo.usp_AddRefund @U,@Original,@A,1,'2026-10-12',@Id OUTPUT;
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_IncomeExpense WHERE TransactionId=@Id AND Expense=-1)
 THROW 51404,N'停用历史分类的退款失败。',1;
 ROLLBACK;
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH;
-- 第三层分类由CHECK/复合外键拒绝，无需触发器。
BEGIN TRY
 BEGIN TRANSACTION;
 INSERT dbo.Categories(UserId,ParentCategoryId,CategoryName,CategoryType,CategoryCode,CategoryLevel,ParentLevel)
 VALUES(@U,@Cat,N'非法第三层','Expense','InvalidThirdLevel',3,2);
 THROW 51405,N'第三层分类竟然成功。',1;
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; IF ERROR_NUMBER()<>547 THROW; END CATCH;
-- 已核验期间不得插入回溯交易。
BEGIN TRY
 BEGIN TRANSACTION;
 EXEC dbo.usp_ReconcileAccount @U,@A,'2026-10-12T23:59:59',705;
 EXEC dbo.usp_AddExpense @U,@A,@Cat,1,'2026-10-12',@Id OUTPUT;
 THROW 51406,N'已核验期间竟然能追加分录。',1;
END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; IF ERROR_NUMBER()<>51028 THROW; END CATCH;
SELECT N'完整性负向测试通过' AS TestResult;
GO
