import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { loadSiteConfig } from './lib/config.mjs'
import {
  DOCK_CALIBRATION_COMMAND_SERVICE_NAME,
  EXECUTION_SERVICE_NAME,
  SCHEDULE_SERVICE_NAME,
  SESSION_COOKIE_NAME,
  SLAM_SUBMIT_SERVICE_NAME,
  TASK_SERVICE_NAME,
} from './lib/constants.mjs'
import {
  bootstrapUsers,
  createSession,
  deleteAllSessions,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
  findUserByUsername,
  insertAuditLog,
  listAuditLogs,
  openSiteDatabase,
  pruneExpiredAuditLogs,
  pruneExpiredSessions,
} from './lib/database.mjs'
import { buildGrantedCapabilities, RosGateway } from './lib/ros-gateway.mjs'
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createSessionToken,
  hashSessionToken,
  parseCookies,
  verifyPassword,
} from './lib/security.mjs'

const __filename = fileURLToPath(import.meta.url)
const gatewayDir = dirname(__filename)
const repoRoot = resolve(gatewayDir, '..')

const args = new Map(
  process.argv.slice(2).flatMap((entry, index, array) => {
    if (!entry.startsWith('--')) {
      return []
    }

    const [key, inlineValue] = entry.replace(/^--/, '').split('=', 2)
    const value = inlineValue ?? array[index + 1]
    return [[key, value]]
  }),
)

const host = args.get('host') ?? '127.0.0.1'
const port = Number(args.get('port') ?? '4173')
const configPath = resolve(args.get('config') ?? join(gatewayDir, 'site-config.json'))
const distDir = resolve(repoRoot, 'dist')
const publicDir = resolve(repoRoot, 'public')
const runtimeDir = resolve(repoRoot, '.tmp', 'site-gateway')
const databasePath = resolve(runtimeDir, 'site-gateway.sqlite')
const packageJsonPath = resolve(repoRoot, 'package.json')
const packageVersion = JSON.parse(readFileSync(packageJsonPath, 'utf8')).version ?? '0.0.0'

mkdirSync(runtimeDir, { recursive: true })

const siteConfig = loadSiteConfig(configPath)
const database = openSiteDatabase(databasePath)
bootstrapUsers(database, siteConfig.bootstrapUsers)
if (siteConfig.clearSessionsOnStartup) {
  deleteAllSessions(database)
}
pruneExpiredSessions(database)
pruneExpiredAuditLogs(database, siteConfig.logRetentionDays)

const rosGateway = new RosGateway(siteConfig)
void rosGateway.connect().catch(() => {
  // Health/capabilities endpoints will surface the current rosbridge error later.
})

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getMimeType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'application/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.ico':
      return 'image/x-icon'
    default:
      return 'application/octet-stream'
  }
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(JSON.stringify(payload))
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  })
  response.end(payload)
}

async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function createGatewayError(message, options = {}) {
  const error = new Error(message)
  error.statusCode = options.statusCode ?? 500
  error.code = options.code ?? 'GATEWAY_ERROR'
  error.source = options.source ?? 'site-gateway'
  error.recoverable = options.recoverable ?? true
  error.requiresEngineer = options.requiresEngineer ?? false
  error.missingDependency = options.missingDependency ?? null
  return error
}

function normalizeErrorResponse(error, requestId) {
  return {
    ok: false,
    success: false,
    code: error?.code ?? 'GATEWAY_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected gateway error.',
    recoverable: error?.recoverable ?? true,
    requiresEngineer: error?.requiresEngineer ?? false,
    missingDependency: error?.missingDependency ?? null,
    requestId,
  }
}

function getSessionFromRequest(request) {
  const cookies = parseCookies(request.headers.cookie)
  const token = cookies[SESSION_COOKIE_NAME]

  if (!token) {
    return null
  }

  pruneExpiredSessions(database)
  return findSessionByTokenHash(database, hashSessionToken(token))
}

