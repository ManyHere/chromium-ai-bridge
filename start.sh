#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================================="
echo "   ⚡ Antigravity AI Chromium Bridge v1.1"
echo "======================================================="
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 not found! Please install Python 3.10+."
    exit 1
fi

echo "[1/2] Checking dependencies..."
if ! python3 -c "import websockets, mcp" &> /dev/null; then
    echo "Installing required packages (websockets, mcp)..."
    python3 -m pip install -q -r "$DIR/server/requirements.txt" || python3 -m pip install -q --user -r "$DIR/server/requirements.txt"
else
    echo "Dependencies OK."
fi

echo "[2/2] Starting bridge server on ws://127.0.0.1:8785 ..."
python3 "$DIR/server/bridge_server.py"
