$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$backendRoot=Join-Path $projectRoot 'backend'
$env:DOTNET_CLI_HOME=Join-Path $backendRoot '.runtime'
$env:NUGET_PACKAGES=Join-Path $backendRoot '.nuget/packages'
$workspaceDatabase='PersonalFinanceWeb_RestoreCheck_'+[guid]::NewGuid().ToString('N')
if ($workspaceDatabase -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$') {throw 'Invalid isolated database name'}
$masterFile=(sqlcmd -S '(localdb)\CodexEntryVerification' -E -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT physical_name FROM sys.master_files WHERE database_id=1 AND name='master'" | Where-Object {$_ -match 'master.mdf'}).Trim()
if (-not $masterFile) {throw 'Cannot locate SQL data directory'}
$dataDirectory=Split-Path $masterFile -Parent
$workspaceDataFile=(Join-Path $dataDirectory "$workspaceDatabase.mdf").Replace("'","''")
$workspaceLogFile=(Join-Path $dataDirectory "$workspaceDatabase.ldf").Replace("'","''")
sqlcmd -S '(localdb)\CodexEntryVerification' -E -C -b -Q "CREATE DATABASE [$workspaceDatabase] ON PRIMARY (NAME=N'$workspaceDatabase', FILENAME=N'$workspaceDataFile') LOG ON (NAME=N'${workspaceDatabase}_log', FILENAME=N'$workspaceLogFile')"
if ($LASTEXITCODE -ne 0) {throw 'Cannot create isolated database'}
try {
 $env:PF_DELETION_TEST_DATABASE=$workspaceDatabase
 $env:PF_TEST_SQL_CONNECTION_STRING="Server=(localdb)\CodexEntryVerification;Database=$workspaceDatabase;Trusted_Connection=True;TrustServerCertificate=True"
 dotnet test (Join-Path $backendRoot 'tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj') --no-restore --filter 'FullyQualifiedName~EntryWorkflowSqlTests|FullyQualifiedName~KeywordSearchSqlTests' --verbosity minimal
 $testExit=$LASTEXITCODE
} finally {
 Remove-Item Env:PF_DELETION_TEST_DATABASE -ErrorAction SilentlyContinue
 Remove-Item Env:PF_TEST_SQL_CONNECTION_STRING -ErrorAction SilentlyContinue
 sqlcmd -S '(localdb)\CodexEntryVerification' -E -C -b -Q "ALTER DATABASE [$workspaceDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$workspaceDatabase]"
}
exit $testExit



