-- Invoked in the selected database. Hashes retain financial equality without outputting amounts.
DECLARE @tables table(Name sysname, OrderColumns nvarchar(200));
INSERT @tables
SELECT t.name,STRING_AGG(CONVERT(nvarchar(max),QUOTENAME(c.name)),N',') WITHIN GROUP(ORDER BY ic.key_ordinal)
FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id AND i.is_primary_key=1
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE t.schema_id=SCHEMA_ID('finance') AND t.name<>'Sessions'
GROUP BY t.name;
IF (SELECT COUNT(*) FROM @tables)<>(SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID('finance') AND name<>'Sessions')
THROW 51000,'Business table without stable primary key',1;
DECLARE @results table(Name sysname, RecordCount bigint, ContentHash varchar(64));
DECLARE @name sysname, @order nvarchar(200), @count bigint, @hash varchar(64), @sql nvarchar(max);
DECLARE tables_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT Name,OrderColumns FROM @tables ORDER BY Name;
OPEN tables_cursor;
FETCH NEXT FROM tables_cursor INTO @name,@order;
WHILE @@FETCH_STATUS=0
BEGIN
    SET @sql=N'SELECT @n=COUNT_BIG(*) FROM finance.'+QUOTENAME(@name)+N';
SELECT @h=CONVERT(varchar(64),HASHBYTES(''SHA2_256'',CONVERT(varbinary(max),
(SELECT * FROM finance.'+QUOTENAME(@name)+N' ORDER BY '+@order+N' FOR JSON PATH,INCLUDE_NULL_VALUES))),2);';
    EXEC sys.sp_executesql @sql,N'@n bigint OUTPUT,@h varchar(64) OUTPUT',@n=@count OUTPUT,@h=@hash OUTPUT;
    INSERT @results VALUES(@name,@count,@hash);
    FETCH NEXT FROM tables_cursor INTO @name,@order;
END;
CLOSE tables_cursor; DEALLOCATE tables_cursor;
PRINT 'PF_JSON_BEGIN';
SELECT
JSON_QUERY((SELECT MigrationId FROM dbo.__EFMigrationsHistory ORDER BY MigrationId FOR JSON PATH)) AS migrations,
JSON_QUERY((SELECT Name AS name,RecordCount AS count,ContentHash AS hash FROM @results ORDER BY Name FOR JSON PATH)) AS tables,
(SELECT COUNT_BIG(*) FROM finance.Documents WHERE Kind='Attachment') AS attachmentCount,
(SELECT COALESCE(SUM(CONVERT(bigint,DATALENGTH(Content))),0) FROM finance.Documents WHERE Kind='Attachment') AS attachmentBytes,
CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),
(SELECT a.Id,a.Currency,a.OpeningBalance+COALESCE((SELECT SUM(e.Amount) FROM finance.Entries e
JOIN finance.Transactions t ON t.Id=e.TransactionId WHERE e.UserId=a.UserId AND e.AccountId=a.Id AND t.Status<>'Deleted'),0) AS balance
FROM finance.Accounts a ORDER BY a.Id FOR JSON PATH,INCLUDE_NULL_VALUES))),2) AS accountBalancesHash
FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;
PRINT 'PF_JSON_END';
