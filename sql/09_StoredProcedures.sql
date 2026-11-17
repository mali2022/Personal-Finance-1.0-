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
-- MODULE 09_StoredProcedures
CREATE TYPE dbo.EntryInput AS TABLE (
 LineNumber INT PRIMARY KEY, EntryKind VARCHAR(10) NOT NULL, AccountId BIGINT NULL, CategoryId BIGINT NULL,
 CurrencyId BIGINT NOT NULL, Amount DECIMAL(19,4) NOT NULL, ExchangeRate DECIMAL(19,8) NOT NULL,
 OriginalEntryId BIGINT NULL, Description NVARCHAR(500) NULL
);
GO
-- 唯一过账入口。按用户串行化余额/退款额度检查，适合个人规模，避免并发超额退款/还款。
CREATE PROCEDURE dbo.usp_PostTransaction
 @UserId BIGINT,@TypeCode VARCHAR(40),@TransactionDate DATETIME2(3),@Entries dbo.EntryInput READONLY,
 @TransactionId BIGINT OUTPUT,@Description NVARCHAR(500)=NULL,@MerchantId BIGINT=NULL,@CounterpartyId BIGINT=NULL,
 @ProjectId BIGINT=NULL,@SourceCode VARCHAR(40)='Manual',@SourceAccountId BIGINT=NULL,
 @ExternalReference NVARCHAR(200)=NULL,@ImportHash BINARY(32)=NULL,@Notes NVARCHAR(2000)=NULL
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON; SET ARITHABORT ON; SET ANSI_WARNINGS ON; SET NUMERIC_ROUNDABORT OFF;
 BEGIN TRY
  BEGIN TRANSACTION;
  DECLARE @LockResult INT,@Resource NVARCHAR(255)=CONCAT(N'FinanceUser:',@UserId),@Base BIGINT,@Type BIGINT,@Source BIGINT;
  EXEC @LockResult=sys.sp_getapplock @Resource=@Resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
  IF @LockResult<0 THROW 51000,N'无法获得记账锁。',1;
  SELECT @Base=DefaultCurrencyId FROM dbo.Users WHERE UserId=@UserId AND IsDeleted=0;
  SELECT @Type=TransactionTypeId FROM dbo.TransactionTypes WHERE TransactionTypeCode=@TypeCode;
  SELECT @Source=SourceId FROM dbo.Sources WHERE SourceCode=@SourceCode;
  IF @Base IS NULL OR @Type IS NULL OR @Source IS NULL THROW 51001,N'用户、类型或来源无效。',1;
  IF @TypeCode NOT IN ('Expense','Income','Transfer','Refund','CreditCardPayment','LoanGiven','LoanReceived',
     'LoanRepaymentReceived','LoanRepaymentPaid','ReimbursementAdvance','ReimbursementReceived','AssetLoss','Adjustment','OpeningBalance','Exchange')
     THROW 51030,N'该交易类型没有已实现的过账规则。',1;
  IF (SELECT COUNT(*) FROM @Entries)<2 OR
     (SELECT SUM(CONVERT(DECIMAL(38,4),ROUND(Amount*ExchangeRate,4))) FROM @Entries)<>0
     THROW 51002,N'至少两条分录；本位币金额必须精确平衡。',1;
  IF EXISTS(SELECT 1 FROM @Entries WHERE CurrencyId=@Base AND ExchangeRate<>1)
     THROW 51003,N'本位币汇率必须等于 1。',1;
  IF EXISTS(SELECT 1 FROM @Entries e LEFT JOIN dbo.Currencies c ON c.CurrencyId=e.CurrencyId WHERE c.CurrencyId IS NULL OR (@TypeCode<>'Refund' AND c.IsActive=0))
     THROW 51004,N'币种无效或停用。',1;
  IF EXISTS(SELECT 1 FROM @Entries e LEFT JOIN dbo.Accounts a ON a.AccountId=e.AccountId AND a.UserId=@UserId
     WHERE e.EntryKind='Account' AND (a.AccountId IS NULL OR a.IsActive=0 OR a.IsDeleted=1 OR a.CurrencyId<>e.CurrencyId OR CONVERT(DATE,@TransactionDate)<a.OpeningDate))
     THROW 51005,N'账户无效、停用、币种不符或早于开户日期。',1;
  IF EXISTS(SELECT 1 FROM @Entries e JOIN dbo.Currencies c ON c.CurrencyId=e.CurrencyId
     WHERE e.Amount<>ROUND(e.Amount,c.DecimalPlaces)) THROW 51006,N'金额超过币种的小数精度。',1;
  IF EXISTS(SELECT 1 FROM @Entries e LEFT JOIN dbo.Categories c ON c.CategoryId=e.CategoryId AND c.UserId=@UserId
     LEFT JOIN dbo.Categories p ON p.CategoryId=c.ParentCategoryId
     WHERE e.EntryKind IN ('Income','Expense') AND
     (c.CategoryId IS NULL OR c.CategoryType<>e.EntryKind OR
      (@TypeCode<>'Refund' AND (c.IsDeleted=1 OR c.IsActive=0 OR
      (p.CategoryId IS NOT NULL AND (p.IsActive=0 OR p.IsDeleted=1))))))
     THROW 51007,N'分类无效、类型不匹配或父分类停用。',1;
  IF @MerchantId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.Merchants WHERE MerchantId=@MerchantId AND UserId=@UserId AND (@TypeCode='Refund' OR (IsActive=1 AND IsDeleted=0)))
     THROW 51008,N'商户无效。',1;
  IF @CounterpartyId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.Counterparties WHERE CounterpartyId=@CounterpartyId AND UserId=@UserId AND (@TypeCode='Refund' OR (IsActive=1 AND IsDeleted=0)))
     THROW 51009,N'交易对象无效。',1;
  IF @ProjectId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.Projects WHERE ProjectId=@ProjectId AND UserId=@UserId AND (@TypeCode='Refund' OR IsDeleted=0))
     THROW 51010,N'项目无效。',1;
  IF NOT EXISTS(SELECT 1 FROM @Entries WHERE EntryKind='Account') THROW 51011,N'交易必须包含账户分录。',1;
  -- 语义约束防止调用者用类型名称掩盖财务实质。
  IF @TypeCode IN ('Expense','AssetLoss') AND
     (NOT EXISTS(SELECT 1 FROM @Entries WHERE EntryKind='Expense') OR EXISTS(SELECT 1 FROM @Entries WHERE EntryKind NOT IN ('Account','Expense') OR (EntryKind='Expense' AND Amount<=0)))
     THROW 51012,N'消费/损失必须含正费用分录，且只能包含账户和费用。',1;
  IF @TypeCode='Income' AND
     (NOT EXISTS(SELECT 1 FROM @Entries WHERE EntryKind='Income') OR EXISTS(SELECT 1 FROM @Entries WHERE EntryKind NOT IN ('Account','Income') OR (EntryKind='Income' AND Amount>=0)))
     THROW 51013,N'收入必须含负收入分录。',1;
  IF @TypeCode IN ('Transfer','CreditCardPayment','LoanGiven','LoanReceived','LoanRepaymentReceived','LoanRepaymentPaid','ReimbursementAdvance','ReimbursementReceived') AND
     ((SELECT COUNT(*) FROM @Entries)<>2 OR EXISTS(SELECT 1 FROM @Entries WHERE EntryKind<>'Account') OR
      (SELECT COUNT(DISTINCT AccountId) FROM @Entries)<>2 OR NOT EXISTS(SELECT 1 FROM @Entries WHERE Amount>0) OR NOT EXISTS(SELECT 1 FROM @Entries WHERE Amount<0))
     THROW 51014,N'内部移动必须为两个不同账户的一正一负分录。手续费应另记费用交易。',1;
  IF @TypeCode='CreditCardPayment' AND (NOT EXISTS(SELECT 1 FROM @Entries e JOIN dbo.Accounts a ON a.AccountId=e.AccountId
     JOIN dbo.AccountTypes at ON at.AccountTypeId=a.AccountTypeId WHERE at.IsCreditCard=1 AND e.Amount>0) OR
     NOT EXISTS(SELECT 1 FROM @Entries e JOIN dbo.Accounts a ON a.AccountId=e.AccountId
     JOIN dbo.AccountTypes at ON at.AccountTypeId=a.AccountTypeId WHERE at.BalanceNature='Asset' AND at.IsLiquid=1 AND e.Amount<0))
     THROW 51015,N'信用卡还款必须增加信用卡的有符号余额。',1;
  IF @TypeCode IN ('LoanGiven','LoanReceived','LoanRepaymentReceived','LoanRepaymentPaid') AND NOT EXISTS(
     SELECT 1 FROM @Entries e JOIN dbo.Loans l ON l.AccountId=e.AccountId AND l.UserId=@UserId AND l.IsDeleted=0
     JOIN dbo.Accounts a ON a.AccountId=l.AccountId JOIN dbo.AccountTypes at ON at.AccountTypeId=a.AccountTypeId
     WHERE (l.Direction='Given' AND at.AccountTypeCode='Receivable' AND
           ((@TypeCode='LoanGiven' AND e.Amount>0) OR (@TypeCode='LoanRepaymentReceived' AND e.Amount<0)))
        OR (l.Direction='Received' AND at.AccountTypeCode IN ('Loan','Payable') AND
           ((@TypeCode='LoanReceived' AND e.Amount<0) OR (@TypeCode='LoanRepaymentPaid' AND e.Amount>0))))
     THROW 51016,N'借贷类型与合同账户方向不符。',1;
  IF @TypeCode IN ('ReimbursementAdvance','ReimbursementReceived') AND NOT EXISTS(
     SELECT 1 FROM @Entries e JOIN dbo.Reimbursements r ON r.AccountId=e.AccountId AND r.UserId=@UserId AND r.IsDeleted=0
     JOIN dbo.Accounts a ON a.AccountId=r.AccountId JOIN dbo.AccountTypes at ON at.AccountTypeId=a.AccountTypeId
     WHERE at.AccountTypeCode='Receivable' AND r.WorkflowStatus NOT IN ('Closed','Abandoned') AND
     ((@TypeCode='ReimbursementAdvance' AND e.Amount>0) OR (@TypeCode='ReimbursementReceived' AND e.Amount<0)))
     THROW 51017,N'报销类型与应收账户方向或状态不符。',1;
  IF @TypeCode IN ('LoanGiven','LoanReceived','LoanRepaymentReceived','LoanRepaymentPaid','ReimbursementAdvance','ReimbursementReceived')
     AND NOT EXISTS(SELECT 1 FROM @Entries e JOIN dbo.Accounts a ON a.AccountId=e.AccountId
     JOIN dbo.AccountTypes at ON at.AccountTypeId=a.AccountTypeId WHERE at.BalanceNature='Asset' AND at.IsLiquid=1 AND
     ((@TypeCode IN ('LoanGiven','LoanRepaymentPaid','ReimbursementAdvance') AND e.Amount<0) OR
      (@TypeCode IN ('LoanReceived','LoanRepaymentReceived','ReimbursementReceived') AND e.Amount>0)))
     THROW 51031,N'借贷和报销结算的另一端必须为流动资产账户。',1;
  IF EXISTS(SELECT 1 FROM @Entries e JOIN dbo.Loans l ON l.AccountId=e.AccountId
     JOIN dbo.Reimbursements r ON r.AccountId=e.AccountId)
     THROW 51033,N'专用账户不能同时登记为贷款和报销账户。',1;
  DECLARE @BusinessCounterparty BIGINT;
  IF @TypeCode IN ('LoanGiven','LoanReceived','LoanRepaymentReceived','LoanRepaymentPaid')
     SELECT @BusinessCounterparty=l.CounterpartyId FROM @Entries e JOIN dbo.Loans l ON l.AccountId=e.AccountId AND l.UserId=@UserId;
  IF @TypeCode IN ('ReimbursementAdvance','ReimbursementReceived')
     SELECT @BusinessCounterparty=r.CounterpartyId FROM @Entries e JOIN dbo.Reimbursements r ON r.AccountId=e.AccountId AND r.UserId=@UserId;
  IF @BusinessCounterparty IS NOT NULL AND @CounterpartyId IS NOT NULL AND @BusinessCounterparty<>@CounterpartyId
     THROW 51032,N'交易对象与合同或报销对象不符。',1;
  SET @CounterpartyId=COALESCE(@BusinessCounterparty,@CounterpartyId);
  IF @TypeCode='OpeningBalance' AND
     ((SELECT COUNT(*) FROM @Entries)<>2 OR (SELECT COUNT(*) FROM @Entries WHERE EntryKind='Account')<>1 OR
      (SELECT COUNT(*) FROM @Entries WHERE EntryKind='Equity')<>1)
     THROW 51018,N'期初必须为一账户、一权益分录。',1;
  IF @TypeCode NOT IN ('OpeningBalance','Adjustment') AND EXISTS(SELECT 1 FROM @Entries WHERE EntryKind='Equity')
     THROW 51019,N'权益分录仅允许期初和明确的调整。',1;
  IF @TypeCode='Exchange' AND
     ((SELECT COUNT(DISTINCT AccountId) FROM @Entries WHERE EntryKind='Account')<2 OR
      (SELECT COUNT(DISTINCT CurrencyId) FROM @Entries WHERE EntryKind='Account')<2 OR
      EXISTS(SELECT 1 FROM @Entries WHERE EntryKind NOT IN ('Account','Income','Expense') OR
      (EntryKind='Income' AND Amount>=0) OR (EntryKind='Expense' AND Amount<=0)))
     THROW 51029,N'兑换必须涉及不同币种账户，差额使用费用或收益分类。',1;
  IF @TypeCode='OpeningBalance' AND EXISTS(SELECT 1 FROM @Entries e JOIN dbo.TransactionEntries old ON old.AccountId=e.AccountId
     JOIN dbo.Transactions t ON t.TransactionId=old.TransactionId WHERE t.Status='Confirmed')
     THROW 51020,N'已有交易的账户不能再录入期初。',1;
  IF @TypeCode='OpeningBalance' AND EXISTS(SELECT 1 FROM @Entries e JOIN dbo.Accounts a ON a.AccountId=e.AccountId WHERE CONVERT(DATE,@TransactionDate)<>a.OpeningDate)
     THROW 51021,N'期初日期必须等于开户日期。',1;
  IF @TypeCode='Refund' AND
     (NOT EXISTS(SELECT 1 FROM @Entries WHERE EntryKind='Expense') OR EXISTS(SELECT 1 FROM @Entries WHERE EntryKind NOT IN ('Account','Expense') OR
      (EntryKind='Expense' AND (Amount>=0 OR OriginalEntryId IS NULL)) OR (EntryKind='Account' AND Amount<=0)))
     THROW 51022,N'退款必须包含正账户、负费用及原费用分录引用。',1;
  IF @TypeCode<>'Refund' AND EXISTS(SELECT 1 FROM @Entries WHERE OriginalEntryId IS NOT NULL)
     THROW 51023,N'仅退款允许原费用分录引用。',1;
  IF EXISTS(SELECT 1 FROM @Entries e LEFT JOIN dbo.vw_PostedEntries o ON o.EntryId=e.OriginalEntryId AND o.UserId=@UserId
     WHERE e.OriginalEntryId IS NOT NULL AND (o.EntryId IS NULL OR o.EntryKind<>'Expense' OR o.Amount<=0 OR
     o.CategoryId<>e.CategoryId OR o.CurrencyId<>e.CurrencyId OR o.ExchangeRate<>e.ExchangeRate OR o.TransactionDate>@TransactionDate))
     THROW 51024,N'退款必须引用已确认的原费用，同分类、同币种、同历史汇率且不早于原交易。',1;
  IF EXISTS(SELECT 1 FROM @Entries e JOIN dbo.TransactionEntries o ON o.EntryId=e.OriginalEntryId
     OUTER APPLY(SELECT SUM(-r.Amount) AS Refunded FROM dbo.vw_PostedEntries r WHERE r.OriginalEntryId=o.EntryId) x
     WHERE e.OriginalEntryId IS NOT NULL GROUP BY o.EntryId,o.Amount,x.Refunded
     HAVING SUM(-e.Amount)+COALESCE(x.Refunded,0)>o.Amount)
     THROW 51025,N'累计退款超过原消费。',1;
  -- 合同应收不得为负，合同应付不得为正；阻止本金超额归还。
  IF EXISTS(SELECT 1 FROM @Entries e JOIN dbo.vw_AccountBalances b ON b.AccountId=e.AccountId
     LEFT JOIN dbo.Loans l ON l.AccountId=e.AccountId LEFT JOIN dbo.Reimbursements r ON r.AccountId=e.AccountId
     WHERE l.LoanId IS NOT NULL OR r.ReimbursementId IS NOT NULL
     GROUP BY b.AccountId,b.BalanceNature,b.SignedBalance
     HAVING (b.BalanceNature='Asset' AND b.SignedBalance+SUM(e.Amount)<0) OR
            (b.BalanceNature='Liability' AND b.SignedBalance+SUM(e.Amount)>0))
     THROW 51026,N'结算超过合同或报销余额。',1;
  IF EXISTS(SELECT 1 FROM @Entries e JOIN dbo.AccountReconciliations r ON r.AccountId=e.AccountId
     WHERE r.Status='Matched' AND @TransactionDate<=r.StatementDate)
     THROW 51028,N'不能向已匹配的对账期间追加账户分录；应先由管理员重新打开对账。',1;
  INSERT dbo.Transactions(UserId,TransactionTypeId,TransactionDate,BaseCurrencyId,Description,MerchantId,CounterpartyId,ProjectId,SourceId,SourceAccountId,ExternalReference,ImportHash,Notes)
  VALUES(@UserId,@Type,@TransactionDate,@Base,@Description,@MerchantId,@CounterpartyId,@ProjectId,@Source,@SourceAccountId,@ExternalReference,@ImportHash,@Notes);
  SET @TransactionId=CONVERT(BIGINT,SCOPE_IDENTITY());
  INSERT dbo.TransactionEntries(UserId,TransactionId,LineNumber,EntryKind,AccountId,CategoryId,CurrencyId,Amount,ExchangeRate,OriginalEntryId,Description)
  SELECT @UserId,@TransactionId,LineNumber,EntryKind,AccountId,CategoryId,CurrencyId,Amount,ExchangeRate,OriginalEntryId,Description FROM @Entries;
  IF EXISTS(SELECT 1 FROM dbo.TransactionEntries WHERE TransactionId=@TransactionId AND BaseCurrencyAmount=0)
     THROW 51027,N'本位币金额四舍五入后不能为零。',1;
  UPDATE dbo.Transactions SET Status='Confirmed',UpdatedAt=SYSUTCDATETIME() WHERE TransactionId=@TransactionId;
  IF @TypeCode='OpeningBalance'
     UPDATE a SET OpeningBalance=e.Amount,UpdatedAt=SYSUTCDATETIME() FROM dbo.Accounts a JOIN @Entries e ON e.AccountId=a.AccountId;
  COMMIT TRANSACTION;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
 END CATCH
