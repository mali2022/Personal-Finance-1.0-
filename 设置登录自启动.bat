@echo off
chcp 65001 >nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\PersonalFinance.Autostart.ps1" -Mode Enable
pause
