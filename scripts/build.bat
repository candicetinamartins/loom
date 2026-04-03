@echo off
REM Cross-platform build script for Loom (Windows)
REM Usage: scripts\build.bat [platform] [arch]
REM Platforms: win32, all
REM Architectures: x64

setlocal enabledelayedexpansion

set "PLATFORM=%~1"
if "%PLATFORM%"=="" set "PLATFORM=win32"

set "ARCH=%~2"
if "%ARCH%"=="" set "ARCH=x64"

echo 🔧 Loom Windows Build
echo ==============================
echo Platform: %PLATFORM%
echo Architecture: %ARCH%
echo.

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."

cd /d "%ROOT_DIR%"

REM Install dependencies
echo 📦 Installing dependencies...
call npm ci
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    exit /b 1
)

REM Build packages
echo 🏗️ Building packages...
call npm run build --workspaces
if errorlevel 1 (
    echo ❌ Failed to build packages
    exit /b 1
)

REM Build Electron app
cd packages\loom-electron

echo 🪟 Building for Windows (%ARCH%)...
call npm run build
if errorlevel 1 (
    echo ❌ Failed to build Electron app
    exit /b 1
)

call npx electron-builder --win --%ARCH%
if errorlevel 1 (
    echo ❌ Failed to package Electron app
    exit /b 1
)

echo.
echo ✅ Build complete!
echo Artifacts in: packages\loom-electron\dist\

endlocal
