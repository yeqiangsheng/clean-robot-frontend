@echo off
setlocal

set "ROOT=%~dp0"
set "HOST=127.0.0.1"
set "PORT=4173"
set "URL=http://%HOST%:%PORT%"
set "TMP_DIR=%ROOT%.tmp\frontend-prod"
set "OUT_LOG=%TMP_DIR%\frontend.out.log"
set "ERR_LOG=%TMP_DIR%\frontend.err.log"
set "PID_FILE=%TMP_DIR%\frontend.pid"

if not exist "%TMP_DIR%" (
  mkdir "%TMP_DIR%" >nul 2>nul
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq %PORT% -and $_.LocalAddress -in @('%HOST%','0.0.0.0','::','::1') } | Select-Object -First 1; if ($listener) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo Frontend production static server is already running at %URL%
  if not defined FRONTEND_NO_OPEN_BROWSER (
    start "" "%URL%"
  )
  exit /b 0
)

call npm.cmd run verify
if errorlevel 1 (
  echo Failed to verify and build the frontend release bundle.
  exit /b 1
)

if exist "%PID_FILE%" (
  del "%PID_FILE%" >nul 2>nul
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = [System.IO.Path]::GetFullPath('%ROOT%');" ^
  "$tmpDir = [System.IO.Path]::GetFullPath('%TMP_DIR%');" ^
  "$outLog = [System.IO.Path]::GetFullPath('%OUT_LOG%');" ^
  "$errLog = [System.IO.Path]::GetFullPath('%ERR_LOG%');" ^
  "$pidFile = [System.IO.Path]::GetFullPath('%PID_FILE%');" ^
  "New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null;" ^
  "$process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm.cmd run start:prod' -WorkingDirectory $root -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru;" ^
  "Set-Content -LiteralPath $pidFile -Value $process.Id"
if errorlevel 1 (
  echo Failed to start the frontend production static server process.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ok = $false;" ^
  "for ($i = 0; $i -lt 20; $i++) {" ^
  "  try {" ^
  "    $response = Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2;" ^
  "    if ($response.StatusCode -ge 200) { $ok = $true; break }" ^
  "  } catch {}" ^
  "  Start-Sleep -Milliseconds 500" ^
  "}" ^
  "if ($ok) { exit 0 } else { exit 1 }"

if errorlevel 1 (
  echo Frontend production static server did not respond at %URL%.
  echo Check logs:
  echo   %OUT_LOG%
  echo   %ERR_LOG%
  exit /b 1
)

echo Frontend production static server is ready at %URL%
echo Logs:
echo   %OUT_LOG%
echo   %ERR_LOG%
if not defined FRONTEND_NO_OPEN_BROWSER (
  start "" "%URL%"
)
exit /b 0
