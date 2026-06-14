@echo off
chcp 65001 >nul 2>&1

echo.
echo === RedClaw Build Script ===
echo.

echo [1/3] Building backend...
call pnpm build
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Backend build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Building control UI...
call pnpm ui:build
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] UI build failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Installing globally...
call npm install -g .
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Global install failed!
    pause
    exit /b 1
)

echo.
echo === Build complete! ===
echo.
echo To apply, restart the gateway:
echo   pnpm openclaw gateway restart
echo.
pause
