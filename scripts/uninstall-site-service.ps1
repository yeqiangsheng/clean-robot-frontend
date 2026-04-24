[CmdletBinding()]
param(
  [string]$ReleaseRoot = (Join-Path $PSScriptRoot '..'),
  [string]$ServiceName = 'CleanRobotSiteGateway',
  [switch]$RemoveWrapperFiles
)

. (Join-Path $PSScriptRoot 'site-service-common.ps1')

$layout = Get-ReleaseLayout -ReleaseRoot $ReleaseRoot

if (Test-Path -LiteralPath $layout.ServiceExe) {
  Invoke-WinSwCommand -ExecutablePath $layout.ServiceExe -Arguments @('stop') -IgnoreExitCode
  Invoke-WinSwCommand -ExecutablePath $layout.ServiceExe -Arguments @('uninstall') -IgnoreExitCode
}
elseif (Test-ServiceExists -ServiceName $ServiceName) {
  Stop-ServiceByNameIfPresent -ServiceName $ServiceName
  & sc.exe delete $ServiceName | Out-Null
}

if ($RemoveWrapperFiles) {
  if (Test-Path -LiteralPath $layout.ServiceXml) {
    Remove-Item -LiteralPath $layout.ServiceXml -Force
  }

  if (Test-Path -LiteralPath $layout.ServiceExe) {
    Remove-Item -LiteralPath $layout.ServiceExe -Force
  }
}

Write-Host "Site service uninstall flow completed for $ServiceName."
