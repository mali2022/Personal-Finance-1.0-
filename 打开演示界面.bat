@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js。请安装 Node.js 20 或更高版本后重试；完整本地模式已由“打开PersonalFinance.bat”提供，不需要 Node。
  pause
  exit /b 1
)
if not exist "frontend\node_modules\vite\dist\node\cli.js" (
  echo 演示模式需要完整的前端依赖。请先在 frontend 目录执行 pnpm install，再重试；日常使用请直接双击“打开PersonalFinance.bat”（不需要 Node）。
  pause
  exit /b 1
)
echo 正在以演示数据打开界面（不连接本地数据库，不会写入正式账本）。
start "" powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://127.0.0.1:5173/'"
cd /d "%~dp0frontend"
node node_modules\vite\bin\vite.js --configLoader runner --mode development --host 127.0.0.1 --port 5173 --strictPort
if errorlevel 1 (
  echo 演示界面启动失败，请检查端口 5173 是否被占用。
  pause
  exit /b 1
)
exit /b 0