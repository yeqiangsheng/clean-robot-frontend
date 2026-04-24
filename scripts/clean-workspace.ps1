[CmdletBinding()]
param(
  [switch]$IncludeReleaseBackups,
  [switch]$IncludeReleaseBundles
)

$ErrorActionPreference = 'Stop'

function Get-FullPath {
  param([Parameter(Mandatory = $true)][string]$Path)
  return [System.IO.Path]::GetFullPath($Path)
}

function Test-PathInside {
  param(
    [Parameter(Mandatory = $true)][string]$CandidatePath,
    [Parameter(Mandatory = $true)][string]$ParentPath
  )

  $candidateFull = Get-FullPath $CandidatePath
  $parentFull = (Get-FullPath $ParentPath).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

  return $candidateFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)
}

function Remove-PathBestEffort {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  try {
    Remove-Item -LiteralPath $Path -Recurse -Force
    Write-Host "Removed $RelativePath"
    return
  }
  catch {
    Write-Warning "Could not remove $RelativePath as a whole. Retrying item-by-item. $($_.Exception.Message)"
  }

  $remaining = New-Object System.Collections.Generic.List[string]
  $children = Get-ChildItem -LiteralPath $Path -Force -Recurse -ErrorAction SilentlyContinue |
    Sort-Object { $_.FullName.Length } -Descending

  foreach ($child in $children) {
    try {
      Remove-Item -LiteralPath $child.FullName -Force -Recurse -ErrorAction Stop
    }
    catch {
      $remaining.Add($child.FullName)
    }
  }

  try {
    Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
  }
  catch {
    $remaining.Add($Path)
  }

  if ($remaining.Count -gt 0) {
    Write-Warning "Some generated files could not be removed because they are still in use:"
    $remaining |
      Sort-Object -Unique |
      ForEach-Object { Write-Warning "  $_" }
    return
  }

  Write-Host "Removed $RelativePath"
}

$repoRoot = Get-FullPath (Split-Path -Parent $PSScriptRoot)

$targets = @(
  'dist',
  '.tmp',
  'test-results',
  'playwright-report'
)

if ($IncludeReleaseBundles) {
  $targets += 'release'
}
elseif ($IncludeReleaseBackups) {
  $targets += 'release\backups'
}

foreach ($relativePath in $targets) {
  $targetPath = Get-FullPath (Join-Path $repoRoot $relativePath)
  if (-not (Test-PathInside -CandidatePath $targetPath -ParentPath $repoRoot)) {
    throw "Refusing to remove a path outside the repository: $targetPath"
  }

  if (-not (Test-Path -LiteralPath $targetPath)) {
    continue
  }

  Remove-PathBestEffort -Path $targetPath -RelativePath $relativePath
}

Write-Host 'Workspace cleanup complete.'
