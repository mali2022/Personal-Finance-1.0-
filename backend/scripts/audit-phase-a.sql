-- Personal Finance 3.0 Phase A: read-only inspection.
-- Execute against PersonalFinanceWeb only. No financial details or credentials returned.
SET NOCOUNT ON;
IF DB_NAME() <> N'PersonalFinanceWeb' THROW 51000, 'Unexpected audit database', 1;
SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ProductVersion')) AS ServerVersion;
SELECT name,recovery_model_desc,page_verify_option_desc,state_desc
FROM sys.databases WHERE name=DB_NAME();
SELECT MigrationId FROM dbo.__EFMigrationsHistory ORDER BY MigrationId;
SELECT t.name,SUM(p.rows) AS [RecordCount]
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
WHERE s.name='finance' GROUP BY t.name ORDER BY t.name;
SELECT CAST(t.name AS nvarchar(40)) AS TableName,
CAST(i.name AS nvarchar(100)) AS IndexName,i.is_unique,
CAST(i.filter_definition AS nvarchar(100)) AS FilterDefinition
FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id
WHERE t.schema_id=SCHEMA_ID('finance') AND i.name IS NOT NULL ORDER BY t.name,i.name;
SELECT CAST(OBJECT_NAME(parent_object_id) AS nvarchar(40)) AS TableName,
CAST(name AS nvarchar(100)) AS ConstraintName,is_disabled,is_not_trusted
FROM sys.check_constraints WHERE parent_object_id IN
(SELECT object_id FROM sys.tables WHERE schema_id=SCHEMA_ID('finance'));
SELECT COUNT(*) AS UnbalancedTransactions FROM
(SELECT TransactionId FROM finance.Entries GROUP BY TransactionId HAVING SUM(BaseAmount)<>0) b;
SELECT COUNT(*) AS MissingOrForeignTransactionAccounts
FROM finance.Transactions t LEFT JOIN finance.Accounts a ON a.Id=t.AccountId AND a.UserId=t.UserId WHERE a.Id IS NULL;
SELECT COUNT(*) AS MissingOrForeignEntryTransactions
FROM finance.Entries e LEFT JOIN finance.Transactions t ON t.Id=e.TransactionId AND t.UserId=e.UserId WHERE t.Id IS NULL;
SELECT COUNT(*) AS MissingOrForeignEntryCategories
FROM finance.Entries e LEFT JOIN finance.Categories c ON c.Id=e.CategoryId AND c.UserId=e.UserId
WHERE e.CategoryId IS NOT NULL AND c.Id IS NULL;
SELECT COUNT(*) AS InvalidRefundOrigins
FROM finance.Transactions r LEFT JOIN finance.Transactions t ON t.Id=r.OriginalTransactionId AND t.UserId=r.UserId
WHERE r.Type='Refund' AND r.Status<>'Deleted' AND (t.Id IS NULL OR t.Type<>'Expense' OR t.Status='Deleted' OR t.Currency<>r.Currency);
SELECT COUNT(*) AS OverRefundedTransactions FROM
(SELECT t.Id FROM finance.Transactions t JOIN finance.Transactions r ON r.OriginalTransactionId=t.Id
AND r.UserId=t.UserId AND r.Type='Refund' AND r.Status<>'Deleted'
GROUP BY t.Id,t.Amount HAVING SUM(r.Amount)>t.Amount) x;
SELECT COUNT(*) AS OrphanAttachments FROM finance.Documents d
LEFT JOIN finance.Transactions t ON t.Id=d.TransactionId AND t.UserId=d.UserId
WHERE d.Kind='Attachment' AND t.Id IS NULL;
SELECT COUNT(*) AS ImportedRowJsonStatusMismatch FROM finance.ImportRows
WHERE Status<>JSON_VALUE(DataJson,'$.status');
SELECT COUNT(*) AS Documents,COALESCE(SUM(DATALENGTH(Content)),0) AS DocumentBytes FROM finance.Documents;
SELECT COUNT(*) AS RecordedBackupSets FROM msdb.dbo.backupset WHERE database_name=DB_NAME();
SELECT TOP(10) backup_start_date,backup_finish_date,type,is_copy_only,has_backup_checksums
FROM msdb.dbo.backupset WHERE database_name=DB_NAME() ORDER BY backup_finish_date DESC;
DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS;
