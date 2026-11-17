param([switch]$LiveAi)
$ErrorActionPreference = 'Stop'
$approvalRoot = Split-Path $PSScriptRoot -Parent
$approvalDb = 'PersonalFinanceWeb_RestoreCheck_' + [guid]::NewGuid().ToString('N')
$approvalData = 'C:\Program Files\Microsoft SQL Server\MSSQL17.MSSQLSERVER\MSSQL\DATA'
$approvalTemp = Join-Path ([IO.Path]::GetTempPath()) ('pf-festival-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $approvalTemp | Out-Null
$approvalApi = $null
$approvalApi2 = $null
try {
    & sqlcmd -S . -E -C -Q "CREATE DATABASE [$approvalDb] ON PRIMARY (NAME=N'$approvalDb',FILENAME=N'$approvalData\$approvalDb.mdf') LOG ON (NAME=N'${approvalDb}_log',FILENAME=N'$approvalData\${approvalDb}_log.ldf')" -b
    if ($LASTEXITCODE -ne 0) { throw 'Isolated database creation failed' }
    $env:PF_DELETION_TEST_DATABASE = $approvalDb
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:ConnectionStrings__Finance = "Server=.;Database=$approvalDb;Trusted_Connection=True;TrustServerCertificate=True"
    $env:Auth__SigningKey = 'ApprovalVerificationSigningKeyForIsolatedDatabaseOnly2026xxxxxxxxxx'
    $env:Verification__Isolated = 'true'
    $env:Database__SnapshotReads = 'false'
    $env:Bootstrap__Email = 'approval-browser@isolated.test'
    $env:Bootstrap__Password = 'Approval-Isolated-Only-2026!'
    $env:DataProtection__KeyPath = Join-Path $approvalTemp 'keys'
    $env:Ai__Enabled = 'false'
    if ($LiveAi) {
        $env:Ai__Enabled = 'true'
        $env:PF_APPROVAL_LIVE_AI = 'true'
        $env:DataProtection__KeyPath = Join-Path $approvalRoot 'backend\src\PersonalFinance.Api\.keys'
        if (-not (Test-Path (Join-Path $env:DataProtection__KeyPath 'deepseek-api-key.protected'))) { throw 'Existing protected provider key is required' }
    }
    $env:FINANCE_API_PROXY_TARGET = 'http://127.0.0.1:5293'
    $approvalDll = Join-Path $approvalRoot 'backend\src\PersonalFinance.Api\bin\Debug\net10.0\PersonalFinance.Api.dll'
    & dotnet $approvalDll --initialize-db *> (Join-Path $approvalTemp 'initialize.log')
    if ($LASTEXITCODE -ne 0) { Get-Content (Join-Path $approvalTemp 'initialize.log') -Tail 10; throw 'Isolated initialization failed' }
    $approvalApi = Start-Process dotnet -ArgumentList @($approvalDll, '--urls', 'http://127.0.0.1:5293') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $approvalTemp 'api.log') -RedirectStandardError (Join-Path $approvalTemp 'api-error.log')
    if ($LiveAi) { $approvalApi2 = Start-Process dotnet -ArgumentList @($approvalDll, '--urls', 'http://127.0.0.1:5294') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $approvalTemp 'api2.log') -RedirectStandardError (Join-Path $approvalTemp 'api2-error.log') }
    Push-Location (Join-Path $approvalRoot 'frontend')
    try {
        & node node_modules/@playwright/test/cli.js test integration/festivals.spec.ts --config playwright.integration.config.ts --reporter=line
        if ($LASTEXITCODE -ne 0) { throw 'Approval browser verification failed' }
    } finally { Pop-Location }
} finally {
    if ($approvalApi -and !$approvalApi.HasExited) { Stop-Process -Id $approvalApi.Id }
    if ($approvalApi2 -and !$approvalApi2.HasExited) { Stop-Process -Id $approvalApi2.Id }
    if ($approvalDb -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$') { throw 'Refusing unsafe database cleanup' }
    & sqlcmd -S . -E -C -Q "IF DB_ID(N'$approvalDb') IS NOT NULL BEGIN ALTER DATABASE [$approvalDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$approvalDb]; END" -b
    $approvalResolved = [IO.Path]::GetFullPath($approvalTemp)
    $approvalTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($approvalResolved.StartsWith($approvalTempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $approvalResolved -Leaf) -like 'pf-festival-*') { Remove-Item -LiteralPath $approvalResolved -Recurse -Force }
}

