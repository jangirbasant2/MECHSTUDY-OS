# ==============================================================================
# MECHSTUDY OS — Windows Uninstallation Script
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$PurgeUserData = $false
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n[MECHSTUDY OS] " -ForegroundColor Cyan -NoNewline
    Write-Host $Message -ForegroundColor White
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] " -ForegroundColor Green -NoNewline
    Write-Host $Message -ForegroundColor White
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "`n[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $Message -ForegroundColor Yellow
}

Clear-Host
Write-Host @"
==============================================================================
                    MECHSTUDY OS — Uninstaller Helper
==============================================================================
"@ -ForegroundColor Cyan

# Locate uninstaller in default install directory
$programDir = Join-Path $env:LOCALAPPDATA "Programs\MECHSTUDY OS"
$uninstaller = Join-Path $programDir "Uninstall MECHSTUDY OS.exe"

if (-not (Test-Path $uninstaller)) {
    # Check 64-bit program files fallback
    $uninstallerFallback = Join-Path ${env:ProgramFiles} "MECHSTUDY OS\Uninstall MECHSTUDY OS.exe"
    if (Test-Path $uninstallerFallback) {
        $uninstaller = $uninstallerFallback
    }
}

if (-not (Test-Path $uninstaller)) {
    Write-ErrorMsg "MECHSTUDY OS uninstaller was not found at expected location:`n$uninstaller"
    Write-Host "You can uninstall MECHSTUDY OS from Windows Settings > Installed apps." -ForegroundColor Yellow
    exit 1
}

Write-Step "Found uninstaller: $uninstaller"

$userDataDir = Join-Path $env:APPDATA "MECHSTUDY OS"
if (Test-Path $userDataDir) {
    Write-Host "`nNOTE: Your personal study database, notes, and bookmarks are located at:" -ForegroundColor Cyan
    Write-Host "$userDataDir" -ForegroundColor White
    Write-Host "By default, your personal study data is PRESERVED so you never lose your progress." -ForegroundColor Green
}

Write-Step "Launching Windows uninstaller..."
try {
    $proc = Start-Process -FilePath $uninstaller -Wait -PassThru
    Write-Success "MECHSTUDY OS program files have been uninstalled."
} catch {
    Write-ErrorMsg "Failed to launch uninstaller: $($_.Exception.Message)"
    exit 1
}

if ($PurgeUserData) {
    $confirm = Read-Host "Are you absolutely sure you want to delete all personal study notes and databases in $userDataDir? (y/N)"
    if ($confirm -eq 'y' -or $confirm -eq 'Y') {
        if (Test-Path $userDataDir) {
            Remove-Item -Recurse -Force $userDataDir
            Write-Success "Personal study database removed."
        }
    } else {
        Write-Host "Personal study data preserved." -ForegroundColor Cyan
    }
}
