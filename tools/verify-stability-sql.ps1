param([string]$Filter='FullyQualifiedName!~AiLiveTests',[string]$ResultName='backend-before',[ValidateRange(0,15)][decimal]$LiveAiBudget=0)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$backendRoot=Join-Path $projectRoot 'backend'
$output=Join-Path $projectRoot 'verification/stability-20261020'
New-Item -ItemType Directory -Force $output | Out-Null
$env:DOTNET_CLI_HOME=Join-Path $backendRoot '.runtime'
$env:NUGET_PACKAGES=Join-Path $backendRoot '.nuget/packages'
$env:PF_AI_LIVE_ENABLED='false'
if($LiveAiBudget -gt 0){
 if($Filter -ne 'FullyQualifiedName~AiLiveTests.BudgetedSyntheticAcceptance'){throw 'Paid runs must select only the bounded synthetic acceptance test'}
 $env:PF_AI_LIVE_ENABLED='true'
 $env:PF_AI_LIVE_BUDGET_CNY=[string]$LiveAiBudget
 $env:PF_AI_APP_ROOT=Join-Path $backendRoot 'src/PersonalFinance.Api'
}
$database='PersonalFinanceWeb_RestoreCheck_'+[guid]::NewGuid().ToString('N')
if($database -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$'){throw 'Invalid test database'}
$masterFile=(sqlcmd -S . -E -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT physical_name FROM sys.master_files WHERE database_id=1 AND name='master'" | Where-Object {$_ -match 'master.mdf'}).Trim()
if(-not $masterFile){throw 'Cannot locate SQL data directory'}
$dataDirectory=Split-Path $masterFile -Parent
$dataFile=(Join-Path $dataDirectory "$database.mdf").Replace("'","''")
$logFile=(Join-Path $dataDirectory "$database.ldf").Replace("'","''")
sqlcmd -S . -E -C -b -Q "CREATE DATABASE [$database] ON PRIMARY (NAME=N'$database', FILENAME=N'$dataFile') LOG ON (NAME=N'${database}_log', FILENAME=N'$logFile')"
if($LASTEXITCODE -ne 0){throw 'Cannot create test database'}
try{
 $env:PF_DELETION_TEST_DATABASE=$database
 $env:PF_TEST_SQL_CONNECTION_STRING="Server=.;Database=$database;Trusted_Connection=True;TrustServerCertificate=True"
 dotnet test (Join-Path $backendRoot 'tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj') --no-restore --filter $Filter --logger "trx;LogFileName=$ResultName.trx" --results-directory $output --verbosity minimal *> (Join-Path $output "$ResultName.log")
 $testExit=$LASTEXITCODE
}finally{
 Remove-Item Env:PF_DELETION_TEST_DATABASE -ErrorAction SilentlyContinue
 Remove-Item Env:PF_TEST_SQL_CONNECTION_STRING -ErrorAction SilentlyContinue
 sqlcmd -S . -E -C -b -Q "ALTER DATABASE [$database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$database]"
 if($LASTEXITCODE -ne 0){throw 'Failed to remove isolated test database'}
}
Get-Content (Join-Path $output "$ResultName.log") -Tail 8
exit $testExit
