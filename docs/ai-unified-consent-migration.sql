BEGIN TRANSACTION;
ALTER TABLE [finance].[AiPrivacySetting] ADD [FullFinancialAccess] bit NOT NULL DEFAULT CAST(0 AS bit);

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20261028102517_AiUnifiedFinancialConsent', N'10.0.12');

COMMIT;
GO

