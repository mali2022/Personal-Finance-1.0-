-- Apply only to the new application database. Original dbo ledger databases are preserved.
USE [PersonalFinanceWeb];
GO
IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    IF SCHEMA_ID(N'finance') IS NULL EXEC(N'CREATE SCHEMA [finance];');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Users] (
        [Id] nvarchar(36) NOT NULL,
        [Email] nvarchar(256) NOT NULL,
        [DisplayName] nvarchar(max) NOT NULL,
        [PasswordHash] nvarchar(max) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_Users] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Accounts] (
        [Id] nvarchar(36) NOT NULL,
        [Name] nvarchar(150) NOT NULL,
        [Type] nvarchar(40) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [OpeningBalance] decimal(28,4) NOT NULL,
        [Institution] nvarchar(max) NULL,
        [Status] nvarchar(40) NOT NULL,
        [CreditLimit] decimal(28,4) NULL,
        [StatementDay] int NULL,
        [PaymentDay] int NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Accounts] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Accounts_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Budgets] (
        [Id] nvarchar(36) NOT NULL,
        [Month] nvarchar(7) NOT NULL,
        [Total] decimal(28,4) NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Budgets] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Budgets_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Businesses] (
        [Id] nvarchar(36) NOT NULL,
        [Kind] nvarchar(40) NOT NULL,
        [Counterparty] nvarchar(max) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [Principal] decimal(28,4) NOT NULL,
        [AccountId] nvarchar(36) NOT NULL,
        [ContractAccountId] nvarchar(36) NOT NULL,
        [OccurredAt] datetimeoffset NOT NULL,
        [Note] nvarchar(max) NOT NULL,
        [Status] nvarchar(40) NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Businesses] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Businesses_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Categories] (
        [Id] nvarchar(36) NOT NULL,
        [Name] nvarchar(max) NOT NULL,
        [ParentId] nvarchar(36) NULL,
        [Kind] nvarchar(40) NOT NULL,
        [Status] nvarchar(40) NOT NULL,
        [SortOrder] int NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Categories] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Categories_Categories_ParentId] FOREIGN KEY ([ParentId]) REFERENCES [finance].[Categories] ([Id]),
        CONSTRAINT [FK_Categories_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Directory] (
        [Id] nvarchar(36) NOT NULL,
        [Kind] nvarchar(40) NOT NULL,
        [Name] nvarchar(150) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [Budget] decimal(28,4) NOT NULL,
        [CategoryId] nvarchar(36) NULL,
        [AccountId] nvarchar(36) NULL,
        [Amount] decimal(28,4) NULL,
        [StartDate] nvarchar(max) NULL,
        [EndDate] nvarchar(max) NULL,
        [Status] nvarchar(40) NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Directory] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Directory_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Documents] (
        [Id] nvarchar(36) NOT NULL,
        [Kind] nvarchar(40) NOT NULL,
        [TransactionId] nvarchar(36) NULL,
        [Name] nvarchar(max) NOT NULL,
        [ContentType] nvarchar(max) NOT NULL,
        [Content] varbinary(max) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Documents] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Documents_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Idempotencies] (
        [Id] nvarchar(36) NOT NULL,
        [Key] nvarchar(200) NOT NULL,
        [Hash] nvarchar(max) NOT NULL,
        [Response] nvarchar(max) NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Idempotencies] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Idempotencies_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Imports] (
        [Id] nvarchar(36) NOT NULL,
        [FileName] nvarchar(max) NOT NULL,
        [Source] nvarchar(max) NOT NULL,
        [HeadersJson] nvarchar(max) NOT NULL,
        [RawRowsJson] nvarchar(max) NOT NULL,
        [MappingJson] nvarchar(max) NOT NULL,
        [AccountId] nvarchar(36) NULL,
        [State] nvarchar(40) NOT NULL,
        [Imported] int NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Imports] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Imports_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Reconciliations] (
        [Id] nvarchar(36) NOT NULL,
        [AccountId] nvarchar(36) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [SystemBalance] decimal(28,4) NOT NULL,
        [ActualBalance] decimal(28,4) NOT NULL,
        [Difference] decimal(28,4) NOT NULL,
        [TransactionId] nvarchar(36) NULL,
        [Reason] nvarchar(max) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Reconciliations] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Reconciliations_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Rules] (
        [Id] nvarchar(36) NOT NULL,
        [IncludeFees] bit NOT NULL,
        [IncludeAssetLoss] bit NOT NULL,
        [IncludeDecreasingAdjustments] bit NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Rules] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Rules_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Sessions] (
        [Id] nvarchar(36) NOT NULL,
        [RefreshHash] nvarchar(64) NOT NULL,
        [ExpiresAt] datetimeoffset NOT NULL,
        [Revoked] bit NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Sessions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Sessions_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Transactions] (
        [Id] nvarchar(36) NOT NULL,
        [Type] nvarchar(40) NOT NULL,
        [Amount] decimal(28,4) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [AccountId] nvarchar(36) NOT NULL,
        [ToAccountId] nvarchar(36) NULL,
        [CategoryId] nvarchar(36) NULL,
        [Merchant] nvarchar(max) NULL,
        [OccurredAt] datetimeoffset NOT NULL,
        [Note] nvarchar(max) NOT NULL,
        [ProjectId] nvarchar(36) NULL,
        [Status] nvarchar(40) NOT NULL,
        [OriginalTransactionId] nvarchar(36) NULL,
        [BusinessId] nvarchar(36) NULL,
        [ImportJobId] nvarchar(36) NULL,
        [ExternalId] nvarchar(36) NULL,
        [Fee] decimal(28,4) NOT NULL,
        [FeeCategoryId] nvarchar(36) NULL,
        [ReceivedAmount] decimal(28,4) NULL,
        [ExchangeRate] decimal(28,8) NULL,
        [AdjustmentDirection] nvarchar(max) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Transactions] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Transactions_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[BudgetLine] (
        [Id] nvarchar(36) NOT NULL,
        [BudgetId] nvarchar(36) NOT NULL,
        [CategoryId] nvarchar(36) NOT NULL,
        [Limit] decimal(28,4) NOT NULL,
        CONSTRAINT [PK_BudgetLine] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_BudgetLine_Budgets_BudgetId] FOREIGN KEY ([BudgetId]) REFERENCES [finance].[Budgets] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[ImportRows] (
        [Id] nvarchar(36) NOT NULL,
        [ImportJobId] nvarchar(36) NOT NULL,
        [Index] int NOT NULL,
        [DataJson] nvarchar(max) NOT NULL,
        [Fingerprint] nvarchar(64) NOT NULL,
        [Status] nvarchar(40) NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_ImportRows] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_ImportRows_Imports_ImportJobId] FOREIGN KEY ([ImportJobId]) REFERENCES [finance].[Imports] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_ImportRows_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[Entries] (
        [Id] nvarchar(36) NOT NULL,
        [TransactionId] nvarchar(36) NOT NULL,
        [Kind] nvarchar(40) NOT NULL,
        [AccountId] nvarchar(36) NULL,
        [CategoryId] nvarchar(36) NULL,
        [Amount] decimal(28,4) NOT NULL,
        [Currency] nvarchar(3) NOT NULL,
        [ExchangeRate] decimal(28,8) NOT NULL,
        [BaseAmount] decimal(28,4) NOT NULL,
        [OriginalEntryId] nvarchar(36) NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_Entries] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_Entries_Accounts_AccountId] FOREIGN KEY ([AccountId]) REFERENCES [finance].[Accounts] ([Id]),
        CONSTRAINT [FK_Entries_Categories_CategoryId] FOREIGN KEY ([CategoryId]) REFERENCES [finance].[Categories] ([Id]),
        CONSTRAINT [FK_Entries_Transactions_TransactionId] FOREIGN KEY ([TransactionId]) REFERENCES [finance].[Transactions] ([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_Entries_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE TABLE [finance].[TransactionTag] (
        [TransactionId] nvarchar(36) NOT NULL,
        [DirectoryId] nvarchar(36) NOT NULL,
        CONSTRAINT [PK_TransactionTag] PRIMARY KEY ([TransactionId], [DirectoryId]),
        CONSTRAINT [FK_TransactionTag_Directory_DirectoryId] FOREIGN KEY ([DirectoryId]) REFERENCES [finance].[Directory] ([Id]),
        CONSTRAINT [FK_TransactionTag_Transactions_TransactionId] FOREIGN KEY ([TransactionId]) REFERENCES [finance].[Transactions] ([Id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Accounts_UserId_Name] ON [finance].[Accounts] ([UserId], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_BudgetLine_BudgetId] ON [finance].[BudgetLine] ([BudgetId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Budgets_UserId_Month] ON [finance].[Budgets] ([UserId], [Month]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Businesses_UserId] ON [finance].[Businesses] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Categories_ParentId] ON [finance].[Categories] ([ParentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Categories_UserId] ON [finance].[Categories] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Directory_UserId_Kind_Name] ON [finance].[Directory] ([UserId], [Kind], [Name]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Documents_UserId] ON [finance].[Documents] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Entries_AccountId] ON [finance].[Entries] ([AccountId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Entries_CategoryId] ON [finance].[Entries] ([CategoryId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Entries_TransactionId] ON [finance].[Entries] ([TransactionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Entries_UserId_AccountId_TransactionId] ON [finance].[Entries] ([UserId], [AccountId], [TransactionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Idempotencies_UserId_Key] ON [finance].[Idempotencies] ([UserId], [Key]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_ImportRows_ImportJobId] ON [finance].[ImportRows] ([ImportJobId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_ImportRows_UserId_Fingerprint_Status] ON [finance].[ImportRows] ([UserId], [Fingerprint], [Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Imports_UserId] ON [finance].[Imports] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Reconciliations_UserId] ON [finance].[Reconciliations] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Rules_UserId] ON [finance].[Rules] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Sessions_RefreshHash] ON [finance].[Sessions] ([RefreshHash]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Sessions_UserId] ON [finance].[Sessions] ([UserId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Transactions_UserId_AccountId_Status] ON [finance].[Transactions] ([UserId], [AccountId], [Status]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Transactions_UserId_ImportJobId] ON [finance].[Transactions] ([UserId], [ImportJobId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_Transactions_UserId_OccurredAt_Id] ON [finance].[Transactions] ([UserId], [OccurredAt], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE INDEX [IX_TransactionTag_DirectoryId] ON [finance].[TransactionTag] ([DirectoryId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Users_Email] ON [finance].[Users] ([Email]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007174605_InitialFinance'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261007174605_InitialFinance', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007175657_ImportFingerprintConstraint'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_ImportRows_UserId_Fingerprint] ON [finance].[ImportRows] ([UserId], [Fingerprint]) WHERE [Status] = ''Imported''');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007175657_ImportFingerprintConstraint'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261007175657_ImportFingerprintConstraint', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007180556_FinancialValueConstraints'
)
BEGIN
    EXEC(N'ALTER TABLE [finance].[Transactions] ADD CONSTRAINT [CK_Transaction_Amounts] CHECK ([Amount] > 0 AND [Fee] >= 0 AND [Version] > 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007180556_FinancialValueConstraints'
)
BEGIN
    EXEC(N'ALTER TABLE [finance].[Entries] ADD CONSTRAINT [CK_Entry_Values] CHECK ([Amount] <> 0 AND [BaseAmount] <> 0 AND [ExchangeRate] > 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007180556_FinancialValueConstraints'
)
BEGIN
    EXEC(N'ALTER TABLE [finance].[Businesses] ADD CONSTRAINT [CK_Business_Principal] CHECK ([Principal] > 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007180556_FinancialValueConstraints'
)
BEGIN
    EXEC(N'ALTER TABLE [finance].[Budgets] ADD CONSTRAINT [CK_Budget_Total] CHECK ([Total] >= 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007180556_FinancialValueConstraints'
)
BEGIN
    EXEC(N'ALTER TABLE [finance].[BudgetLine] ADD CONSTRAINT [CK_BudgetLine_Limit] CHECK ([Limit] >= 0)');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007180556_FinancialValueConstraints'
)
BEGIN
    EXEC(N'ALTER TABLE [finance].[Accounts] ADD CONSTRAINT [CK_Account_Credit] CHECK (([CreditLimit] IS NULL OR [CreditLimit] >= 0) AND ([StatementDay] IS NULL OR [StatementDay] BETWEEN 1 AND 31) AND ([PaymentDay] IS NULL OR [PaymentDay] BETWEEN 1 AND 31))');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261007180556_FinancialValueConstraints'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261007180556_FinancialValueConstraints', N'10.0.12');
END;

COMMIT;
GO


