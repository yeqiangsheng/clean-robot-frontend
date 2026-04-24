import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const repoRoot = resolve(__dirname, '..')

const protectedEntries = [
  'README.md',
  'DEPLOYMENT.md',
  '现场验收清单.md',
  '故障排查手册.md',
  'docs/README.md',
  'docs/frontend_live_regression_matrix_v1.md',
  'src/App.tsx',
  'src/main.tsx',
  'src/pages',
  'src/components',
  'src/features',
  'src/hooks',
  'src/stores',
  'src/api/gateway',
  'site-gateway/server.mjs',
]

const forbiddenPatterns = [
  {
    label: '/exe_task_server',
    test: (line) =>
      line.includes('/exe_task_server') &&
      !line.includes('/coverage_task_manager/app/exe_task_server'),
  },
  {
    label: '/clean_robot_server/map_server',
    test: (line) => line.includes('/clean_robot_server/map_server'),
  },
  {
    label: '/database_server/clean_task_service',
    test: (line) => line.includes('/database_server/clean_task_service'),
  },
  {
    label: '/database_server/clean_schedule_service',
    test: (line) => line.includes('/database_server/clean_schedule_service'),
  },
  {
    label: '/clean_robot_server/slam_command_service',
    test: (line) => line.includes('/clean_robot_server/slam_command_service'),
  },
  {
    label: '/clean_robot_server/get_slam_status',
    test: (line) => line.includes('/clean_robot_server/get_slam_status'),
  },
  {
    label: '/clean_robot_server/get_slam_job',
    test: (line) => line.includes('/clean_robot_server/get_slam_job'),
  },
  {
    label: '/clean_robot_server/get_odometry_status',
    test: (line) => line.includes('/clean_robot_server/get_odometry_status'),
  },
  {
    label: '/coverage_task_manager/get_system_readiness',
    test: (line) => line.includes('/coverage_task_manager/get_system_readiness'),
  },
  {
    label: '/database_server/profile_catalog_service',
    test: (line) => line.includes('/database_server/profile_catalog_service'),
  },
  {
    label: 'deprecated fallback',
    test: (line) => line.includes('deprecated fallback'),
  },
  {
    label: '/home/baer/Doraemon',
    test: (line) => line.includes('/home/baer/Doraemon'),
  },
  {
    label: 'ws://10.0.0.157:9090',
    test: (line) => line.includes('ws://10.0.0.157:9090'),
  },
  {
    label: 'ws://10.0.0.174:9090',
    test: (line) => line.includes('ws://10.0.0.174:9090'),
  },
]

function normalizePath(filePath) {
  return relative(repoRoot, filePath).replaceAll('\\', '/')
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

const filesToAudit = []
for (const entry of protectedEntries) {
  const fullPath = resolve(repoRoot, entry)
  if (!existsSync(fullPath)) {
    continue
  }

  collectFiles(fullPath, filesToAudit)
}

const findings = []

for (const filePath of filesToAudit) {
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)
  const relativePath = normalizePath(filePath)

  lines.forEach((line, index) => {
    for (const pattern of forbiddenPatterns) {
      if (!pattern.test(line)) {
        continue
      }

      findings.push({
        file: relativePath,
        line: index + 1,
        token: pattern.label,
      })
    }
  })
}

if (findings.length > 0) {
  console.error('Legacy boundary audit failed. Forbidden legacy markers were found in protected layers:\n')
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} -> ${finding.token}`)
  }
  process.exit(1)
}

console.log('Legacy boundary audit passed.')
