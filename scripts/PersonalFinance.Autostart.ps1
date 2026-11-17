param([ValidateSet('Enable','Disable','Delete','Status')][string]$Mode='Status')
Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$digest=[Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))
$suffix=([BitConverter]::ToString($digest) -replace '-','').Substring(0,12)
$name='PersonalFinance-'+$suffix
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
try {
    $existing=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($Mode -eq 'Enable') {
        $answer=Read-Host '是否为当前用户注册登录后自动启动 Personal Finance 的任务？输入 YES 确认，其他输入取消'
        if ($answer -cne 'YES') { Write-Host '已取消，未注册任务。'; exit 0 }
        if ($existing) {
            if ($existing.Actions.Execute -notlike '*powershell.exe' -or $existing.Actions.Arguments -notlike ('*'+(Join-Path $PSScriptRoot 'PersonalFinance.Local.ps1')+'*')) { throw '同名任务内容与本项目不匹配，拒绝覆盖。' }
            Enable-ScheduledTask -TaskName $name | Out-Null
            Write-Host ('已启用现有登录自启动任务：'+$name)
            exit 0
        }
        $script=Join-Path $PSScriptRoot 'PersonalFinance.Local.ps1'
        $arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$script+'" -Mode Start'
        $action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $root
        $trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
        $trigger.Delay='PT30S'
        $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
        $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
        Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description ('当前用户登录后启动 '+$root+'；不初始化或迁移数据库。') | Out-Null
        Write-Host ('已注册任务：'+$name+'。登录后延迟30秒启动，并在服务就绪后打开浏览器。')
    } elseif ($Mode -eq 'Status') {
        if ($existing) { Write-Host ('任务：'+$name+'；状态：'+$existing.State); Get-ScheduledTaskInfo -TaskName $name | Select-Object LastRunTime,LastTaskResult,NextRunTime }
        else { Write-Host ('尚未注册登录自启动任务：'+$name) }
    } elseif ($existing) {
        if ($existing.Actions.Execute -notlike '*powershell.exe' -or $existing.Actions.Arguments -notlike ('*'+(Join-Path $PSScriptRoot 'PersonalFinance.Local.ps1')+'*')) { throw '任务内容与本项目不匹配，拒绝操作。' }
        if ($Mode -eq 'Disable') { Disable-ScheduledTask -TaskName $name | Out-Null; Write-Host '已关闭登录自启动。当前应用仍可手动启动。' }
        else { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Host '已删除登录自启动任务。项目、数据库和日志均保留。' }
    } else { Write-Host '未找到本项目的自启动任务，无需操作。' }
} catch { Write-Host ('自启动设置失败：'+$_.Exception.Message); exit 1 }
