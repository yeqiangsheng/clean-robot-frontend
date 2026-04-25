import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const repoRoot = resolve(__dirname, '..')

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.md',
  '.svg',
  '.txt',
])

const distDir = resolve(repoRoot, 'dist')
const currentDocEntries = [
  'README.md',
  'DEPLOYMENT.md',
  'docs',
  'public',
  'site-gateway/site-config.json',
  '.env.example',
  '现场验收清单.md',
  '故障排查手册.md',
]

const distFileNamePatterns = [
  {
    label: 'test/spec artifact filename',
    pattern: /(^|[._-])(test|spec)([._-]|$)/i,
  },
  {
    label: 'vitest artifact filename',
    pattern: /vitest/i,
  },
  {
    label: 'testing-library artifact filename',
    pattern: /testing-library/i,
  },
]

const distContentPatterns = [
  {
    label: 'vitest marker',
    pattern: /vitest/i,
  },
  {
    label: '@testing-library marker',
    pattern: /@testing-library/i,
  },
  {
    label: 'source test file marker',
    pattern: /\.(test|spec)\.(ts|tsx|js|jsx)/i,
  },
  {
    label: 'test-only user marker',
    pattern: /(test-engineer|mock-engineer)/i,
  },
]

const currentDocPatterns = [
  {
    label: 'live rosbridge IP baked into current docs/config',
    pattern: /(192\.168\.16\.11|10\.2\.0\.88|10\.0\.0\.157|10\.0\.0\.174)/,
  },
  {
    label: 'browser-side rosbridge Vite env in current docs/config',
    pattern: /VITE_ROSBRIDGE_URL/,
  },
  {
    label: 'legacy fallback wording in current docs/config',
    pattern: /deprecated fallback/i,
  },
  {
    label: 'old site coverage commit route',
    pattern: /\/database_server\/coverage_commit_service/,
  },
  {
    label: 'stale local operator path',
    pattern: /\/home\/baer\/Doraemon/,
  },
  {
    label: 'weak default bootstrap password',
    pattern:
      /(operator123|service123|engineer123|admin123|"password"\s*:\s*"(1|change-me[^"]*)")/,
  },
  {
    label: 'personal bootstrap account',
    pattern: /"username"\s*:\s*"baer"/i,
  },
]

const forbiddenPublicAppConfigFields = [
  'rosbridgeUrl',
  'quickRosbridgeUrls',
  'rolePolicy',
  'engineerUnlockMode',
  'engineerPasscode',
]

function normalizePath(filePath) {
  return relative(repoRoot, filePath).replaceAll('\\', '/')
}

function isTextFile(filePath) {
  return textExtensions.has(extname(filePath).toLowerCase())
}

function shouldSkipCurrentDoc(filePath) {
  const normalized = normalizePath(filePath)
  return normalized.startsWith('docs/archive/')
}

function collectFiles(entryPath, output) {
  const stats = statSync(entryPath)

  if (stats.isFile()) {
    output.push(entryPath)
    return
  }

  for (const name of readdirSync(entryPath)) {
    collectFiles(resolve(entryPath, name), output)
  }
}

function scanFileContent(filePath, patterns, findings) {
  if (!isTextFile(filePath)) {
    return
  }

  const content = readFileSync(filePath, 'utf8')
  const relativePath = normalizePath(filePath)

  for (const pattern of patterns) {
    if (pattern.pattern.test(content)) {
      findings.push({
        file: relativePath,
        token: pattern.label,
      })
    }
  }
}

if (!existsSync(distDir)) {
  console.error('Production package audit failed: dist/ is missing. Run npm run build first.')
  process.exit(1)
}

const distFiles = []
collectFiles(distDir, distFiles)

const findings = []

const publicAppConfigPath = resolve(repoRoot, 'public/app-config.json')
if (existsSync(publicAppConfigPath)) {
  const publicAppConfig = JSON.parse(readFileSync(publicAppConfigPath, 'utf8'))

  if (publicAppConfig && typeof publicAppConfig === 'object' && !Array.isArray(publicAppConfig)) {
    for (const field of forbiddenPublicAppConfigFields) {
      if (field in publicAppConfig) {
        findings.push({
          file: normalizePath(publicAppConfigPath),
          token: `gateway-only public app config field: ${field}`,
        })
      }
    }
  }
}

for (const filePath of distFiles) {
  const relativePath = normalizePath(filePath)

  for (const pattern of distFileNamePatterns) {
    if (pattern.pattern.test(relativePath)) {
      findings.push({
        file: relativePath,
        token: pattern.label,
      })
    }
  }

  scanFileContent(filePath, distContentPatterns, findings)
}

for (const entry of currentDocEntries) {
  const fullPath = resolve(repoRoot, entry)

  if (!existsSync(fullPath)) {
    continue
  }

  const files = []
  collectFiles(fullPath, files)

  for (const filePath of files) {
    if (shouldSkipCurrentDoc(filePath)) {
      continue
    }

    scanFileContent(filePath, currentDocPatterns, findings)
  }
}

if (findings.length > 0) {
  console.error('Production package audit failed. Forbidden release markers were found:\n')

  for (const finding of findings) {
    console.error(`- ${finding.file} -> ${finding.token}`)
  }

  process.exit(1)
}

console.log('Production package audit passed.')
