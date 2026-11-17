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
