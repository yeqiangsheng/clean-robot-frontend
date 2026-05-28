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
  'src/utils',
  'src/api/contracts',
  'src/api/gateway',
  'src/workers',
  'site-gateway/lib',
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
    label: '/clean_robot_server/submit_slam_command',
    test: (line) => line.includes('/clean_robot_server/submit_slam_command'),
  },
  {
    label: '/database_server/map_alignment_service',
    test: (line) => line.includes('/database_server/map_alignment_service'),
  },
  {
    label: '/database_server/map_alignment_by_points_service',
    test: (line) => line.includes('/database_server/map_alignment_by_points_service'),
  },
  {
    label: '/database_server/rect_zone_preview_service',
    test: (line) => line.includes('/database_server/rect_zone_preview_service'),
  },
  {
    label: '/database_server/coverage_zone_service',
    test: (line) => line.includes('/database_server/coverage_zone_service'),
  },
  {
    label: '/database_server/zone_plan_path_service',
    test: (line) => line.includes('/database_server/zone_plan_path_service'),
  },
  {
    label: '/database_server/coverage_preview_service',
    test: (line) => line.includes('/database_server/coverage_preview_service'),
  },
  {
    label: '/database_server/coverage_commit_service',
    test: (line) => line.includes('/database_server/coverage_commit_service'),
  },
  {
    label: '/database_server/no_go_area_service',
    test: (line) => line.includes('/database_server/no_go_area_service'),
  },
  {
    label: '/database_server/virtual_wall_service',
    test: (line) => line.includes('/database_server/virtual_wall_service'),
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
    test: (line) => /deprecated fallback/i.test(line),
  },
  {
    label: 'deprecatedFallback',
    test: (line) => line.includes('deprecatedFallback'),
  },
  {
    label: '_FALLBACK_NAME',
    test: (line) => line.includes('_FALLBACK_NAME'),
  },
  {
    label: 'readQueryFallback',
    test: (line) => line.includes('readQueryFallback'),
  },
  {
    label: 'callAppFirstReadQueryService',
    test: (line) => line.includes('callAppFirstReadQueryService'),
  },
  {
    label: 'mapLegacyResponse',
    test: (line) => line.includes('mapLegacyResponse'),
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
  {
    label: 'browser rosbridge proxy route',
    test: (line) => line.includes('/ws/rosbridge'),
  },
  {
    label: 'browser websocket proxy route',
    test: (line) => line.includes('/ws/*') || line.includes("'/ws'") || line.includes('"/ws"'),
  },
  {
    label: 'browser websocket proxy env',
    test: (line) => line.includes('VITE_SITE_GATEWAY_WS_TARGET'),
  },
  {
    label: 'browser rosbridge reconnect route',
    test: (line) => line.includes('/gateway/rosbridge/reconnect'),
  },
  {
    label: 'browser rosbridge proxy server',
    test: (line) => line.includes('WebSocketServer'),
  },
  {
    label: 'browser rosbridge proxy helper',
    test: (line) => line.includes('normalizeForwardedWebSocketMessage'),
  },
  {
    label: 'browser rosbridge proxy config helper',
    test: (line) => line.includes('getRosbridgeProxyPath'),
  },
  {
    label: 'browser-side ROS subscription wording',
    test: (line) => /browser-side ROS subscriptions/i.test(line),
  },
  {
    label: 'rosbridge proxying wording',
    test: (line) => /rosbridge proxying/i.test(line),
  },
  {
    label: 'browser-visible ROS upstream URL state',
    test: (line) =>
      line.includes('snapshot.url') ||
      line.includes('connection.url') ||
      line.includes('health.ros.url') ||
      line.includes('defaultUrl'),
  },
  {
    label: 'browser ROS service request type',
    test: (line) => line.includes('RosServiceRequest'),
  },
  {
    label: 'browser remember password control',
    test: (line) => line.includes('rememberPassword') || line.includes('记住密码'),
  },
  {
    label: 'browser stores login password',
    test: (line) => /localStorage\.setItem\(.*password/i.test(line),
  },
  {
    label: 'browser imports old api/ros namespace',
    test: (line) =>
      /^import\s+(?!type\b).*\sfrom\s+['"].*\/api\/ros\/[^'"]+['"]/.test(line) ||
      /import\(['"].*\/api\/ros\/[^'"]+['"]\)/.test(line) ||
      /^import\s+(?!type\b).*\sfrom\s+['"]\.\.\/ros\/[^'"]+['"]/.test(line) ||
      /import\(['"]\.\.\/ros\/[^'"]+['"]\)/.test(line),
  },
  {
    label: 'static direct ROS gateway import',
    test: (line) =>
      /^import\s+(?!type\b).*\sfrom\s+['"]\.\.\/ros\/(client|executionServices|mapCatalogServices|odometryServices|profileCatalogServices|runtimeServices|scheduleServices|services|slamWorkflowServices|systemReadinessServices|taskServices)['"]/.test(
        line,
      ),
  },
  {
    label: 'dynamic direct ROS service import',
    test: (line) =>
      /import\(['"]\.\.\/ros\/(client|executionServices|mapCatalogServices|odometryServices|profileCatalogServices|runtimeServices|scheduleServices|services|slamWorkflowServices|systemReadinessServices|taskServices)['"]\)/.test(
        line,
      ) ||
      /import\(['"]\.\/(client|executionServices|mapCatalogServices|odometryServices|profileCatalogServices|runtimeServices|scheduleServices|services|slamWorkflowServices|systemReadinessServices|taskServices)['"]\)/.test(
        line,
      ),
  },
  {
    label: 'browser imports direct ROS client',
    test: (line) =>
      /^import\s+(?!type\b).*\sfrom\s+['"].*\/api\/ros\/client['"]/.test(line) ||
      /import\(['"].*\/api\/ros\/client['"]\)/.test(line),
  },
  {
    label: 'runtime UI imports direct ROS runtime service',
    test: (line) =>
      /^import\s+(?!type\b).*\sfrom\s+['"].*\/api\/ros\/runtimeServices['"]/.test(line),
  },
  {
    label: 'runtime UI imports direct ROS SLAM topic service',
    test: (line) =>
      /^import\s+(?!type\b).*\sfrom\s+['"].*\/api\/ros\/slamWorkflowTopics['"]/.test(line),
  },
  {
    label: 'legacy robotGateway aggregate import',
    test: (line) =>
      /^import\s+(?!type\b).*\sfrom\s+['"].*\/api\/gateway\/robotGateway['"]/.test(line) ||
      /^import\s+(?!type\b).*\sfrom\s+['"]\.\/robotGateway['"]/.test(line) ||
      /^export\s+.*\sfrom\s+['"]\.\/robotGateway['"]/.test(line),
  },
  {
    label: 'legacy components/ros import',
    test: (line) =>
      /^import\s+(?!type\b).*\sfrom\s+['"].*\/components\/ros\/[^'"]+['"]/.test(line) ||
      /import\(['"].*\/components\/ros\/[^'"]+['"]\)/.test(line),
  },
]

const forbiddenPathPatterns = [
  {
    label: 'legacy components/ros namespace',
    test: (relativePath) => relativePath.startsWith('src/components/ros/'),
  },
  {
    label: 'legacy browser rosbridge proxy client',
    test: (relativePath) => relativePath === 'src/api/gateway/connectionUrl.ts',
  },
  {
    label: 'legacy browser rosbridge proxy helper',
    test: (relativePath) => relativePath.startsWith('site-gateway/lib/ws-proxy.'),
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

  for (const pattern of forbiddenPathPatterns) {
    if (!pattern.test(relativePath)) {
      continue
    }

    findings.push({
      file: relativePath,
      line: 1,
      token: pattern.label,
    })
  }

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
