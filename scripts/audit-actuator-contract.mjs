import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const repoRoot = resolve(__dirname, '..')

const textExtensions = new Set(['.css', '.js', '.json', '.mjs', '.ts', '.tsx'])

const protectedEntries = ['src', 'site-gateway/lib', 'site-gateway/server.mjs']

const requiredContracts = [
  {
    file: 'src/api/gateway/actuatorControlGateway.ts',
    label: 'frontend actuator level max is 100',
    pattern: /ACTUATOR_LEVEL_MAX\s*=\s*100\b/,
  },
  {
    file: 'site-gateway/lib/constants.mjs',
    label: 'gateway actuator level max is 100',
    pattern: /ACTUATOR_LEVEL_MAX\s*=\s*100\b/,
  },
  {
    file: 'src/api/gateway/actuatorControlGateway.ts',
    label: 'frontend water tap topic type',
    pattern: /robot_platform_msgs\/ControlWaterTap/,
  },
  {
    file: 'src/api/gateway/actuatorControlGateway.ts',
    label: 'frontend motor topic type',
    pattern: /robot_platform_msgs\/ControlMotor/,
  },
  {
    file: 'src/api/gateway/actuatorControlGateway.ts',
    label: 'frontend clean tools topic type',
    pattern: /robot_platform_msgs\/ControlCleanTools/,
  },
  {
    file: 'site-gateway/lib/constants.mjs',
    label: 'gateway water tap topic type',
    pattern: /robot_platform_msgs\/ControlWaterTap/,
  },
  {
    file: 'site-gateway/lib/constants.mjs',
    label: 'gateway motor topic type',
    pattern: /robot_platform_msgs\/ControlMotor/,
  },
  {
    file: 'site-gateway/lib/constants.mjs',
    label: 'gateway clean tools topic type',
    pattern: /robot_platform_msgs\/ControlCleanTools/,
  },
]

const forbiddenPatterns = [
  {
    label: 'legacy actuator level max 64',
    pattern: /ACTUATOR_LEVEL_MAX\s*=\s*64\b|0\s*\.\.\s*64|0\s*-\s*64/,
  },
  {
    label: 'legacy actuator topic type',
    pattern: /my_msg_srv\/(ControlWaterTap|ControlMotor|ControlCleanTools)/,
  },
  {
    label: 'legacy wheeltec charge path',
    pattern: /\/set_charge/,
  },
  {
    label: 'browser-side actuator ROS publisher module',
    pattern: /actuatorControlTopics|publishWaterSequenceOn|publishVacuumChainOn|publishBrushWorkPosition|publishBrushRetractOn|publishScraperDeployOn|publishScraperStowOn/,
  },
  {
    label: 'legacy split actuator command kind',
    pattern:
      /['"](waterPump|waterValve|sewageValve|suction|suctionLevel|vacuumMotor|vacuumPreset|brushOpen|brushClose|brushRaise|brushLower|scraperRaise|scraperLower)['"]/,
  },
]

function normalizePath(filePath) {
  return relative(repoRoot, filePath).replaceAll('\\', '/')
}

function isTextFile(filePath) {
  return textExtensions.has(extname(filePath).toLowerCase())
}

function collectFiles(entryPath, output) {
  const stats = statSync(entryPath)

  if (stats.isFile()) {
    output.push(entryPath)
    return
  }

  for (const name of readdirSync(entryPath)) {
    if (name === 'node_modules' || name === 'dist') {
      continue
    }

    collectFiles(resolve(entryPath, name), output)
  }
}

const findings = []

for (const contract of requiredContracts) {
  const fullPath = resolve(repoRoot, contract.file)

  if (!existsSync(fullPath)) {
    findings.push({
      file: contract.file,
      token: `missing required contract file: ${contract.label}`,
    })
    continue
  }

  const content = readFileSync(fullPath, 'utf8')
  if (!contract.pattern.test(content)) {
    findings.push({
      file: contract.file,
      token: `missing required contract: ${contract.label}`,
    })
  }
}

const filesToAudit = []
for (const entry of protectedEntries) {
  const fullPath = resolve(repoRoot, entry)
  if (!existsSync(fullPath)) {
    continue
  }

  collectFiles(fullPath, filesToAudit)
}

for (const filePath of filesToAudit) {
  if (!isTextFile(filePath)) {
    continue
  }

  const content = readFileSync(filePath, 'utf8')
  const relativePath = normalizePath(filePath)

  for (const pattern of forbiddenPatterns) {
    if (pattern.pattern.test(content)) {
      findings.push({
        file: relativePath,
        token: pattern.label,
      })
    }
  }
}

if (findings.length > 0) {
  console.error('Actuator contract audit failed. Forbidden or missing contract markers were found:\n')

  for (const finding of findings) {
    console.error(`- ${finding.file} -> ${finding.token}`)
  }

  process.exit(1)
}

console.log('Actuator contract audit passed.')
