# Build script for Amon Hen on Windows
# Usage:
#   .\build.ps1            -> Stops running instances, builds with wails build
#   .\build.ps1 -Restart   -> Stops running instances, builds with wails build, launches new build

param (
    [switch]$Restart
)

$ErrorActionPreference = "Stop"

Write-Host "Checking for running instances of Amon Hen..." -ForegroundColor Cyan
$runningProcesses = Get-Process -Name "Amon Hen", "Amon Hen-dev" -ErrorAction SilentlyContinue

if ($runningProcesses) {
    Write-Host "Closing running instances to release file lock..." -ForegroundColor Yellow
    $runningProcesses | Stop-Process -Force
    Start-Sleep -Milliseconds 500
}

Write-Host "Building application with Wails..." -ForegroundColor Cyan
wails build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Wails build failed."
    exit $LASTEXITCODE
}

Write-Host "Build complete: build\bin\Amon Hen.exe" -ForegroundColor Green

if ($Restart) {
    Write-Host "Starting updated Amon Hen..." -ForegroundColor Cyan
    Start-Process -FilePath "build\bin\Amon Hen.exe"
}
