@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "HOST=127.0.0.1"
set "PORT=4173"
set "SERVICE_NAME=CleanRobotSiteGateway"
set "SERVICE_SCRIPT=%ROOT%scripts\manage-site-service.ps1"
set "TMP_DIR=%ROOT%.tmp\frontend-prod"
set "PID_FILE=%TMP_DIR%\frontend.pid"
set "TARGET_PID="

if exist "%SERVICE_SCRIPT%" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SERVICE_SCRIPT%" -Action stop -ServiceName "%SERVICE_NAME%" -ListenHost "%HOST%" -Port %PORT%
  set "SERVICE_RESULT=!ERRORLEVEL!"
  if "!SERVICE_RESULT!"=="0" (
    rem Continue below to stop any manual or orphan node process still listening on the site port.
  ) else if not "!SERVICE_RESULT!"=="3" (
    echo Frontend site gateway service could not be stopped from this shell.
    echo Continuing with local pid/port cleanup.
  )
)

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
  "Write-Host ('Stopping frontend site gateway PID ' + $process.Id + ' on port %PORT%.');" ^
  "try { Stop-Process -Id $process.Id -Force -ErrorAction Stop; exit 0 } catch { Write-Host ('Unable to stop PID ' + $process.Id + ': ' + $_.Exception.Message); exit 5 }"
set "STOP_RESULT=%ERRORLEVEL%"

if "%STOP_RESULT%"=="2" (
  echo No frontend site gateway process was found on port %PORT%.
  goto cleanup
)

if "%STOP_RESULT%"=="4" (
  echo Port %PORT% is not owned by node, so it was not stopped automatically.
  exit /b 1
)

if not "%STOP_RESULT%"=="0" (
  echo Failed to stop the frontend site gateway process.
  echo Port %PORT% is still owned by a node process that this shell cannot terminate.
  echo Run this script from an elevated Administrator terminal, or stop PID reported by:
  echo   powershell -NoProfile -Command "Get-NetTCPConnection -State Listen ^| Where-Object { $_.LocalPort -eq %PORT% }"
  exit /b 1
)

:stopped
echo Frontend site gateway stopped.

:cleanup
if exist "%PID_FILE%" (
  del "%PID_FILE%" >nul 2>nul
)
exit /b 0
