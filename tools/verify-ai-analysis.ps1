param([string]$Filter = 'FullyQualifiedName~Ai|FullyQualifiedName~DeepSeekClientTests|FullyQualifiedName~FinancialReport|FullyQualifiedName~CategoryStatistics|FullyQualifiedName~CustomReport|FullyQualifiedName~StatisticsPolicy')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$backendRoot = Join-Path $projectRoot 'backend'
$env:DOTNET_CLI_HOME = Join-Path $backendRoot '.runtime'
$env:NUGET_PACKAGES = Join-Path $backendRoot '.nuget/packages'
$aiDatabase = 'PersonalFinanceWeb_RestoreCheck_' + [guid]::NewGuid().ToString('N')
if ($aiDatabase -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$') { throw 'Invalid isolated database name' }
$aiServer = '(localdb)\CodexEntryVerification'
$masterFile = (sqlcmd -S $aiServer -E -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT physical_name FROM sys.master_files WHERE database_id=1 AND name='master'" | Where-Object { $_ -match 'master.mdf' }).Trim()
if (!$masterFile) { throw 'Cannot locate isolated SQL instance' }
$aiDataDirectory = Split-Path $masterFile -Parent
$aiDataFile = (Join-Path $aiDataDirectory "$aiDatabase.mdf").Replace("'", "''")
$aiLogFile = (Join-Path $aiDataDirectory "$aiDatabase.ldf").Replace("'", "''")
sqlcmd -S $aiServer -E -C -b -Q "CREATE DATABASE [$aiDatabase] ON PRIMARY (NAME=N'$aiDatabase', FILENAME=N'$aiDataFile') LOG ON (NAME=N'${aiDatabase}_log', FILENAME=N'$aiLogFile')"
if ($LASTEXITCODE -ne 0) { throw 'Cannot create isolated database' }
$testExit = 1
try {
    $env:PF_DELETION_TEST_DATABASE = $aiDatabase
    $env:PF_TEST_SQL_CONNECTION_STRING = "Server=$aiServer;Database=$aiDatabase;Trusted_Connection=True;TrustServerCertificate=True"
    dotnet test (Join-Path $backendRoot 'tests/PersonalFinance.Tests') --artifacts-path (Join-Path $projectRoot 'verification/ai-dotnet-artifacts') --filter $Filter --logger 'trx;LogFileName=ai-analysis-sql.trx' --verbosity minimal
    $testExit = $LASTEXITCODE
} finally {
    Remove-Item Env:PF_DELETION_TEST_DATABASE -ErrorAction SilentlyContinue
    Remove-Item Env:PF_TEST_SQL_CONNECTION_STRING -ErrorAction SilentlyContinue
    if ($aiDatabase -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$') { throw 'Refusing cleanup outside the disposable test database' }
    sqlcmd -S $aiServer -E -C -b -Q "ALTER DATABASE [$aiDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$aiDatabase]"
}
exit $testExit
