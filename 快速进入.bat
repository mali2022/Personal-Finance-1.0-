@echo off
chcp 65001 >nul
call "%~dp0打开PersonalFinance.bat" %*
exit /b %errorlevel%