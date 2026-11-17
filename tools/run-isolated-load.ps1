#Requires -Version 7.0
param([ValidateRange(0, 120)][int]$Minutes = 0, [ValidateRange(1, 16)][int]$Workers = 4, [string]$RunName = 'baseline')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
node --check (Join-Path $root 'tools/isolated-load.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Load script syntax check failed' }
if ($RunName -notmatch '^[a-zA-Z0-9-]+$') { throw 'Invalid run name' }
$output = Join-Path $root "verification/stability-next-20261020/$RunName"
if (Test-Path $output) { throw 'Do not overwrite load evidence; choose another run name' }
New-Item -ItemType Directory -Force $output | Out-Null
$work = Join-Path $root ('.local-run/load-' + [guid]::NewGuid().ToString('N'))
$apiOut = Join-Path $work 'api'
New-Item -ItemType Directory -Force $apiOut | Out-Null
$env:DOTNET_CLI_HOME = Join-Path $root 'backend/.runtime'
$env:NUGET_PACKAGES = Join-Path $root 'backend/.nuget/packages'
dotnet publish (Join-Path $root 'backend/src/PersonalFinance.Api/PersonalFinance.Api.csproj') --no-restore -c Release -o $apiOut *> (Join-Path $output 'build.log')
if ($LASTEXITCODE -ne 0) { throw 'Load API build failed' }
$database = 'PersonalFinanceWeb_RestoreCheck_' + [guid]::NewGuid().ToString('N')
if ($database -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$') { throw 'Invalid isolated database' }
$master = (sqlcmd -S . -E -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT physical_name FROM sys.master_files WHERE database_id=1 AND name='master'" | Where-Object { $_ -match 'master.mdf' }).Trim()
if (-not $master) { throw 'Cannot locate SQL data directory' }
$data = (Join-Path (Split-Path $master -Parent) "$database.mdf").Replace("'", "''")
$log = (Join-Path (Split-Path $master -Parent) "$database.ldf").Replace("'", "''")
sqlcmd -S . -E -C -b -Q "CREATE DATABASE [$database] ON PRIMARY (NAME=N'$database',FILENAME=N'$data') LOG ON (NAME=N'${database}_log',FILENAME=N'$log')"
if ($LASTEXITCODE -ne 0) { throw 'Cannot create isolated database' }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$email = [guid]::NewGuid().ToString('N') + '@load.test'
$password = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$settings = @{
  ASPNETCORE_ENVIRONMENT = 'Development'; ASPNETCORE_URLS = "http://127.0.0.1:$port"
  ConnectionStrings__Finance = "Server=.;Database=$database;Trusted_Connection=True;TrustServerCertificate=True"
  Auth__SigningKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
  Bootstrap__Email = $email; Bootstrap__Password = $password
  Verification__Isolated = 'true'; Ai__Enabled = 'false'
  Logging__LogLevel__Default = 'Warning'; Logging__LogLevel__Microsoft = 'Warning'
  DataProtection__KeyPath = (Join-Path $work 'keys')
}
function Start-HiddenProcess([string]$Executable, [string[]]$Arguments, [string]$Name, [hashtable]$Variables) {
  $info = [Diagnostics.ProcessStartInfo]::new($Executable)
  $info.WorkingDirectory = $apiOut; $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
  foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
  foreach ($key in $Variables.Keys) { $info.Environment[$key] = $Variables[$key] }
  $process = [Diagnostics.Process]::Start($info)
  $stdout = [IO.FileStream]::new((Join-Path $output "$Name.log"), [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
  $stderr = [IO.FileStream]::new((Join-Path $output "$Name-error.log"), [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
  return @{ Process = $process; Out = $stdout; Err = $stderr; OutTask = $process.StandardOutput.BaseStream.CopyToAsync($stdout); ErrTask = $process.StandardError.BaseStream.CopyToAsync($stderr) }
}
function Finish-Process($item) {
  if (-not $item) { return }
  if (-not $item.Process.HasExited) { $item.Process.Kill($true) }
  $item.Process.WaitForExit(); $null = $item.OutTask.GetAwaiter().GetResult(); $null = $item.ErrTask.GetAwaiter().GetResult()
  $item.Out.Dispose(); $item.Err.Dispose()
}
$api = $null; $load = $null; $initialize = $null; $complete = $false
try {
  $initialize = Start-HiddenProcess (Get-Command dotnet).Source @((Join-Path $apiOut 'PersonalFinance.Api.dll'), '--initialize-db') 'initialize' $settings
  if (-not $initialize.Process.WaitForExit(180000) -or $initialize.Process.ExitCode -ne 0) { throw 'Isolated initialization failed' }
  Finish-Process $initialize; $initialize = $null
  $seed = "SET NOCOUNT ON;`n" + [IO.File]::ReadAllText((Join-Path $root 'backend/tests/performance-a35-seed.sql')).Replace('{{DATABASE}}', $database).Replace('{{EMAIL}}', $email)
  $seedFile = Join-Path $work 'seed.sql'; [IO.File]::WriteAllText($seedFile, $seed, [Text.UTF8Encoding]::new($false))
  $raw = sqlcmd -S . -E -C -b -I -d $database -y 0 -w 65535 -f 65001 -i $seedFile | Out-String
  $seedExit = $LASTEXITCODE
  [IO.File]::WriteAllText((Join-Path $output 'seed.log'), $raw)
  if ($seedExit -ne 0) { throw 'Isolated seeding failed' }
  $match = [regex]::Match($raw, '(?s)PF_JSON_BEGIN\s*(.*?)\s*PF_JSON_END')
  if (-not $match.Success) { throw 'Seed metadata missing' }
  $fixture = $match.Groups[1].Value | ConvertFrom-Json
  $fixture | Add-Member database $database
  $fixture | Add-Member apiBuildId ((Get-FileHash (Join-Path $apiOut 'PersonalFinance.Api.dll') -Algorithm SHA256).Hash)
  $fixture | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 (Join-Path $output 'fixture.json')
  $api = Start-HiddenProcess (Get-Command dotnet).Source @((Join-Path $apiOut 'PersonalFinance.Api.dll')) 'api' $settings
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) { try { $health = Invoke-RestMethod "http://127.0.0.1:$port/api/health"; if ($health.code -eq 'READY') { $ready = $true; break } } catch { }; Start-Sleep -Seconds 1 }
  if (-not $ready) { throw 'Isolated API did not become ready' }
  $nodeSettings = @{ PF_LOAD_ORIGIN = "http://127.0.0.1:$port"; PF_LOAD_DATABASE = $database; PF_LOAD_EMAIL = $email; PF_LOAD_PASSWORD = $password; PF_LOAD_SIGNING_KEY = $settings.Auth__SigningKey; PF_LOAD_OUTPUT = $output; PF_LOAD_SECONDS = [string]($Minutes * 60); PF_LOAD_WORKERS = [string]$Workers }
  Write-Output "ISOLATED_LOAD_READY transactions=40000 workers=$Workers minutes=$Minutes"
  $load = Start-HiddenProcess (Get-Command node).Source @((Join-Path $root 'tools/isolated-load.mjs')) 'load' $nodeSettings
  do {
    if ($api.Process.HasExited) { throw 'API exited during load' }
    $api.Process.Refresh()
    $connections = sqlcmd -S . -E -C -b -h -1 -W -d $database -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process=1 AND database_id=DB_ID()"
    if ($LASTEXITCODE -ne 0) { throw 'Resource sample query failed' }
    @{ at = [DateTimeOffset]::UtcNow.ToString('o'); apiPrivateBytes = $api.Process.PrivateMemorySize64; apiWorkingSet = $api.Process.WorkingSet64; apiCpuSeconds = $api.Process.TotalProcessorTime.TotalSeconds; apiThreads = $api.Process.Threads.Count; apiHandles = $api.Process.HandleCount; sqlSessions = [int](($connections | Out-String).Trim()) } | ConvertTo-Json -Compress | Add-Content -Encoding utf8 (Join-Path $output 'resources.jsonl')
    $finished = $load.Process.WaitForExit(30000)
    if (-not $finished) { Write-Output ('LOAD_PROGRESS ' + (Get-Content (Join-Path $output 'progress.json') -Raw -ErrorAction SilentlyContinue)) }
  } until ($finished)
  if ($load.Process.ExitCode -ne 0) { throw 'Load assertions failed; inspect load-error.log' }
  $integrityFile = Join-Path $root 'backend/scripts/recovery-integrity.sql'
  sqlcmd -S . -E -C -b -I -d $database -f 65001 -i $integrityFile *> (Join-Path $output 'integrity.log')
  if ($LASTEXITCODE -ne 0) { throw 'Post-load financial integrity failed' }
  $complete = $true
} finally {
  Finish-Process $load; Finish-Process $api; Finish-Process $initialize
  sqlcmd -S . -E -C -b -Q "ALTER DATABASE [$database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$database]"
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove isolated database' }
  @{ complete = $complete; databaseRemoved = $true; minutes = $Minutes; workers = $Workers; finishedAt = [DateTimeOffset]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $output 'cleanup.json')
}
Write-Output "ISOLATED_LOAD_PASSED output=$output"
