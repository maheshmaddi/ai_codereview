# ============================================================
# OpenCode Code Review - Single Start Script (Windows)
# ============================================================
# Starts the backend API server and Next.js web UI without Docker.
# Prerequisites: Node.js 18+ must be installed.
# Usage: .\start.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenCode Code Review - Starting...    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Check Node.js ---
$nodeVersion = $null
try {
    $nodeVersion = (node --version 2>$null)
} catch {}

if (-not $nodeVersion) {
    Write-Host "[ERROR] Node.js is not installed. Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}

$major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($major -lt 18) {
    Write-Host "[ERROR] Node.js $nodeVersion detected. Version 18+ is required." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Node.js $nodeVersion" -ForegroundColor Green

# --- Setup .env files ---
$projectRoot = $PSScriptRoot

# Server .env
$serverDir = Join-Path $projectRoot "server"
$serverEnv = Join-Path $serverDir ".env"
$serverEnvExample = Join-Path $serverDir ".env.example"
if (-not (Test-Path $serverEnv)) {
    if (Test-Path $serverEnvExample) {
        Copy-Item $serverEnvExample $serverEnv
        Write-Host '[SETUP] Created server/.env from .env.example - please edit with your settings' -ForegroundColor Yellow
    } else {
        Write-Host '[WARN] server/.env.example not found' -ForegroundColor Yellow
    }
} else {
    Write-Host '[OK] server/.env exists' -ForegroundColor Green
}

# Web .env.local
$webDir = Join-Path $projectRoot "web"
$webEnv = Join-Path $webDir ".env.local"
$webEnvExample = Join-Path $webDir ".env.example"
if (-not (Test-Path $webEnv)) {
    if (Test-Path $webEnvExample) {
        Copy-Item $webEnvExample $webEnv
        Write-Host '[SETUP] Created web/.env.local from .env.example - please edit with your settings' -ForegroundColor Yellow
    } else {
        Write-Host '[WARN] web/.env.example not found' -ForegroundColor Yellow
    }
} else {
    Write-Host '[OK] web/.env.local exists' -ForegroundColor Green
}

# --- Install Dependencies ---
Write-Host ""
Write-Host "Installing server dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $projectRoot "server")
$ErrorActionPreference = "Continue"
npm install 2>&1 | Out-Null
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] Server npm install failed" -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "[OK] Server dependencies installed" -ForegroundColor Green

Write-Host "Installing web dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $projectRoot "web")
$ErrorActionPreference = "Continue"
npm install 2>&1 | Out-Null
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] Web npm install failed" -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "[OK] Web dependencies installed" -ForegroundColor Green

# --- Start Services ---
Write-Host ""
Write-Host "Starting services..." -ForegroundColor Cyan

# Start server in background
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:projectRoot
    Set-Location "server"
    npm run dev 2>&1
}
Write-Host "[STARTED] Backend API server (port 3001)" -ForegroundColor Green

# Start web in background
$webJob = Start-Job -ScriptBlock {
    Set-Location $using:projectRoot
    Set-Location "web"
    npm run dev 2>&1
}
Write-Host "[STARTED] Web UI (port 3000)" -ForegroundColor Green

# --- Display Info ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Services Running:" -ForegroundColor Cyan
Write-Host "  API Server:  http://localhost:3001" -ForegroundColor White
Write-Host "  Web UI:      http://localhost:3000" -ForegroundColor White
Write-Host "  Health:      http://localhost:3001/health" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host '[INFO] If using polling mode, ensure GITHUB_POLLING_ENABLED=true in server/.env' -ForegroundColor Yellow
Write-Host '[INFO] If using OpenCode AI features, ensure opencode is running separately' -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop all services..." -ForegroundColor Gray
Write-Host ""

# --- Keep alive and handle shutdown ---
try {
    while ($true) {
        # Check if jobs are still running
        $serverState = (Get-Job -Id $serverJob.Id).State
        $webState = (Get-Job -Id $webJob.Id).State

        if ($serverState -eq 'Failed') {
            Write-Host "[ERROR] Server crashed. Logs:" -ForegroundColor Red
            Receive-Job -Id $serverJob.Id
        }
        if ($webState -eq 'Failed') {
            Write-Host "[ERROR] Web UI crashed. Logs:" -ForegroundColor Red
            Receive-Job -Id $webJob.Id
        }

        Start-Sleep -Seconds 2
    }
} finally {
    Write-Host ""
    Write-Host "Stopping services..." -ForegroundColor Yellow
    Stop-Job -Id $serverJob.Id -ErrorAction SilentlyContinue
    Stop-Job -Id $webJob.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $serverJob.Id -Force -ErrorAction SilentlyContinue
    Remove-Job -Id $webJob.Id -Force -ErrorAction SilentlyContinue
    Write-Host '[OK] All services stopped.' -ForegroundColor Green
}
