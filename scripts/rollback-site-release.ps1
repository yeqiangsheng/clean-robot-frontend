[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot,
  [string]$BackupRoot,
  [string]$BackupName,
  [string]$ServiceName = 'CleanRobotSiteGateway',
  [switch]$SkipDependencyInstall
)

. (Join-Path $PSScriptRoot 'site-service-common.ps1')

$installRootFull = Get-FullPath $InstallRoot
$backupRootFull = if ($BackupRoot) {
  Get-FullPath $BackupRoot
}
else {
  Get-FullPath (Join-Path (Split-Path -Parent $installRootFull) 'backups')
}

if (-not (Test-Path -LiteralPath $backupRootFull)) {
  throw "BackupRoot was not found: $backupRootFull"
}

$selectedBackupPath = $null
if ($BackupName) {
  $selectedBackupPath = Get-FullPath (Join-Path $backupRootFull $BackupName)
}
else {
  $selectedBackupPath = Get-ChildItem -LiteralPath $backupRootFull -Directory |
    Where-Object { $_.Name -like 'site-backup-*' } |
    Sort-Object Name -Descending |
    Select-Object -First 1 |
    ForEach-Object { $_.FullName }
}

if (-not $selectedBackupPath) {
  throw "No backup release was found in $backupRootFull"
}

if (-not (Test-Path -LiteralPath $selectedBackupPath)) {
  throw "Selected backup directory was not found: $selectedBackupPath"
}

if (Test-PathInside -CandidatePath $backupRootFull -ParentPath $installRootFull) {
  throw 'BackupRoot must not be nested inside InstallRoot.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$displacedCurrentPath = Join-Path $backupRootFull "rollback-current-$timestamp"

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

  Move-Item -LiteralPath $installRootFull -Destination $displacedCurrentPath
}

Move-Item -LiteralPath $selectedBackupPath -Destination $installRootFull
Ensure-ProductionDependencies -ReleaseRoot $installRootFull -SkipInstall:$SkipDependencyInstall

$installScriptPath = Join-Path $installRootFull 'scripts\\install-site-service.ps1'
if (
  (Test-Path -LiteralPath $installScriptPath) -and
  (
    (Test-Path -LiteralPath (Join-Path $installRootFull 'service\\clean-robot-site-service.exe')) -or
    (Test-ServiceExists -ServiceName $ServiceName)
  )
) {
  & powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $installScriptPath `
    -ReleaseRoot $installRootFull `
    -ServiceName $ServiceName

  if ($LASTEXITCODE -ne 0) {
    throw "install-site-service.ps1 failed with exit code $LASTEXITCODE."
  }
}
else {
  Write-Warning 'Rollback restored the release files, but service installation was skipped because no WinSW wrapper was available in the restored backup.'
}

Write-Host "Rollback completed."
Write-Host "Restored release: $installRootFull"
Write-Host "Displaced current release: $displacedCurrentPath"
