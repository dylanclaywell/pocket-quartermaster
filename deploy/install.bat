@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_INSTALL=%SCRIPT_DIR%install.ps1"

if not exist "%PS_INSTALL%" (
    echo Bootstrapping install.ps1 from latest release...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
        "Invoke-WebRequest -Uri 'https://github.com/dylanclaywell/saves-manager/releases/latest/download/install.ps1' -OutFile '%PS_INSTALL%' -UseBasicParsing"
    if errorlevel 1 (
        echo Failed to download install.ps1. Check your internet connection.
        pause
        exit /b 1
    )
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS_INSTALL%" %*
echo.
pause
