#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "======================================================="
echo "   ⚡ Antigravity AI Chromium Bridge"
echo "======================================================="
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[ОШИБКА] Python3 не найден! Установите Python 3.10+."
    exit 1
fi

echo "[1/2] Проверка зависимостей..."
python3 -m pip install -q -r "$DIR/server/requirements.txt"

echo "[2/2] Запуск сервера моста..."
python3 "$DIR/server/bridge_server.py"
