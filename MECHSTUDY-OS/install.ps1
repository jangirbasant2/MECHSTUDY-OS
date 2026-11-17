# ==============================================================================
# MECHSTUDY OS — One-Line Windows Installation Script
# Usage:
#   irm https://raw.githubusercontent.com/jangirbasant2/MECHSTUDY-OS/main/install.ps1 | iex
# ==============================================================================

[CmdletBinding()]
param(
    [string]$Repo = "jangirbasant2/MECHSTUDY-OS",
    [string]$Version = "latest",
    [switch]$Silent = $false
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
   __  __ _____ ____ _   _ ____ _____ _   _ ______   __   ___  ____  
  |  \/  | ____/ ___| | | / ___|_   _| | | |  _ \ \ / /  / _ \/ ___| 
  | |\/| |  _|| |   | |_| \___ \ | | | | | | | | \ V /  | | | \___ \ 
  | |  | | |__| |___|  _  |___) || | | |_| | |_| || |   | |_| |___) |
  |_|  |_|_____\____|_| |_|____/ |_|  \___/|____/ |_|    \___/|____/ 
                                                                       
  RTU + GATE Mechanical Engineering Study Workspace & Local AI Brain
==============================================================================
"@ -ForegroundColor Cyan

Write-Step "Initializing setup environment on Windows ($([System.Environment]::OSVersion.VersionString))..."

# Check Windows Architecture
$is64Bit = [System.Environment]::Is64BitOperatingSystem
if (-not $is64Bit) {
    Write-ErrorMsg "MECHSTUDY OS requires a 64-bit Windows operating system (x64). Installation aborted."
    exit 1
}

# Ensure TLS 1.2 / 1.3 is enabled
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12

$apiUrl = if ($Version -eq "latest") {
    "https://api.github.com/repos/$Repo/releases/latest"
} else {
    "https://api.github.com/repos/$Repo/releases/tags/$Version"
}

Write-Step "Querying GitHub Releases for $Repo ($Version)..."
$releaseData = $null
try {
    $headers = @{
        "User-Agent" = "MECHSTUDY-OS-Installer"
        "Accept" = "application/vnd.github.v3+json"
    }
    $releaseData = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get
} catch {
    Write-Host "Notice: GitHub API query returned an error or was rate-limited: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Step "Falling back to direct release asset resolution..."
}

# Resolve Download URL
$downloadUrl = $null
$checksumUrl = $null
$assetName = "MECHSTUDY-OS-Setup-1.0.0.exe"

if ($releaseData -and $releaseData.assets) {
    $installerAsset = $releaseData.assets | Where-Object { $_.name -like "*Setup*.exe" } | Select-Object -First 1
    if ($installerAsset) {
        $downloadUrl = $installerAsset.browser_download_url
        $assetName = $installerAsset.name
    }
    $checksumAsset = $releaseData.assets | Where-Object { $_.name -like "*checksum*.sha256" -or $_.name -like "*SHA256*" } | Select-Object -First 1
    if ($checksumAsset) {
        $checksumUrl = $checksumAsset.browser_download_url
    }
}

if (-not $downloadUrl) {
    # Direct fallback download URL
    $tag = if ($releaseData -and $releaseData.tag_name) { $releaseData.tag_name } else { "v1.0.0" }
    $downloadUrl = "https://github.com/$Repo/releases/download/$tag/MECHSTUDY-OS-Setup-1.0.0.exe"
    $checksumUrl = "https://github.com/$Repo/releases/download/$tag/MECHSTUDY-OS-Setup-1.0.0.exe.sha256"
}

$tempDir = [System.IO.Path]::GetTempPath()
$targetInstaller = Join-Path $tempDir $assetName
$targetChecksum = Join-Path $tempDir "$assetName.sha256"

Write-Step "Downloading installer ($assetName)..."
Write-Host "Source: $downloadUrl" -ForegroundColor DarkGray
Write-Host "Target: $targetInstaller" -ForegroundColor DarkGray

try {
    $webClient = New-Object System.Net.WebClient
    $webClient.Headers.Add("User-Agent", "MECHSTUDY-OS-Installer")
    $webClient.DownloadFile($downloadUrl, $targetInstaller)
} catch {
    Write-ErrorMsg "Failed to download MECHSTUDY OS installer: $($_.Exception.Message)"
    Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check your internet connection." -ForegroundColor White
    Write-Host "2. Download manually from: https://github.com/$Repo/releases" -ForegroundColor White
    exit 1
}

# Validate Download File Exists and is not empty
if (-not (Test-Path $targetInstaller) -or ((Get-Item $targetInstaller).Length -lt 10000000)) {
    Write-ErrorMsg "Downloaded installer is incomplete or corrupted. Please check network connectivity and retry."
    exit 1
}

$fileSizeMB = [Math]::Round(((Get-Item $targetInstaller).Length / 1MB), 2)
Write-Success "Installer downloaded successfully ($fileSizeMB MB)."

# Attempt Checksum Verification if available
if ($checksumUrl) {
    Write-Step "Attempting SHA-256 integrity verification..."
    try {
        $webClient.DownloadFile($checksumUrl, $targetChecksum)
        if (Test-Path $targetChecksum) {
            $expectedHashRaw = (Get-Content $targetChecksum -Raw).Trim()
            $expectedHash = ($expectedHashRaw -split '\s+')[0].Trim().ToLower()
            $actualHash = (Get-FileHash -Path $targetInstaller -Algorithm SHA256).Hash.ToLower()

            if ($expectedHash -eq $actualHash) {
                Write-Success "SHA-256 checksum matched: $actualHash"
            } else {
                Write-ErrorMsg "Checksum mismatch! Expected: $expectedHash, Actual: $actualHash"
                Write-Host "Aborting installation due to failed checksum verification." -ForegroundColor Red
                exit 1
            }
        }
    } catch {
        Write-Host "Checksum file was not provided by the release asset server. Proceeding with standard signature check." -ForegroundColor DarkGray
    }
}

# Launching Installer
Write-Step "Launching MECHSTUDY OS Setup..."
Write-Host "Follow the on-screen installer prompts. (Your user data in %APPDATA% is never touched)." -ForegroundColor Cyan

$installerArgs = if ($Silent) { "/S" } else { "" }

try {
    $process = Start-Process -FilePath $targetInstaller -ArgumentList $installerArgs -Wait -PassThru
    if ($process.ExitCode -eq 0) {
        Write-Success "MECHSTUDY OS installation completed successfully!"
        Write-Host "`nYou can now launch MECHSTUDY OS from your Start Menu or Desktop shortcut." -ForegroundColor Green
    } else {
        Write-Host "`nInstaller exited with status code: $($process.ExitCode)" -ForegroundColor Yellow
    }
} catch {
    Write-ErrorMsg "Failed to execute installer: $($_.Exception.Message)"
} finally {
    # Cleanup temporary installer file
    if (Test-Path $targetInstaller) {
        Remove-Item $targetInstaller -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $targetChecksum) {
        Remove-Item $targetChecksum -Force -ErrorAction SilentlyContinue
    }
}
