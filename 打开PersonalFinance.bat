@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\PersonalFinance.Local.ps1" -Mode Start -Static -ConfigPath "%~dp0scripts\local-runtime.json" %*
if errorlevel 1 (
  echo.
  echo 本地启动失败，请查看 .local-run\logs 日志。
  pause
  exit /b 1
)
exit /b 0