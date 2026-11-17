-- MODULE 00_CreateDatabase
SET NOEXEC OFF;
USE master;
GO
-- 不使用可能失效的实例默认目录。沿用正在运行的 master 文件所在目录。
-- 路径来自SQL Server自身元数据，使用 sp_executesql 并转义字符串，不拼接用户输入。
IF DB_ID(N'PersonalFinance') IS NULL
BEGIN
 DECLARE @DataPath NVARCHAR(4000),@LogPath NVARCHAR(4000),@CreateSql NVARCHAR(MAX);
 SELECT TOP(1) @DataPath=physical_name FROM sys.master_files WHERE database_id=1 AND type=0 ORDER BY file_id;
 SELECT TOP(1) @LogPath=physical_name FROM sys.master_files WHERE database_id=1 AND type=1 ORDER BY file_id;
 SET @DataPath=LEFT(@DataPath,LEN(@DataPath)-CHARINDEX(N'\',REVERSE(@DataPath))+1)+N'PersonalFinance.mdf';
 SET @LogPath=LEFT(@LogPath,LEN(@LogPath)-CHARINDEX(N'\',REVERSE(@LogPath))+1)+N'PersonalFinance_log.ldf';
 IF @DataPath IS NULL OR @LogPath IS NULL THROW 51500,N'无法确定数据库文件目录。',1;
 SET @CreateSql=N'CREATE DATABASE PersonalFinance ON PRIMARY (NAME=N''PersonalFinance'',FILENAME=N'''
  +REPLACE(@DataPath,N'''',N'''''')+N''',SIZE=32MB,FILEGROWTH=64MB) LOG ON (NAME=N''PersonalFinance_log'',FILENAME=N'''
  +REPLACE(@LogPath,N'''',N'''''')+N''',SIZE=16MB,FILEGROWTH=64MB);';
 EXEC sys.sp_executesql @CreateSql;
END;
GO
-- GO 后 SSMS 会继续执行：单纯 THROW 不足以阻止后续批次，必须关闭执行。
IF DB_ID(N'PersonalFinance') IS NULL
BEGIN
 RAISERROR(N'安装中止：PersonalFinance建库失败。后续批次不会写入master。请修正错误后重新执行完整文件。',16,1);
 SET NOEXEC ON;
END;
GO
USE PersonalFinance;
GO
IF DB_NAME()<>N'PersonalFinance'
BEGIN
 RAISERROR(N'安装中止：当前数据库不是PersonalFinance。',16,1);
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
