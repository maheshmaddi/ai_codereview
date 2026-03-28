#!/usr/bin/env bash
# ============================================================
# OpenClaw Code Review — Single Start Script (Linux/Mac)
# ============================================================
# Starts the backend API server and Next.js web UI without Docker.
# Migrated from OpenCode to OpenClaw for AI code review.
# Prerequisites: Node.js 18+ must be installed.
# Usage: ./start.sh
# ============================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "========================================"
echo "  OpenClaw Code Review — Starting...   "
echo "========================================"
echo ""

# --- Check Node.js ---
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
    echo ""
    echo "Quick install:"
    echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -"
    echo "                 sudo apt-get install -y nodejs"
    echo "  macOS:         brew install node@18"
    echo "  or:            nvm install 18 && nvm use 18"
    exit 1
fi

NODE_VERSION=$(node --version)
MAJOR_VERSION=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
if [ "$MAJOR_VERSION" -lt 18 ]; then
    echo "[ERROR] Node.js $NODE_VERSION detected. Version 18+ is required."
    exit 1
fi
echo "[OK] Node.js $NODE_VERSION"

# --- Check for OpenClaw Installation ---
echo ""
echo "Checking OpenClaw installation..."

OPENCLAW_CMD=""
if command -v openclaw &> /dev/null; then
    OPENCLAW_CMD="openclaw"
    echo "[OK] OpenClaw CLI found: $(command -v openclaw)"
else
    echo "[WARN] OpenClaw CLI not found in PATH"
    echo ""
    echo "OpenClaw is required for AI code review features."
    echo ""
    echo "Installation options:"
    echo "  1. Install via npm:"
    echo "     npm install -g openclaw"
    echo ""
    echo "  2. Install from source:"
    echo "     git clone https://github.com/openclaw/openclaw.git"
    echo "     cd openclaw && npm install && npm link"
    echo ""
    echo "  3. Continue without OpenClaw (limited functionality)"
    echo ""

    read -p "Continue without OpenClaw? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "[INFO] Please install OpenClaw and run this script again."
        exit 0
    fi

    echo "[WARN] Continuing without OpenClaw - AI features will not work"
fi

# --- Get OpenClaw gateway port ---
GATEWAY_PORT=18789
if [ -n "$OPENCLAW_CMD" ]; then
    PORT_CONFIG=$(openclaw config get gateway.port 2>/dev/null || echo "")
    if echo "$PORT_CONFIG" | grep -qE '^[0-9]+$'; then
        GATEWAY_PORT=$(echo "$PORT_CONFIG" | grep -oE '[0-9]+')
    fi
    echo "[OK] OpenClaw gateway port: $GATEWAY_PORT"
fi

# --- Check / Start OpenClaw Gateway ---
if [ -n "$OPENCLAW_CMD" ]; then
    echo ""
    echo "Checking OpenClaw gateway..."

    GATEWAY_RUNNING=false
    if curl -sf "http://localhost:$GATEWAY_PORT/health" > /dev/null 2>&1; then
        GATEWAY_RUNNING=true
    fi

    if $GATEWAY_RUNNING; then
        echo "[OK] OpenClaw gateway already running (port $GATEWAY_PORT)"
    else
        echo "[STARTING] OpenClaw gateway..."
        openclaw gateway start &
        OPENCLAW_PID=$!

        # Wait for gateway to come up (up to 15 seconds)
        MAX_WAIT=15
        WAITED=0
        while [ $WAITED -lt $MAX_WAIT ]; do
            sleep 1
            WAITED=$((WAITED + 1))
            if curl -sf "http://localhost:$GATEWAY_PORT/health" > /dev/null 2>&1; then
                GATEWAY_RUNNING=true
                break
            fi
            echo "  Waiting... ($WAITED/$MAX_WAIT)"
        done

        if $GATEWAY_RUNNING; then
            echo "[OK] OpenClaw gateway started (port $GATEWAY_PORT)"
        else
            echo "[WARN] OpenClaw gateway did not start within ${MAX_WAIT}s - continuing anyway"
        fi
    fi
