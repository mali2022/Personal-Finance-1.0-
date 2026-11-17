param([switch]$Initialize, [switch]$CreateIntegrationUser)
$ErrorActionPreference='Stop'
$taskBackendRoot=Split-Path $PSScriptRoot -Parent
$env:DOTNET_CLI_HOME=Join-Path $taskBackendRoot '.runtime'
$env:NUGET_PACKAGES=Join-Path $taskBackendRoot '.nuget/packages'
$env:APPDATA=Join-Path $taskBackendRoot '.runtime/appdata'
$env:ASPNETCORE_ENVIRONMENT='Development'
$taskProject=Join-Path $taskBackendRoot 'src/PersonalFinance.Api'
dotnet restore $taskProject --configfile (Join-Path $taskBackendRoot 'NuGet.Config')
if ($LASTEXITCODE -ne 0) { throw 'NuGet 恢复失败' }
dotnet build $taskProject --no-restore
if ($LASTEXITCODE -ne 0) { throw '后端构建失败' }
if ($CreateIntegrationUser) {
    $env:Bootstrap__Email='integration@personal.finance'
    $env:Bootstrap__CredentialsFile='integration-credentials.local.json'
}
if ($Initialize -or $CreateIntegrationUser) {
    dotnet run --project $taskProject --no-build --no-launch-profile -- --initialize-db
    if ($LASTEXITCODE -ne 0) { throw '数据库初始化失败' }
}
Remove-Item Env:Bootstrap__Email,Env:Bootstrap__CredentialsFile -ErrorAction SilentlyContinue
dotnet run --project $taskProject --no-build --no-launch-profile --urls http://127.0.0.1:5085
