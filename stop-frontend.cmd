@echo off
setlocal

set "ROOT=%~dp0"
set "HOST=127.0.0.1"
set "PORT=5173"
set "TMP_DIR=%ROOT%.tmp\frontend-dev"
set "PID_FILE=%TMP_DIR%\frontend.pid"
set "TARGET_PID="

if exist "%PID_FILE%" (
  set /p TARGET_PID=<"%PID_FILE%"
)

if defined TARGET_PID (
  taskkill /PID %TARGET_PID% /T /F >nul 2>nul
  if not errorlevel 1 goto stopped
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq %PORT% -and $_.LocalAddress -in @('%HOST%','0.0.0.0','::','::1') } | Select-Object -First 1;" ^
  "if (-not $listener) { exit 2 }" ^
  "$process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue;" ^
  "if (-not $process) { exit 3 }" ^
  "if ($process.ProcessName -ne 'node') { exit 4 }" ^
  "Stop-Process -Id $process.Id -Force"
set "STOP_RESULT=%ERRORLEVEL%"

if "%STOP_RESULT%"=="2" (
  echo No frontend process was found on port %PORT%.
  goto cleanup
)

if "%STOP_RESULT%"=="4" (
  echo Port %PORT% is not owned by node, so it was not stopped automatically.
  exit /b 1
)

if not "%STOP_RESULT%"=="0" (
  echo Failed to stop the frontend process.
  exit /b 1
)

:stopped
echo Frontend stopped.

:cleanup
if exist "%PID_FILE%" (
  del "%PID_FILE%" >nul 2>nul
)
exit /b 0
