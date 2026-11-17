-- 只读诊断：可以在SSMS整体执行；不删除或修改任何表/数据。
SET NOEXEC OFF;
USE master;
GO
SELECT @@SERVERNAME AS ServerName,DB_NAME() AS CurrentDatabase;
SELECT name,state_desc FROM sys.databases WHERE name IN (N'master',N'PersonalFinance');
SELECT SERVERPROPERTY('InstanceDefaultDataPath') AS ConfiguredDataPath,
 SERVERPROPERTY('InstanceDefaultLogPath') AS ConfiguredLogPath;
SELECT DB_NAME(database_id) AS DatabaseName,type_desc,physical_name
FROM sys.master_files WHERE database_id=1;
-- 若返回本项目表，说明先前失败后续批次曾错误执行到master；不要删除系统表。
SELECT s.name AS SchemaName,t.name AS ProjectTableInMaster,t.create_date
FROM master.sys.tables t JOIN master.sys.schemas s ON s.schema_id=t.schema_id
WHERE s.name=N'dbo' AND t.name IN (
N'Currencies',N'Users',N'AccountTypes',N'TransactionTypes',N'Sources',N'Counterparties',N'Tags',N'Projects',
N'Accounts',N'Categories',N'Merchants',N'Transactions',N'TransactionEntries',N'TransactionTags',N'Attachments',
N'Loans',N'Reimbursements',N'AccountReconciliations',N'ReconciledEntries',N'ExchangeRates',N'AuditLogs',
N'Budgets',N'BudgetItems',N'RecurringTransactions',N'RecurringEntries',N'RecurringOccurrences');
IF DB_ID(N'PersonalFinance') IS NOT NULL
 EXEC sys.sp_executesql N'SELECT N''PersonalFinance'' AS DatabaseName,s.name AS SchemaName,t.name AS TableName FROM PersonalFinance.sys.tables t JOIN PersonalFinance.sys.schemas s ON s.schema_id=t.schema_id ORDER BY s.name,t.name;';
GO
