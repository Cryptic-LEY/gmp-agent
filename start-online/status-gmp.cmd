@echo off
setlocal EnableExtensions

set "FAILED="

echo [GMP] Fixed services:
call :CHECK "Web" 3000 "http://127.0.0.1:3000/api/health"
call :CHECK "GMP API" 8001 "http://127.0.0.1:8001/health"
call :CHECK "OpenMAIC" 3002 "http://127.0.0.1:3002/health"
call :CHECK "Team Sync" 3011 "http://127.0.0.1:3011/health"

echo.
if defined FAILED (
  echo [ERROR] Some GMP services are not healthy.
  set "STATUS=1"
) else (
  echo [GMP] All required GMP services are healthy.
  set "STATUS=0"
)

if /I not "%~1"=="--no-pause" pause
exit /b %STATUS%

:CHECK
echo.
echo [%~1] Port %~2
powershell -NoProfile -ExecutionPolicy Bypass -Command "$name='%~1'; $port=%~2; $url='%~3'; $conn=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $conn) { Write-Host '  port: FREE'; exit 1 }; $proc=Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue; if ($proc) { Write-Host ('  pid: ' + $conn.OwningProcess + '  process: ' + $proc.ProcessName + '  memoryMB: ' + [math]::Round($proc.WorkingSet64 / 1MB, 1)) } else { Write-Host ('  pid: ' + $conn.OwningProcess) }; $sw=[Diagnostics.Stopwatch]::StartNew(); try { $response=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8; $sw.Stop(); Write-Host ('  health: HTTP ' + [int]$response.StatusCode + '  ms: ' + $sw.ElapsedMilliseconds); if ([int]$response.StatusCode -lt 200 -or [int]$response.StatusCode -ge 300) { exit 1 }; exit 0 } catch { $sw.Stop(); Write-Host ('  health: ERR  ms: ' + $sw.ElapsedMilliseconds + '  ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 set "FAILED=1"
exit /b 0
