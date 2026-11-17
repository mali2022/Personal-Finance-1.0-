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
