@echo off
title Antigravity AI Browser Bridge
cls

echo =======================================================
echo    AI Chromium Bridge
echo =======================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found in PATH!
    echo Please install Python 3.10+ from python.org and check "Add to PATH".
    echo.
    pause
    exit /b 1
)

echo [1/2] Checking dependencies (websockets, mcp)...
python -m pip install -q -r "%~dp0server\requirements.txt"
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Could not update dependencies automatically. Trying to start anyway...
)

echo [2/2] Starting server on ws://127.0.0.1:8785 ...
echo.
python "%~dp0server\bridge_server.py"

if %ERRORLEVEL% neq 0 (
    echo.
    echo Server stopped with error code %ERRORLEVEL%.
    pause
)
