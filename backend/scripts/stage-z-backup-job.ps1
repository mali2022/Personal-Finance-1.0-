#Requires -Version 7.0
[CmdletBinding()]
param([switch]$VerifyRestore,[switch]$TestFailure)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'recovery-common.ps1')
$root=Protect-RecoveryRoot
$mutex=[Threading.Mutex]::new($false,'Local\PersonalFinanceStageZBackup')
if(-not $mutex.WaitOne(0)){throw '备份任务已运行'}
try {
 if($TestFailure){throw 'Controlled failure rehearsal before backup'}
 $result=& (Join-Path $PSScriptRoot 'backup-finance.ps1')
 $result | Write-Output
 if($VerifyRestore){
  $id=[regex]::Match(($result -join ' '),'\d{8}T\d{6}Z_[a-f0-9]{32}').Value
  if(-not $id){throw '未找到已验证备份编号'}
  & (Join-Path $PSScriptRoot 'verify-finance-restore.ps1') -BackupId $id
 }
 [IO.File]::AppendAllText((Join-Path $root 'scheduled-status.jsonl'),(@{time=[DateTimeOffset]::UtcNow.ToString('o');state='Passed';restoreRequested=[bool]$VerifyRestore}|ConvertTo-Json -Compress)+[Environment]::NewLine)
} catch {
 # Do not serialize exception messages containing database details to ordinary logs.
 [IO.File]::AppendAllText((Join-Path $root 'scheduled-status.jsonl'),(@{time=[DateTimeOffset]::UtcNow.ToString('o');state='Failed';code='BACKUP_JOB_FAILED'}|ConvertTo-Json -Compress)+[Environment]::NewLine)
 throw '备份任务失败；请检查受保护备份目录内清单。'
} finally {$mutex.ReleaseMutex();$mutex.Dispose()}
