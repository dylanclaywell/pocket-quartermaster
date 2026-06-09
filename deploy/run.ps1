# Starts SavesManager from the .output folder next to this script.
# Run via run.bat (recommended) or: powershell.exe -ExecutionPolicy Bypass -File run.ps1
$ErrorActionPreference = "Stop"

$Root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Entry = Join-Path $Root ".output\server\index.mjs"
$EnvFile = Join-Path $Root "savesmanager.env"

if (-not (Test-Path $Entry)) {
    Write-Host "Build not found at $Entry" -ForegroundColor Red
    Write-Host "Run update.bat first to download the latest release." -ForegroundColor Yellow
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed (or not on PATH)." -ForegroundColor Red
    Write-Host "Install Node 22+ from https://nodejs.org/ and try again." -ForegroundColor Yellow
    exit 1
}

# Defaults, overridable via savesmanager.env (KEY=VALUE lines, # comments allowed)
$env:NODE_ENV = "production"
$env:HOST     = "0.0.0.0"
$env:PORT     = "3000"

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $key   = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        Set-Item -Path "env:$key" -Value $value
    }
}

Write-Host "Starting SavesManager on http://localhost:$($env:PORT)" -ForegroundColor Green
Write-Host "Bound to $($env:HOST):$($env:PORT). Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

& node $Entry
