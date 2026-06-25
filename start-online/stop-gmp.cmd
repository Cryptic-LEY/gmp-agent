@echo off
setlocal EnableExtensions

echo [GMP] Stopping GMP fixed-port services...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = 3000,3011,8001,3002; $processIds = Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if (-not $processIds) { Write-Host '[GMP] No GMP fixed ports are currently listening.'; exit 0 }; foreach ($processId in $processIds) { if ($processId) { Write-Host ('[GMP] Stopping process tree ' + $processId); cmd /c ('taskkill /PID ' + $processId + ' /T /F') } }; Start-Sleep -Seconds 2; $left = Get-NetTCPConnection -State Listen -LocalPort $ports -ErrorAction SilentlyContinue; if ($left) { Write-Host '[WARN] Some ports are still occupied. Close the service windows manually or run this script as Administrator.'; exit 1 }"
set "STATUS=%ERRORLEVEL%"

echo [GMP] Redis service is left running.
echo [GMP] Done.

if /I not "%~1"=="--no-pause" pause
exit /b %STATUS%
