# Downloads the latest SavesManager build from GitHub Releases and swaps it
# in next to this script. Run via update.bat (recommended).
$ErrorActionPreference = "Stop"

$Repo  = if ($env:SAVESMANAGER_REPO) { $env:SAVESMANAGER_REPO } else { "dylanclaywell/saves-manager" }
$Asset = "savesmanager-output.zip"
$Url   = "https://github.com/$Repo/releases/latest/download/$Asset"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tmp  = Join-Path $env:TEMP "savesmanager-update-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $Tmp -Force | Out-Null

try {
    $Zip = Join-Path $Tmp "output.zip"
    Write-Host "Downloading $Url" -ForegroundColor Cyan
    Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing

    Write-Host "Extracting..." -ForegroundColor Cyan
    Expand-Archive -Path $Zip -DestinationPath $Tmp -Force

    $NewOutput = Join-Path $Tmp ".output"
    if (-not (Test-Path $NewOutput)) {
        throw "Zip did not contain a .output folder"
    }

    $Target = Join-Path $Root ".output"
    $Backup = Join-Path $Root ".output.old"

    if (Test-Path $Backup) { Remove-Item -Recurse -Force $Backup }
    if (Test-Path $Target) { Rename-Item -Path $Target -NewName ".output.old" }

    Move-Item -Path $NewOutput -Destination $Target

    Write-Host ""
    Write-Host "Update complete." -ForegroundColor Green
    Write-Host "Previous build kept at: $Backup" -ForegroundColor DarkGray
    Write-Host "Start the server with run.bat." -ForegroundColor DarkGray
} finally {
    if (Test-Path $Tmp) { Remove-Item -Recurse -Force $Tmp }
}