function requireSession(request) {
  const session = getSessionFromRequest(request)
  if (!session) {
    throw createGatewayError('登录会话已失效，请重新登录。', {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      recoverable: true,
    })
  }

  return session
}

function requireCapability(request, capability) {
  const session = requireSession(request)
  const grantedCapabilities = buildGrantedCapabilities(siteConfig, session.role)

  if (!grantedCapabilities.includes(capability)) {
    throw createGatewayError(`当前角色没有能力执行 ${capability}。`, {
      statusCode: 403,
      code: 'CAPABILITY_DENIED',
      recoverable: true,
      requiresEngineer: capability === 'slamWorkbench' || capability === 'actuatorControl',
    })
  }

  return {
    session,
    grantedCapabilities,
  }
}

function requireAnyCapability(request, capabilities) {
  const session = requireSession(request)
  const grantedCapabilities = buildGrantedCapabilities(siteConfig, session.role)
  const matched = capabilities.find((capability) => grantedCapabilities.includes(capability))

  if (!matched) {
    throw createGatewayError(`当前角色没有能力执行 ${capabilities.join(' / ')}。`, {
      statusCode: 403,
      code: 'CAPABILITY_DENIED',
      recoverable: true,
      requiresEngineer: capabilities.includes('runtimeMonitoring') || capabilities.includes('actuatorControl'),
    })
  }

  return {
    session,
    grantedCapabilities,
    matchedCapability: matched,
  }
}

function createAuditEvent(session, partial, requestId) {
  return insertAuditLog(database, {
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    timestamp: Date.now(),
    actor: session.username,
    role: session.role,
    category: partial.category,
    action: partial.action,
    target: partial.target,
    status: partial.status,
    message: partial.message,
    detail: partial.detail ?? {},
    requestId,
    source: partial.source ?? 'site-gateway',
  })
}

function getPublicConfigSnapshot() {
  const distConfigPath = join(distDir, 'app-config.json')
  const publicConfigPath = join(publicDir, 'app-config.json')
  const configFilePath = existsSync(distConfigPath) ? distConfigPath : publicConfigPath

  if (!existsSync(configFilePath)) {
    return null
  }

  try {
    return JSON.parse(readFileSync(configFilePath, 'utf8'))
  } catch {
    return null
  }
}

function getPublicRosConnectionSnapshot(connection) {
  return {
    status: connection.status,
    isConnected: connection.isConnected,
    lastError: connection.lastError,
    connectedAt: connection.connectedAt,
    sessionId: connection.sessionId,
  }
}