fi

# --- Check for OpenClaw Skills ---
echo ""
echo "Checking OpenClaw skills..."

REQUIRED_SKILLS=("codereview-int-deep" "codereview" "pushcomments")
MISSING_SKILLS=()

if [ -n "$OPENCLAW_CMD" ]; then
    SKILLS_LIST=$(openclaw skills list 2>/dev/null || echo "")

    for skill in "${REQUIRED_SKILLS[@]}"; do
        if echo "$SKILLS_LIST" | grep -q "$skill"; then
            echo "[OK] Skill found: $skill"
        else
            MISSING_SKILLS+=("$skill")
        fi
    done

    if [ ${#MISSING_SKILLS[@]} -gt 0 ]; then
        echo ""
        echo "[WARN] Missing skills: ${MISSING_SKILLS[*]}"
        echo ""
        echo "Skills are located in: ~/.openclaw/workspace/skills/"
        echo "Each skill needs a SKILL.md file in its own subdirectory."
        echo ""
    fi
fi

# --- Setup .env files ---
if [ ! -f "$PROJECT_ROOT/server/.env" ]; then
    if [ -f "$PROJECT_ROOT/server/.env.example" ]; then
        cp "$PROJECT_ROOT/server/.env.example" "$PROJECT_ROOT/server/.env"
        echo "[SETUP] Created server/.env from .env.example"
        echo "[ACTION] Please edit server/.env with your settings:"
        echo "  - OPENCLAW_SERVER_URL (default: http://localhost:$GATEWAY_PORT)"
        echo "  - GITHUB_TOKEN (your GitHub PAT)"
        echo "  - GITHUB_WEBHOOK_SECRET (if using webhooks)"
    fi
else
    echo "[OK] server/.env exists"
fi

if [ ! -f "$PROJECT_ROOT/web/.env.local" ]; then
    if [ -f "$PROJECT_ROOT/web/.env.example" ]; then
        cp "$PROJECT_ROOT/web/.env.example" "$PROJECT_ROOT/web/.env.local"
        echo "[SETUP] Created web/.env.local from .env.example"
    fi
else
    echo "[OK] web/.env.local exists"
fi

# --- Install Dependencies ---
echo ""
echo "Installing server dependencies..."
cd "$PROJECT_ROOT/server" && npm install --silent
echo "[OK] Server dependencies installed"

echo "Installing web dependencies..."
cd "$PROJECT_ROOT/web" && npm install --silent
echo "[OK] Web dependencies installed"

# --- Cleanup on exit ---
PIDS=()
cleanup() {
    echo ""
    echo "Stopping services..."
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null
    echo "[OK] All services stopped."
    exit 0
}
trap cleanup SIGINT SIGTERM

# --- Start Services ---
echo ""
echo "Starting services..."

# Start server in background
cd "$PROJECT_ROOT/server" && npm run dev &
PIDS+=($!)
echo "[STARTED] Backend API server (port 3001)"

# Start web in background
cd "$PROJECT_ROOT/web" && npm run dev &
PIDS+=($!)
echo "[STARTED] Web UI (port 3002)"

# --- Display Info ---
echo ""
echo "========================================"
echo "  Services Running:"
echo "  OpenClaw:    http://localhost:$GATEWAY_PORT"
echo "  API Server:  http://localhost:3001"
echo "  Web UI:      http://localhost:3002"
echo "  Health:      http://localhost:3001/health"
echo "========================================"
echo ""
echo "Configuration:"
echo "  - Edit server/.env for GitHub token and settings"
echo "  - Set GITHUB_POLLING_ENABLED=true for polling mode"
echo ""

if [ ${#MISSING_SKILLS[@]} -gt 0 ]; then
    echo "Missing Skills:"
    for skill in "${MISSING_SKILLS[@]}"; do
        echo "  - $skill"
    done
    echo "  Skills directory: ~/.openclaw/workspace/skills/"
    echo ""
fi

echo "Press Ctrl+C to stop all services..."

# Keep alive
wait
