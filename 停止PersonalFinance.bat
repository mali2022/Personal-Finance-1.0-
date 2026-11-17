@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\PersonalFinance.Local.ps1" -Mode Stop
if errorlevel 1 (
  echo 停止失败，请查看上方中文提示和 .local-run\logs 日志。
  pause
  exit /b 1
)
echo 已完成停止。原有服务、SQL Server 和浏览器不会被关闭。
exit /b 0