END;
GO
CREATE PROCEDURE dbo.usp_AddExpense
 @UserId BIGINT,@AccountId BIGINT,@CategoryId BIGINT,@Amount DECIMAL(19,4),@TransactionDate DATETIME2(3),
 @TransactionId BIGINT OUTPUT,@Description NVARCHAR(500)=NULL,@ExchangeRate DECIMAL(19,8)=NULL,@MerchantId BIGINT=NULL,@ProjectId BIGINT=NULL
AS
BEGIN
 SET NOCOUNT ON;
 IF @Amount<=0 THROW 51100,N'金额必须为正。',1;
 DECLARE @C BIGINT,@E dbo.EntryInput;
 SELECT @C=CurrencyId FROM dbo.Accounts WHERE AccountId=@AccountId AND UserId=@UserId;
 IF @ExchangeRate IS NULL SELECT @ExchangeRate=1 FROM dbo.Users WHERE UserId=@UserId AND DefaultCurrencyId=@C;
 IF @ExchangeRate IS NULL THROW 51116,N'外币消费必须显式提供汇率。',1;
 INSERT @E VALUES(1,'Account',@AccountId,NULL,@C,-@Amount,@ExchangeRate,NULL,NULL),(2,'Expense',NULL,@CategoryId,@C,@Amount,@ExchangeRate,NULL,NULL);
 EXEC dbo.usp_PostTransaction @UserId,'Expense',@TransactionDate,@E,@TransactionId OUTPUT,@Description,@MerchantId,NULL,@ProjectId;
