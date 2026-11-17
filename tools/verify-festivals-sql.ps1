$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$backendRoot=Join-Path $projectRoot 'backend'
$env:DOTNET_CLI_HOME=Join-Path $backendRoot '.runtime'
$env:NUGET_PACKAGES=Join-Path $backendRoot '.nuget/packages'
$fuelDatabase='PersonalFinanceWeb_RestoreCheck_'+[guid]::NewGuid().ToString('N')
if ($fuelDatabase -notmatch '^PersonalFinanceWeb_RestoreCheck_[a-f0-9]{32}$') {throw 'Invalid isolated database name'}
$masterFile=(sqlcmd -S . -E -C -b -h -1 -W -Q "SET NOCOUNT ON; SELECT physical_name FROM sys.master_files WHERE database_id=1 AND name='master'" | Where-Object {$_ -match 'master.mdf'}).Trim()
if (-not $masterFile) {throw 'Cannot locate SQL data directory'}
$dataDirectory=Split-Path $masterFile -Parent
$fuelDataFile=(Join-Path $dataDirectory "$fuelDatabase.mdf").Replace("'","''")
$fuelLogFile=(Join-Path $dataDirectory "$fuelDatabase.ldf").Replace("'","''")
sqlcmd -S . -E -C -b -Q "CREATE DATABASE [$fuelDatabase] ON PRIMARY (NAME=N'$fuelDatabase', FILENAME=N'$fuelDataFile') LOG ON (NAME=N'${fuelDatabase}_log', FILENAME=N'$fuelLogFile')"
if ($LASTEXITCODE -ne 0) {throw 'Cannot create isolated database'}
try {
 $env:PF_DELETION_TEST_DATABASE=$fuelDatabase
 $env:PF_TEST_SQL_CONNECTION_STRING="Server=.;Database=$fuelDatabase;Trusted_Connection=True;TrustServerCertificate=True"
 dotnet test (Join-Path $backendRoot 'tests/PersonalFinance.Tests/PersonalFinance.Tests.csproj') --no-restore --filter 'FullyQualifiedName~Festival' --logger "console;verbosity=normal"
 $testExit=$LASTEXITCODE
} finally {
 Remove-Item Env:PF_DELETION_TEST_DATABASE -ErrorAction SilentlyContinue
 Remove-Item Env:PF_TEST_SQL_CONNECTION_STRING -ErrorAction SilentlyContinue
 sqlcmd -S . -E -C -b -Q "ALTER DATABASE [$fuelDatabase] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$fuelDatabase]"
}
exit $testExit


