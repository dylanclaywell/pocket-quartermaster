@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_INSTALL=%SCRIPT_DIR%install.ps1"

if "%HOST%"=="" (
    set /p HOST=Host to bind to [0.0.0.0]:
)
if "%HOST%"=="" set "HOST=0.0.0.0"

if "%PORT%"=="" (
    set /p PORT=Port to listen on [3000]:
)
if "%PORT%"=="" set "PORT=3000"

echo Using HOST=%HOST% PORT=%PORT%
echo.

if not exist "%PS_INSTALL%" (
    echo Bootstrapping install.ps1 from latest release...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
        "Invoke-WebRequest -Uri 'https://github.com/dylanclaywell/pocket-quartermaster/releases/latest/download/install.ps1' -OutFile '%PS_INSTALL%' -UseBasicParsing"
    if errorlevel 1 (
        echo Failed to download install.ps1. Check your internet connection.
        pause
        exit /b 1
    )
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_INSTALL%" %*
echo.
pause
