# Starts SavesManager from the .output folder next to this script.
# Run via run.bat (recommended) or: powershell.exe -ExecutionPolicy Bypass -File run.ps1
$ErrorActionPreference = "Stop"

$Root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Entry = Join-Path $Root ".output\server\index.mjs"

if (-not (Test-Path $Entry)) {
    Write-Host "Build not found at $Entry" -ForegroundColor Red
    Write-Host "Run update.bat first to download the latest release." -ForegroundColor Yellow
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed (or not on PATH)." -ForegroundColor Red
    Write-Host "Install Node 20+ from https://nodejs.org/ and try again." -ForegroundColor Yellow
    exit 1
}

$env:NODE_ENV = "production"
$env:HOST     = if ($env:SAVESMANAGER_HOST) { $env:SAVESMANAGER_HOST } else { "0.0.0.0" }
$env:PORT     = if ($env:SAVESMANAGER_PORT) { $env:SAVESMANAGER_PORT } else { "3000" }

Write-Host "Starting SavesManager on http://localhost:$($env:PORT)" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

& node $Entry
