[CmdletBinding()]
param(
  [string]$ReleaseRoot = (Join-Path $PSScriptRoot '..'),
  [string]$WinSwExePath,
  [string]$NodePath,
  [string]$ServiceName = 'CleanRobotSiteGateway',
  [string]$DisplayName = 'Clean Robot Site Gateway',
  [string]$Description = 'Local site gateway for the clean robot frontend.',
  [string]$ListenHost = '127.0.0.1',
  [int]$Port = 4173,
  [string]$RosbridgeUrl,
  [string]$MapImportPbstreamDir,
  [switch]$SkipDependencyInstall
)

. (Join-Path $PSScriptRoot 'site-service-common.ps1')

$layout = Get-ReleaseLayout -ReleaseRoot $ReleaseRoot
Assert-ReleasePackage -Layout $layout
Ensure-Directory $layout.ServiceDir
Ensure-Directory $layout.LogDir
Ensure-ProductionDependencies -ReleaseRoot $layout.Root -SkipInstall:$SkipDependencyInstall

$resolvedNodePath = Get-NodeExecutable -NodePath $NodePath

$resolvedWinSwSeedPath = $null
if ($WinSwExePath) {
  $resolvedWinSwSeedPath = Get-FullPath $WinSwExePath
  if (-not (Test-Path -LiteralPath $resolvedWinSwSeedPath)) {
    throw "The provided WinSW binary was not found: $resolvedWinSwSeedPath"
  }
}
elseif (-not (Test-Path -LiteralPath $layout.ServiceExe)) {
  throw "WinSW binary is required for service installation. Re-run this script with -WinSwExePath <path-to-WinSW.exe>."
}

if ($resolvedWinSwSeedPath) {
  Copy-Item -LiteralPath $resolvedWinSwSeedPath -Destination $layout.ServiceExe -Force
}

Write-WinSwConfig `
  -Layout $layout `
  -ServiceId $ServiceName `
  -DisplayName $DisplayName `
  -Description $Description `
  -NodePath $resolvedNodePath `
  -ListenHost $ListenHost `
  -Port $Port `
  -RosbridgeUrl $RosbridgeUrl `
  -MapImportPbstreamDir $MapImportPbstreamDir

$serviceAlreadyExists = Test-ServiceExists -ServiceName $ServiceName
if (-not $serviceAlreadyExists) {
  Invoke-WinSwCommand -ExecutablePath $layout.ServiceExe -Arguments @('install')
}
else {
  Invoke-WinSwCommand -ExecutablePath $layout.ServiceExe -Arguments @('stop') -IgnoreExitCode
}

Invoke-WinSwCommand -ExecutablePath $layout.ServiceExe -Arguments @('start')

Write-Host "Site service installed and started."
Write-Host "Service name: $ServiceName"
Write-Host "Service wrapper: $($layout.ServiceExe)"
Write-Host "Service config: $($layout.ServiceXml)"
