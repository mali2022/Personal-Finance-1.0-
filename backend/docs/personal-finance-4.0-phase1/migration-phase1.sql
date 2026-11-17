BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    ALTER TABLE [finance].[AiUsageRecord] ADD [ConfigurationVersion] nvarchar(64) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    ALTER TABLE [finance].[AiUsageRecord] ADD [RequestId] nvarchar(36) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    ALTER TABLE [finance].[AiToolAudit] ADD [AccountScopeJson] nvarchar(max) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    ALTER TABLE [finance].[AiToolAudit] ADD [DurationMs] bigint NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    ALTER TABLE [finance].[AiToolAudit] ADD [ErrorCode] nvarchar(100) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    ALTER TABLE [finance].[AiToolAudit] ADD [RequestId] nvarchar(36) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    ALTER TABLE [finance].[AiPrivacySetting] ADD [SaveHistory] bit NOT NULL DEFAULT CAST(0 AS bit);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE TABLE [finance].[AiConfigurationSnapshot] (
        [Id] nvarchar(36) NOT NULL,
        [ConfigurationJson] nvarchar(max) NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        CONSTRAINT [PK_AiConfigurationSnapshot] PRIMARY KEY ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE TABLE [finance].[AiConversation] (
        [Id] nvarchar(36) NOT NULL,
        [Title] nvarchar(120) NOT NULL,
        [AccountScopeJson] nvarchar(max) NULL,
        [Archived] bit NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UpdatedAt] datetimeoffset NOT NULL,
        [ExpiresAt] datetimeoffset NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_AiConversation] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AiConversation_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE TABLE [finance].[AiRequestAudit] (
        [Id] nvarchar(36) NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [LedgerId] nvarchar(36) NOT NULL,
        [AccountScopeJson] nvarchar(max) NOT NULL,
        [ConfigurationVersion] nvarchar(64) NOT NULL,
        [StartedAt] datetimeoffset NOT NULL,
        [CompletedAt] datetimeoffset NULL,
        [State] nvarchar(40) NOT NULL,
        [ErrorCode] nvarchar(100) NULL,
        CONSTRAINT [PK_AiRequestAudit] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_AiRequestAudit_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE TABLE [finance].[AiMessage] (
        [Id] nvarchar(36) NOT NULL,
        [ConversationId] nvarchar(36) NOT NULL,
        [RequestId] nvarchar(36) NOT NULL,
        [Question] nvarchar(4000) NOT NULL,
        [Answer] nvarchar(max) NOT NULL,
        [SourcesJson] nvarchar(max) NOT NULL,
        [Model] nvarchar(max) NOT NULL,
        [FinancialDataVerified] bit NOT NULL,
        [Feedback] int NOT NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_AiMessage] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_AiMessage_Feedback] CHECK ([Feedback] BETWEEN -1 AND 1),
        CONSTRAINT [FK_AiMessage_AiConversation_ConversationId] FOREIGN KEY ([ConversationId]) REFERENCES [finance].[AiConversation] ([Id]),
        CONSTRAINT [FK_AiMessage_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE INDEX [IX_AiConversation_ExpiresAt] ON [finance].[AiConversation] ([ExpiresAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE INDEX [IX_AiConversation_UserId_Archived_UpdatedAt] ON [finance].[AiConversation] ([UserId], [Archived], [UpdatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE INDEX [IX_AiMessage_ConversationId] ON [finance].[AiMessage] ([ConversationId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE UNIQUE INDEX [IX_AiMessage_RequestId] ON [finance].[AiMessage] ([RequestId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE INDEX [IX_AiMessage_UserId_ConversationId_CreatedAt_Id] ON [finance].[AiMessage] ([UserId], [ConversationId], [CreatedAt], [Id]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    CREATE INDEX [IX_AiRequestAudit_UserId_StartedAt] ON [finance].[AiRequestAudit] ([UserId], [StartedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013104647_AiScopeHistoryAudit'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261013104647_AiScopeHistoryAudit', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013110014_AiAtomicQuotaReservations'
)
BEGIN
    ALTER TABLE [finance].[AiUsageRecord] ADD [ReservedCost] decimal(20,10) NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013110014_AiAtomicQuotaReservations'
)
BEGIN
    ALTER TABLE [finance].[AiUsageRecord] ADD [State] nvarchar(40) NOT NULL DEFAULT N'Recorded';
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013110014_AiAtomicQuotaReservations'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261013110014_AiAtomicQuotaReservations', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013110502_AiConfigurationIdentifiers'
)
BEGIN
    DECLARE @var nvarchar(max);
    SELECT @var = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[finance].[AiRequestAudit]') AND [c].[name] = N'LedgerId');
    IF @var IS NOT NULL EXEC(N'ALTER TABLE [finance].[AiRequestAudit] DROP CONSTRAINT ' + @var + ';');
    ALTER TABLE [finance].[AiRequestAudit] ALTER COLUMN [LedgerId] nvarchar(64) NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013110502_AiConfigurationIdentifiers'
)
BEGIN
    DECLARE @var1 nvarchar(max);
    SELECT @var1 = QUOTENAME([d].[name])
    FROM [sys].[default_constraints] [d]
    INNER JOIN [sys].[columns] [c] ON [d].[parent_column_id] = [c].[column_id] AND [d].[parent_object_id] = [c].[object_id]
    WHERE ([d].[parent_object_id] = OBJECT_ID(N'[finance].[AiConfigurationSnapshot]') AND [c].[name] = N'Id');
    IF @var1 IS NOT NULL EXEC(N'ALTER TABLE [finance].[AiConfigurationSnapshot] DROP CONSTRAINT ' + @var1 + ';');
    ALTER TABLE [finance].[AiConfigurationSnapshot] ALTER COLUMN [Id] nvarchar(64) NOT NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013110502_AiConfigurationIdentifiers'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261013110502_AiConfigurationIdentifiers', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013111429_AiPersistentTransactionDrafts'
)
BEGIN
    CREATE TABLE [finance].[AiTransactionDraft] (
        [Id] nvarchar(36) NOT NULL,
        [RequestId] nvarchar(36) NOT NULL,
        [ResultJson] nvarchar(max) NOT NULL,
        [SourceHash] nvarchar(64) NOT NULL,
        [Source] nvarchar(max) NOT NULL,
        [State] nvarchar(40) NOT NULL,
        [TransactionId] nvarchar(36) NULL,
        [CreatedAt] datetimeoffset NOT NULL,
        [UserId] nvarchar(36) NOT NULL,
        [Version] bigint NOT NULL,
        CONSTRAINT [PK_AiTransactionDraft] PRIMARY KEY ([Id]),
        CONSTRAINT [CK_AiDraft_State] CHECK ([State] IN ('Draft','Confirmed','Deleted')),
        CONSTRAINT [FK_AiTransactionDraft_Transactions_TransactionId] FOREIGN KEY ([TransactionId]) REFERENCES [finance].[Transactions] ([Id]),
        CONSTRAINT [FK_AiTransactionDraft_Users_UserId] FOREIGN KEY ([UserId]) REFERENCES [finance].[Users] ([Id])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013111429_AiPersistentTransactionDrafts'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [IX_AiTransactionDraft_TransactionId] ON [finance].[AiTransactionDraft] ([TransactionId]) WHERE [TransactionId] IS NOT NULL');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013111429_AiPersistentTransactionDrafts'
)
BEGIN
    CREATE INDEX [IX_AiTransactionDraft_UserId_State_CreatedAt] ON [finance].[AiTransactionDraft] ([UserId], [State], [CreatedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013111429_AiPersistentTransactionDrafts'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261013111429_AiPersistentTransactionDrafts', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013115825_AiConsentVersion'
)
BEGIN
    ALTER TABLE [finance].[AiPrivacySetting] ADD [ConsentVersion] bigint NOT NULL DEFAULT CAST(1 AS bigint);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013115825_AiConsentVersion'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261013115825_AiConsentVersion', N'10.0.12');
END;

COMMIT;
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013120504_AiRequestConsentAudit'
)
BEGIN
    ALTER TABLE [finance].[AiRequestAudit] ADD [ConsentVersion] bigint NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261013120504_AiRequestConsentAudit'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261013120504_AiRequestConsentAudit', N'10.0.12');
END;

COMMIT;
GO