END;
GO
CREATE PROCEDURE dbo.usp_AddIncome
 @UserId BIGINT,@AccountId BIGINT,@CategoryId BIGINT,@Amount DECIMAL(19,4),@TransactionDate DATETIME2(3),
 @TransactionId BIGINT OUTPUT,@Description NVARCHAR(500)=NULL,@ExchangeRate DECIMAL(19,8)=NULL
AS
BEGIN
 SET NOCOUNT ON;
 IF @Amount<=0 THROW 51101,N'金额必须为正。',1;
 DECLARE @C BIGINT,@E dbo.EntryInput;
 SELECT @C=CurrencyId FROM dbo.Accounts WHERE AccountId=@AccountId AND UserId=@UserId;
 IF @ExchangeRate IS NULL SELECT @ExchangeRate=1 FROM dbo.Users WHERE UserId=@UserId AND DefaultCurrencyId=@C;
 IF @ExchangeRate IS NULL THROW 51117,N'外币收入必须显式提供汇率。',1;
 INSERT @E VALUES(1,'Account',@AccountId,NULL,@C,@Amount,@ExchangeRate,NULL,NULL),(2,'Income',NULL,@CategoryId,@C,-@Amount,@ExchangeRate,NULL,NULL);
 EXEC dbo.usp_PostTransaction @UserId,'Income',@TransactionDate,@E,@TransactionId OUTPUT,@Description;
