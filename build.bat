@echo off
chcp 65001 >nul 2>&1
echo.
echo  🐲 RedClaw Build Script
echo  =======================
echo.

echo [1/3] Building backend...
call pnpm build
if %errorlevel% neq 0 (
    echo.
    echo  ❌ Backend build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Building control UI...
call pnpm ui:build
if %errorlevel% neq 0 (
    echo.
    echo  ❌ UI build failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Installing globally...
call npm install -g .
if %errorlevel% neq 0 (
    echo.
    echo  ❌ Global install failed!
    pause
    exit /b 1
)

echo.
echo  ✅ Build complete! RedClaw upgraded successfully.
echo.
echo  To apply, restart the gateway:
echo    openclaw gateway restart
echo    or manually: Stop-Process -Id (Get-Process node | Where CommandLine -match gateway).Id -Force
echo.
pause
