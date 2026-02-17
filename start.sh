#!/usr/bin/env bash
# ============================================================
# OpenCode Code Review — Single Start Script (Linux/Mac)
# ============================================================
# Starts the backend API server and Next.js web UI without Docker.
# Prerequisites: Node.js 18+ must be installed.
# Usage: ./start.sh
# ============================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "========================================"
echo "  OpenCode Code Review — Starting...    "
echo "========================================"
echo ""

# --- Check Node.js ---
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node --version)
MAJOR_VERSION=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
if [ "$MAJOR_VERSION" -lt 18 ]; then
    echo "[ERROR] Node.js $NODE_VERSION detected. Version 18+ is required."
    exit 1
fi
echo "[OK] Node.js $NODE_VERSION"

# --- Setup .env files ---
if [ ! -f "$PROJECT_ROOT/server/.env" ]; then
    if [ -f "$PROJECT_ROOT/server/.env.example" ]; then
        cp "$PROJECT_ROOT/server/.env.example" "$PROJECT_ROOT/server/.env"
        echo "[SETUP] Created server/.env from .env.example — please edit with your settings"
    fi
else
    echo "[OK] server/.env exists"
fi

if [ ! -f "$PROJECT_ROOT/web/.env.local" ]; then
    if [ -f "$PROJECT_ROOT/web/.env.example" ]; then
        cp "$PROJECT_ROOT/web/.env.example" "$PROJECT_ROOT/web/.env.local"
        echo "[SETUP] Created web/.env.local from .env.example — please edit with your settings"
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

cd "$PROJECT_ROOT/server" && npm run dev &
PIDS+=($!)
echo "[STARTED] Backend API server (port 3001)"

cd "$PROJECT_ROOT/web" && npm run dev &
PIDS+=($!)
echo "[STARTED] Web UI (port 3000)"

# --- Display Info ---
echo ""
echo "========================================"
echo "  Services Running:"
echo "  API Server:  http://localhost:3001"
echo "  Web UI:      http://localhost:3000"
echo "  Health:      http://localhost:3001/health"
echo "========================================"
echo ""
echo "[INFO] If using polling mode, ensure GITHUB_POLLING_ENABLED=true in server/.env"
echo "[INFO] If using OpenCode AI features, ensure opencode is running separately"
echo ""
echo "Press Ctrl+C to stop all services..."

# Keep alive
wait
