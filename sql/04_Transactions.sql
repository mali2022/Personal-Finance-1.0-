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
