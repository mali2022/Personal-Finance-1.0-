#Requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupId, [string]$Server='.')
. (Join-Path $PSScriptRoot 'recovery-common.ps1')
Assert-LocalSqlServer $Server
$manifest = Read-VerifiedManifest $BackupId
$folder = Get-ProtectedBackupFolder $BackupId
$target = 'PersonalFinanceWeb_RestoreCheck_' + [Guid]::NewGuid().ToString('N')
Assert-FinanceTarget $target
$run = Join-Path $folder ('restore-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run | Out-Null
$recordPath = Join-Path $run 'verification.json'
$record = [ordered]@{ formatVersion=1; backupId=$BackupId; database=$target; state='Started'; startedAt=[DateTime]::UtcNow.ToString('o') }
Write-RecoveryJson $recordPath $record
try {
    $file = ConvertTo-SqlLiteral (Join-Path $folder 'database.bak')
    # This FILELISTONLY layout is validated for the current SQL Server 17 instance.
    # Unsupported layouts fail before RESTORE; no source-file paths are reused.
    $sql = @"
IF DB_ID(N'$target') IS NOT NULL THROW 51000,'Verification target already exists',1;
RESTORE VERIFYONLY FROM DISK=$file WITH CHECKSUM,STOP_ON_ERROR;
CREATE TABLE #files(LogicalName nvarchar(128),PhysicalName nvarchar(260),Type char(1),FileGroupName nvarchar(128),Size numeric(20,0),MaxSize numeric(20,0),FileId bigint,CreateLSN numeric(25,0),DropLSN numeric(25,0),UniqueId uniqueidentifier,ReadOnlyLSN numeric(25,0),ReadWriteLSN numeric(25,0),BackupSizeInBytes bigint,SourceBlockSize int,FileGroupId int,LogGroupGUID uniqueidentifier,DifferentialBaseLSN numeric(25,0),DifferentialBaseGUID uniqueidentifier,IsReadOnly bit,IsPresent bit,TDEThumbprint varbinary(32),SnapshotURL nvarchar(360));
INSERT #files EXEC('RESTORE FILELISTONLY FROM DISK='+$(ConvertTo-SqlLiteral $file));
IF EXISTS(SELECT 1 FROM #files WHERE Type NOT IN('D','L') OR IsPresent<>1) THROW 51000,'Unsupported backup file layout',1;
DECLARE @moves nvarchar(max),@restore nvarchar(max);
SELECT @moves=STRING_AGG(CONVERT(nvarchar(max),N', MOVE '+QUOTENAME(LogicalName,'''')+N' TO '+
N''''+REPLACE($(ConvertTo-SqlLiteral ($run + '\'))+N'file-'+CONVERT(nvarchar(20),FileId)+CASE WHEN Type='L' THEN N'.ldf' ELSE N'.mdf' END,N'''',N'''''')+N''''),N'') FROM #files;
IF @moves IS NULL THROW 51000,'No database files found',1;
SET @restore=N'RESTORE DATABASE [$target] FROM DISK='+$(ConvertTo-SqlLiteral $file)+N' WITH CHECKSUM,STOP_ON_ERROR,RECOVERY'+@moves;
EXEC(@restore);
"@
    $null = Invoke-RecoverySql $Server $sql $run
    $snapshot = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'recovery-snapshot.sql') -Raw
    $actual = ConvertFrom-RecoverySqlJson (Invoke-RecoverySql $Server "USE [$target];`n$snapshot" $run)
    if (($actual | ConvertTo-Json -Depth 100 -Compress) -cne ($manifest.baseline | ConvertTo-Json -Depth 100 -Compress)) {
        Write-RecoveryJson (Join-Path $run 'actual-baseline.json') $actual
        throw '恢复后业务表、附件、迁移或账户余额指纹不一致。'
    }
    $integrity = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'recovery-integrity.sql') -Raw
    $result = Invoke-RecoverySql $Server "USE [$target];`n$integrity" $run
    if ($result -notmatch 'PF_INTEGRITY_PASSED') { throw '完整性验证未完成。' }
    if ($actual.tables.name -contains 'RecurringRules') {
        $planning = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'planning-integrity.sql') -Raw
        $planningResult = Invoke-RecoverySql $Server "USE [$target];`n$planning" $run
        if ($planningResult -notmatch 'PF_PLANNING_INTEGRITY_PASSED') { throw '规划数据完整性验证未完成。' }
        $record['planningChecksPassed']=$true
    }
    # Lock down the restored verification copy; never alter production sessions/configuration.
    $null = Invoke-RecoverySql $Server "USE [$target]; UPDATE finance.Sessions SET Revoked=1,Version=Version+1; USE master; ALTER DATABASE [$target] SET READ_ONLY WITH NO_WAIT;" $run
    $record['state']='Passed'; $record['businessFingerprintsMatch']=$true
    $record['checkDbPassed']=$true; $record['constraintsPassed']=$true
    $record['financialChecksPassed']=$true; $record['restoredSessionsRevoked']=$true; $record['readOnly']=$true
    $record['attachmentCount']=$actual.attachmentCount; $record['attachmentBytes']=$actual.attachmentBytes
    $record['finishedAt']=[DateTime]::UtcNow.ToString('o')
    Write-RecoveryJson $recordPath $record
    Write-Output "隔离恢复验证通过：$target"
    Write-Output '验证副本已撤销会话并设为只读，保留供检查；正式账本未被覆盖。'
} catch {
    $record['state']='Failed'; $record['error']=$_.Exception.Message
    try {
        $null = Invoke-RecoverySql $Server "IF EXISTS(SELECT 1 FROM sys.databases WHERE name=N'$target' AND state_desc='ONLINE') BEGIN EXEC(N'USE [$target]; IF OBJECT_ID(N''finance.Sessions'') IS NOT NULL UPDATE finance.Sessions SET Revoked=1,Version=Version+1;'); ALTER DATABASE [$target] SET READ_ONLY WITH NO_WAIT; END;" $run
        $record['failedCopyQuarantined']=$true
    } catch {
        $record['failedCopyQuarantined']=$false
        $record['quarantineError']=$_.Exception.Message
    }
    $record['finishedAt']=[DateTime]::UtcNow.ToString('o')
    Write-RecoveryJson $recordPath $record
    throw
}
