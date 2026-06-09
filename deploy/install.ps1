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
    Write-Host "Node.js was not found on PATH." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        $Answer = Read-Host "Install Node.js 20 LTS via winget now? [Y/n]"
        if ($Answer -eq "" -or $Answer -match '^[Yy]') {
            winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
            Write-Host "Node installed. You may need to close and reopen this window for PATH to refresh." -ForegroundColor Yellow
            Write-Host "Re-run install.bat after reopening if 'node' is still not recognized." -ForegroundColor Yellow
        } else {
            Write-Host "Skipping Node install. Install Node 20+ from https://nodejs.org/ and re-run install.bat." -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "winget not available. Install Node 20+ from https://nodejs.org/ and re-run install.bat." -ForegroundColor Yellow
        exit 1
    }
} else {
    $NodeVersion = (& node --version)
    Write-Host "Found Node $NodeVersion" -ForegroundColor Green
}

Write-Host ""
Write-Host "==> Downloading run/update scripts from latest release" -ForegroundColor Cyan
Get-ReleaseFile "run.ps1"
Get-ReleaseFile "run.bat"
Get-ReleaseFile "update.ps1"
Get-ReleaseFile "update.bat"

Write-Host ""
Write-Host "==> Downloading first build via update.ps1" -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root "update.ps1")

Write-Host ""
Write-Host "Install complete." -ForegroundColor Green
Write-Host "Start the server:    run.bat" -ForegroundColor DarkGray
Write-Host "Update later:        update.bat" -ForegroundColor DarkGray
