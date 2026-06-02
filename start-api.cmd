@echo off
setlocal

set "ROOT=%~dp0"
set "API_DIR=%ROOT%gmp-api"
set "VENV_DIR=%API_DIR%\.venv"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"
set "HOST=127.0.0.1"
set "PORT=8001"

if not exist "%API_DIR%\main.py" (
  echo [ERROR] Cannot find backend entry: "%API_DIR%\main.py"
  pause
  exit /b 1
)

set "NEED_VENV=0"
if not exist "%PYTHON_EXE%" set "NEED_VENV=1"
if exist "%PYTHON_EXE%" (
  "%PYTHON_EXE%" --version >nul 2>&1
  if errorlevel 1 (
    echo [WARN] Existing Python virtual environment is invalid.
    set "NEED_VENV=1"
  )
)

if "%NEED_VENV%"=="1" goto create_venv
goto venv_ready

:create_venv
py -3 --version >nul 2>&1
if not errorlevel 1 (
  set "VENV_CREATOR=py -3"
  goto rebuild_venv
)

py -3.14 --version >nul 2>&1
if not errorlevel 1 (
  set "VENV_CREATOR=py -3.14"
  goto rebuild_venv
)

py -3.13 --version >nul 2>&1
if not errorlevel 1 (
  set "VENV_CREATOR=py -3.13"
  goto rebuild_venv
)

py -3.12 --version >nul 2>&1
if not errorlevel 1 (
  set "VENV_CREATOR=py -3.12"
  goto rebuild_venv
)

py -3.11 --version >nul 2>&1
if not errorlevel 1 (
  set "VENV_CREATOR=py -3.11"
  goto rebuild_venv
)

python --version >nul 2>&1
if not errorlevel 1 (
  set "VENV_CREATOR=python"
  goto rebuild_venv
)

echo [ERROR] No working Python 3 interpreter was found.
echo Please install Python 3.11+ and make sure py or python is available in PATH.
pause
exit /b 1

:rebuild_venv
if exist "%VENV_DIR%" (
  echo [INFO] Removing invalid Python virtual environment...
  rmdir /s /q "%VENV_DIR%"
)

echo [INFO] Creating Python virtual environment...
%VENV_CREATOR% -m venv "%VENV_DIR%"
if errorlevel 1 (
  echo [ERROR] Python virtual environment was not created.
  pause
  exit /b 1
)

:venv_ready
"%PYTHON_EXE%" --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python virtual environment is not runnable.
  pause
  exit /b 1
)

pushd "%API_DIR%"

echo [INFO] Installing backend dependencies...
"%PYTHON_EXE%" -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to install backend dependencies.
  echo Check your network, pip mirror, or requirements.txt.
  popd
  pause
  exit /b 1
)

echo.
echo [INFO] Starting GMP backend...
echo [INFO] URL: http://%HOST%:%PORT%
echo [INFO] Press Ctrl+C to stop.
echo.

"%PYTHON_EXE%" -m uvicorn main:app --app-dir "%API_DIR%" --host %HOST% --port %PORT% --reload
set "EXIT_CODE=%ERRORLEVEL%"

popd

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Backend exited with code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
