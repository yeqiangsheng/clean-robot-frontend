import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const repoRoot = resolve(__dirname, '..')

const sourceRoots = ['src', 'site-gateway', 'scripts']
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css']
const skippedDirectories = new Set([
  'dist',
  'node_modules',
  'playwright-report',
  'release',
  'test-results',
])

const entryPatterns = [
  /^src\/main\.tsx$/,
  /^src\/App\.tsx$/,
  /^src\/index\.css$/,
  /^src\/vite-env\.d\.ts$/,
  /^src\/pages\//,
  /^src\/test\/setup\.ts$/,
  /^src\/workers\/mapSnapshotWorker\.ts$/,
  /^site-gateway\/server\.mjs$/,
  /^scripts\//,
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/,
]

const importPattern =
  /(?:import\s+(?:[^'"()]+?\s+from\s+)?|export\s+[^'"()]+?\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]|@import\s+['"]([^'"]+)['"]/g

function normalizePath(filePath) {
  return relative(repoRoot, filePath).replaceAll('\\', '/')
}

function collectFiles(entryPath, output) {
  const stats = statSync(entryPath)

  if (stats.isFile()) {
    if (sourceExtensions.includes(extname(entryPath))) {
      output.push(resolve(entryPath))
    }
    return
  }

  for (const name of readdirSync(entryPath)) {
    if (skippedDirectories.has(name)) {
      continue
    }

    collectFiles(resolve(entryPath, name), output)
  }
}

function resolveLocalImport(fromFile, specifier, fileSet) {
  if (!specifier?.startsWith('.')) {
    return null
  }

  const basePath = resolve(dirname(fromFile), specifier)
  const candidates = [
    basePath,
    ...sourceExtensions.map((extension) => `${basePath}${extension}`),
    ...sourceExtensions.map((extension) => resolve(basePath, `index${extension}`)),
  ]

  return candidates.find((candidate) => fileSet.has(resolve(candidate))) ?? null
}

function isEntryFile(relativePath) {
  return entryPatterns.some((pattern) => pattern.test(relativePath))
}

const files = []

for (const rootName of sourceRoots) {
  const rootPath = resolve(repoRoot, rootName)

  if (existsSync(rootPath)) {
    collectFiles(rootPath, files)
  }
}

const fileSet = new Set(files)
const inbound = new Map(files.map((filePath) => [filePath, new Set()]))

for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8')

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2]
    const target = resolveLocalImport(filePath, specifier, fileSet)

    if (target) {
      inbound.get(target).add(filePath)
    }
  }
}

const zeroInboundCandidates = files
  .map((filePath) => normalizePath(filePath))
  .filter((relativePath) => {
    if (isEntryFile(relativePath)) {
      return false
    }

    return inbound.get(resolve(repoRoot, relativePath)).size === 0
  })
  .sort()

if (zeroInboundCandidates.length > 0) {
  console.error('Local module audit failed. These files have no local inbound imports:\n')

  for (const candidate of zeroInboundCandidates) {
    console.error(`- ${candidate}`)
  }

  console.error('\nIf a file is an intentional entrypoint, add it to scripts/audit-local-modules.mjs.')
  process.exit(1)
}

console.log('Local module audit passed.')
