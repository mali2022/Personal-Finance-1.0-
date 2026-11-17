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