END;
GO
CREATE PROCEDURE dbo.usp_AddTransfer
 @UserId BIGINT,@FromAccountId BIGINT,@ToAccountId BIGINT,@FromAmount DECIMAL(19,4),@ToAmount DECIMAL(19,4),
 @TransactionDate DATETIME2(3),@TransactionId BIGINT OUTPUT,@FromRate DECIMAL(19,8)=NULL,@ToRate DECIMAL(19,8)=NULL,
 @Description NVARCHAR(500)=NULL,@TypeCode VARCHAR(40)='Transfer'
AS
BEGIN
 SET NOCOUNT ON;
 IF @FromAmount<=0 OR @ToAmount<=0 THROW 51102,N'金额必须为正。',1;
 IF @TypeCode NOT IN ('Transfer','CreditCardPayment','LoanGiven','LoanReceived','LoanRepaymentReceived','LoanRepaymentPaid','ReimbursementAdvance','ReimbursementReceived')
 THROW 51103,N'无效的内部移动类型。',1;
 DECLARE @F BIGINT,@T BIGINT,@E dbo.EntryInput;
 SELECT @F=CurrencyId FROM dbo.Accounts WHERE UserId=@UserId AND AccountId=@FromAccountId;
 SELECT @T=CurrencyId FROM dbo.Accounts WHERE UserId=@UserId AND AccountId=@ToAccountId;
 IF @FromRate IS NULL SELECT @FromRate=1 FROM dbo.Users WHERE UserId=@UserId AND DefaultCurrencyId=@F;
 IF @ToRate IS NULL SELECT @ToRate=1 FROM dbo.Users WHERE UserId=@UserId AND DefaultCurrencyId=@T;
 IF @FromRate IS NULL OR @ToRate IS NULL THROW 51118,N'外币转账必须显式提供双方汇率。',1;
 INSERT @E VALUES(1,'Account',@FromAccountId,NULL,@F,-@FromAmount,@FromRate,NULL,NULL),(2,'Account',@ToAccountId,NULL,@T,@ToAmount,@ToRate,NULL,NULL);
 EXEC dbo.usp_PostTransaction @UserId,@TypeCode,@TransactionDate,@E,@TransactionId OUTPUT,@Description;
