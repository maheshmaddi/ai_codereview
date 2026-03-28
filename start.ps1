# ============================================================
# OpenClaw Code Review - Single Start Script (Windows)
# ============================================================
# Starts the backend API server and Next.js web UI without Docker.
# Migrated from OpenCode to OpenClaw for AI code review.
# Prerequisites: Node.js 18+ must be installed.
# Usage: .\start.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw Code Review - Starting...   " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Check Node.js ---
$nodeVersion = $null
try {
    $nodeVersion = (node --version 2>$null)
} catch {}

if (-not $nodeVersion) {
    Write-Host "[ERROR] Node.js is not installed. Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
    Write-Host ""
    Write-Host "Quick install (Windows):" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://nodejs.org/en/download/" -ForegroundColor White
    Write-Host "  2. Or use winget: winget install OpenJS.NodeJS.LTS" -ForegroundColor White
    Write-Host "  3. Or use chocolatey: choco install nodejs-lts" -ForegroundColor White
    exit 1
}

$major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($major -lt 18) {
    Write-Host "[ERROR] Node.js $nodeVersion detected. Version 18+ is required." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Node.js $nodeVersion" -ForegroundColor Green

# --- Check for OpenClaw Installation ---
$projectRoot = $PSScriptRoot
Write-Host ""
Write-Host "Checking OpenClaw installation..." -ForegroundColor Cyan

$openclawCmd = $null
try {
    $openclawCmd = (Get-Command openclaw -ErrorAction SilentlyContinue).Source
} catch {}

if (-not $openclawCmd) {
    Write-Host "[WARN] OpenClaw CLI not found in PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "OpenClaw is required for AI code review features." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Installation options:" -ForegroundColor Cyan
    Write-Host "  1. Install via npm:" -ForegroundColor White
    Write-Host "     npm install -g openclaw" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Install from source:" -ForegroundColor White
    Write-Host "     git clone https://github.com/openclaw/openclaw.git" -ForegroundColor Gray
    Write-Host "     cd openclaw && npm install && npm link" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. Continue without OpenClaw (limited functionality)" -ForegroundColor White
    Write-Host ""

    $response = Read-Host "Continue without OpenClaw? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "[INFO] Please install OpenClaw and run this script again." -ForegroundColor Yellow
        exit 0
    }

    Write-Host "[WARN] Continuing without OpenClaw - AI features will not work" -ForegroundColor Yellow
} else {
    Write-Host "[OK] OpenClaw CLI found: $openclawCmd" -ForegroundColor Green
}

# --- Get OpenClaw gateway port ---
$gatewayPort = 18789
if ($openclawCmd) {
    try {
        $portConfig = (cmd /c "openclaw config get gateway.port 2>nul" 2>$null | Out-String).Trim()
        if ($portConfig -match '^\d+$') {
            $gatewayPort = [int]$portConfig
        } elseif ($portConfig -match '"(\d+)"') {
            $gatewayPort = [int]$Matches[1]
        }
    } catch {}
    Write-Host "[OK] OpenClaw gateway port: $gatewayPort" -ForegroundColor Green
}

# --- Check / Start OpenClaw Gateway ---
$openclawJob = $null
if ($openclawCmd) {
    Write-Host ""
    Write-Host "Checking OpenClaw gateway..." -ForegroundColor Cyan

    $gatewayRunning = $false
    try {
        $healthCheck = Invoke-WebRequest -Uri "http://localhost:$gatewayPort/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($healthCheck.StatusCode -eq 200) {
            $gatewayRunning = $true
        }
    } catch {}

    if ($gatewayRunning) {
        Write-Host "[OK] OpenClaw gateway already running (port $gatewayPort)" -ForegroundColor Green
    } else {
        Write-Host "[STARTING] OpenClaw gateway..." -ForegroundColor Yellow
        $savedPref2 = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $openclawJob = Start-Job -ScriptBlock {
            & $using:openclawCmd gateway start 2>&1
        }
        $ErrorActionPreference = $savedPref2

        # Wait for gateway to come up (up to 15 seconds)
        $maxWait = 15
        $waited = 0
        while ($waited -lt $maxWait) {
            Start-Sleep -Seconds 1
            $waited++
            try {
                $check = Invoke-WebRequest -Uri "http://localhost:$using:gatewayPort/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
                if ($check.StatusCode -eq 200) {
                    $gatewayRunning = $true
                    break
                }
            } catch {}
            Write-Host "  Waiting... ($waited/$maxWait)" -ForegroundColor Gray
        }

        if ($gatewayRunning) {
            Write-Host "[OK] OpenClaw gateway started (port $gatewayPort)" -ForegroundColor Green
        } else {
            Write-Host "[WARN] OpenClaw gateway did not start within ${maxWait}s - continuing anyway" -ForegroundColor Yellow
        }
    }
}

