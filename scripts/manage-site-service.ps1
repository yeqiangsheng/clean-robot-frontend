[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action,

  [string]$Root,
  [string]$ServiceName = 'CleanRobotSiteGateway',
  [string]$ListenHost = '127.0.0.1',
  [int]$Port = 4173,
  [int]$TimeoutSeconds = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'site-service-common.ps1')

$effectiveRoot = if ($Root) {
  $Root
}
else {
  Join-Path $PSScriptRoot '..'
}

$resolvedRoot = Get-FullPath $effectiveRoot
$healthUrl = "http://${ListenHost}:$Port/api/health"

function Get-ServiceWrapperPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SearchRoot
  )

  $candidates = [System.Collections.Generic.List[string]]::new()
  $candidates.Add((Join-Path $SearchRoot 'service\clean-robot-site-service.exe'))

  $releaseDirectory = Join-Path $SearchRoot 'release'
  if (Test-Path -LiteralPath $releaseDirectory) {
    Get-ChildItem -LiteralPath $releaseDirectory -Directory -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTimeUtc -Descending |
      ForEach-Object {
        $candidates.Add((Join-Path $_.FullName 'service\clean-robot-site-service.exe'))
      }
  }

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

function Test-HealthEndpoint {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  }
  catch {
    return $false
  }
}

function Wait-Until {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Condition,

    [int]$Seconds = 20,
    [int]$IntervalMilliseconds = 500
  )

  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    if (& $Condition) {
      return $true
    }

    Start-Sleep -Milliseconds $IntervalMilliseconds
  } while ((Get-Date) -lt $deadline)

  return (& $Condition)
}

if (-not (Test-ServiceExists -ServiceName $ServiceName)) {
  Write-Host "Service $ServiceName was not found under the current host."
  exit 3
}

$wrapperPath = Get-ServiceWrapperPath -SearchRoot $resolvedRoot
$service = Get-Service -Name $ServiceName -ErrorAction Stop

switch ($Action) {
  'status' {
    [pscustomobject]@{
      serviceName = $ServiceName
      status = [string]$service.Status
      wrapperPath = $wrapperPath
      healthUrl = $healthUrl
      healthy = Test-HealthEndpoint
    } | ConvertTo-Json -Compress
    exit 0
  }

  'start' {
    if ($service.Status -eq 'Running' -and (Test-HealthEndpoint)) {
      Write-Host "Site service is already healthy at $healthUrl"
      exit 0
    }

    if ($wrapperPath) {
      Invoke-WinSwCommand -ExecutablePath $wrapperPath -Arguments @('start') -IgnoreExitCode
    }
    else {
      Start-Service -Name $ServiceName -ErrorAction Stop
    }

    if (-not (Wait-Until -Condition { (Get-Service -Name $ServiceName).Status -eq 'Running' } -Seconds $TimeoutSeconds)) {
      throw "Service $ServiceName did not reach the Running state in time."
    }

    if (-not (Wait-Until -Condition { Test-HealthEndpoint } -Seconds $TimeoutSeconds)) {
      throw "Service $ServiceName started, but $healthUrl did not become healthy in time."
    }

    Write-Host "Site service started and healthy at $healthUrl"
    exit 0
  }

  'stop' {
    if ($service.Status -eq 'Stopped') {
      Write-Host "Site service is already stopped."
      exit 0
    }

    if ($wrapperPath) {
      Invoke-WinSwCommand -ExecutablePath $wrapperPath -Arguments @('stop') -IgnoreExitCode
    }
    else {
      Stop-ServiceByNameIfPresent -ServiceName $ServiceName
    }

    if (-not (Wait-Until -Condition { (Get-Service -Name $ServiceName).Status -eq 'Stopped' } -Seconds $TimeoutSeconds)) {
      throw "Service $ServiceName did not stop in time."
    }

    Write-Host 'Site service stopped.'
    exit 0
  }
}