END;
GO
CREATE PROCEDURE dbo.usp_AddCreditCardPayment
 @UserId BIGINT,@BankAccountId BIGINT,@CardAccountId BIGINT,@Amount DECIMAL(19,4),@TransactionDate DATETIME2(3),@TransactionId BIGINT OUTPUT
AS
BEGIN
 IF EXISTS(SELECT 1 FROM dbo.Accounts a JOIN dbo.Users u ON u.UserId=a.UserId
 WHERE a.UserId=@UserId AND a.AccountId IN (@BankAccountId,@CardAccountId) AND a.CurrencyId<>u.DefaultCurrencyId)
 THROW 51119,N'快捷信用卡还款仅支持本位币；外币请调用带显式汇率的转账过程。',1;
 EXEC dbo.usp_AddTransfer @UserId,@BankAccountId,@CardAccountId,@Amount,@Amount,@TransactionDate,@TransactionId OUTPUT,1,1,N'信用卡还款','CreditCardPayment';
END;
GO
CREATE PROCEDURE dbo.usp_AddRefund
 @UserId BIGINT,@OriginalEntryId BIGINT,@ReceiveAccountId BIGINT,@Amount DECIMAL(19,4),
 @TransactionDate DATETIME2(3),@TransactionId BIGINT OUTPUT
