import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = resolve(__dirname, '..')

const packageJsonPath = join(repoRoot, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const packageLockPath = join(repoRoot, 'package-lock.json')
const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'))
const version = packageJson.version ?? '0.0.0'

const releaseRoot = resolve(repoRoot, 'release', `clean-robot-site-v${version}`)
const releaseStartCommand = 'node ./site-gateway/server.mjs --host 127.0.0.1 --port 4173'
const runtimeDependencyNames = ['ws']
const runtimeScriptNames = new Set([
  'install-site-service.ps1',
  'install-site-systemd.sh',
  'manage-site-service.ps1',
  'rollback-site-release.ps1',
  'site-service-common.ps1',
  'uninstall-site-service.ps1',
  'uninstall-site-systemd.sh',
  'upgrade-site-release.ps1',
])
const forbiddenReleaseFilePatterns = [
  /(^|[._-])(test|spec)([._-]|$)/i,
  /vitest/i,
  /testing-library/i,
  /playwright/i,
  /audit-legacy/i,
  /audit-production/i,
  /clean-workspace/i,
  /package-trial/i,
]
const requiredPaths = [
  join(repoRoot, 'dist', 'index.html'),
  join(repoRoot, 'site-gateway', 'server.mjs'),
  join(repoRoot, 'site-gateway', 'site-config.json'),
  join(repoRoot, 'public', 'app-config.json'),
  join(repoRoot, 'start-frontend-prod.cmd'),
  join(repoRoot, 'start-frontend-prod.sh'),
  join(repoRoot, 'stop-frontend-prod.cmd'),
  join(repoRoot, 'stop-frontend-prod.sh'),
  packageLockPath,
]

for (const requiredPath of requiredPaths) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Cannot package trial release because a required file is missing: ${requiredPath}`)
  }
}

try {
  rmSync(releaseRoot, { recursive: true, force: true })
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  throw new Error(
    [
      `Cannot replace the existing release directory: ${releaseRoot}`,
      'Stop any frontend site gateway process or Windows service that is still using this release directory, then run package:trial again.',
      `Original error: ${message}`,
    ].join('\n'),
  )
}
mkdirSync(releaseRoot, { recursive: true })

function normalizeReleasePath(filePath) {
  return filePath.replaceAll('\\', '/')
}

function shouldCopyPath(sourceRelativePath, sourcePath) {
  const normalized = normalizeReleasePath(sourceRelativePath)
  const baseName = normalized.split('/').at(-1) ?? ''

  if (normalized.startsWith('site-gateway/') && /(^|[._-])(test|spec)([._-]|$)/i.test(baseName)) {
    return false
  }

  if (normalized.startsWith('scripts/')) {
    return runtimeScriptNames.has(baseName)
  }

  return !statSync(sourcePath).isDirectory() || baseName !== '.tmp'
}

function copyFiltered(sourcePath, targetPath, sourceRelativePath) {
  if (!shouldCopyPath(sourceRelativePath, sourcePath)) {
    return
  }

  const stats = statSync(sourcePath)

  if (stats.isDirectory()) {
    mkdirSync(targetPath, { recursive: true })

    for (const entryName of readdirSync(sourcePath)) {
      copyFiltered(
        join(sourcePath, entryName),
        join(targetPath, entryName),
        normalizeReleasePath(join(sourceRelativePath, entryName)),
      )
    }
    return
  }

  mkdirSync(dirname(targetPath), { recursive: true })
  cpSync(sourcePath, targetPath)
}

function collectReleaseFiles(directory, output = []) {
  for (const entryName of readdirSync(directory)) {
    const entryPath = join(directory, entryName)
    const stats = statSync(entryPath)

    if (stats.isDirectory()) {
      collectReleaseFiles(entryPath, output)
      continue
    }

    output.push(entryPath)
  }

  return output
}

function createReleasePackageJson() {
  const dependencies = {}

  for (const dependencyName of runtimeDependencyNames) {
    const dependencyVersion = packageJson.dependencies?.[dependencyName]

    if (!dependencyVersion) {
      throw new Error(`Cannot package trial release because runtime dependency is missing: ${dependencyName}`)
    }

    dependencies[dependencyName] = dependencyVersion
  }

  return {
    name: packageJson.name,
    private: true,
    version,
    type: packageJson.type ?? 'module',
    scripts: {
      'start:prod': releaseStartCommand,
    },
    dependencies,
  }
}

function createReleasePackageLock(releasePackageJson) {
  const packages = {
    '': {
      name: releasePackageJson.name,
      version: releasePackageJson.version,
      dependencies: releasePackageJson.dependencies,
    },
  }

  for (const dependencyName of Object.keys(releasePackageJson.dependencies)) {
    const packageKey = `node_modules/${dependencyName}`
    const lockedDependency = packageLock.packages?.[packageKey]

    if (!lockedDependency) {
      throw new Error(`Cannot package trial release because package-lock is missing: ${packageKey}`)
    }

    packages[packageKey] = lockedDependency
  }

  return {
    name: releasePackageJson.name,
    version: releasePackageJson.version,
    lockfileVersion: packageLock.lockfileVersion ?? 3,
    requires: packageLock.requires ?? true,
    packages,
  }
}

function assertReleasePackageManifest() {
  const findings = []
  const manifest = JSON.parse(readFileSync(resolve(releaseRoot, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(resolve(releaseRoot, 'package-lock.json'), 'utf8'))
  const scriptNames = Object.keys(manifest.scripts ?? {})
  const dependencyNames = Object.keys(manifest.dependencies ?? {})
  const lockedPackageNames = Object.keys(lock.packages ?? {}).filter(Boolean)

  if (manifest.devDependencies) {
    findings.push('package.json still contains devDependencies')
  }

  for (const scriptName of scriptNames) {
    if (scriptName !== 'start:prod') {
      findings.push(`package.json still exposes development script: ${scriptName}`)
    }
  }

  if (manifest.scripts?.['start:prod'] !== releaseStartCommand) {
    findings.push('package.json start:prod does not point at the site gateway runtime')
  }

  for (const dependencyName of dependencyNames) {
    if (!runtimeDependencyNames.includes(dependencyName)) {
      findings.push(`package.json still contains non-runtime dependency: ${dependencyName}`)
    }
  }

  for (const dependencyName of runtimeDependencyNames) {
    if (!manifest.dependencies?.[dependencyName]) {
      findings.push(`package.json is missing runtime dependency: ${dependencyName}`)
    }
  }

  for (const lockedPackageName of lockedPackageNames) {
    if (!runtimeDependencyNames.some((dependencyName) => lockedPackageName === `node_modules/${dependencyName}`)) {
      findings.push(`package-lock.json still contains non-runtime package: ${lockedPackageName}`)
    }
  }

  if (findings.length > 0) {
    throw new Error(`Release package manifest is not runtime-pruned:\n${findings.map((item) => `- ${item}`).join('\n')}`)
  }
}

function assertCleanReleasePackage() {
  const findings = []

  assertReleasePackageManifest()

  for (const filePath of collectReleaseFiles(releaseRoot)) {
    const relativePath = normalizeReleasePath(filePath.slice(releaseRoot.length + 1))

    for (const pattern of forbiddenReleaseFilePatterns) {
      if (pattern.test(relativePath)) {
        findings.push(relativePath)
        break
      }
    }
  }

  if (findings.length > 0) {
    throw new Error(
      `Release package contains development-only files:\n${findings
        .map((item) => `- ${item}`)
        .join('\n')}`,
    )
  }
}

function normalizeLinuxScriptLineEndings() {
  for (const filePath of collectReleaseFiles(releaseRoot)) {
    if (!filePath.endsWith('.sh')) {
      continue
    }

    const content = readFileSync(filePath, 'utf8')
    writeFileSync(filePath, content.replaceAll('\r\n', '\n'))
  }
}

const copyEntries = [
  ['dist', 'dist'],
  ['public', 'public'],
  ['site-gateway', 'site-gateway'],
  ['scripts', 'scripts'],
  ['start-frontend-prod.cmd', 'start-frontend-prod.cmd'],
  ['start-frontend-prod.sh', 'start-frontend-prod.sh'],
  ['stop-frontend-prod.cmd', 'stop-frontend-prod.cmd'],
  ['stop-frontend-prod.sh', 'stop-frontend-prod.sh'],
  ['DEPLOYMENT.md', 'DEPLOYMENT.md'],
  ['docs/ubuntu20_robot_deployment.md', 'docs/ubuntu20_robot_deployment.md'],
  [`docs/release_notes_${version}.md`, `docs/release_notes_${version}.md`],
  ['现场验收清单.md', '现场验收清单.md'],
  ['故障排查手册.md', '故障排查手册.md'],
  ['README.md', 'README.md'],
  ['.env.example', '.env.example'],
]

for (const [sourceRelativePath, targetRelativePath] of copyEntries) {
  const sourcePath = resolve(repoRoot, sourceRelativePath)
  if (!existsSync(sourcePath)) {
    continue
  }

  const targetPath = resolve(releaseRoot, targetRelativePath)
  copyFiltered(sourcePath, targetPath, sourceRelativePath)
}

const releasePackageJson = createReleasePackageJson()
writeFileSync(resolve(releaseRoot, 'package.json'), `${JSON.stringify(releasePackageJson, null, 2)}\n`)
writeFileSync(
  resolve(releaseRoot, 'package-lock.json'),
  `${JSON.stringify(createReleasePackageLock(releasePackageJson), null, 2)}\n`,
)

mkdirSync(resolve(releaseRoot, 'service'), { recursive: true })

writeFileSync(
  resolve(releaseRoot, 'RELEASE-INFO.json'),
  JSON.stringify(
    {
      packageName: packageJson.name,
      version,
      createdAt: new Date().toISOString(),
      deploymentMode: 'single-site-gateway',
      entryUrl: 'http://127.0.0.1:4173',
      startCommand: '.\\start-frontend-prod.cmd',
      stopCommand: '.\\stop-frontend-prod.cmd',
      linuxEntryUrl: 'http://<robot-ip>:4173',
      linuxStartCommand: './start-frontend-prod.sh',
      linuxStopCommand: './stop-frontend-prod.sh',
      installCommand: 'npm.cmd install --omit=dev',
      linuxInstallCommand: 'npm install --omit=dev',
      serviceInstallCommand:
        '.\\scripts\\install-site-service.ps1 -WinSwExePath C:\\path\\to\\WinSW.exe',
      serviceInstallWithRosbridgeCommand:
        '.\\scripts\\install-site-service.ps1 -WinSwExePath C:\\path\\to\\WinSW.exe -RosbridgeUrl ws://<robot-host>:9090',
      linuxSystemdInstallCommand:
        'sudo SITE_ROSBRIDGE_URL=ws://127.0.0.1:9090 ./scripts/install-site-systemd.sh',
      linuxSystemdUninstallCommand: 'sudo ./scripts/uninstall-site-systemd.sh',
      serviceUninstallCommand: '.\\scripts\\uninstall-site-service.ps1',
      upgradeCommand:
        '.\\scripts\\upgrade-site-release.ps1 -InstallRoot C:\\CleanRobot\\site',
      rollbackCommand:
        '.\\scripts\\rollback-site-release.ps1 -InstallRoot C:\\CleanRobot\\site',
      notes: [
        'Production startup no longer runs verify automatically.',
        'Editable UI config is served from public/app-config.json.',
        'Field ROS addresses should be set with SITE_ROSBRIDGE_URL, -RosbridgeUrl, or deployed site-config.json.',
        'The site gateway proxies browser access to ROS through /ws/rosbridge.',
        'WinSW install and upgrade/rollback scripts are bundled under scripts/.',
        'Ubuntu 20.04 robot-side systemd install scripts are bundled under scripts/.',
      ],
    },
    null,
    2,
  ),
)

normalizeLinuxScriptLineEndings()
assertCleanReleasePackage()

console.log(`Trial release packaged at: ${releaseRoot}`)
