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

if ! command -v openclaw &> /dev/null; then
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
    OPENCLAW_CMD=""
else
    OPENCLAW_CMD="openclaw"
    echo "[OK] OpenClaw CLI found: $(command -v openclaw)"
fi

# --- Check for OpenClaw Skills (local .opencode/commands/) ---
echo ""
echo "Checking OpenClaw skills (local .opencode/commands/)..."

declare -A SKILL_FILES=(
    ["codereview-init"]="codereview-int-deep.md"
    ["codereview-pr"]="codereview.md"
    ["codereview-push"]="pushcomments.md"
    ["architecture-analyze"]="architecture-analyze.md"
    ["architecture-plan"]="architecture-plan.md"
    ["development-execute"]="development-execute.md"
    ["testing-plan"]="testing-plan.md"
    ["testing-execute"]="testing-execute.md"
)
MISSING_SKILLS=()

COMMANDS_DIR="$PROJECT_ROOT/.opencode/commands"
for skill in "${!SKILL_FILES[@]}"; do
    file="${SKILL_FILES[$skill]}"
    if [ -f "$COMMANDS_DIR/$file" ]; then
        echo "[OK] Skill found: $skill ($file)"
    else
        MISSING_SKILLS+=("$skill")
        echo "[MISS] Skill missing: $skill (expected: .opencode/commands/$file)"
    fi
done

if [ ${#MISSING_SKILLS[@]} -gt 0 ]; then
    echo ""
    echo "[WARN] Missing skill files: ${MISSING_SKILLS[*]}"
    echo "Create them in .opencode/commands/ - see MIGRATION.md for details."
fi

# --- Setup .env files ---
if [ ! -f "$PROJECT_ROOT/server/.env" ]; then
    if [ -f "$PROJECT_ROOT/server/.env.example" ]; then
        cp "$PROJECT_ROOT/server/.env.example" "$PROJECT_ROOT/server/.env"
        echo "[SETUP] Created server/.env from .env.example"
        echo "[ACTION] Please edit server/.env with your settings:"
        echo "  - OPENCLAW_SERVER_URL (default: http://localhost:3000)"
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

# Start OpenClaw if installed
if [ -n "$OPENCLAW_CMD" ]; then
    # Check if OpenClaw is already running
    if curl -s http://localhost:3000/status > /dev/null 2>&1; then
        echo "[OK] OpenClaw already running (port 3000)"
    else
        openclaw gateway start &
        PIDS+=($!)
        echo "[STARTED] OpenClaw server (port 3000)"
        echo "Waiting for OpenClaw to initialize (5s)..."
        sleep 5
        echo "[OK] Continuing startup"
    fi
else
    echo "[SKIPPED] OpenClaw not installed - AI features disabled"
fi

cd "$PROJECT_ROOT/server" && npm run dev &
PIDS+=($!)
echo "[STARTED] Backend API server (port 3001)"

cd "$PROJECT_ROOT/web" && npm run dev &
PIDS+=($!)
echo "[STARTED] Web UI (port 3002)"

# --- Display Info ---
echo ""
echo "========================================"
echo "  Services Running:"
echo "  OpenClaw:    http://localhost:3000"
echo "  API Server:  http://localhost:3001"
echo "  Web UI:      http://localhost:3002"
echo "  Health:      http://localhost:3001/health"
echo "========================================"
echo ""
echo "Configuration:"
echo "  - Edit server/.env for GitHub token and settings"
echo "  - Set GITHUB_POLLING_ENABLED=true for polling mode"
echo ""
echo "Feature Lifecycle:"
echo "  - Create features in Projects > Features"
echo "  - Phases: Architecture → Development → Testing"
echo "  - Upload requirements (PDF/DOCX/MD/TXT, max 5MB)"
echo ""

if [ ${#MISSING_SKILLS[@]} -gt 0 ]; then
    echo "Missing Skills:"
    for skill in "${MISSING_SKILLS[@]}"; do
        echo "  - $skill"
    done
    echo "  Install with: /skill-creator or /clawhub install"
    echo ""
fi

echo "Press Ctrl+C to stop all services..."

# Keep alive
wait
