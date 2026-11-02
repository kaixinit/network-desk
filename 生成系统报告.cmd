@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\collect-system.ps1"
echo.
echo Import the JSON from the reports folder into Network Desk.
pause
