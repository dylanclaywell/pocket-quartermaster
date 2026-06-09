# First-time SavesManager install on Windows. Drops run/update scripts and
# the latest build into the folder this script lives in.
#
# Friend-friendly flow:
#   1. Make a folder (e.g. C:\SavesManager).
#   2. Download install.bat from the latest GitHub Release into that folder.
#   3. Double-click install.bat.
#   4. Double-click run.bat afterward to start the server.
$ErrorActionPreference = "Stop"

$Repo = if ($env:SAVESMANAGER_REPO) { $env:SAVESMANAGER_REPO } else { "dylanclaywell/saves-manager" }
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-ReleaseFile($Name) {
    $Url = "https://github.com/$Repo/releases/latest/download/$Name"
    $Dest = Join-Path $Root $Name
    Write-Host "  -> $Name" -ForegroundColor DarkGray
    Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
}

Write-Host "==> Checking for Node.js" -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js was not found on PATH." -ForegroundColor Red
    Write-Host "SavesManager requires Node.js 22 or newer." -ForegroundColor Yellow
    Write-Host "Install it from https://nodejs.org/ (pick the LTS download), then re-run install.bat." -ForegroundColor Yellow
    exit 1
}

$NodeVersion = (& node --version)
Write-Host "Found Node $NodeVersion" -ForegroundColor Green

Write-Host ""
Write-Host "==> Downloading run/update scripts from latest release" -ForegroundColor Cyan
Get-ReleaseFile "run.ps1"
Get-ReleaseFile "run.bat"
Get-ReleaseFile "update.ps1"
Get-ReleaseFile "update.bat"

$EnvFile = Join-Path $Root "savesmanager.env"
if (Test-Path $EnvFile) {
    Write-Host "Keeping existing savesmanager.env" -ForegroundColor DarkGray
    if ($env:HOST -or $env:PORT) {
        Write-Host "    NOTE: HOST/PORT env vars were set but ignored (env file already exists)." -ForegroundColor Yellow
        Write-Host "    Edit savesmanager.env manually to change them." -ForegroundColor Yellow
    }
} else {
    Write-Host "  -> savesmanager.env (from defaults)" -ForegroundColor DarkGray
    Invoke-WebRequest -Uri "https://github.com/$Repo/releases/latest/download/savesmanager.env.example" -OutFile $EnvFile -UseBasicParsing
    if ($env:HOST) {
        (Get-Content $EnvFile) -replace '^HOST=.*', "HOST=$($env:HOST)" | Set-Content $EnvFile -Encoding ascii
        Write-Host "    HOST=$($env:HOST)" -ForegroundColor DarkGray
    }
    if ($env:PORT) {
        (Get-Content $EnvFile) -replace '^PORT=.*', "PORT=$($env:PORT)" | Set-Content $EnvFile -Encoding ascii
        Write-Host "    PORT=$($env:PORT)" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "==> Downloading first build via update.ps1" -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "update.ps1")

Write-Host ""
Write-Host "Install complete." -ForegroundColor Green
Write-Host "Start the server:    run.bat" -ForegroundColor DarkGray
Write-Host "Update later:        update.bat" -ForegroundColor DarkGray
Write-Host "Config (port/host):  savesmanager.env" -ForegroundColor DarkGray
