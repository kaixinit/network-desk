@echo off
setlocal
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" "server\index.mjs" --open
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js 22.12 or newer is required. Use the Windows portable package or install Node.js from nodejs.org.
    pause
    exit /b 1
  )
  node "server\index.mjs" --open
)
if errorlevel 1 pause
