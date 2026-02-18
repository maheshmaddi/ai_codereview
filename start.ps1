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

# --- Sync OpenCode Config ---
$projectRoot = $PSScriptRoot
Write-Host ""
Write-Host "Syncing OpenCode configuration..." -ForegroundColor Cyan

function Sync-OpencodeConfig {
    $globalOpenCodePath = Join-Path $env:USERPROFILE ".opencode"
    $projectOpenCodePath = Join-Path $projectRoot ".opencode"
    
    if (-not (Test-Path $globalOpenCodePath)) {
        New-Item -ItemType Directory -Path $globalOpenCodePath -Force | Out-Null
        Write-Host "[CREATED] Global OpenCode directory: $globalOpenCodePath" -ForegroundColor Green
    }
    
    # Copy agents
    $projectAgents = Join-Path $projectOpenCodePath "agents"
    $globalAgents = Join-Path $globalOpenCodePath "agents"
    if (Test-Path $projectAgents) {
        if (-not (Test-Path $globalAgents)) {
            New-Item -ItemType Directory -Path $globalAgents -Force | Out-Null
        }
        Copy-Item -Path "$projectAgents\*" -Destination $globalAgents -Recurse -Force
        Write-Host "[OK] Synced OpenCode agents to global config" -ForegroundColor Green
    }
    
    # Copy commands
    $projectCommands = Join-Path $projectOpenCodePath "commands"
    $globalCommands = Join-Path $globalOpenCodePath "commands"
    if (Test-Path $projectCommands) {
        if (-not (Test-Path $globalCommands)) {
            New-Item -ItemType Directory -Path $globalCommands -Force | Out-Null
        }
        Copy-Item -Path "$projectCommands\*" -Destination $globalCommands -Recurse -Force
        Write-Host "[OK] Synced OpenCode commands to global config" -ForegroundColor Green
    }
    
    # Copy rules if exists
    $projectRules = Join-Path $projectOpenCodePath "rules"
    $globalRules = Join-Path $globalOpenCodePath "rules"
    if (Test-Path $projectRules) {
        if (-not (Test-Path $globalRules)) {
            New-Item -ItemType Directory -Path $globalRules -Force | Out-Null
        }
        Copy-Item -Path "$projectRules\*" -Destination $globalRules -Recurse -Force
        Write-Host "[OK] Synced OpenCode rules to global config" -ForegroundColor Green
    }

    # Merge project opencode.json permissions into global ~/.config/opencode/opencode.json
    # This ensures permissions apply even when opencode CLI runs from temp directories
    $projectOpencodeJson = Join-Path $projectRoot "opencode.json"
    $globalOpencodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
    $globalOpencodeJson = Join-Path $globalOpencodeConfigDir "opencode.json"
    
    if (Test-Path $projectOpencodeJson) {
        try {
            $projectConfig = Get-Content $projectOpencodeJson -Raw | ConvertFrom-Json
            if ($projectConfig.permission) {
                # Read or create global config
                if (Test-Path $globalOpencodeJson) {
                    $globalConfig = Get-Content $globalOpencodeJson -Raw | ConvertFrom-Json
                } else {
                    if (-not (Test-Path $globalOpencodeConfigDir)) {
                        New-Item -ItemType Directory -Path $globalOpencodeConfigDir -Force | Out-Null
                    }
                    $globalConfig = [PSCustomObject]@{ '$schema' = 'https://opencode.ai/config.json' }
                }
                
                # Merge permission block
                if (-not $globalConfig.permission) {
                    $globalConfig | Add-Member -MemberType NoteProperty -Name 'permission' -Value $projectConfig.permission -Force
                } else {
                    # Merge each permission key (external_directory, etc)
                    $projectConfig.permission.PSObject.Properties | ForEach-Object {
                        if ($globalConfig.permission.PSObject.Properties.Match($_.Name).Count -eq 0) {
                             $globalConfig.permission | Add-Member -MemberType NoteProperty -Name $_.Name -Value $_.Value -Force
                        } else {
                             # Ideally deep merge, but for now just overwrite top-level keys like "external_directory"
                             $globalConfig.permission.$($_.Name) = $_.Value
                        }
                    }
                }
                $globalConfig | ConvertTo-Json -Depth 10 | Set-Content $globalOpencodeJson -Encoding UTF8
                Write-Host "[OK] Synced OpenCode permissions to global config" -ForegroundColor Green
            }
        } catch {
            Write-Host "[WARN] Failed to sync OpenCode permissions: $_" -ForegroundColor Yellow
        }
    }
}

Sync-OpencodeConfig

# --- Setup .env files ---

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

# Start OpenCode server in background (required for AI review features)
# Resolve the full path first (Start-Job runs in a clean environment without PATH)
$opencodeCmd = (Get-Command opencode -ErrorAction SilentlyContinue)
if ($opencodeCmd) { $opencodeCmd = $opencodeCmd.Source }
if (-not $opencodeCmd) {
    Write-Host "[WARN] opencode not found in PATH - AI features may not work" -ForegroundColor Yellow
    $opencodeJob = $null
} else {
    $opencodeJob = Start-Job -ScriptBlock {
        & $using:opencodeCmd serve 2>&1
    }
    Write-Host "[STARTED] OpenCode server (port 4096)" -ForegroundColor Green
    Write-Host "Waiting for OpenCode to initialize (5s)..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5
    Write-Host "[OK] Continuing startup" -ForegroundColor Green
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
Write-Host "[STARTED] Web UI (port 3000)" -ForegroundColor Green

# --- Display Info ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Services Running:" -ForegroundColor Cyan
Write-Host "  OpenCode:    http://localhost:4096" -ForegroundColor White
Write-Host "  API Server:  http://localhost:3001" -ForegroundColor White
Write-Host "  Web UI:      http://localhost:3000" -ForegroundColor White
Write-Host "  Health:      http://localhost:3001/health" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host '[INFO] If using polling mode, ensure GITHUB_POLLING_ENABLED=true in server/.env' -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop all services..." -ForegroundColor Gray
Write-Host ""

# --- Keep alive and handle shutdown ---
try {
    while ($true) {
        # Check if jobs are still running
        # Check if OpenCode process is still running
        if ($opencodeJob -and $opencodeJob.State -eq 'Failed') {
            Write-Host "[ERROR] OpenCode server crashed. Logs:" -ForegroundColor Red
            Receive-Job -Id $opencodeJob.Id
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
    # Stop OpenCode job
    if ($opencodeJob) {
        Stop-Job -Id $opencodeJob.Id -ErrorAction SilentlyContinue
        Remove-Job -Id $opencodeJob.Id -Force -ErrorAction SilentlyContinue
    }
    Stop-Job -Id $serverJob.Id -ErrorAction SilentlyContinue
    Stop-Job -Id $webJob.Id -ErrorAction SilentlyContinue
    Remove-Job -Id $serverJob.Id -Force -ErrorAction SilentlyContinue
    Remove-Job -Id $webJob.Id -Force -ErrorAction SilentlyContinue
    Write-Host '[OK] All services stopped.' -ForegroundColor Green
}
