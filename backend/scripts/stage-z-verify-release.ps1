#Requires -Version 7.0
param([Parameter(Mandatory)][string]$ReleaseDirectory,[Parameter(Mandatory)][string]$Database,[Parameter(Mandatory)][string]$ProtectedDirectory,[Parameter(Mandatory)][string]$EvidenceDirectory)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'recovery-common.ps1')
Assert-FinanceTarget $Database
$root=[IO.Path]::GetFullPath($ReleaseDirectory)
$ProtectedDirectory=[IO.Path]::GetFullPath($ProtectedDirectory)
$EvidenceDirectory=[IO.Path]::GetFullPath($EvidenceDirectory)
$env:Auth__SigningKey=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$env:Bootstrap__Email='stage-z-'+[Guid]::NewGuid().ToString('N')+'@personal.finance'
$env:Bootstrap__Password=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
$env:ConnectionStrings__Finance="Server=.;Database=$Database;Trusted_Connection=True;TrustServerCertificate=True"
$env:ASPNETCORE_ENVIRONMENT='Production'
$env:Automation__SchedulerEnabled='false';$env:Planning__AlertSchedulerEnabled='false'
& sqlcmd -S . -E -C -b -Q "ALTER DATABASE [$Database] SET READ_WRITE WITH NO_WAIT;" | Out-Null
if($LASTEXITCODE){throw '隔离库未能启用测试写入'}
Push-Location $root
try { & (Join-Path $root 'PersonalFinance.Api.exe') --initialize-db | Out-Null; if($LASTEXITCODE){throw '隔离初始化失败'} } finally { Pop-Location }
$credentials=@{email=$env:Bootstrap__Email;password=$env:Bootstrap__Password}
$credentials|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $ProtectedDirectory 'stage-z-credentials.local.json')
$env:Kestrel__Certificates__Default__Path=Join-Path $ProtectedDirectory 'stage-z-test.pfx'
$env:Kestrel__Certificates__Default__Password=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
& dotnet dev-certs https --export-path $env:Kestrel__Certificates__Default__Path --password $env:Kestrel__Certificates__Default__Password | Out-Null
if($LASTEXITCODE){throw '测试证书导出失败'}
& (Join-Path $PSScriptRoot 'stage-z-release-start.ps1') -ReleaseDirectory $root -Database $Database -Port 5443
try {
 $ready=$false
 for($i=0;$i -lt 10;$i++){try {$homeResponse=Invoke-WebRequest https://127.0.0.1:5443/ -SkipCertificateCheck -NoProxy -TimeoutSec 3;$ready=$true;break}catch{Start-Sleep -Seconds 1}}
 if(-not $ready){throw '发布未就绪；检查启动日志'}
 $deep=Invoke-WebRequest https://127.0.0.1:5443/accounts -SkipCertificateCheck -NoProxy -TimeoutSec 5
 $missing=Invoke-WebRequest https://127.0.0.1:5443/api/stage-z-missing -SkipCertificateCheck -NoProxy -TimeoutSec 5 -SkipHttpErrorCheck
 $login=Invoke-WebRequest https://127.0.0.1:5443/api/auth/login -Method Post -ContentType application/json -Body ($credentials|ConvertTo-Json) -SkipCertificateCheck -NoProxy -TimeoutSec 5 -SessionVariable session
 $token=($login.Content|ConvertFrom-Json).data.accessToken
 $accounts=Invoke-WebRequest https://127.0.0.1:5443/api/accounts -Headers @{Authorization="Bearer $token"} -SkipCertificateCheck -NoProxy -TimeoutSec 5
 $xsrf=Invoke-WebRequest https://127.0.0.1:5443/api/auth/me -WebSession $session -Headers @{Authorization="Bearer $token"} -SkipCertificateCheck -NoProxy -TimeoutSec 5 -SkipHttpErrorCheck
 $cookie=$login.Headers['Set-Cookie'] -join ';'
 if($missing.StatusCode -ne 404 -or $cookie -notmatch 'secure' -or $cookie -notmatch 'httponly'){throw 'API回退或Cookie安全校验失败'}
 @{database=$Database;production=$true;selfContained=$true;homeStatus=$homeResponse.StatusCode;deepLinkStatus=$deep.StatusCode;unknownApiStatus=$missing.StatusCode;loginStatus=$login.StatusCode;accountsStatus=$accounts.StatusCode;refreshCookieSecureHttpOnly=$true;viteRequired=$false;time=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $EvidenceDirectory 'release-proof.json')
} finally { & (Join-Path $PSScriptRoot 'stage-z-release-stop.ps1') -ReleaseDirectory $root }


