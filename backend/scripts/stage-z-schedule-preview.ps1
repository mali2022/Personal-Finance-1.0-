#Requires -Version 7.0
param([Parameter(Mandatory)][string]$OutputFile)
$ErrorActionPreference='Stop'
$hostExe=(Get-Command pwsh).Source
$job=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'stage-z-backup-job.ps1'))
@{taskName='PersonalFinance-Z-Backup';executable=$hostExe;arguments='-NoProfile -File "'+$job+'"';schedule='每日 Asia/Shanghai 02:00，错过启动后补运行，不重叠执行';weeklyValidation='每周日调用相同任务并增加 -VerifyRestore；会保留新恢复副本，须监控磁盘';registered=$false;overwriteExistingTask=$false;account='当前 Windows 账户；需本机 SQL 备份及独立新库恢复权限，凭据不写入任务参数'}|ConvertTo-Json|Set-Content -LiteralPath $OutputFile
