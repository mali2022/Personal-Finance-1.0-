param([ValidateSet('integration/concert-p0.spec.ts','integration/concert-p1.spec.ts','integration/investment-returns.spec.ts')][string]$TestSpec='integration/concert-p0.spec.ts')
$ErrorActionPreference='Stop'
$concertRoot=Split-Path $PSScriptRoot -Parent
$concertDb='PersonalFinanceWeb_RestoreCheck_'+[guid]::NewGuid().ToString('N')
$concertTemp=Join-Path ([IO.Path]::GetTempPath()) ('pf-concert-'+[guid]::NewGuid().ToString('N'))
$concertApi=$null
New-Item -ItemType Directory -Path $concertTemp | Out-Null
try {
 if($concertDb -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$'){throw 'Unsafe isolated database'}
 $masterFile=(sqlcmd -S . -E -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT physical_name FROM sys.master_files WHERE database_id=1 AND name='master'" | Where-Object {$_ -match 'master.mdf'}).Trim()
 $concertData=Split-Path $masterFile -Parent
 sqlcmd -S . -E -C -b -Q "CREATE DATABASE [$concertDb] ON PRIMARY (NAME=N'$concertDb',FILENAME=N'$concertData\$concertDb.mdf') LOG ON (NAME=N'${concertDb}_log',FILENAME=N'$concertData\${concertDb}_log.ldf')"
 if($LASTEXITCODE -ne 0){throw 'Isolated database creation failed'}
 $env:PF_DELETION_TEST_DATABASE=$concertDb
 $env:ConnectionStrings__Finance="Server=.;Database=$concertDb;Trusted_Connection=True;TrustServerCertificate=True"
 $env:ASPNETCORE_ENVIRONMENT='Development'
 $env:Auth__SigningKey='ConcertVerificationIsolatedOnly2026xxxxxxxxxxxxxxxxxxxxxxxxxx'
 $env:Verification__Isolated='true'
 $env:Database__SnapshotReads='false'
 $env:Bootstrap__Email='concert-browser@isolated.test'
 $env:Bootstrap__Password=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
 $env:DataProtection__KeyPath=Join-Path $concertTemp 'keys'
 $env:Ai__Enabled='false'
 $env:FINANCE_API_PROXY_TARGET='http://127.0.0.1:5295'
 $concertApiRoot=Join-Path $concertRoot 'backend\src\PersonalFinance.Api'
 $concertDll=Join-Path $concertApiRoot 'bin\Debug\net10.0\PersonalFinance.Api.dll'
 $env:ASPNETCORE_CONTENTROOT=$concertApiRoot
 dotnet $concertDll --initialize-db *> (Join-Path $concertTemp 'initialize.log')
 if($LASTEXITCODE -ne 0){Get-Content (Join-Path $concertTemp 'initialize.log') -Tail 12;throw 'Isolated initialization failed'}
 $concertApi=Start-Process dotnet -ArgumentList @($concertDll,'--urls','http://127.0.0.1:5295') -WorkingDirectory $concertApiRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $concertTemp 'api.log') -RedirectStandardError (Join-Path $concertTemp 'api-error.log')
 $concertReady=$false
 $concertDeadline=[DateTime]::UtcNow.AddSeconds(30)
 while([DateTime]::UtcNow -lt $concertDeadline -and !$concertReady){
  if($concertApi.HasExited){throw 'Isolated API exited before becoming ready'}
  try {$response=Invoke-WebRequest 'http://127.0.0.1:5295/api/verification-context' -SkipHttpErrorCheck -TimeoutSec 1;$concertReady=$response.StatusCode -lt 500} catch {}
  if(!$concertReady){Start-Sleep -Milliseconds 200}
 }
 if(!$concertReady){throw 'Isolated API readiness exceeded 30 seconds'}
 Push-Location (Join-Path $concertRoot 'frontend')
 try {node node_modules/@playwright/test/cli.js test $TestSpec --config playwright.integration.config.ts --reporter=line;if($LASTEXITCODE -ne 0){throw 'Isolated browser verification failed'}} finally {Pop-Location}
} finally {
 if($concertApi -and !$concertApi.HasExited){Stop-Process -Id $concertApi.Id}
 if($concertDb -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$'){throw 'Unsafe database cleanup'}
 sqlcmd -S . -E -C -b -Q "IF DB_ID(N'$concertDb') IS NOT NULL BEGIN ALTER DATABASE [$concertDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$concertDb]; END"
 $concertResolved=[IO.Path]::GetFullPath($concertTemp)
 $concertTempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if($concertResolved.StartsWith($concertTempRoot,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $concertResolved -Leaf) -like 'pf-concert-*'){Remove-Item -LiteralPath $concertResolved -Recurse -Force}
}