AS
BEGIN
 SET NOCOUNT ON;
 IF @Amount<=0 THROW 51104,N'退款金额必须为正。',1;
 DECLARE @C BIGINT,@Cat BIGINT,@Rate DECIMAL(19,8),@M BIGINT,@P BIGINT,@CP BIGINT,@E dbo.EntryInput;
 SELECT @C=CurrencyId,@Cat=CategoryId,@Rate=ExchangeRate,@M=MerchantId,@P=ProjectId,@CP=CounterpartyId FROM dbo.vw_PostedEntries WHERE EntryId=@OriginalEntryId AND UserId=@UserId AND EntryKind='Expense';
 IF @C IS NULL THROW 51105,N'原费用不存在。',1;
 INSERT @E VALUES(1,'Account',@ReceiveAccountId,NULL,@C,@Amount,@Rate,NULL,NULL),(2,'Expense',NULL,@Cat,@C,-@Amount,@Rate,@OriginalEntryId,NULL);
 EXEC dbo.usp_PostTransaction @UserId,'Refund',@TransactionDate,@E,@TransactionId OUTPUT,N'原消费退款',@M,@CP,@P;
END;
GO
CREATE PROCEDURE dbo.usp_AddLoanGiven
 @UserId BIGINT,@LoanId BIGINT,@PayAccountId BIGINT,@Amount DECIMAL(19,4),@TransactionDate DATETIME2(3),@TransactionId BIGINT OUTPUT
AS
BEGIN
 DECLARE @A BIGINT;
 SELECT @A=AccountId FROM dbo.Loans WHERE UserId=@UserId AND LoanId=@LoanId AND Direction='Given' AND IsDeleted=0;
 IF @A IS NULL THROW 51106,N'借出合同不存在。',1;
 IF EXISTS(SELECT 1 FROM dbo.Accounts a JOIN dbo.Users u ON u.UserId=a.UserId
 WHERE a.UserId=@UserId AND a.AccountId IN (@A,@PayAccountId) AND a.CurrencyId<>u.DefaultCurrencyId)
 THROW 51120,N'快捷借出仅支持本位币；外币请使用带显式汇率的转账。',1;
 EXEC dbo.usp_AddTransfer @UserId,@PayAccountId,@A,@Amount,@Amount,@TransactionDate,@TransactionId OUTPUT,1,1,N'借给别人','LoanGiven';
END;
GO
CREATE PROCEDURE dbo.usp_AddLoanRepayment
 @UserId BIGINT,@LoanId BIGINT,@CashAccountId BIGINT,@Amount DECIMAL(19,4),@TransactionDate DATETIME2(3),@TransactionId BIGINT OUTPUT
