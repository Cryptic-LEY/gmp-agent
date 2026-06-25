@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "API_DIR=%ROOT_DIR%gmp-api"
set "WEB_DIR=%ROOT_DIR%gmp-web"
set "OPENMAIC_DIR=%ROOT_DIR%openmaic-service"

if not defined GMP_API_WORKERS set "GMP_API_WORKERS=2"

set "WEB_MODE=production"
if /I "%~1"=="dev" set "WEB_MODE=dev"
if /I "%~1"=="--dev" set "WEB_MODE=dev"

echo [GMP] Starting GMP platform...
echo [GMP] Root: %ROOT_DIR%
echo [GMP] Web mode: %WEB_MODE%
echo.

call :CHECK_PORT 8001 "GMP API"
call :CHECK_PORT 3002 "OpenMAIC"
call :CHECK_PORT 3011 "Team Sync"
call :CHECK_PORT 3000 "Web"

if defined PORT_ERROR (
  echo.
  echo [ERROR] One or more fixed ports are occupied. Nothing was started.
  echo [GMP] Run stop-gmp.cmd first, then run start-gmp.cmd again.
  goto end_failed
)

if not exist "%API_DIR%\main.py" (
  echo [ERROR] Cannot find "%API_DIR%\main.py".
  goto end_failed
)

if not exist "%WEB_DIR%\package.json" (
  echo [ERROR] Cannot find "%WEB_DIR%\package.json".
  goto end_failed
)

if not exist "%OPENMAIC_DIR%\package.json" (
  echo [ERROR] Cannot find "%OPENMAIC_DIR%\package.json".
  goto end_failed
)

sc query redis >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  sc query redis | find "RUNNING" >nul
  if errorlevel 1 (
    echo [GMP] Redis service exists but is not running. Trying to start it...
    net start redis
    if errorlevel 1 (
      echo [WARN] Redis did not start. Run this script as Administrator, or start Redis manually.
    )
  ) else (
    echo [GMP] Redis service is already running.
  )
) else (
  echo [WARN] Redis Windows service was not found. Team mode needs Redis on port 6379.
)

if /I "%WEB_MODE%"=="production" (
  if /I "%GMP_SKIP_BUILD%"=="1" (
    echo [GMP] Skipping Next build because GMP_SKIP_BUILD=1.
  ) else (
    echo [GMP] Building Web production bundle...
    pushd "%WEB_DIR%"
    call npm run build
    if errorlevel 1 (
      popd
      echo [ERROR] Web production build failed. Services were not started.
      goto end_failed
    )
    popd
  )
)

echo [GMP] Starting GMP API on port 8001...
if exist "%API_DIR%\.venv\Scripts\python.exe" (
  start "GMP API :8001" /min cmd /k "cd /d ""%API_DIR%"" && set ""GMP_ENV=production"" && .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8001 --workers %GMP_API_WORKERS%"
) else (
  start "GMP API :8001" /min cmd /k "cd /d ""%API_DIR%"" && set ""GMP_ENV=production"" && python -m uvicorn main:app --host 0.0.0.0 --port 8001 --workers %GMP_API_WORKERS%"
)

echo [GMP] Starting OpenMAIC on port 3002...
start "GMP OpenMAIC :3002" /min cmd /k "cd /d ""%OPENMAIC_DIR%"" && set ""NODE_ENV=production"" && set ""PORT=3002"" && npm run start"

echo [GMP] Starting Team Sync on port 3011...
start "GMP Team Sync :3011" /min cmd /k "cd /d ""%WEB_DIR%"" && set ""NODE_ENV=production"" && set ""TEAM_SYNC_PORT=3011"" && npm run team-sync"

if /I "%WEB_MODE%"=="dev" (
  echo [GMP] Starting Web dev server on port 3000...
  start "GMP Web :3000" /min cmd /k "cd /d ""%WEB_DIR%"" && npm run dev"
) else (
  echo [GMP] Starting Web production server on port 3000...
  start "GMP Web :3000" /min cmd /k "cd /d ""%WEB_DIR%"" && set ""NODE_ENV=production"" && set ""NEXT_TELEMETRY_DISABLED=1"" && npm run start"
)

timeout /t 6 /nobreak >nul
call "%~dp0status-gmp.cmd" --no-pause

echo.
echo [GMP] Open:
echo   http://localhost:3000
echo   http://localhost:3000/simulation
echo.
echo [GMP] Done.
goto end_ok

:CHECK_PORT
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo [ERROR] Port %~1 is occupied. %~2 cannot start on its fixed port.
  set "PORT_ERROR=1"
) else (
  echo [GMP] Port %~1 is free for %~2.
)
exit /b 0

:end_failed
if /I not "%~1"=="--no-pause" pause
exit /b 1

:end_ok
if /I not "%~1"=="--no-pause" pause
exit /b 0
