@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ============================================================
echo  备份并升级本地数据库（PersonalFinanceWeb）
echo ============================================================
echo 本操作会先备份本地数据库，再应用当前程序包含的 EF 迁移。
echo 仅在你确认本地数据库需要升级、且已了解迁移风险时执行。
echo 不会删除账务数据，但结构变更不可自动回滚；请保留备份。
echo.
set /p CONFIRM=输入大写 YES 继续（其他输入取消）: 
if /i not "%CONFIRM%"=="YES" (
  echo 已取消，未修改数据库。
  pause
  exit /b 1
)
where dotnet >nul 2>nul
if errorlevel 1 (
  echo 找不到 dotnet。请安装 .NET 10 SDK 或运行时后重试。
  pause
  exit /b 1
)
if not exist "backend\src\PersonalFinance.Api\bin\Debug\net10.0\PersonalFinance.Api.dll" (
  echo 缺少后端运行产物。请先构建 backend（dotnet build backend/src/PersonalFinance.Api）后重试。
  pause
  exit /b 1
)
set "BACKUP_DIR=%~dp0backend\.backups"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
for /f "tokens=1-4 delims=/ " %%a in ("%date%") do set "D=%%d-%%b-%%c"
set "STAMP=%D%-%time:~0,2%-%time:~3,2%-%time:~6,2%"
set "STAMP=%STAMP: =0%"
set "BACKUP=%BACKUP_DIR%\PersonalFinanceWeb-before-migrate-%STAMP%.bak"
echo 正在备份到：%BACKUP%
sqlcmd -S localhost -E -C -Q "BACKUP DATABASE [PersonalFinanceWeb] TO DISK=N'%BACKUP%' WITH INIT, CHECKSUM" -b
if errorlevel 1 (
  echo 备份失败，已停止，未执行迁移。
  pause
  exit /b 1
)
echo 正在校验备份...
sqlcmd -S localhost -E -C -Q "RESTORE VERIFYONLY FROM DISK=N'%BACKUP%' WITH CHECKSUM" -b
if errorlevel 1 (
  echo 备份校验失败，已停止，未执行迁移。
  pause
  exit /b 1
)
echo 备份校验通过，开始应用迁移...
set "ASPNETCORE_ENVIRONMENT=Development"
set "DOTNET_CLI_HOME=%~dp0backend\.runtime"
dotnet "%~dp0backend\src\PersonalFinance.Api\bin\Debug\net10.0\PersonalFinance.Api.dll" --initialize-db --contentRoot "%~dp0backend\src\PersonalFinance.Api"
if errorlevel 1 (
  echo 迁移失败。请保留备份并查看上方错误；不要重复执行。
  pause
  exit /b 1
)
echo 迁移完成。现在可以双击“打开PersonalFinance.bat”。
pause
exit /b 0