AS
BEGIN
 DECLARE @A BIGINT,@D VARCHAR(10);
 SELECT @A=AccountId,@D=Direction FROM dbo.Loans WHERE UserId=@UserId AND LoanId=@LoanId AND IsDeleted=0;
 IF @A IS NULL THROW 51107,N'合同不存在。',1;
 IF EXISTS(SELECT 1 FROM dbo.Accounts a JOIN dbo.Users u ON u.UserId=a.UserId
 WHERE a.UserId=@UserId AND a.AccountId IN (@A,@CashAccountId) AND a.CurrencyId<>u.DefaultCurrencyId)
 THROW 51121,N'快捷本金归还仅支持本位币；外币请使用带显式汇率的转账。',1;
 IF @D='Given' EXEC dbo.usp_AddTransfer @UserId,@A,@CashAccountId,@Amount,@Amount,@TransactionDate,@TransactionId OUTPUT,1,1,N'收回本金','LoanRepaymentReceived';
 ELSE EXEC dbo.usp_AddTransfer @UserId,@CashAccountId,@A,@Amount,@Amount,@TransactionDate,@TransactionId OUTPUT,1,1,N'偿还本金','LoanRepaymentPaid';
END;
GO
CREATE PROCEDURE dbo.usp_GetAccountBalance @UserId BIGINT,@AccountId BIGINT,@AsOf DATETIME2(3)=NULL
AS
BEGIN
 SELECT a.AccountId,a.AccountName,a.CurrencyId,COALESCE(SUM(e.Amount),0) AS SignedBalance,
 CASE WHEN at.BalanceNature='Liability' THEN -COALESCE(SUM(e.Amount),0) ELSE COALESCE(SUM(e.Amount),0) END AS DisplayBalance
 FROM dbo.Accounts a JOIN dbo.AccountTypes at ON at.AccountTypeId=a.AccountTypeId
 LEFT JOIN dbo.vw_PostedEntries e ON e.AccountId=a.AccountId AND (@AsOf IS NULL OR e.TransactionDate<=@AsOf)
 WHERE a.UserId=@UserId AND a.AccountId=@AccountId GROUP BY a.AccountId,a.AccountName,a.CurrencyId,at.BalanceNature;
END;
GO
CREATE PROCEDURE dbo.usp_GetMonthlyReport @UserId BIGINT,@Month DATE
AS
BEGIN
 DECLARE @Start DATE=DATEFROMPARTS(YEAR(@Month),MONTH(@Month),1);
 SELECT @Start AS MonthStart,COALESCE(SUM(Income),0) AS Income,COALESCE(SUM(Expense),0) AS Expense,
 COALESCE(SUM(Consumption),0) AS Consumption,COALESCE(SUM(Income-Expense),0) AS Surplus
 FROM dbo.vw_IncomeExpense WHERE UserId=@UserId AND TransactionDate>=@Start AND TransactionDate<DATEADD(MONTH,1,@Start);
 SELECT * FROM dbo.vw_MonthlyCategoryExpense WHERE UserId=@UserId AND MonthStart=@Start;
END;
GO
CREATE PROCEDURE dbo.usp_ReconcileAccount
 @UserId BIGINT,@AccountId BIGINT,@StatementDate DATETIME2(3),@StatementBalance DECIMAL(19,4)
AS
BEGIN
 SET XACT_ABORT ON; SET NOCOUNT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @L INT,@R NVARCHAR(255)=CONCAT(N'FinanceUser:',@UserId),@B DECIMAL(19,4),@Id BIGINT;
 EXEC @L=sys.sp_getapplock @Resource=@R,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
 IF @L<0 THROW 51108,N'无法获得对账锁。',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.Accounts WHERE UserId=@UserId AND AccountId=@AccountId) THROW 51109,N'账户不存在。',1;
 SELECT @B=COALESCE(SUM(Amount),0) FROM dbo.vw_PostedEntries WHERE AccountId=@AccountId AND TransactionDate<=@StatementDate;
 INSERT dbo.AccountReconciliations(UserId,AccountId,StatementDate,StatementBalance,CalculatedBalance,Status)
 VALUES(@UserId,@AccountId,@StatementDate,@StatementBalance,@B,CASE WHEN @B=@StatementBalance THEN 'Matched' ELSE 'Open' END);
 SET @Id=SCOPE_IDENTITY();
 IF @B=@StatementBalance
 INSERT dbo.ReconciledEntries(ReconciliationId,EntryId)
 SELECT @Id,e.EntryId FROM dbo.vw_PostedEntries e WHERE e.AccountId=@AccountId AND e.TransactionDate<=@StatementDate
 AND NOT EXISTS(SELECT 1 FROM dbo.ReconciledEntries r WHERE r.EntryId=e.EntryId);
 COMMIT;
 SELECT * FROM dbo.AccountReconciliations WHERE ReconciliationId=@Id;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH
