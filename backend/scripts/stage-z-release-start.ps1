#Requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ReleaseDirectory,[Parameter(Mandatory)][string]$Database,[int]$Port=5443)
$ErrorActionPreference='Stop'
if($Database -cnotmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$') {throw '本脚本仅启动隔离测试发布；正式切换须单独确认'}
$root=[IO.Path]::GetFullPath($ReleaseDirectory)
$exe=Join-Path $root 'PersonalFinance.Api.exe'
if(-not (Test-Path -LiteralPath $exe)){throw '发布可执行文件不存在'}
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw '端口已占用'}
& sqlcmd -S . -E -C -b -d $Database -Q 'SET NOCOUNT ON; SELECT 1;' | Out-Null
if($LASTEXITCODE){throw '数据库连接失败'}
if(-not $env:Auth__SigningKey -or $env:Auth__SigningKey.Length -lt 32){throw '请通过环境变量配置测试签名密钥'}
$env:ASPNETCORE_ENVIRONMENT='Production'
$env:ConnectionStrings__Finance="Server=.;Database=$Database;Trusted_Connection=True;TrustServerCertificate=True"
# Production cookies require HTTPS. Use an explicitly configured certificate.
if(-not $env:Kestrel__Certificates__Default__Path){throw '生产 HTTPS 证书未配置'}
$env:ASPNETCORE_URLS="https://127.0.0.1:$Port"
$env:Automation__SchedulerEnabled='false'
$env:Planning__AlertSchedulerEnabled='false'
$env:Logging__LogLevel__Default='Warning'
$env:Logging__LogLevel__Microsoft_EntityFrameworkCore='None'
$process=Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'startup-out.log') -RedirectStandardError (Join-Path $root 'startup-error.log')
@{pid=$process.Id;startTime=$process.StartTime.ToUniversalTime().ToString('o');exe=$exe;database=$Database;port=$Port}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $root 'owned-process.json')
Write-Output "隔离发布已启动 PID=$($process.Id)，请检查 HTTPS、登录与深链接。"
