param(
    [ValidateSet('Start','Stop','Status')][string]$Mode='Start',
    [switch]$NoBrowser,
    [switch]$Static,
    [string]$ConfigPath,
    [string]$StateDirectory,
    [int]$ReadyTimeoutSeconds=60
)
Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $ConfigPath) { $ConfigPath=Join-Path $PSScriptRoot 'local-runtime.json' }
if (-not $StateDirectory) { $StateDirectory=Join-Path $root '.local-run' }
$StateDirectory=[IO.Path]::GetFullPath($StateDirectory)
New-Item -ItemType Directory -Force -Path $StateDirectory | Out-Null
$logDirectory=Join-Path $StateDirectory 'logs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss-fff'
$log=Join-Path $logDirectory ($stamp+'-'+$Mode+'.log')
$stateFile=Join-Path $StateDirectory 'processes.json'
$utf8=New-Object Text.UTF8Encoding($false)
function Log([string]$message) {
    $line='['+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')+'] '+$message
    [IO.File]::AppendAllText($log,$line+[Environment]::NewLine,$utf8)
    Write-Host $line
}
function Resolve-Runtime([string]$name,[string]$configured,[string[]]$candidates) {
    $values=New-Object Collections.Generic.List[string]
    if ($configured) { $values.Add($configured) }
    $environmentValue=[Environment]::GetEnvironmentVariable('PF_'+$name.ToUpperInvariant())
    if ($environmentValue) { $values.Add($environmentValue) }
    $command=Get-Command $name -ErrorAction SilentlyContinue
    if ($command -and $command.Source) { $values.Add($command.Source) }
    foreach ($candidate in $candidates) { if ($candidate) { $values.Add($candidate) } }
    foreach ($candidate in $values) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return [IO.Path]::GetFullPath($candidate) }
    }
    throw ('找不到 '+$name+' 运行时。请安装后重试，或用环境变量 PF_'+$name.ToUpperInvariant()+' / scripts/local-runtime.json 指定可执行文件路径。')
}
function SaveState {
    $temporary=$stateFile+'.tmp'
    [IO.File]::WriteAllText($temporary,(@{schema=1;root=$root;processes=@($script:owned)} | ConvertTo-Json -Depth 8),$utf8)
    Move-Item -LiteralPath $temporary -Destination $stateFile -Force
}
function GetProcessRecord([int]$processId) {
    Get-CimInstance Win32_Process -Filter ('ProcessId='+$processId) -ErrorAction SilentlyContinue
}
function IsOwned($record) {
    $process=GetProcessRecord ([int]$record.processId)
    return $null -ne $process -and $process.CreationDate.ToUniversalTime().Ticks.ToString() -ceq $record.createdTicks -and $process.ExecutablePath -ieq $record.executable -and $process.CommandLine -ceq $record.commandLine
}
function StopOwned($record) {
    if (-not (IsOwned $record)) { Log ('忽略已退出或身份不匹配的进程：'+$record.kind); return }
    # Snapshot descendants while the verified root is alive; recheck identity before every stop.
    $all=@(Get-CimInstance Win32_Process)
    $children=New-Object Collections.Generic.List[object]
    $parents=@([int]$record.processId)
    while ($parents.Count -gt 0) {
        $next=@($all | Where-Object { $_.ParentProcessId -in $parents -and $_.CreationDate.ToUniversalTime().Ticks -ge [long]$record.createdTicks })
        foreach ($child in $next) { $children.Add($child) }
        $parents=@($next | ForEach-Object { [int]$_.ProcessId })
    }
    if (IsOwned $record) { Stop-Process -Id ([int]$record.processId) -ErrorAction SilentlyContinue }
    foreach ($child in @($children.ToArray()) | Sort-Object CreationDate -Descending) {
        $live=GetProcessRecord ([int]$child.ProcessId)
        if ($live -and $live.CreationDate -eq $child.CreationDate -and $live.ExecutablePath -ieq $child.ExecutablePath -and $live.CommandLine -ceq $child.CommandLine) { Stop-Process -Id ([int]$child.ProcessId) -ErrorAction SilentlyContinue }
    }
    Log ('已停止启动器创建的'+$record.kind+'，PID '+$record.processId)
}
function Listeners([int]$port) {
    @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}