END;
GO
CREATE PROCEDURE dbo.usp_ReclassifyExpense
 @UserId BIGINT,@EntryId BIGINT,@CategoryId BIGINT,@Reason NVARCHAR(1000)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @L INT,@R NVARCHAR(255)=CONCAT(N'FinanceUser:',@UserId),@Before NVARCHAR(MAX),@After NVARCHAR(MAX);
 EXEC @L=sys.sp_getapplock @Resource=@R,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
 IF @L<0 THROW 51110,N'无法获得分类纠错锁。',1;
 IF @Reason IS NULL OR LEN(LTRIM(RTRIM(@Reason)))=0 THROW 51111,N'必须填写纠错原因。',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_PostedEntries WHERE UserId=@UserId AND EntryId=@EntryId AND EntryKind='Expense' AND Amount>0)
 THROW 51112,N'只能对原始正费用分录重分类。',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.Categories c LEFT JOIN dbo.Categories p ON p.CategoryId=c.ParentCategoryId
 WHERE c.UserId=@UserId AND c.CategoryId=@CategoryId AND c.CategoryType='Expense' AND c.IsActive=1 AND c.IsDeleted=0
 AND (p.CategoryId IS NULL OR (p.IsActive=1 AND p.IsDeleted=0))) THROW 51113,N'新分类无效。',1;
 SELECT @Before=(SELECT EntryId,CategoryId FROM dbo.TransactionEntries WHERE EntryId=@EntryId OR OriginalEntryId=@EntryId FOR JSON PATH);
 UPDATE dbo.TransactionEntries SET CategoryId=@CategoryId,UpdatedAt=SYSUTCDATETIME(),UpdatedBy=ORIGINAL_LOGIN()
 WHERE UserId=@UserId AND (EntryId=@EntryId OR OriginalEntryId=@EntryId);
 SELECT @After=(SELECT EntryId,CategoryId FROM dbo.TransactionEntries WHERE EntryId=@EntryId OR OriginalEntryId=@EntryId FOR JSON PATH);
 INSERT dbo.AuditLogs(UserId,EntityName,EntityId,ActionName,BeforeData,AfterData,Reason)
 VALUES(@UserId,'TransactionEntries',@EntryId,'Reclassify',@Before,@After,@Reason);
 COMMIT;
 END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH
END;
GO
-- 指定真实账单起止时间（左闭右开），还款为期间活动，不冒充银行的逐账单核销结果。
CREATE PROCEDURE dbo.usp_GetCreditCardPeriod
 @UserId BIGINT,@AccountId BIGINT,@PeriodStart DATETIME2(3),@PeriodEnd DATETIME2(3)
AS
BEGIN
 IF @PeriodStart>=@PeriodEnd THROW 51114,N'账单区间无效。',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.vw_AccountBalances WHERE UserId=@UserId AND AccountId=@AccountId AND IsCreditCard=1)
 THROW 51115,N'信用卡不存在。',1;
 SELECT b.AccountId,b.CurrencyId,b.DisplayBalance AS CurrentDebt,
 COALESCE(x.PeriodPurchases,0) AS PeriodPurchases,COALESCE(x.PeriodRefunds,0) AS PeriodRefunds,
 COALESCE(x.PeriodPayments,0) AS PeriodPayments,COALESCE(z.ClosingDebt,0) AS ClosingDebt
 FROM dbo.vw_AccountBalances b
 OUTER APPLY(SELECT SUM(CASE WHEN tt.TransactionTypeCode='Expense' THEN -e.Amount ELSE 0 END) AS PeriodPurchases,
 SUM(CASE WHEN tt.TransactionTypeCode='Refund' THEN e.Amount ELSE 0 END) AS PeriodRefunds,
 SUM(CASE WHEN tt.TransactionTypeCode='CreditCardPayment' THEN e.Amount ELSE 0 END) AS PeriodPayments
 FROM dbo.vw_PostedEntries e JOIN dbo.TransactionTypes tt ON tt.TransactionTypeId=e.TransactionTypeId
 WHERE e.AccountId=b.AccountId AND e.TransactionDate>=@PeriodStart AND e.TransactionDate<@PeriodEnd) x
 OUTER APPLY(SELECT -SUM(e.Amount) AS ClosingDebt FROM dbo.vw_PostedEntries e WHERE e.AccountId=b.AccountId AND e.TransactionDate<@PeriodEnd) z
 WHERE b.AccountId=@AccountId AND b.UserId=@UserId;
END;
GO
-- 应用角色只允许过程写账，拒绝直接改变已确认分录。数据库管理员仍须遵守运维约定。
CREATE ROLE FinanceApp;
GRANT SELECT ON SCHEMA::dbo TO FinanceApp;
GRANT EXECUTE ON SCHEMA::dbo TO FinanceApp;
GRANT REFERENCES ON TYPE::dbo.EntryInput TO FinanceApp;
GRANT EXECUTE ON TYPE::dbo.EntryInput TO FinanceApp;
DENY INSERT,UPDATE,DELETE ON SCHEMA::dbo TO FinanceApp;
GO
