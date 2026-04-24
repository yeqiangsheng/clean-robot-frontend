[CmdletBinding()]
param(
  [string]$PackageRoot = (Join-Path $PSScriptRoot '..'),
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot,
  [string]$BackupRoot,
  [string]$ServiceName = 'CleanRobotSiteGateway',
  [string]$WinSwExePath,
  [switch]$SkipDependencyInstall
)

. (Join-Path $PSScriptRoot 'site-service-common.ps1')

$packageRootFull = Get-FullPath $PackageRoot
$installRootFull = Get-FullPath $InstallRoot
$backupRootFull = if ($BackupRoot) {
  Get-FullPath $BackupRoot
}
else {
  Get-FullPath (Join-Path (Split-Path -Parent $installRootFull) 'backups')
}

if ($packageRootFull -eq $installRootFull) {
  throw 'PackageRoot and InstallRoot must be different directories.'
}

if (Test-PathInside -CandidatePath $backupRootFull -ParentPath $installRootFull) {
  throw 'BackupRoot must not be nested inside InstallRoot.'
}

Ensure-Directory $backupRootFull

$packageLayout = Get-ReleaseLayout -ReleaseRoot $packageRootFull
Assert-ReleasePackage -Layout $packageLayout

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupRootFull "site-backup-$timestamp"
$winSwSeedForInstall = $null

if (Test-Path -LiteralPath $installRootFull) {
  $currentLayout = Get-ReleaseLayout -ReleaseRoot $installRootFull

  if (Test-ServiceExists -ServiceName $ServiceName) {
    if (Test-Path -LiteralPath $currentLayout.ServiceExe) {
      Invoke-WinSwCommand -ExecutablePath $currentLayout.ServiceExe -Arguments @('stop') -IgnoreExitCode
    }
    else {
      Stop-ServiceByNameIfPresent -ServiceName $ServiceName
    }
  }

  Move-Item -LiteralPath $installRootFull -Destination $backupPath

  $backupServiceExe = Join-Path $backupPath 'service\\clean-robot-site-service.exe'
  if (Test-Path -LiteralPath $backupServiceExe) {
    $winSwSeedForInstall = $backupServiceExe
  }
}

Copy-DirectoryContents -SourceDirectory $packageRootFull -DestinationDirectory $installRootFull
Ensure-ProductionDependencies -ReleaseRoot $installRootFull -SkipInstall:$SkipDependencyInstall

$installScriptPath = Join-Path $installRootFull 'scripts\\install-site-service.ps1'
if (
  (Test-Path -LiteralPath $installScriptPath) -and
  ($WinSwExePath -or $winSwSeedForInstall -or (Test-ServiceExists -ServiceName $ServiceName))
) {
  $installArguments = @(
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    $installScriptPath,
    '-ReleaseRoot',
    $installRootFull,
    '-ServiceName',
    $ServiceName
  )

  if ($WinSwExePath) {
    $installArguments += @('-WinSwExePath', (Get-FullPath $WinSwExePath))
  }
  elseif ($winSwSeedForInstall) {
    $installArguments += @('-WinSwExePath', $winSwSeedForInstall)
  }

  & powershell.exe @installArguments
  if ($LASTEXITCODE -ne 0) {
    throw "install-site-service.ps1 failed with exit code $LASTEXITCODE."
  }
}
else {
  Write-Warning 'Upgrade copied the new release, but service installation was skipped because no WinSW binary was available.'
}

Write-Host "Upgrade completed."
Write-Host "Installed release: $installRootFull"
if (Test-Path -LiteralPath $backupPath) {
  Write-Host "Rollback backup: $backupPath"
}
