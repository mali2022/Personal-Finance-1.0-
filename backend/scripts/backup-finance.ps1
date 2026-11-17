#Requires -Version 7.0
[CmdletBinding()]
param([string]$Server='.', [string]$Database='PersonalFinanceWeb')
. (Join-Path $PSScriptRoot 'recovery-common.ps1')
Assert-FinanceSource $Database
Assert-LocalSqlServer $Server
$root = Protect-RecoveryRoot
$id = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '_' + [Guid]::NewGuid().ToString('N')
$folder = Join-Path $root $id
New-Item -ItemType Directory -Path $folder | Out-Null
$file = Join-Path $folder 'database.bak'
$manifestPath = Join-Path $folder 'manifest.json'
$manifest = [ordered]@{
    formatVersion=1; backupId=$id; database=$Database; server=$Server; state='Started'
    startedAt=[DateTime]::UtcNow.ToString('o'); copyOnly=$true; checksum=$true
    attachmentStorage='SQL Documents.Content (included in database backup)'
    sessionRecovery='Rotate JWT signing key, regenerate Data Protection keys and revoke restored sessions before operational use'
}
Write-RecoveryJson $manifestPath $manifest
try {
    $snapshot = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'recovery-snapshot.sql') -Raw
    $literal = ConvertTo-SqlLiteral $file
    # Session-owned application locks allow BACKUP outside a transaction while financial writers wait.
    # Auth refresh sessions are intentionally excluded from the business fingerprint.
    $sql = @"
USE [PersonalFinanceWeb];
DECLARE @user nvarchar(36),@resource nvarchar(255),@lockResult int;
DECLARE users_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT Id FROM finance.Users ORDER BY Id;
OPEN users_cursor; FETCH NEXT FROM users_cursor INTO @user;
WHILE @@FETCH_STATUS=0
BEGIN
 SET @resource=N'finance-user:'+@user;
 EXEC @lockResult=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Session',@LockTimeout=10000;
 IF @lockResult<0 THROW 51000,'Unable to lock financial writes',1;
 FETCH NEXT FROM users_cursor INTO @user;
END;
CLOSE users_cursor; DEALLOCATE users_cursor;
BACKUP DATABASE [PersonalFinanceWeb] TO DISK=$literal WITH COPY_ONLY,CHECKSUM,STOP_ON_ERROR;
RESTORE VERIFYONLY FROM DISK=$literal WITH CHECKSUM,STOP_ON_ERROR;
$snapshot
"@
    $baseline = ConvertFrom-RecoverySqlJson (Invoke-RecoverySql $Server $sql $folder)
    $manifest['baseline'] = $baseline
    $manifest['fileBytes'] = (Get-Item -LiteralPath $file).Length
    $manifest['sha256'] = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    $manifest['finishedAt'] = [DateTime]::UtcNow.ToString('o')
    $manifest['state'] = 'Verified'
    Write-RecoveryJson $manifestPath $manifest
    Write-Output "备份完成并通过 SQL CHECKSUM/VERIFYONLY。编号：$id"
    Write-Output '尚需运行隔离恢复验证，VERIFYONLY 不等同恢复成功。'
} catch {
    $manifest['state']='Failed'; $manifest['error']=$_.Exception.Message
    $manifest['finishedAt']=[DateTime]::UtcNow.ToString('o')
    Write-RecoveryJson $manifestPath $manifest
    throw
}
