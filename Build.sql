-- SQL Server 2019/2022；首次安装脚本。SSMS 普通查询窗口按顺序执行。
-- MODULE 00_CreateDatabase
SET NOEXEC OFF;
USE master;
GO
-- 不使用可能失效的实例默认目录。沿用正在运行的 master 文件所在目录。
-- 路径来自SQL Server自身元数据，使用 sp_executesql 并转义字符串，不拼接用户输入。
IF DB_ID(N'PersonalFinance') IS NULL
BEGIN
 DECLARE @DataPath NVARCHAR(4000),@LogPath NVARCHAR(4000),@CreateSql NVARCHAR(MAX);
 SELECT TOP(1) @DataPath=physical_name FROM sys.master_files WHERE database_id=1 AND type=0 ORDER BY file_id;
 SELECT TOP(1) @LogPath=physical_name FROM sys.master_files WHERE database_id=1 AND type=1 ORDER BY file_id;
 SET @DataPath=LEFT(@DataPath,LEN(@DataPath)-CHARINDEX(N'\',REVERSE(@DataPath))+1)+N'PersonalFinance.mdf';
 SET @LogPath=LEFT(@LogPath,LEN(@LogPath)-CHARINDEX(N'\',REVERSE(@LogPath))+1)+N'PersonalFinance_log.ldf';
 IF @DataPath IS NULL OR @LogPath IS NULL THROW 51500,N'无法确定数据库文件目录。',1;
 SET @CreateSql=N'CREATE DATABASE PersonalFinance ON PRIMARY (NAME=N''PersonalFinance'',FILENAME=N'''
  +REPLACE(@DataPath,N'''',N'''''')+N''',SIZE=32MB,FILEGROWTH=64MB) LOG ON (NAME=N''PersonalFinance_log'',FILENAME=N'''
  +REPLACE(@LogPath,N'''',N'''''')+N''',SIZE=16MB,FILEGROWTH=64MB);';
 EXEC sys.sp_executesql @CreateSql;
END;
GO
-- GO 后 SSMS 会继续执行：单纯 THROW 不足以阻止后续批次，必须关闭执行。
IF DB_ID(N'PersonalFinance') IS NULL
BEGIN
 RAISERROR(N'安装中止：PersonalFinance建库失败。后续批次不会写入master。请修正错误后重新执行完整文件。',16,1);
 SET NOEXEC ON;
END;
GO
USE PersonalFinance;
GO
IF DB_NAME()<>N'PersonalFinance'
BEGIN
 RAISERROR(N'安装中止：当前数据库不是PersonalFinance。',16,1);
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
-- MODULE 01_MasterTables
IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0)
BEGIN
 RAISERROR(N'安装中止：目标数据库已有业务表。首次安装脚本禁止覆盖或重复导入数据。',16,1);
 SET NOEXEC ON;
END;
GO
CREATE TABLE dbo.Currencies (
 CurrencyId BIGINT IDENTITY PRIMARY KEY, CurrencyCode CHAR(3) NOT NULL UNIQUE,
 CurrencyName NVARCHAR(50) NOT NULL, CurrencySymbol NVARCHAR(10) NOT NULL,
 DecimalPlaces TINYINT NOT NULL CHECK (DecimalPlaces BETWEEN 0 AND 4),
 IsActive BIT NOT NULL DEFAULT 1
);
CREATE TABLE dbo.Users (
 UserId BIGINT IDENTITY PRIMARY KEY, UserName NVARCHAR(100) NOT NULL UNIQUE,
 DisplayName NVARCHAR(100) NOT NULL, DefaultCurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 IsDeleted BIT NOT NULL DEFAULT 0,
 UNIQUE(UserId,DefaultCurrencyId)
);
CREATE TABLE dbo.AccountTypes (
 AccountTypeId BIGINT IDENTITY PRIMARY KEY, AccountTypeCode VARCHAR(40) NOT NULL UNIQUE,
 AccountTypeName NVARCHAR(50) NOT NULL, BalanceNature VARCHAR(10) NOT NULL CHECK (BalanceNature IN ('Asset','Liability')),
 IsLiquid BIT NOT NULL DEFAULT 0, IsCreditCard BIT NOT NULL DEFAULT 0,
 CHECK (IsCreditCard=0 OR BalanceNature='Liability')
);
CREATE TABLE dbo.TransactionTypes (
 TransactionTypeId BIGINT IDENTITY PRIMARY KEY, TransactionTypeCode VARCHAR(40) NOT NULL UNIQUE,
 TransactionTypeName NVARCHAR(80) NOT NULL
);
CREATE TABLE dbo.Sources (
 SourceId BIGINT IDENTITY PRIMARY KEY, SourceCode VARCHAR(40) NOT NULL UNIQUE, SourceName NVARCHAR(80) NOT NULL
);
CREATE TABLE dbo.Counterparties (
 CounterpartyId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 CounterpartyName NVARCHAR(200) NOT NULL, CounterpartyKind VARCHAR(20) NOT NULL CHECK (CounterpartyKind IN ('Person','Organization')),
 Notes NVARCHAR(2000) NULL, IsActive BIT NOT NULL DEFAULT 1,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(UserId,CounterpartyId), UNIQUE(UserId,CounterpartyName)
);
CREATE TABLE dbo.Tags (
 TagId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users, TagName NVARCHAR(100) NOT NULL,
 IsActive BIT NOT NULL DEFAULT 1, IsDeleted BIT NOT NULL DEFAULT 0,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 UNIQUE(UserId,TagId), UNIQUE(UserId,TagName)
);
CREATE TABLE dbo.Projects (
 ProjectId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 ProjectName NVARCHAR(150) NOT NULL, StartDate DATE NOT NULL, EndDate DATE NULL,
 CurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies, BudgetAmount DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK(BudgetAmount>=0),
 Status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK(Status IN ('Planned','Active','Completed','Cancelled')),
 Notes NVARCHAR(2000) NULL, IsDeleted BIT NOT NULL DEFAULT 0,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 UNIQUE(UserId,ProjectId), CHECK(EndDate IS NULL OR EndDate>=StartDate)
);
GO
-- MODULE 02_Accounts
-- OpeningBalance 由过账过程维护为期初分录的镜像，余额查询只汇总分录，避免重复加期初。
CREATE TABLE dbo.Accounts (
 AccountId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 AccountTypeId BIGINT NOT NULL REFERENCES dbo.AccountTypes, AccountName NVARCHAR(150) NOT NULL,
 InstitutionName NVARCHAR(150) NULL, AccountNumberMasked NVARCHAR(80) NULL,
 CurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies,
 OpeningBalance DECIMAL(19,4) NOT NULL DEFAULT 0, OpeningDate DATE NOT NULL,
 CreditLimit DECIMAL(19,4) NULL CHECK(CreditLimit>=0), BillingDay TINYINT NULL CHECK(BillingDay BETWEEN 1 AND 31),
 PaymentDueDay TINYINT NULL CHECK(PaymentDueDay BETWEEN 1 AND 31),
 IncludeInNetWorth BIT NOT NULL DEFAULT 1, IncludeInStatistics BIT NOT NULL DEFAULT 1,
 SortOrder INT NOT NULL DEFAULT 0, IsActive BIT NOT NULL DEFAULT 1, ClosedAt DATETIME2(3) NULL,
 Notes NVARCHAR(2000) NULL, CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(UserId,AccountId), UNIQUE(UserId,AccountId,CurrencyId), UNIQUE(UserId,AccountName),
 CHECK(ClosedAt IS NULL OR IsActive=0)
);
GO
-- MODULE 03_Categories
-- 复合自引用外键强制父分类为同用户、同类型的一层分类，层级无需触发器。
CREATE TABLE dbo.Categories (
 CategoryId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 ParentCategoryId BIGINT NULL, CategoryName NVARCHAR(100) NOT NULL,
 CategoryType VARCHAR(10) NOT NULL CHECK(CategoryType IN ('Income','Expense')),
 CategoryCode VARCHAR(60) NOT NULL, CategoryLevel TINYINT NOT NULL,
 ParentLevel TINYINT NULL, IsConsumption BIT NOT NULL DEFAULT 1,
 Description NVARCHAR(1000) NULL, SortOrder INT NOT NULL DEFAULT 0, IsActive BIT NOT NULL DEFAULT 1,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(UserId,CategoryId), UNIQUE(UserId,CategoryCode),
 UNIQUE(UserId,CategoryId,CategoryType),
 UNIQUE(UserId,CategoryId,CategoryType,CategoryLevel),
 FOREIGN KEY(UserId,ParentCategoryId,CategoryType,ParentLevel) REFERENCES dbo.Categories(UserId,CategoryId,CategoryType,CategoryLevel),
 CHECK(ParentCategoryId IS NULL OR ParentCategoryId<>CategoryId),
 CHECK((CategoryLevel=1 AND ParentCategoryId IS NULL AND ParentLevel IS NULL) OR
       (CategoryLevel=2 AND ParentCategoryId IS NOT NULL AND ParentLevel=1))
);
CREATE UNIQUE INDEX UX_Categories_Name ON dbo.Categories(UserId,CategoryType,ParentCategoryId,CategoryName);
CREATE TABLE dbo.Merchants (
 MerchantId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 MerchantName NVARCHAR(200) NOT NULL, MerchantCategory NVARCHAR(100) NULL, DefaultCategoryId BIGINT NULL,
 Notes NVARCHAR(2000) NULL, IsActive BIT NOT NULL DEFAULT 1,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(UserId,MerchantId), UNIQUE(UserId,MerchantName),
 FOREIGN KEY(UserId,DefaultCategoryId) REFERENCES dbo.Categories(UserId,CategoryId)
);
GO
-- MODULE 04_Transactions
CREATE TABLE dbo.Transactions (
 TransactionId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 TransactionTypeId BIGINT NOT NULL REFERENCES dbo.TransactionTypes,
 TransactionDate DATETIME2(3) NOT NULL, BaseCurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies,
 Description NVARCHAR(500) NULL, CounterpartyId BIGINT NULL, MerchantId BIGINT NULL,
 ProjectId BIGINT NULL, ReferenceNumber NVARCHAR(100) NULL,
 Status VARCHAR(12) NOT NULL DEFAULT 'Pending' CHECK(Status IN ('Pending','Confirmed','Cancelled')),
 SourceId BIGINT NOT NULL REFERENCES dbo.Sources, SourceAccountId BIGINT NULL,
 ExternalReference NVARCHAR(200) NULL, ImportHash BINARY(32) NULL, Notes NVARCHAR(2000) NULL,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(UserId,TransactionId),
 FOREIGN KEY(UserId,BaseCurrencyId) REFERENCES dbo.Users(UserId,DefaultCurrencyId),
 FOREIGN KEY(UserId,CounterpartyId) REFERENCES dbo.Counterparties(UserId,CounterpartyId),
 FOREIGN KEY(UserId,MerchantId) REFERENCES dbo.Merchants(UserId,MerchantId),
 FOREIGN KEY(UserId,ProjectId) REFERENCES dbo.Projects(UserId,ProjectId),
 FOREIGN KEY(UserId,SourceAccountId) REFERENCES dbo.Accounts(UserId,AccountId),
 CHECK(ExternalReference IS NULL OR SourceAccountId IS NOT NULL),
 CHECK(IsDeleted=0 OR Status<>'Confirmed')
);
-- Amount 统一有符号；Account: 净资产方向；Expense: 正数费用/负数冲减；Income: 负数收入。
CREATE TABLE dbo.TransactionEntries (
 EntryId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL,
 TransactionId BIGINT NOT NULL, LineNumber INT NOT NULL CHECK(LineNumber>0),
 EntryKind VARCHAR(10) NOT NULL CHECK(EntryKind IN ('Account','Expense','Income','Equity')),
 AccountId BIGINT NULL, CategoryId BIGINT NULL,
 CurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies, Amount DECIMAL(19,4) NOT NULL CHECK(Amount<>0),
 ExchangeRate DECIMAL(19,8) NOT NULL CHECK(ExchangeRate>0),
 BaseCurrencyAmount AS CONVERT(DECIMAL(19,4),ROUND(Amount*ExchangeRate,4)) PERSISTED,
 OriginalEntryId BIGINT NULL, Description NVARCHAR(500) NULL,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 UNIQUE(TransactionId,LineNumber), UNIQUE(UserId,EntryId),
 FOREIGN KEY(UserId,TransactionId) REFERENCES dbo.Transactions(UserId,TransactionId),
 FOREIGN KEY(UserId,AccountId,CurrencyId) REFERENCES dbo.Accounts(UserId,AccountId,CurrencyId),
 FOREIGN KEY(UserId,CategoryId,EntryKind) REFERENCES dbo.Categories(UserId,CategoryId,CategoryType),
 FOREIGN KEY(UserId,OriginalEntryId) REFERENCES dbo.TransactionEntries(UserId,EntryId),
 CHECK((EntryKind='Account' AND AccountId IS NOT NULL AND CategoryId IS NULL) OR
       (EntryKind IN ('Expense','Income') AND AccountId IS NULL AND CategoryId IS NOT NULL) OR
       (EntryKind='Equity' AND AccountId IS NULL AND CategoryId IS NULL)),
 CHECK(OriginalEntryId IS NULL OR (EntryKind='Expense' AND Amount<0)),
 CHECK(OriginalEntryId IS NULL OR OriginalEntryId<>EntryId),
 CHECK(BaseCurrencyAmount<>0)
);
CREATE TABLE dbo.TransactionTags (
 UserId BIGINT NOT NULL, TransactionId BIGINT NOT NULL, TagId BIGINT NOT NULL,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 PRIMARY KEY(TransactionId,TagId),
 FOREIGN KEY(UserId,TransactionId) REFERENCES dbo.Transactions(UserId,TransactionId),
 FOREIGN KEY(UserId,TagId) REFERENCES dbo.Tags(UserId,TagId)
);
CREATE TABLE dbo.Attachments (
 AttachmentId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL, TransactionId BIGINT NOT NULL,
 FileName NVARCHAR(260) NOT NULL, FileLocation NVARCHAR(2000) NOT NULL, FileHash BINARY(32) NULL,
 MimeType VARCHAR(150) NULL, FileSize BIGINT NOT NULL CHECK(FileSize>=0),
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 FOREIGN KEY(UserId,TransactionId) REFERENCES dbo.Transactions(UserId,TransactionId)
);
GO
-- MODULE 05_Loans_Reimbursements
-- 每笔合同/报销使用独立应收或应付账户，余额只来自分录。
CREATE TABLE dbo.Loans (
 LoanId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL, AccountId BIGINT NOT NULL,
 CounterpartyId BIGINT NOT NULL, Direction VARCHAR(10) NOT NULL CHECK(Direction IN ('Given','Received')),
 ContractNumber NVARCHAR(100) NULL, StartDate DATE NOT NULL, DueDate DATE NULL,
 AnnualInterestRate DECIMAL(9,6) NULL CHECK(AnnualInterestRate>=0), Notes NVARCHAR(2000) NULL,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(AccountId), UNIQUE(UserId,LoanId),
 FOREIGN KEY(UserId,AccountId) REFERENCES dbo.Accounts(UserId,AccountId),
 FOREIGN KEY(UserId,CounterpartyId) REFERENCES dbo.Counterparties(UserId,CounterpartyId),
 CHECK(DueDate IS NULL OR DueDate>=StartDate)
);
CREATE TABLE dbo.Reimbursements (
 ReimbursementId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL, AccountId BIGINT NOT NULL,
 CounterpartyId BIGINT NOT NULL, SubmittedDate DATE NULL,
 WorkflowStatus VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK(WorkflowStatus IN ('Draft','Submitted','Closed','Abandoned')),
 Notes NVARCHAR(2000) NULL,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 IsDeleted BIT NOT NULL DEFAULT 0, DeletedAt DATETIME2(3) NULL,
 UNIQUE(AccountId), UNIQUE(UserId,ReimbursementId),
 FOREIGN KEY(UserId,AccountId) REFERENCES dbo.Accounts(UserId,AccountId),
 FOREIGN KEY(UserId,CounterpartyId) REFERENCES dbo.Counterparties(UserId,CounterpartyId)
);
CREATE TABLE dbo.AccountReconciliations (
 ReconciliationId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL, AccountId BIGINT NOT NULL,
 StatementDate DATETIME2(3) NOT NULL, StatementBalance DECIMAL(19,4) NOT NULL,
 CalculatedBalance DECIMAL(19,4) NOT NULL,
 Difference AS (StatementBalance-CalculatedBalance) PERSISTED,
 Status VARCHAR(12) NOT NULL DEFAULT 'Open' CHECK(Status IN ('Open','Matched','Resolved')),
 AdjustmentTransactionId BIGINT NULL, Notes NVARCHAR(2000) NULL,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 FOREIGN KEY(UserId,AccountId) REFERENCES dbo.Accounts(UserId,AccountId),
 FOREIGN KEY(UserId,AdjustmentTransactionId) REFERENCES dbo.Transactions(UserId,TransactionId),
 UNIQUE(AccountId,StatementDate), CHECK(Status<>'Matched' OR StatementBalance=CalculatedBalance)
);
CREATE TABLE dbo.ReconciledEntries (
 ReconciliationId BIGINT NOT NULL REFERENCES dbo.AccountReconciliations, EntryId BIGINT NOT NULL REFERENCES dbo.TransactionEntries,
 PRIMARY KEY(ReconciliationId,EntryId), UNIQUE(EntryId)
);
CREATE TABLE dbo.ExchangeRates (
 RateId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 CurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies, BaseCurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies,
 RateDate DATE NOT NULL, ExchangeRate DECIMAL(19,8) NOT NULL CHECK(ExchangeRate>0),
 RateSource NVARCHAR(100) NOT NULL, CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 UNIQUE(UserId,CurrencyId,BaseCurrencyId,RateDate),
 CHECK(CurrencyId<>BaseCurrencyId OR ExchangeRate=1)
);
-- 仅保存允许的分类纠错历史；金额修改必须新增冲销/更正交易。
CREATE TABLE dbo.AuditLogs (
 AuditLogId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 EntityName VARCHAR(50) NOT NULL, EntityId BIGINT NOT NULL, ActionName VARCHAR(40) NOT NULL,
 BeforeData NVARCHAR(MAX) NOT NULL CHECK(ISJSON(BeforeData)=1),
 AfterData NVARCHAR(MAX) NOT NULL CHECK(ISJSON(AfterData)=1), Reason NVARCHAR(1000) NOT NULL,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN()
);
GO
-- MODULE 06_Budgets
CREATE TABLE dbo.Budgets (
 BudgetId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 BudgetPeriod DATE NOT NULL CHECK(DAY(BudgetPeriod)=1), CurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies,
 Notes NVARCHAR(1000) NULL, IsDeleted BIT NOT NULL DEFAULT 0,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 UNIQUE(UserId,BudgetId), UNIQUE(UserId,BudgetPeriod),
 FOREIGN KEY(UserId,CurrencyId) REFERENCES dbo.Users(UserId,DefaultCurrencyId)
);
CREATE TABLE dbo.BudgetItems (
 BudgetItemId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL, BudgetId BIGINT NOT NULL,
 CategoryId BIGINT NOT NULL, CategoryType VARCHAR(10) NOT NULL DEFAULT 'Expense' CHECK(CategoryType='Expense'),
 BudgetAmount DECIMAL(19,4) NOT NULL CHECK(BudgetAmount>=0),
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 UNIQUE(BudgetId,CategoryId),
 FOREIGN KEY(UserId,BudgetId) REFERENCES dbo.Budgets(UserId,BudgetId),
 FOREIGN KEY(UserId,CategoryId,CategoryType) REFERENCES dbo.Categories(UserId,CategoryId,CategoryType)
);
-- 模板同样采用分录，规则不自动产生已确认交易；调度器调用过账过程。
CREATE TABLE dbo.RecurringTransactions (
 RecurringTransactionId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL REFERENCES dbo.Users,
 TransactionTypeId BIGINT NOT NULL REFERENCES dbo.TransactionTypes, RuleName NVARCHAR(150) NOT NULL,
 Frequency VARCHAR(12) NOT NULL CHECK(Frequency IN ('Daily','Weekly','Monthly','Quarterly','Yearly')),
 IntervalCount INT NOT NULL DEFAULT 1 CHECK(IntervalCount>0), StartDate DATE NOT NULL, EndDate DATE NULL,
 NextDueDate DATE NOT NULL, DayOfMonth TINYINT NULL CHECK(DayOfMonth BETWEEN 1 AND 31),
 IsActive BIT NOT NULL DEFAULT 1, IsDeleted BIT NOT NULL DEFAULT 0, Notes NVARCHAR(1000) NULL,
 CreatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(), UpdatedAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CreatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(), UpdatedBy NVARCHAR(100) NOT NULL DEFAULT ORIGINAL_LOGIN(),
 UNIQUE(UserId,RecurringTransactionId), CHECK(EndDate IS NULL OR EndDate>=StartDate)
);
CREATE TABLE dbo.RecurringEntries (
 RecurringEntryId BIGINT IDENTITY PRIMARY KEY, UserId BIGINT NOT NULL, RecurringTransactionId BIGINT NOT NULL,
 LineNumber INT NOT NULL, EntryKind VARCHAR(10) NOT NULL CHECK(EntryKind IN ('Account','Expense','Income','Equity')),
 AccountId BIGINT NULL, CategoryId BIGINT NULL, CurrencyId BIGINT NOT NULL REFERENCES dbo.Currencies,
 Amount DECIMAL(19,4) NOT NULL CHECK(Amount<>0), ExchangeRate DECIMAL(19,8) NOT NULL CHECK(ExchangeRate>0),
 UNIQUE(RecurringTransactionId,LineNumber),
 FOREIGN KEY(UserId,RecurringTransactionId) REFERENCES dbo.RecurringTransactions(UserId,RecurringTransactionId),
 FOREIGN KEY(UserId,AccountId,CurrencyId) REFERENCES dbo.Accounts(UserId,AccountId,CurrencyId),
 FOREIGN KEY(UserId,CategoryId,EntryKind) REFERENCES dbo.Categories(UserId,CategoryId,CategoryType),
 CHECK((EntryKind='Account' AND AccountId IS NOT NULL AND CategoryId IS NULL) OR
 (EntryKind IN ('Expense','Income') AND AccountId IS NULL AND CategoryId IS NOT NULL) OR
 (EntryKind='Equity' AND AccountId IS NULL AND CategoryId IS NULL))
);
CREATE TABLE dbo.RecurringOccurrences (
 UserId BIGINT NOT NULL, RecurringTransactionId BIGINT NOT NULL, DueDate DATE NOT NULL, TransactionId BIGINT NOT NULL,
 PRIMARY KEY(RecurringTransactionId,DueDate), UNIQUE(TransactionId),
 FOREIGN KEY(UserId,RecurringTransactionId) REFERENCES dbo.RecurringTransactions(UserId,RecurringTransactionId),
 FOREIGN KEY(UserId,TransactionId) REFERENCES dbo.Transactions(UserId,TransactionId)
);
GO
-- MODULE 07_Indexes
CREATE INDEX IX_Transactions_Date ON dbo.Transactions(UserId,TransactionDate,TransactionId)
 INCLUDE(TransactionTypeId,MerchantId,ProjectId,BaseCurrencyId) WHERE IsDeleted=0 AND Status='Confirmed';
CREATE INDEX IX_Transactions_Merchant ON dbo.Transactions(UserId,MerchantId,TransactionDate) INCLUDE(TransactionId)
 WHERE IsDeleted=0 AND Status='Confirmed';
CREATE INDEX IX_Entries_Account ON dbo.TransactionEntries(UserId,AccountId,TransactionId) INCLUDE(Amount,BaseCurrencyAmount,CurrencyId);
CREATE INDEX IX_Entries_Category ON dbo.TransactionEntries(UserId,CategoryId,TransactionId) INCLUDE(EntryKind,BaseCurrencyAmount);
CREATE INDEX IX_Entries_Refund ON dbo.TransactionEntries(OriginalEntryId) INCLUDE(Amount,TransactionId) WHERE OriginalEntryId IS NOT NULL;
CREATE UNIQUE INDEX UX_Transactions_External ON dbo.Transactions(UserId,SourceId,SourceAccountId,ExternalReference) WHERE ExternalReference IS NOT NULL;
CREATE UNIQUE INDEX UX_Transactions_Hash ON dbo.Transactions(UserId,SourceId,SourceAccountId,ImportHash) WHERE ImportHash IS NOT NULL;
CREATE INDEX IX_TransactionTags_Tag ON dbo.TransactionTags(UserId,TagId,TransactionId);
CREATE INDEX IX_Rates_Date ON dbo.ExchangeRates(UserId,BaseCurrencyId,CurrencyId,RateDate DESC) INCLUDE(ExchangeRate);
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
-- MODULE 10_SeedData
INSERT dbo.Currencies(CurrencyCode,CurrencyName,CurrencySymbol,DecimalPlaces)
VALUES('CNY',N'人民币',N'¥',2),('USD',N'美元',N'$',2),('HKD',N'港币',N'HK$',2),('JPY',N'日元',N'¥',0),('EUR',N'欧元',N'€',2);
INSERT dbo.Users(UserName,DisplayName,DefaultCurrencyId) SELECT N'demo',N'示例用户',CurrencyId FROM dbo.Currencies WHERE CurrencyCode='CNY';
INSERT dbo.AccountTypes(AccountTypeCode,AccountTypeName,BalanceNature,IsLiquid,IsCreditCard) VALUES
('Cash',N'现金','Asset',1,0),('Bank',N'银行账户','Asset',1,0),('DebitCard',N'借记卡','Asset',1,0),
('CreditCard',N'信用卡','Liability',0,1),('Alipay',N'支付宝','Asset',1,0),('WeChat',N'微信支付','Asset',1,0),
('Wallet',N'数字钱包','Asset',1,0),('StoredValue',N'储值账户','Asset',0,0),('Investment',N'投资账户','Asset',0,0),
('Securities',N'证券账户','Asset',0,0),('Loan',N'借款账户','Liability',0,0),('Receivable',N'应收账户','Asset',0,0),
('Payable',N'应付账户','Liability',0,0),('OtherAsset',N'其他资产','Asset',0,0),('OtherLiability',N'其他负债','Liability',0,0);
INSERT dbo.TransactionTypes(TransactionTypeCode,TransactionTypeName) VALUES
('Expense',N'个人费用'),('Income',N'个人收入'),('Transfer',N'内部转账'),('Refund',N'消费退款'),
('CreditCardPayment',N'信用卡还款'),('LoanGiven',N'借出本金'),('LoanReceived',N'借入本金'),
('LoanRepaymentReceived',N'收回本金'),('LoanRepaymentPaid',N'偿还本金'),('ReimbursementAdvance',N'报销垫付'),
('ReimbursementReceived',N'报销到账'),('AssetLoss',N'资产损失'),('Adjustment',N'会计调整'),('OpeningBalance',N'期初余额');
INSERT dbo.TransactionTypes(TransactionTypeCode,TransactionTypeName) VALUES('Exchange',N'货币兑换');
INSERT dbo.Sources(SourceCode,SourceName) VALUES('Manual',N'手工'),('Alipay',N'支付宝'),('WeChat',N'微信'),
('BankImport',N'银行导入'),('CreditCardImport',N'信用卡导入'),('CSV',N'CSV'),('API',N'API'),('Other',N'其他');
DECLARE @U BIGINT=(SELECT UserId FROM dbo.Users WHERE UserName=N'demo'),@C BIGINT=(SELECT CurrencyId FROM dbo.Currencies WHERE CurrencyCode='CNY');
INSERT dbo.Categories(UserId,CategoryName,CategoryType,CategoryCode,CategoryLevel,IsConsumption,SortOrder)
SELECT @U,Name,'Expense',Code,1,Consumption,Sort FROM (VALUES
(N'餐饮食品','Food',1,1),(N'生鲜食材','Fresh',1,2),(N'粮油调味','Grocery',1,3),(N'居家生活','Household',1,4),
(N'交通出行','Transport',1,5),(N'购物消费','Shopping',1,6),(N'医疗健康','Health',1,7),(N'教育学习','Education',1,8),
(N'娱乐休闲','Entertainment',1,9),(N'社交人情','Social',1,10),(N'住房居住','Housing',1,11),(N'通讯网络','Communication',1,12),
(N'金融费用','Finance',1,13),(N'宠物','Pets',1,14),(N'旅行','Travel',1,15),(N'其他支出','OtherExpense',1,16),
(N'资产损失','AssetLoss',0,17)) x(Name,Code,Consumption,Sort);
INSERT dbo.Categories(UserId,CategoryName,CategoryType,CategoryCode,CategoryLevel,IsConsumption)
SELECT @U,Name,'Income',Code,1,0 FROM (VALUES(N'工资收入','Salary'),(N'奖金收入','Bonus'),(N'经营收入','Business'),
(N'投资收益','InvestmentIncome'),(N'利息收入','Interest'),(N'礼金红包','Gifts'),(N'其他收入','OtherIncome')) x(Name,Code);
INSERT dbo.Categories(UserId,ParentCategoryId,CategoryName,CategoryType,CategoryCode,CategoryLevel,ParentLevel,IsConsumption)
SELECT @U,p.CategoryId,x.Name,'Expense',x.Code,2,1,x.Consumption FROM (VALUES
('Food',N'日常午餐','Lunch',1),('Food',N'食品','FoodGoods',1),('Household',N'日用品','DailyGoods',1),
('Pets',N'宠物用品','PetGoods',1),('Shopping',N'普通购物','GeneralShopping',1),('OtherExpense',N'不明消费','Unknown',1),
('AssetLoss',N'现金遗失','CashLoss',0),('Finance',N'手续费','Fees',1),('Finance',N'借款利息','LoanInterest',1)) x(ParentCode,Name,Code,Consumption)
JOIN dbo.Categories p ON p.UserId=@U AND p.CategoryCode=x.ParentCode;
INSERT dbo.Accounts(UserId,AccountTypeId,AccountName,CurrencyId,OpeningDate,CreditLimit,BillingDay,PaymentDueDay)
SELECT @U,at.AccountTypeId,x.Name,@C,'2026-01-01',CASE WHEN x.Code='CreditCard' THEN 20000 END,
CASE WHEN x.Code='CreditCard' THEN 10 END,CASE WHEN x.Code='CreditCard' THEN 28 END
FROM (VALUES('Cash',N'现金'),('Alipay',N'支付宝'),('WeChat',N'微信支付'),('DebitCard',N'招商银行储蓄卡'),('CreditCard',N'信用卡'),
('Receivable',N'张三借款应收'),('Receivable',N'公司报销应收'),('Loan',N'个人借款应付')) x(Code,Name)
JOIN dbo.AccountTypes at ON at.AccountTypeCode=x.Code;
INSERT dbo.Counterparties(UserId,CounterpartyName,CounterpartyKind) VALUES(@U,N'张三','Person'),(@U,N'公司','Organization');
INSERT dbo.Loans(UserId,AccountId,CounterpartyId,Direction,StartDate)
SELECT @U,a.AccountId,c.CounterpartyId,'Given','2026-01-01' FROM dbo.Accounts a CROSS JOIN dbo.Counterparties c
WHERE a.UserId=@U AND a.AccountName=N'张三借款应收' AND c.UserId=@U AND c.CounterpartyName=N'张三';
INSERT dbo.Loans(UserId,AccountId,CounterpartyId,Direction,StartDate)
SELECT @U,a.AccountId,c.CounterpartyId,'Received','2026-01-01' FROM dbo.Accounts a CROSS JOIN dbo.Counterparties c
WHERE a.UserId=@U AND a.AccountName=N'个人借款应付' AND c.UserId=@U AND c.CounterpartyName=N'张三';
INSERT dbo.Reimbursements(UserId,AccountId,CounterpartyId,WorkflowStatus)
SELECT @U,a.AccountId,c.CounterpartyId,'Submitted' FROM dbo.Accounts a CROSS JOIN dbo.Counterparties c
WHERE a.UserId=@U AND a.AccountName=N'公司报销应收' AND c.UserId=@U AND c.CounterpartyName=N'公司';
INSERT dbo.Merchants(UserId,MerchantName) VALUES(@U,N'示例超市'),(@U,N'午餐店');
INSERT dbo.Tags(UserId,TagName) VALUES(@U,N'工作'),(@U,N'家庭'),(@U,N'旅游');
INSERT dbo.Projects(UserId,ProjectName,StartDate,CurrencyId,BudgetAmount) VALUES(@U,N'日本旅游','2026-10-01',@C,20000);
INSERT dbo.Budgets(UserId,BudgetPeriod,CurrencyId) VALUES(@U,'2026-10-01',@C);
INSERT dbo.BudgetItems(UserId,BudgetId,CategoryId,BudgetAmount)
SELECT @U,b.BudgetId,c.CategoryId,2000 FROM dbo.Budgets b CROSS JOIN dbo.Categories c WHERE b.UserId=@U AND c.UserId=@U AND c.CategoryCode='Food';
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