function Healthy([string]$url,[bool]$api) {
    try {
        $response=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
        if ($response.StatusCode -ne 200) { return $false }
        if ($api) { return ($response.Content | ConvertFrom-Json).status -eq 'healthy' }
        return $response.Content -match '<title>Personal Finance'
    } catch { return $false }
}
function WaitReady([string]$url,[bool]$api,$record) {
    $deadline=[DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    do {
        if (Healthy $url $api) { return }
        if (-not (IsOwned $record)) { throw ($record.kind+'进程提前退出，请查看对应的 stdout/stderr 日志。') }
        if ($api) {
            $probe = & curl.exe -s --max-time 3 $url 2>$null
            if ($probe -match '"code":"SCHEMA_OUTDATED"') {
                throw '本地数据库结构落后于当前程序（SCHEMA_OUTDATED）。请先备份数据库，再运行“备份并升级本地数据库.bat”，或按文档执行 --initialize-db；启动器不会自动迁移数据库。'
            }
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw ($record.kind+'启动超时（'+$ReadyTimeoutSeconds+'秒），请查看日志。')
}
function StartOwned([string]$kind,[string]$executable,[string[]]$arguments,[string]$workingDirectory) {
    foreach ($argument in $arguments) { if ($argument.Contains('"')) { throw '启动路径不能包含双引号。' } }
    $quoted=($arguments | ForEach-Object { '"'+$_+'"' }) -join ' '
    $process=Start-Process -FilePath $executable -ArgumentList $quoted -WorkingDirectory $workingDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory ($stamp+'-'+$kind+'.stdout.log')) -RedirectStandardError (Join-Path $logDirectory ($stamp+'-'+$kind+'.stderr.log')) -PassThru
    $info=GetProcessRecord $process.Id
    if (-not $info) { throw ($kind+'无法启动。') }
    $record=[pscustomobject]@{kind=$kind;processId=$process.Id;createdTicks=$info.CreationDate.ToUniversalTime().Ticks.ToString();executable=$info.ExecutablePath;commandLine=$info.CommandLine}
    $script:owned+=@($record); $script:created+=@($record); SaveState
    Log ('已启动'+$kind+'，PID '+$process.Id)
    return $record
}
$lock=$null; $script:owned=@(); $script:created=@(); $code=0
try {
    try { $lock=[IO.File]::Open((Join-Path $StateDirectory 'launcher.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
    catch { throw '另一次启动或停止正在执行，请稍后再试。' }
    if (Test-Path -LiteralPath $stateFile) {
        $state=Get-Content -LiteralPath $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($state.schema -ne 1 -or $state.root -cne $root) { throw '进程记录格式或项目路径不匹配，已拒绝停止任何进程。' }
        $script:owned=@($state.processes)
    }
    if ($Mode -eq 'Stop') {
        foreach ($record in @($script:owned | Sort-Object kind -Descending)) { StopOwned $record }
        $script:owned=@(); SaveState
        Log '停止完成。未由启动器创建的服务、SQL Server 和浏览器均保留运行。'
    } elseif ($Mode -eq 'Status') {
        foreach ($record in $script:owned) { Log ($record.kind+'：'+$(if(IsOwned $record){'运行中'}else{'已退出或身份不匹配'})) }
        Log ('日志目录：'+$logDirectory)
    } else {
        $config = if (Test-Path -LiteralPath $ConfigPath) {
            Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        } else {
            [pscustomobject]@{ node=''; dotnet=''; backendPort=5085; frontendPort=5174 }
        }
        if (-not $config.backendPort) { $config | Add-Member -NotePropertyName backendPort -NotePropertyValue 5085 }
        if (-not $config.frontendPort) { $config | Add-Member -NotePropertyName frontendPort -NotePropertyValue 5174 }
        $node=$null
        if (-not $Static) {
            $node=Resolve-Runtime 'node' $config.node @(
                (Join-Path $root '.tools\node\node.exe'),
                (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
                (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
                (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
                (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'),
                (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe')
            )
        }
        $dotnet=Resolve-Runtime 'dotnet' $config.dotnet @(
            (Join-Path $root '.tools\dotnet\dotnet.exe'),
            (Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'),
            (Join-Path $env:LOCALAPPDATA 'Microsoft\dotnet\dotnet.exe'),
            (Join-Path $env:USERPROFILE '.dotnet\dotnet.exe')
        )
        if (-not $Static) {
            $nodeVersion=(& $node -v).TrimStart('v')
            if ([int]($nodeVersion.Split('.')[0]) -lt 20) { throw ('Node 版本过低（'+$nodeVersion+'），需要 Node 20 或更高版本。') }
        }
        $dotnetVersion=(& $dotnet --version).Trim()
        if ([int]($dotnetVersion.Split('.')[0]) -lt 10) { throw ('dotnet 版本过低（'+$dotnetVersion+'），需要 .NET 10 SDK 或运行时。') }
        $runtimeText = if ($Static) { 'static（后端托管前端，不需要 Node）' } else { 'node='+$node+' ('+$nodeVersion+')' }
        Log ('运行时：'+$runtimeText+'，dotnet='+$dotnet+' ('+$dotnetVersion+')')
        $development=Get-Content (Join-Path $root 'backend/src/PersonalFinance.Api/appsettings.Development.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $connection=$development.ConnectionStrings.Finance
        if ($env:ConnectionStrings__Finance) { $connection=$env:ConnectionStrings__Finance }
        $builder=New-Object System.Data.SqlClient.SqlConnectionStringBuilder($connection)
        if ($builder.DataSource -notin @('.','(local)','localhost',$env:COMPUTERNAME) -or $builder.InitialCatalog -ne 'PersonalFinanceWeb') { throw '当前数据库配置与已核实的本机默认实例 PersonalFinanceWeb 不符；请人工核对，启动器不修改配置或数据库。' }
        $service=Get-Service -Name 'MSSQLSERVER' -ErrorAction SilentlyContinue
        if (-not $service) { throw '找不到 SQL Server 默认实例服务 MSSQLSERVER，请检查 SQL Server 安装。' }
        if ($service.Status -ne 'Running') {
            Log 'SQL Server 数据库服务未运行，正在启动 MSSQLSERVER。'
            try {
                Start-Service -Name 'MSSQLSERVER' -ErrorAction Stop
                $service.WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
            } catch {
                Log '启动数据库服务需要管理员权限，请在 Windows 用户账户控制提示中允许。'
                $helper=Join-Path $PSScriptRoot 'Start-PersonalFinance.Database.ps1'
                try {
                    $elevated=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -ArgumentList ('-NoLogo -NoProfile -ExecutionPolicy Bypass -File "'+$helper+'"') -Verb RunAs -WindowStyle Hidden -PassThru
                    $null=$elevated.Handle
                    if (-not $elevated.WaitForExit(60000)) { throw '管理员授权或服务启动等待超时，请完成授权后重新启动。' }
                    if ($elevated.ExitCode -ne 0) { throw '数据库服务启动失败，请检查 Windows 事件查看器中的 SQL Server 错误。' }
                } catch { throw ('无法启动数据库服务：'+$_.Exception.Message+' 可在 services.msc 中启动 SQL Server (MSSQLSERVER) 后重试。') }
            }
            $service.Refresh()
            if ($service.Status -ne 'Running') { throw 'SQL Server 数据库服务尚未就绪，请稍后重新启动。' }
        }
        Log 'SQL Server 默认实例服务 MSSQLSERVER 正在运行。'
        $databaseConnection=New-Object System.Data.SqlClient.SqlConnection($connection)
        try {
            $databaseConnection.Open()
            $command=$databaseConnection.CreateCommand()
            $command.CommandText='SELECT 1'
            $null=$command.ExecuteScalar()
            Log 'PersonalFinanceWeb 数据库连接检查通过。'
        } catch { throw ('数据库 PersonalFinanceWeb 无法连接：'+$_.Exception.Message) }
        finally { $databaseConnection.Dispose() }
        $script:owned=@($script:owned | Where-Object { IsOwned $_ }); SaveState
        $apiUrl='http://127.0.0.1:'+([int]$config.backendPort)+'/api/health'
        $pageUrl=if ($Static) { 'http://127.0.0.1:'+([int]$config.backendPort)+'/' } else { 'http://127.0.0.1:'+([int]$config.frontendPort)+'/' }
        $backend=Join-Path $root 'backend/src/PersonalFinance.Api'
        $dll=Join-Path $backend 'bin/Debug/net10.0/PersonalFinance.Api.dll'
        $front=Join-Path $root 'frontend'
        $vite=Join-Path $front 'node_modules/vite/bin/vite.js'
        $wwwroot=Join-Path $backend 'wwwroot'
        if (-not (Test-Path $dll)) { throw '缺少已构建后端。请先按项目文档构建；启动器不会自动构建或迁移数据库。' }
        if ($Static) {
            if (-not (Test-Path (Join-Path $wwwroot 'index.html'))) { throw '静态模式缺少 backend/src/PersonalFinance.Api/wwwroot/index.html。请先把 frontend/dist 复制到该目录，或改用普通启动模式。' }
        } elseif (-not (Test-Path $vite)) { throw '缺少前端依赖 frontend/node_modules。请先执行 pnpm install，或给启动器加 -Static 使用已构建前端。' }
        $compiledAt=(Get-Item -LiteralPath $dll).LastWriteTimeUtc
        $newerSource=Get-ChildItem -LiteralPath $backend -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/](bin|obj)[\\/]' -and $_.Extension -in @('.cs','.csproj') -and $_.LastWriteTimeUtc -gt $compiledAt } | Select-Object -First 1
        if ($newerSource) { throw '后端源代码已更新，但 Debug 运行版本尚未重新构建。请先停止本地服务，运行 dotnet build backend/src/PersonalFinance.Api --no-restore 后重新启动，避免前后端版本不一致。启动器不会自动构建或迁移数据库。' }
        $record=$null
        $ports=@(Listeners ([int]$config.backendPort))
        if ($ports.Count) {
            $existing=GetProcessRecord ([int]$ports[0].OwningProcess)
            $command=if($existing){$existing.CommandLine.Replace('/','\')}else{''}
            if (-not $existing -or $command -notlike '*PersonalFinance.Api*' -or $command -notlike ('*'+$backend+'*') -or -not (Healthy $apiUrl $true)) { throw ('后端端口 '+$config.backendPort+' 已被占用，且不是本项目健康的后端。请核对占用程序；不会强行结束它。') }
            Log '后端已经健康运行，直接复用，不重复启动。'
        } else {
            $env:ASPNETCORE_ENVIRONMENT='Development'
            $env:DOTNET_CLI_HOME=Join-Path $root 'backend/.runtime'
            $env:NUGET_PACKAGES=Join-Path $root 'backend/.nuget/packages'
            $env:APPDATA=Join-Path $root 'backend/.runtime/appdata'
            $env:Verification__Isolated='false'; $env:Automation__SchedulerEnabled='true'
            $record=StartOwned 'backend' $dotnet @($dll,'--urls',('http://127.0.0.1:'+$config.backendPort),'--contentRoot',$backend) $root
            WaitReady $apiUrl $true $record
        }
        if ($Static) {
            if ($record) { WaitReady $pageUrl $false $record }
            Log '静态前端由后端托管，已就绪。'
        } else {
        $ports=@(Listeners ([int]$config.frontendPort))
        if ($ports.Count) {
            $existing=GetProcessRecord ([int]$ports[0].OwningProcess)
            if (-not $existing -or $existing.CommandLine -notmatch 'vite[\\/]bin[\\/]vite.js' -or -not (Healthy $pageUrl $false) -or -not (Healthy ($pageUrl+'api/health') $true)) { throw ('前端端口 '+$config.frontendPort+' 已被占用，且不是已就绪的 Personal Finance 页面。不会结束占用程序。') }
            Log '前端已经就绪，直接复用，不重复启动。'
        } else {
            $env:FINANCE_API_PROXY_TARGET='http://127.0.0.1:'+$config.backendPort
            $record=StartOwned 'frontend' $node @($vite,'--configLoader','runner','--mode','integration','--host','127.0.0.1','--port',[string]$config.frontendPort,'--strictPort') $front
            WaitReady $pageUrl $false $record
            WaitReady ($pageUrl+'api/health') $true $record
        }
        }
        Log ('Personal Finance 已就绪：'+$pageUrl)
        if (-not $NoBrowser) { Start-Process $pageUrl }
    }
} catch {
    $code=1
    Log ('启动/停止失败：'+$_.Exception.Message)
    if ($lock) {
        foreach ($record in @($script:created | Sort-Object kind -Descending)) { try { StopOwned $record } catch { Log '新启动进程清理失败，可再次运行停止脚本。' } }
        $script:owned=@($script:owned | Where-Object { IsOwned $_ }); SaveState
    }
} finally {
    if ($lock) { $lock.Dispose() }
    Write-Host ('日志：'+$log)
}
exit $code
