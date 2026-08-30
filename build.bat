@echo off
chcp 65001 >nul 2>&1

echo.
echo === RedClaw Build Script ===
echo.

echo [1/3] Building backend + GUI web...
call pnpm build
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Build failed!
    pause
    exit /b 1
)

echo.
echo [2/3] Installing globally...
rem --force: 版本号没变时 npm 会静默跳过复制
call npm install -g . --force
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Global install failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Building desktop app (Tauri)...
rem 桌面端前端在 tauri build 时嵌入 exe，只跑 vite build 不会更新已安装的 GUI
cd /d "%~dp0packages\desktop-gui"
call pnpm tauri:build
set TAURI_EXIT=%errorlevel%
cd /d "%~dp0"
if %TAURI_EXIT% neq 0 (
    echo.
    echo [FAIL] Tauri build failed!
    pause
    exit /b 1
)

echo.
echo === Build complete! ===
echo.
echo Desktop app (run directly):
echo   packages\desktop-gui\src-tauri\target\release\redclaw-desktop.exe
echo Installer (for reinstall):
echo   packagesdesktop-guisrc-tauri	argeteleaseundle
sis\
echo.
echo To apply gateway changes, restart:
echo   pnpm openclaw gateway restart
echo.
pause