# --- Check for OpenClaw Skills ---
Write-Host ""
Write-Host "Checking OpenClaw skills..." -ForegroundColor Cyan

$requiredSkills = @("codereview-int-deep", "codereview", "pushcomments",
    "architecture-analyze", "architecture-plan", "development-execute",
    "testing-plan", "testing-execute")
$missingSkills = @()

if ($openclawCmd) {
    $savedPref = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $skillsList = (cmd /c "openclaw skills list 2>nul" 2>$null | Out-String)
    $ErrorActionPreference = $savedPref

    foreach ($skill in $requiredSkills) {
        if ($skillsList -match [regex]::Escape($skill)) {
            Write-Host "[OK] Skill found: $skill" -ForegroundColor Green
        } else {
            $missingSkills += $skill
        }
    }

    if ($missingSkills.Count -gt 0) {
        Write-Host ""
        Write-Host "[WARN] Missing skills: $($missingSkills -join ', ')" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Skills are located in: ~/.openclaw/workspace/skills/" -ForegroundColor Cyan
        Write-Host "Each skill needs a SKILL.md file in its own subdirectory." -ForegroundColor White
        Write-Host ""
    }
}

# --- Setup .env files ---

# Server .env
$serverDir = Join-Path $projectRoot "server"
$serverEnv = Join-Path $serverDir ".env"
$serverEnvExample = Join-Path $serverDir ".env.example"
if (-not (Test-Path $serverEnv)) {
    if (Test-Path $serverEnvExample) {
        Copy-Item $serverEnvExample $serverEnv
        Write-Host '[SETUP] Created server/.env from .env.example' -ForegroundColor Yellow
        Write-Host '[ACTION] Please edit server/.env with your settings:' -ForegroundColor Yellow
        Write-Host "  - OPENCLAW_SERVER_URL (default: http://localhost:$gatewayPort)" -ForegroundColor White
        Write-Host '  - GITHUB_TOKEN (your GitHub PAT)' -ForegroundColor White
        Write-Host '  - GITHUB_WEBHOOK_SECRET (if using webhooks)' -ForegroundColor White
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
        Write-Host '[SETUP] Created web/.env.local from .env.example' -ForegroundColor Yellow
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
Write-Host "[STARTED] Web UI (port 3002)" -ForegroundColor Green

# --- Display Info ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Services Running:" -ForegroundColor Cyan
Write-Host "  OpenClaw:    http://localhost:$gatewayPort" -ForegroundColor White
Write-Host "  API Server:  http://localhost:3001" -ForegroundColor White
Write-Host "  Web UI:      http://localhost:3002" -ForegroundColor White
Write-Host "  Health:      http://localhost:3001/health" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  - Edit server/.env for GitHub token and settings" -ForegroundColor White
Write-Host "  - Set GITHUB_POLLING_ENABLED=true for polling mode" -ForegroundColor White
Write-Host ""

if ($missingSkills.Count -gt 0) {
    Write-Host "Missing Skills:" -ForegroundColor Yellow
    foreach ($skill in $missingSkills) {
        Write-Host "  - $skill" -ForegroundColor White
    }
    Write-Host "  Skills directory: ~/.openclaw/workspace/skills/" -ForegroundColor White
    Write-Host ""
}

Write-Host "Press Ctrl+C to stop all services..." -ForegroundColor Gray
Write-Host ""

# --- Keep alive and handle shutdown ---
try {
    while ($true) {
        # Check if jobs are still running
        if ($openclawJob -and $openclawJob.State -eq 'Failed') {
            Write-Host "[ERROR] OpenClaw gateway crashed. Logs:" -ForegroundColor Red
            Receive-Job -Id $openclawJob.Id
        }
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
    # Stop OpenClaw gateway
    if ($openclawJob) {
        Stop-Job -Id $openclawJob.Id -ErrorAction SilentlyContinue
        Remove-Job -Id $openclawJob.Id -Force -ErrorAction SilentlyContinue
    }
    Stop-Job -Id $serverJob.Id -ErrorAction SilentlyContinue
    Stop-Job -Id $webJob.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $serverJob.Id -Force -ErrorAction SilentlyContinue
    Remove-Job -Id $webJob.Id -Force -ErrorAction SilentlyContinue
    Write-Host '[OK] All services stopped.' -ForegroundColor Green
}