async function handleApiRequest(request, response, url) {
  const requestId = randomUUID()

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      const connection = rosGateway.getConnectionSnapshot()
      sendJson(response, 200, {
        status: 'ok',
        version: packageVersion,
        siteName: siteConfig.siteName,
        robotId: siteConfig.robotId,
        ros: getPublicRosConnectionSnapshot(connection),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/gateway/ros/reconnect') {
      requireSession(request)
      const connection = await rosGateway.reconnect()
      sendJson(response, 200, {
        success: true,
        ros: getPublicRosConnectionSnapshot(connection),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/session/login') {
      const body = await readJsonBody(request)
      const username = typeof body.username === 'string' ? body.username.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      const user = findUserByUsername(database, username)

      if (!user || !verifyPassword(password, user.passwordHash)) {
        throw createGatewayError('用户名或密码不正确。', {
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
        })
      }

      const token = createSessionToken()
      const expiresAt = Date.now() + siteConfig.sessionTtlHours * 60 * 60 * 1000
      createSession(database, {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt,
      })

      const sessionPayload = {
        user: {
          username: user.username,
          displayName: user.displayName,
          role: user.role,
        },
        capabilities: buildGrantedCapabilities(siteConfig, user.role),
      }

      createAuditEvent(sessionPayload.user, {
        category: 'auth',
        action: 'session:login',
        target: '/api/session/login',
        status: 'success',
        message: '用户登录成功。',
      }, requestId)

      sendJson(response, 200, sessionPayload, {
        'Set-Cookie': buildSessionCookie(token, siteConfig.sessionTtlHours * 60 * 60),
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/session/logout') {
      const cookies = parseCookies(request.headers.cookie)
      const token = cookies[SESSION_COOKIE_NAME]
      const session = getSessionFromRequest(request)

      if (token) {
        deleteSessionByTokenHash(database, hashSessionToken(token))
      }

      if (session) {
        createAuditEvent(session, {
          category: 'auth',
          action: 'session:logout',
          target: '/api/session/logout',
          status: 'success',
          message: '用户已退出登录。',
        }, requestId)
      }

      sendJson(response, 200, { success: true }, {
        'Set-Cookie': buildExpiredSessionCookie(),
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/session/me') {
      const session = requireSession(request)
      sendJson(response, 200, {
        user: {
          username: session.username,
          displayName: session.displayName,
          role: session.role,
        },
        capabilities: buildGrantedCapabilities(siteConfig, session.role),
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/capabilities') {
      const session = requireSession(request)
      const capabilities = buildGrantedCapabilities(siteConfig, session.role)
      sendJson(response, 200, await rosGateway.getCapabilityStatuses(capabilities))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/audit') {
      requireSession(request)
      const limit = Number(url.searchParams.get('limit') ?? '50')
      sendJson(response, 200, listAuditLogs(database, limit))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/audit/records') {
      const session = requireSession(request)
      const body = await readJsonBody(request)
      const detail = isRecord(body.detail) ? body.detail : {}
      const record = createAuditEvent(session, {
        category: typeof body.category === 'string' ? body.category : 'system',
        action: typeof body.action === 'string' ? body.action : 'unknown',
        target: typeof body.target === 'string' ? body.target : '--',
        status: typeof body.status === 'string' ? body.status : 'success',
        message: typeof body.message === 'string' ? body.message : 'audit event',
        detail,
        source: 'frontend-audit-bridge',
      }, requestId)

      sendJson(response, 200, record)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/diagnostics/export') {
      const session = requireSession(request)
      const [capabilityMap, runtimeTopics, auditLogs] = await Promise.all([
        rosGateway.getCapabilityStatuses(buildGrantedCapabilities(siteConfig, session.role)),
        rosGateway.getRuntimeTopicMetas(),
        Promise.resolve(listAuditLogs(database, 50)),
      ])

      const bundle = {
        generatedAt: new Date().toISOString(),
        appVersion: packageVersion,
        gatewayVersion: packageVersion,
        siteName: siteConfig.siteName,
        robotId: siteConfig.robotId,
        publicConfig: getPublicConfigSnapshot(),
        ros: rosGateway.getConnectionSnapshot(),
        capabilities: capabilityMap,
        runtimeTopics,
        auditLogs,
      }

      const filename = `clean-robot-diagnostics-${siteConfig.robotId}-${Date.now()}.json`
      const record = createAuditEvent(session, {
        category: 'system',
        action: 'diagnostics:export',
        target: '/api/diagnostics/export',
        status: 'success',
        message: '诊断包已导出。',
        detail: {
          filename,
        },
      }, requestId)

      sendJson(response, 200, {
        filename,
        bundle,
        auditEvent: record,
      })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/system/readiness') {
      requireAnyCapability(request, ['systemReadiness', 'executionControl', 'overview'])
      const taskId = Number(url.searchParams.get('taskId') ?? '0')
      sendJson(response, 200, await rosGateway.getSystemReadiness(taskId))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/system/readiness/topic') {
      requireAnyCapability(request, ['systemReadiness', 'executionControl', 'overview'])
      sendJson(response, 200, await rosGateway.getSystemReadinessTopicSnapshot())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/odometry/state') {
      requireCapability(request, 'slamWorkbench')
      sendJson(response, 200, await rosGateway.getOdometryState())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/odometry/topic') {
      requireCapability(request, 'slamWorkbench')
      sendJson(response, 200, await rosGateway.getOdometryTopicSnapshot())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/runtime/topics') {
      requireAnyCapability(request, [
        'overview',
        'executionControl',
        'runtimeMonitoring',
        'actuatorControl',
        'chargingControl',
      ])
      const topicKeys = (url.searchParams.get('keys') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
      const includeEndpointInfo = url.searchParams.get('includeEndpointInfo') !== 'false'
      sendJson(
        response,
        200,
        await rosGateway.getRuntimeTopicSnapshots({
          topicKeys,
          includeEndpointInfo,
        }),
      )
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/profile-catalog') {
      requireCapability(request, 'profileCatalog')
      sendJson(response, 200, await rosGateway.fetchProfileCatalog({
        profileKind: url.searchParams.get('profileKind') ?? '',
        includeDisabled: url.searchParams.get('includeDisabled') === 'true',
        mapName: url.searchParams.get('mapName') ?? '',
      }))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/maps') {
      requireAnyCapability(request, ['taskManagement', 'mapWorkbench', 'slamWorkbench'])
      sendJson(response, 200, await rosGateway.listMaps())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/maps/current') {
      requireCapability(request, 'mapWorkbench')
      sendJson(response, 200, await rosGateway.getCurrentMapRecord())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/maps/import-current/preflight') {
      requireCapability(request, 'mapWorkbench')
      sendJson(
        response,
        200,
        await rosGateway.checkMapImportPreflight({
          mapName: url.searchParams.get('mapName') ?? '',
        }),
      )
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/maps/import-current') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.importCurrentMapAsset(body))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/maps/soft-delete') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.softDeleteMapAsset(body))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/maps/hard-delete') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.hardDeleteMapAsset(body))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/maps/cleanup-disabled') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.cleanupDisabledMapAssets(body))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/maps/live') {
      requireCapability(request, 'slamWorkbench')
      const afterMs = Number(url.searchParams.get('after') ?? '0')
      sendJson(response, 200, await rosGateway.getLiveMapSnapshot(afterMs))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/workbench/alignment') {
      requireCapability(request, 'mapWorkbench')
      sendJson(
        response,
        200,
        await rosGateway.getMapAlignment(url.searchParams.get('mapName') ?? ''),
      )
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workbench/alignment/confirm') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.confirmMapAlignmentByPoints(body))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workbench/zones/rect-preview') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.previewRectZoneByPoints(body))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workbench/zones/coverage-preview') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.previewCoverageRegion(body))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/workbench/zones') {
      requireCapability(request, 'mapWorkbench')
      sendJson(
        response,
        200,
        await rosGateway.listCoverageZones(url.searchParams.get('mapName') ?? ''),
      )
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workbench/zones') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.commitCoverageRegion(body))
      return
    }

    if (
      request.method === 'GET' &&
      /^\/api\/workbench\/zones\/[^/]+\/plan-path$/.test(url.pathname)
    ) {
      requireCapability(request, 'mapWorkbench')
      const zoneId = decodeURIComponent(
        url.pathname.replace(/^\/api\/workbench\/zones\//, '').replace(/\/plan-path$/, ''),
      )
      sendJson(
        response,
        200,
        await rosGateway.getZonePlanPath({
          map_name: url.searchParams.get('mapName') ?? '',
          zone_id: zoneId,
          alignment_version: url.searchParams.get('alignmentVersion') ?? '',
          plan_profile_name: url.searchParams.get('planProfileName') ?? '',
        }),
      )
      return
    }

    if (request.method === 'GET' && /^\/api\/workbench\/zones\/[^/]+$/.test(url.pathname)) {
      requireCapability(request, 'mapWorkbench')
      const zoneId = decodeURIComponent(url.pathname.replace(/^\/api\/workbench\/zones\//, ''))
      sendJson(
        response,
        200,
        await rosGateway.getCoverageZoneDetail({
          mapName: url.searchParams.get('mapName') ?? '',
          zoneId,
          profileName: url.searchParams.get('profileName') ?? '',
        }),
      )
      return
    }

    if (request.method === 'DELETE' && /^\/api\/workbench\/zones\/[^/]+$/.test(url.pathname)) {
      requireCapability(request, 'mapWorkbench')
      const zoneId = decodeURIComponent(url.pathname.replace(/^\/api\/workbench\/zones\//, ''))
      sendJson(
        response,
        200,
        await rosGateway.deleteCoverageZone(url.searchParams.get('mapName') ?? '', zoneId),
      )
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/workbench/no-go-areas') {
      requireCapability(request, 'mapWorkbench')
      sendJson(
        response,
        200,
        await rosGateway.listNoGoAreas(url.searchParams.get('mapName') ?? ''),
      )
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workbench/no-go-areas') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.createNoGoArea(body))
      return
    }

    if (
      request.method === 'GET' &&
      /^\/api\/workbench\/no-go-areas\/[^/]+$/.test(url.pathname)
    ) {
      requireCapability(request, 'mapWorkbench')
      const areaId = decodeURIComponent(
        url.pathname.replace(/^\/api\/workbench\/no-go-areas\//, ''),
      )
      sendJson(
        response,
        200,
        await rosGateway.getNoGoAreaDetail(url.searchParams.get('mapName') ?? '', areaId),
      )
      return
    }

    if (
      request.method === 'PUT' &&
      /^\/api\/workbench\/no-go-areas\/[^/]+$/.test(url.pathname)
    ) {
      requireCapability(request, 'mapWorkbench')
      const areaId = decodeURIComponent(
        url.pathname.replace(/^\/api\/workbench\/no-go-areas\//, ''),
      )
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.updateNoGoArea({ ...body, area_id: areaId }))
      return
    }

    if (
      request.method === 'DELETE' &&
      /^\/api\/workbench\/no-go-areas\/[^/]+$/.test(url.pathname)
    ) {
      requireCapability(request, 'mapWorkbench')
      const areaId = decodeURIComponent(
        url.pathname.replace(/^\/api\/workbench\/no-go-areas\//, ''),
      )
      sendJson(
        response,
        200,
        await rosGateway.deleteNoGoArea(url.searchParams.get('mapName') ?? '', areaId),
      )
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/workbench/virtual-walls') {
      requireCapability(request, 'mapWorkbench')
      sendJson(
        response,
        200,
        await rosGateway.listVirtualWalls(url.searchParams.get('mapName') ?? ''),
      )
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/workbench/virtual-walls') {
      requireCapability(request, 'mapWorkbench')
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.createVirtualWall(body))
      return
    }

    if (
      request.method === 'GET' &&
      /^\/api\/workbench\/virtual-walls\/[^/]+$/.test(url.pathname)
    ) {
      requireCapability(request, 'mapWorkbench')
      const wallId = decodeURIComponent(
        url.pathname.replace(/^\/api\/workbench\/virtual-walls\//, ''),
      )
      sendJson(
        response,
        200,
        await rosGateway.getVirtualWallDetail(url.searchParams.get('mapName') ?? '', wallId),
      )
      return
    }

    if (
      request.method === 'PUT' &&
      /^\/api\/workbench\/virtual-walls\/[^/]+$/.test(url.pathname)
    ) {
      requireCapability(request, 'mapWorkbench')
      const wallId = decodeURIComponent(
        url.pathname.replace(/^\/api\/workbench\/virtual-walls\//, ''),
      )
      const body = await readJsonBody(request)
      sendJson(response, 200, await rosGateway.updateVirtualWall({ ...body, wall_id: wallId }))
      return
    }

    if (
      request.method === 'DELETE' &&
      /^\/api\/workbench\/virtual-walls\/[^/]+$/.test(url.pathname)
    ) {
      requireCapability(request, 'mapWorkbench')
      const wallId = decodeURIComponent(
        url.pathname.replace(/^\/api\/workbench\/virtual-walls\//, ''),
      )
      sendJson(
        response,
        200,
        await rosGateway.deleteVirtualWall(url.searchParams.get('mapName') ?? '', wallId),
      )
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/tasks') {
      requireAnyCapability(request, ['taskManagement', 'executionControl', 'overview'])
      sendJson(response, 200, await rosGateway.listTasks())
      return
    }

    if (request.method === 'GET' && /^\/api\/tasks\/\d+$/.test(url.pathname)) {
      requireCapability(request, 'taskManagement')
      const taskId = Number(url.pathname.split('/').pop())
      sendJson(response, 200, await rosGateway.getTaskDetail(taskId))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/tasks') {
      const { session } = requireCapability(request, 'taskManagement')
      const input = await readJsonBody(request)
      const result = await rosGateway.createTask(input)
      const record = createAuditEvent(session, {
        category: 'system',
        action: 'task:create',
        target: TASK_SERVICE_NAME,
        status: 'success',
        message: '任务创建成功。',
        detail: {
          taskId: result.task.id,
          taskName: result.task.name,
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'PUT' && /^\/api\/tasks\/\d+$/.test(url.pathname)) {
      const { session } = requireCapability(request, 'taskManagement')
      const input = await readJsonBody(request)
      const taskId = Number(url.pathname.split('/').pop())
      const currentTask = await rosGateway.getTaskDetail(taskId)
      const result = await rosGateway.updateTask(currentTask, input)
      const record = createAuditEvent(session, {
        category: 'system',
        action: 'task:update',
        target: TASK_SERVICE_NAME,
        status: 'success',
        message: '任务更新成功。',
        detail: {
          taskId: result.task.id,
          taskName: result.task.name,
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'DELETE' && /^\/api\/tasks\/\d+$/.test(url.pathname)) {
      const { session } = requireCapability(request, 'taskManagement')
      const taskId = Number(url.pathname.split('/').pop())
      const result = await rosGateway.deleteTask(taskId)
      const record = createAuditEvent(session, {
        category: 'system',
        action: 'task:delete',
        target: TASK_SERVICE_NAME,
        status: 'success',
        message: '任务删除请求已提交。',
        detail: { taskId },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/schedules') {
      requireCapability(request, 'scheduleManagement')
      sendJson(response, 200, await rosGateway.listSchedules())
      return
    }

    if (request.method === 'GET' && /^\/api\/schedules\/.+/.test(url.pathname)) {
      requireCapability(request, 'scheduleManagement')
      const scheduleId = decodeURIComponent(url.pathname.replace(/^\/api\/schedules\//, ''))
      const taskId = Number(url.searchParams.get('taskId') ?? '0')
      sendJson(response, 200, await rosGateway.getScheduleDetail(scheduleId, taskId))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/schedules') {
      const { session } = requireCapability(request, 'scheduleManagement')
      const body = await readJsonBody(request)
      const result = await rosGateway.createSchedule(body.input, body.task)
      const record = createAuditEvent(session, {
        category: 'system',
        action: 'schedule:create',
        target: SCHEDULE_SERVICE_NAME,
        status: 'success',
        message: '调度创建成功。',
        detail: {
          scheduleId: result.schedule.id,
          taskId: result.schedule.taskId,
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'PUT' && /^\/api\/schedules\/.+/.test(url.pathname)) {
      const { session } = requireCapability(request, 'scheduleManagement')
      const scheduleId = decodeURIComponent(url.pathname.replace(/^\/api\/schedules\//, ''))
      const body = await readJsonBody(request)
      const currentSchedule = await rosGateway.getScheduleDetail(scheduleId, body.input?.taskId ?? 0)
      const result = await rosGateway.updateSchedule(currentSchedule, body.input, body.task)
      const record = createAuditEvent(session, {
        category: 'system',
        action: 'schedule:update',
        target: SCHEDULE_SERVICE_NAME,
        status: 'success',
        message: '调度更新成功。',
        detail: {
          scheduleId: result.schedule.id,
          taskId: result.schedule.taskId,
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'DELETE' && /^\/api\/schedules\/.+/.test(url.pathname)) {
      const { session } = requireCapability(request, 'scheduleManagement')
      const scheduleId = decodeURIComponent(url.pathname.replace(/^\/api\/schedules\//, ''))
      const taskId = Number(url.searchParams.get('taskId') ?? '0')
      const result = await rosGateway.deleteSchedule(scheduleId, taskId)
      const record = createAuditEvent(session, {
        category: 'system',
        action: 'schedule:delete',
        target: SCHEDULE_SERVICE_NAME,
        status: 'success',
        message: '调度删除请求已提交。',
        detail: {
          scheduleId,
          taskId,
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/execution/commands') {
      const { session } = requireAnyCapability(request, ['executionControl', 'overview'])
      const body = await readJsonBody(request)
      const result = await rosGateway.executeTaskCommand(body.command, body.taskId)
      const record = createAuditEvent(session, {
        category: 'task',
        action: body.command,
        target: EXECUTION_SERVICE_NAME,
        status: result.success ? 'success' : 'failed',
        message: result.message || '执行命令已提交。',
        detail: {
          command: body.command,
          taskId: body.taskId,
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/dock-calibration/status') {
      requireAnyCapability(request, ['dockCalibration', 'chargingControl', 'actuatorControl'])
      sendJson(
        response,
        200,
        await rosGateway.getDockCalibrationStatus(
          url.searchParams.get('robotId') ?? siteConfig.robotId,
        ),
      )
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/dock-calibration/command') {
      const { session } = requireAnyCapability(request, [
        'dockCalibration',
        'chargingControl',
        'actuatorControl',
      ])
      const body = await readJsonBody(request)
      const result = await rosGateway.runDockCalibrationCommand(body, siteConfig.robotId)
      const record = createAuditEvent(session, {
        category: 'charging',
        action: `dock-calibration:${result.operation ?? body.operation ?? 'unknown'}`,
        target: DOCK_CALIBRATION_COMMAND_SERVICE_NAME,
        status: result.success ? 'success' : 'failed',
        message: result.message || 'Dock calibration command submitted.',
        detail: {
          operation: result.operation ?? body.operation,
          requireStage2Quality:
            body.requireStage2Quality ?? body.require_stage2_quality ?? false,
          x: body.x,
          y: body.y,
          yaw: body.yaw,
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/manual-drive/status') {
      const { session, grantedCapabilities } = requireAnyCapability(request, [
        'overview',
        'executionControl',
        'actuatorControl',
      ])
      sendJson(
        response,
        200,
        await rosGateway.getManualDriveStatus({
          role: session.role,
          capabilities: grantedCapabilities,
        }),
      )
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/manual-drive/command') {
      const { session, grantedCapabilities } = requireAnyCapability(request, [
        'overview',
        'executionControl',
        'actuatorControl',
      ])
      const body = await readJsonBody(request)
      const result = await rosGateway.runManualDriveCommand(body, {
        role: session.role,
        capabilities: grantedCapabilities,
      })
      const record = createAuditEvent(session, {
        category: 'actuator',
        action: `manual-drive:${result.action ?? body.action ?? 'unknown'}`,
        target: '/clean_robot_server/app/manual_drive_command',
        status: result.success ? 'success' : 'blocked',
        message: result.message || 'Manual drive command submitted.',
        detail: {
          action: result.action ?? body.action,
          direction: result.direction ?? body.direction,
          blockedReasons: result.blockedReasons ?? [],
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/slam/state') {
      requireCapability(request, 'slamWorkbench')
      sendJson(response, 200, await rosGateway.getSlamState())
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/slam/state/topic') {
      requireCapability(request, 'slamWorkbench')
      sendJson(response, 200, await rosGateway.getSlamStateTopicSnapshot())
      return
    }

    if (request.method === 'GET' && /^\/api\/slam\/jobs\/.+/.test(url.pathname)) {
      requireCapability(request, 'slamWorkbench')
      const jobId = decodeURIComponent(url.pathname.replace(/^\/api\/slam\/jobs\//, ''))
      sendJson(response, 200, await rosGateway.getSlamJob(jobId))
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/slam/jobs/topic') {
      requireCapability(request, 'slamWorkbench')
      sendJson(response, 200, await rosGateway.getSlamJobTopicSnapshot())
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/slam/actions') {
      const { session } = requireCapability(request, 'slamWorkbench')
      const body = await readJsonBody(request)
      const actionKind =
        body.actionKind === 'restart_localization' ? 'relocalize' : body.actionKind
      const result = await rosGateway.runSlamAction(actionKind, body.payload ?? {})
      const record = createAuditEvent(session, {
        category: 'slam',
        action: actionKind,
        target: SLAM_SUBMIT_SERVICE_NAME,
        status: 'success',
        message: 'SLAM 动作已通过站点网关下发。',
        detail: {
          actionKind,
          payload: body.payload ?? {},
        },
      }, requestId)
      sendJson(response, 200, { ...result, auditEvent: record })
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/actuators/status') {
      requireCapability(request, 'actuatorControl')
      sendJson(response, 200, await rosGateway.getActuatorStatus())
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/actuator/commands') {
      const session = requireSession(request)
      const body = await readJsonBody(request)
      const command = isRecord(body.command) ? body.command : body
      const capability =
        command.kind === 'chargingSequence' ? 'chargingControl' : 'actuatorControl'
      const grantedCapabilities = buildGrantedCapabilities(siteConfig, session.role)

      if (!grantedCapabilities.includes(capability)) {
        throw createGatewayError('当前角色没有执行机构控制权限。', {
          statusCode: 403,
          code: 'CAPABILITY_DENIED',
          recoverable: true,
          requiresEngineer: true,
        })
      }

      const lastCommand = await rosGateway.runActuatorCommand(command)
      const record = createAuditEvent(session, {
        category: capability === 'chargingControl' ? 'charging' : 'actuator',
        action: command.kind ?? 'unknown',
        target: '/mcore/*',
        status: 'success',
        message: '执行机构命令已下发。',
        detail: command,
      }, requestId)
      sendJson(response, 200, {
        ok: true,
        success: true,
        kind: command.kind ?? 'unknown',
        message: lastCommand.message,
        lastCommand,
        auditEvent: record,
      })
      return
    }

    sendJson(response, 404, {
      code: 'NOT_FOUND',
      message: `Unknown API route: ${url.pathname}`,
      requestId,
    })
  } catch (error) {
    const statusCode = error?.statusCode ?? 500

    if (statusCode >= 400 && statusCode < 500) {
      sendJson(response, statusCode, normalizeErrorResponse(error, requestId))
      return
    }

    console.error(`[site-gateway] request failed ${request.method} ${url.pathname}`, error)
    sendJson(response, 500, normalizeErrorResponse(error, requestId))
  }
}

function resolveStaticPath(urlPathname) {
  const pathname = urlPathname === '/' ? '/index.html' : urlPathname
  const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  return resolve(distDir, `.${normalizedPath}`)
}

function serveStatic(request, response, url) {
  const publicConfigPath = join(publicDir, 'app-config.json')
  if (url.pathname === '/app-config.json' && existsSync(publicConfigPath)) {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    createReadStream(publicConfigPath).pipe(response)
    return
  }

  const filePath = resolveStaticPath(url.pathname)

  if (existsSync(filePath) && statSync(filePath).isFile() && filePath.startsWith(distDir)) {
    response.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'no-store',
    })
    createReadStream(filePath).pipe(response)
    return
  }

  const indexPath = join(distDir, 'index.html')
  if (existsSync(indexPath)) {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    createReadStream(indexPath).pipe(response)
    return
  }

  sendText(
    response,
    503,
    'Frontend bundle is missing. Build the app first or use the packaged trial release before starting the site gateway.',
  )
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)

  if (url.pathname.startsWith('/api/')) {
    void handleApiRequest(request, response, url)
    return
  }

  serveStatic(request, response, url)
})

server.listen(port, host, () => {
  console.log(`[site-gateway] listening on http://${host}:${port}; rosbridge upstream configured`)
})
