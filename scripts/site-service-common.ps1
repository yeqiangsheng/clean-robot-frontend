Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FullPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  return [System.IO.Path]::GetFullPath($Path)
}

function Ensure-Directory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Get-ReleaseRootFromScript {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ScriptDirectory
  )

  return Get-FullPath (Join-Path $ScriptDirectory '..')
}

function Get-ReleaseLayout {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot,

    [Parameter(Mandatory = $false)]
    [string]$ServiceBinaryName = 'clean-robot-site-service'
  )

  $root = Get-FullPath $ReleaseRoot
  $serviceDir = Join-Path $root 'service'

  return @{
    Root = $root
    DistIndex = Join-Path $root 'dist\\index.html'
    SiteGatewayServer = Join-Path $root 'site-gateway\\server.mjs'
    SiteGatewayConfig = Join-Path $root 'site-gateway\\site-config.json'
    PackageJson = Join-Path $root 'package.json'
    PackageLock = Join-Path $root 'package-lock.json'
    ScriptsDir = Join-Path $root 'scripts'
    ServiceDir = $serviceDir
    ServiceExe = Join-Path $serviceDir "$ServiceBinaryName.exe"
    ServiceXml = Join-Path $serviceDir "$ServiceBinaryName.xml"
    LogDir = Join-Path $root '.tmp\\frontend-prod'
  }
}

function Assert-ReleasePackage {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Layout
  )

  $requiredPaths = @(
    $Layout.Root,
    $Layout.DistIndex,
    $Layout.SiteGatewayServer,
    $Layout.SiteGatewayConfig,
    $Layout.PackageJson,
    $Layout.PackageLock
  )

  foreach ($requiredPath in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
      throw "Missing required release file: $requiredPath"
    }
  }
}

function Get-NodeExecutable {
  param(
    [Parameter(Mandatory = $false)]
    [string]$NodePath
  )

  if ($NodePath) {
    $resolvedNodePath = Get-FullPath $NodePath
    if (-not (Test-Path -LiteralPath $resolvedNodePath)) {
      throw "Node executable was not found: $resolvedNodePath"
    }

    return $resolvedNodePath
  }

  $nodeCommand = Get-Command node -ErrorAction Stop | Select-Object -First 1
  return $nodeCommand.Source
}

function Ensure-ProductionDependencies {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ReleaseRoot,

    [Parameter(Mandatory = $false)]
    [switch]$SkipInstall
  )

  if ($SkipInstall) {
    return
  }

  $wsModulePath = Join-Path $ReleaseRoot 'node_modules\\ws'
  if (Test-Path -LiteralPath $wsModulePath) {
    return
  }

  Push-Location $ReleaseRoot
  try {
    & npm.cmd install --omit=dev
    if ($LASTEXITCODE -ne 0) {
      throw "npm.cmd install --omit=dev failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }
}

function ConvertTo-XmlText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text
  )

  return [System.Security.SecurityElement]::Escape($Text)
}

function Write-WinSwConfig {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Layout,

    [Parameter(Mandatory = $true)]
    [string]$ServiceId,

    [Parameter(Mandatory = $true)]
    [string]$DisplayName,

    [Parameter(Mandatory = $true)]
    [string]$Description,

    [Parameter(Mandatory = $true)]
    [string]$NodePath,

    [Parameter(Mandatory = $true)]
    [string]$ListenHost,

    [Parameter(Mandatory = $true)]
    [int]$Port,

    [Parameter(Mandatory = $false)]
    [string]$RosbridgeUrl,

    [Parameter(Mandatory = $false)]
    [string]$MapImportPbstreamDir
  )

  Ensure-Directory $Layout.ServiceDir
  Ensure-Directory $Layout.LogDir

  $escapedServiceId = ConvertTo-XmlText $ServiceId
  $escapedDisplayName = ConvertTo-XmlText $DisplayName
  $escapedDescription = ConvertTo-XmlText $Description
  $escapedNodePath = ConvertTo-XmlText $NodePath
  $escapedGatewayServer = ConvertTo-XmlText $Layout.SiteGatewayServer
  $escapedWorkingDirectory = ConvertTo-XmlText $Layout.Root
  $escapedLogDirectory = ConvertTo-XmlText $Layout.LogDir
  $escapedHost = ConvertTo-XmlText $ListenHost
  $escapedPort = ConvertTo-XmlText ([string]$Port)
  $extraEnvXml = ''

  if ($RosbridgeUrl) {
    $escapedRosbridgeUrl = ConvertTo-XmlText $RosbridgeUrl
    $extraEnvXml += "  <env name=`"SITE_ROSBRIDGE_URL`" value=`"$escapedRosbridgeUrl`" />`r`n"
  }

  if ($MapImportPbstreamDir) {
    $escapedMapImportPbstreamDir = ConvertTo-XmlText $MapImportPbstreamDir
    $extraEnvXml += "  <env name=`"SITE_MAP_IMPORT_PBSTREAM_DIR`" value=`"$escapedMapImportPbstreamDir`" />`r`n"
  }

  $xml = @"
<service>
  <id>$escapedServiceId</id>
  <name>$escapedDisplayName</name>
  <description>$escapedDescription</description>
  <executable>$escapedNodePath</executable>
  <argument>$escapedGatewayServer</argument>
  <argument>--host</argument>
  <argument>$escapedHost</argument>
  <argument>--port</argument>
  <argument>$escapedPort</argument>
  <workingdirectory>$escapedWorkingDirectory</workingdirectory>
  <logpath>$escapedLogDirectory</logpath>
  <log mode="roll-by-size-time">
    <sizeThreshold>10240</sizeThreshold>
    <pattern>yyyyMMdd</pattern>
    <autoRollAtTime>00:00:00</autoRollAtTime>
  </log>
  <stoptimeout>15 sec</stoptimeout>
  <env name="FRONTEND_NO_OPEN_BROWSER" value="1" />
${extraEnvXml}  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="20 sec" />
  <onfailure action="restart" delay="30 sec" />
</service>
"@

  Set-Content -LiteralPath $Layout.ServiceXml -Value $xml -Encoding UTF8
}

function Test-ServiceExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ServiceName
  )

  return $null -ne (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)
}

function Invoke-WinSwCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,

    [Parameter(Mandatory = $false)]
    [switch]$IgnoreExitCode
  )

  if (-not (Test-Path -LiteralPath $ExecutablePath)) {
    throw "WinSW executable was not found: $ExecutablePath"
  }

  & $ExecutablePath @Arguments
  if (-not $IgnoreExitCode -and $LASTEXITCODE -ne 0) {
    throw "WinSW command failed: $ExecutablePath $($Arguments -join ' ')"
  }
}

function Stop-ServiceByNameIfPresent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ServiceName
  )

  $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($null -eq $service) {
    return
  }

  if ($service.Status -ne 'Stopped') {
    Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20))
  }
}

function Test-PathInside {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CandidatePath,

    [Parameter(Mandatory = $true)]
    [string]$ParentPath
  )

  $candidate = (Get-FullPath $CandidatePath).TrimEnd('\') + '\'
  $parent = (Get-FullPath $ParentPath).TrimEnd('\') + '\'
  return $candidate.StartsWith($parent, [System.StringComparison]::OrdinalIgnoreCase)
}

function Copy-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDirectory,

    [Parameter(Mandatory = $true)]
    [string]$DestinationDirectory
  )

  Ensure-Directory $DestinationDirectory

  Get-ChildItem -LiteralPath $SourceDirectory -Force | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DestinationDirectory $_.Name) -Recurse -Force
  }
}
