#Requires -Version 7.0
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
if((Get-TimeZone).Id -ne 'China Standard Time'){throw '任务时区须先核对为北京时间'}
$job=(Resolve-Path (Join-Path $PSScriptRoot 'stage-z-backup-job.ps1')).Path
$exe=(Get-Command pwsh).Source
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$definitions=@(@{name='PersonalFinance-Z-Backup';args='';trigger=(New-ScheduledTaskTrigger -Daily -At '02:00')},@{name='PersonalFinance-Z-RestoreValidation';args=' -VerifyRestore';trigger=(New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '02:30')})
# Validate all names before changing Task Scheduler; never overwrite an existing task.
foreach($definition in $definitions){if(Get-ScheduledTask -TaskName $definition.name -ErrorAction SilentlyContinue){throw '同名任务已存在；拒绝覆盖'}}
foreach($definition in $definitions){
 $action=New-ScheduledTaskAction -Execute $exe -Argument ('-NoProfile -WindowStyle Hidden -File "'+$job+'"'+$definition.args)
 Register-ScheduledTask -TaskName $definition.name -Action $action -Trigger $definition.trigger -Principal $principal -Settings $settings -Description 'Personal Finance Z local protected backup/restore validation; signed-in user required'
}
