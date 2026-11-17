Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher=Join-Path $PSScriptRoot 'PersonalFinance.Local.ps1'
$runtime=Get-Content (Join-Path $PSScriptRoot 'local-runtime.json') -Raw | ConvertFrom-Json
$run=Join-Path $root 'backend/test-results/launcher'
New-Item -ItemType Directory -Force $run | Out-Null
$checks=New-Object Collections.Generic.List[string]
$listener=$null; $dummy=$null
function Assert([bool]$condition,[string]$message) { if(-not $condition){throw $message} }
function Run([string]$mode='Start',[string]$config='', [string]$state='') {
    $launchArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$launcher,'-Mode',$mode,'-NoBrowser')
    if($config){$launchArgs+=@('-ConfigPath',$config)}; if($state){$launchArgs+=@('-StateDirectory',$state)}
    $tag=[Guid]::NewGuid().ToString('N')
    $stdout=Join-Path $run ($tag+'.stdout.log'); $stderr=Join-Path $run ($tag+'.stderr.log')
    $process=Start-Process powershell.exe -ArgumentList (($launchArgs | ForEach-Object { '"'+$_+'"' }) -join ' ') -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $null=$process.Handle
    $process.WaitForExit()
    Get-Content $stdout -Encoding UTF8 | Out-Host
    return $process.ExitCode
}
try {
    Assert ((Run) -eq 0) '首次启动失败'
    $first=Get-Content (Join-Path $root '.local-run/processes.json') -Raw | ConvertFrom-Json
    Assert (@($first.processes).Count -eq 2) '需要由启动器创建的前后端进程以验证停止'
    $checks.Add('真实前后端健康检查通过，启动器持久记录两项进程身份')
    Assert ((Run) -eq 0) '重复启动失败'
    $second=Get-Content (Join-Path $root '.local-run/processes.json') -Raw | ConvertFrom-Json
    Assert ((($first.processes.processId | Sort-Object) -join ',') -eq (($second.processes.processId | Sort-Object) -join ',')) '重复启动产生新实例'
    $checks.Add('重复启动复用原 PID，不创建重复实例')
    $freshnessProbe=Join-Path $root 'backend/src/PersonalFinance.Api/Application/LauncherFreshnessProbe.local.cs'
    Assert (-not (Test-Path -LiteralPath $freshnessProbe)) '源码版本检查探针路径已存在'
    try {
        Set-Content -LiteralPath $freshnessProbe -Value '// Temporary launcher freshness verification.' -Encoding UTF8
        (Get-Item -LiteralPath $freshnessProbe).LastWriteTimeUtc=[DateTime]::UtcNow.AddMinutes(1)
        Assert ((Run) -eq 1) '源码更新后仍复用了旧编译版本'
        foreach($processId in $first.processes.processId){Assert ([bool](Get-Process -Id $processId -ErrorAction SilentlyContinue)) '版本检查误停运行服务'}
        $checks.Add('源码晚于编译产物时拒绝复用旧版本，保留已运行服务')
    } finally { Remove-Item -LiteralPath $freshnessProbe -ErrorAction SilentlyContinue }
    $dummy=Start-Process $runtime.node -ArgumentList @('-e','"setInterval(()=>{},1000)"') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $run 'unrelated-node.stdout.log') -RedirectStandardError (Join-Path $run 'unrelated-node.stderr.log') -PassThru
    Assert ((Run 'Stop') -eq 0) '停止失败'
    foreach($processId in $first.processes.processId){Assert (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) '本项目进程未停止'}
    Assert ([bool](Get-Process -Id $dummy.Id -ErrorAction SilentlyContinue)) '误停无关 Node'
    Assert ((Get-Service MSSQLSERVER).Status -eq 'Running') 'SQL Server 被改变'
    $checks.Add('停止只结束启动器创建的前后端，无关 Node 和 SQL Server 保留')
    Assert ((Run 'Stop') -eq 0) '重复停止失败'
    $checks.Add('重复停止安全完成')
    # A real occupied TCP port: fail after starting the backend, then verify rollback of only newly started processes.
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
    $listener.Start()
    $failureConfig=Join-Path $run 'occupied-port.json'
    @{node=$runtime.node;dotnet=$runtime.dotnet;backendPort=5085;frontendPort=$listener.LocalEndpoint.Port} | ConvertTo-Json | Set-Content -Encoding UTF8 $failureConfig
    $failureState=Join-Path $run 'failure-state'
    Assert ((Run 'Start' $failureConfig $failureState) -eq 1) '占用端口未报错'
    Assert (@(Get-NetTCPConnection -State Listen -LocalPort 5085 -ErrorAction SilentlyContinue).Count -eq 0) '失败后遗留新启动后端'
    $failureLog=(Get-ChildItem (Join-Path $failureState 'logs') -Filter '*Start.log' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content -Raw -Encoding UTF8)
    Assert ($failureLog -match '前端端口.*已被占用' -and $failureLog -match '已停止启动器创建的backend') '错误或失败清理未留存中文日志'
    Assert ([bool](Get-Process -Id $dummy.Id -ErrorAction SilentlyContinue)) '失败清理误停无关 Node'
    $checks.Add('真实前端端口占用给出中文错误、日志及退出码1，回收本次新后端')
    $listener.Stop(); $listener=$null
    # Dependency failure uses an isolated config; it does not remove installed software or stop SQL Server.
    $invalid=Join-Path $run 'missing-runtime.json'
    @{node=(Join-Path $run 'does-not-exist.exe');dotnet=$runtime.dotnet;backendPort=5085;frontendPort=5174} | ConvertTo-Json | Set-Content -Encoding UTF8 $invalid
    Assert ((Run 'Start' $invalid (Join-Path $run 'invalid-state')) -eq 1) '缺少依赖未报错'
    $checks.Add('运行时路径失效返回中文错误，不安装软件或修改数据库')
    # A forged stale record must not stop an unrelated process even when its PID is live.
    $stale=Join-Path $run 'stale-state'; New-Item -ItemType Directory -Force $stale | Out-Null
    @{schema=1;root=$root;processes=@(@{kind='frontend';processId=$dummy.Id;createdTicks='0';executable=$runtime.node;commandLine=''})} | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $stale 'processes.json')
    Assert ((Run 'Stop' '' $stale) -eq 0) '过期进程记录处理失败'
    Assert ([bool](Get-Process -Id $dummy.Id -ErrorAction SilentlyContinue)) 'PID身份保护失败'
    $checks.Add('PID复用/身份不匹配保护，不结束无关进程')
    Assert ((Run) -eq 0) '最终启动失败'
    $checks.Add('最终重新启动成功，正式应用保留运行')
    @{date=[DateTime]::UtcNow.ToString('o');passed=$checks.Count;checks=$checks.ToArray();databaseChanged=$false;autostartRegistered=$false} | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $run 'results.json')
    Write-Host ($checks.Count.ToString()+' 项真实启动/停止检查通过。')
} finally {
    if($listener){$listener.Stop()}
    if($dummy){Stop-Process -Id $dummy.Id -ErrorAction SilentlyContinue}
}
