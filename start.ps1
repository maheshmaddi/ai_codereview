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

# --- Check for OpenClaw Skills ---
Write-Host ""
Write-Host "Checking OpenClaw skills (local .opencode/commands/)..." -ForegroundColor Cyan

$requiredSkills = @(
    @{ name = "codereview-init"; file = "codereview-int-deep.md" },
    @{ name = "codereview-pr"; file = "codereview.md" },
    @{ name = "codereview-push"; file = "pushcomments.md" },
    @{ name = "architecture-analyze"; file = "architecture-analyze.md" },
    @{ name = "architecture-plan"; file = "architecture-plan.md" },
    @{ name = "development-execute"; file = "development-execute.md" },
    @{ name = "testing-plan"; file = "testing-plan.md" },
    @{ name = "testing-execute"; file = "testing-execute.md" }
)
$missingSkills = @()

$commandsDir = Join-Path (Join-Path $projectRoot ".opencode") "commands"
foreach ($skill in $requiredSkills) {
    $skillFile = Join-Path $commandsDir $skill.file
    if (Test-Path $skillFile) {
        Write-Host "[OK] Skill found: $($skill.name) ($($skill.file))" -ForegroundColor Green
    } else {
        $missingSkills += $skill.name
        Write-Host "[MISS] Skill missing: $($skill.name) (expected: .opencode/commands/$($skill.file))" -ForegroundColor Yellow
    }
}

if ($missingSkills.Count -gt 0) {
    Write-Host ""
    Write-Host "[WARN] Missing skill files: $($missingSkills -join ', ')" -ForegroundColor Yellow
    Write-Host "Create them in .opencode/commands/ - see MIGRATION.md for details." -ForegroundColor Yellow
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
        Write-Host '  - OPENCLAW_SERVER_URL (default: http://localhost:3000)' -ForegroundColor White
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

# Start OpenClaw server in background (if installed)
$openclawJob = $null
if ($openclawCmd) {
    # Check if OpenClaw is already running
    $openclawRunning = $false
    try {
        $healthCheck = Invoke-WebRequest -Uri "http://localhost:3000/status" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($healthCheck.StatusCode -eq 200) {
            $openclawRunning = $true
        }
    } catch {}
    
    if ($openclawRunning) {
        Write-Host "[OK] OpenClaw already running (port 3000)" -ForegroundColor Green
    } else {
        $openclawJob = Start-Job -ScriptBlock {
            & $using:openclawCmd gateway start 2>&1
        }
        Write-Host "[STARTED] OpenClaw server (port 3000)" -ForegroundColor Green
        Write-Host "Waiting for OpenClaw to initialize (5s)..." -ForegroundColor Cyan
        Start-Sleep -Seconds 5
        Write-Host "[OK] Continuing startup" -ForegroundColor Green
    }
} else {
    Write-Host "[SKIPPED] OpenClaw not installed - AI features disabled" -ForegroundColor Yellow
}

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
Write-Host "  OpenClaw:    http://localhost:3000" -ForegroundColor White
Write-Host "  API Server:  http://localhost:3001" -ForegroundColor White
Write-Host "  Web UI:      http://localhost:3002 (open this in browser)" -ForegroundColor White
Write-Host "  Health:      http://localhost:3001/health" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  - Edit server/.env for GitHub token and settings" -ForegroundColor White
Write-Host "  - Set GITHUB_POLLING_ENABLED=true for polling mode" -ForegroundColor White
Write-Host ""
Write-Host "Feature Lifecycle:" -ForegroundColor Yellow
Write-Host "  - Create features in Projects > Features" -ForegroundColor White
Write-Host "  - Phases: Architecture -> Development -> Testing" -ForegroundColor White
Write-Host "  - Upload requirements (PDF/DOCX/MD/TXT, max 5MB)" -ForegroundColor White
Write-Host ""

if ($missingSkills.Count -gt 0) {
    Write-Host "Missing Skill Files:" -ForegroundColor Yellow
    foreach ($skill in $missingSkills) {
        Write-Host "  - $skill" -ForegroundColor White
    }
    Write-Host "  Create them in .opencode/commands/ - see MIGRATION.md" -ForegroundColor White
    Write-Host ""
}

Write-Host "Press Ctrl+C to stop all services..." -ForegroundColor Gray
Write-Host ""

# --- Keep alive and handle shutdown ---
try {
    while ($true) {
        # Check if jobs are still running
        if ($openclawJob -and $openclawJob.State -eq 'Failed') {
            Write-Host "[ERROR] OpenClaw server crashed. Logs:" -ForegroundColor Red
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
    # Stop OpenClaw job
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
