-- Local SQL Server default directory is invalid on this workstation.
-- Use the existing master database directory without changing server settings.
USE master;
SET NOCOUNT ON;
IF DB_ID(N'PersonalFinanceWeb') IS NULL
BEGIN
    DECLARE @master nvarchar(4000) = (SELECT physical_name FROM sys.master_files WHERE database_id=1 AND file_id=1);
    DECLARE @folder nvarchar(4000) = LEFT(@master,LEN(@master)-CHARINDEX('\',REVERSE(@master))+1);
    DECLARE @sql nvarchar(max) = N'CREATE DATABASE [PersonalFinanceWeb] ON PRIMARY (NAME=N''PersonalFinanceWeb'',FILENAME=N''' + REPLACE(@folder+N'PersonalFinanceWeb.mdf',N'''',N'''''') + N''') LOG ON (NAME=N''PersonalFinanceWeb_log'',FILENAME=N''' + REPLACE(@folder+N'PersonalFinanceWeb_log.ldf',N'''',N'''''') + N''');';
    EXEC sys.sp_executesql @sql;
END;
