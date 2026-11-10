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
rem --force: npm skips copying silently when the version is unchanged
call npm install -g . --force
if %errorlevel% neq 0 (
    echo.
    echo [FAIL] Global install failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Building desktop app (Tauri)...
rem GUI frontend is embedded into the exe by tauri build; vite build alone
rem does not update the installed desktop app
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
echo   packages\desktop-gui\src-tauri\target\release\bundle
echo.
echo To apply gateway changes, restart:
echo   pnpm openclaw gateway restart
echo.
pause
