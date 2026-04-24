import {
  buildNoGoAreaRequest,
  buildVirtualWallRequest,
  fetchActiveAlignment as fetchRosActiveAlignment,
  fetchCoverageZoneDetail as fetchRosCoverageZoneDetail,
  fetchCoverageZones as fetchRosCoverageZones,
  fetchNoGoAreaDetail as fetchRosNoGoAreaDetail,
  fetchNoGoAreas as fetchRosNoGoAreas,
  fetchVirtualWallDetail as fetchRosVirtualWallDetail,
  fetchVirtualWalls as fetchRosVirtualWalls,
  fetchZonePlanPath as fetchRosZonePlanPath,
  previewCoverageRegion as previewRosCoverageRegion,
  previewRectZoneByPoints as previewRosRectZoneByPoints,
  commitCoverageRegion as commitRosCoverageRegion,
  confirmMapAlignmentByPoints as confirmRosMapAlignmentByPoints,
  deleteCoverageZone as deleteRosCoverageZone,
  addNoGoArea as addRosNoGoArea,
  modifyNoGoArea as modifyRosNoGoArea,
  deleteNoGoArea as deleteRosNoGoArea,
  addVirtualWall as addRosVirtualWall,
  modifyVirtualWall as modifyRosVirtualWall,
  deleteVirtualWall as deleteRosVirtualWall,
  normalizeAlignment,
  normalizeAreaEntity,
  normalizeCoverageCommit,
  normalizeCoveragePreview,
  normalizeMapPayload,
  normalizeRectZonePreview,
  normalizeZonePlanPath,
  resolveRequestedMapName,
} from '../ros/services'
import {
  importCurrentMapAsset as importRosCurrentMapAsset,
  fetchMapCatalog as fetchRosMapCatalog,
} from '../ros/mapCatalogServices'
import { fetchOdometryStatus } from '../ros/odometryServices'
import {
  ODOMETRY_STATUS_QUERY_CONTRACT,
  PROFILE_CATALOG_QUERY_CONTRACT,
  SLAM_JOB_QUERY_CONTRACT,
  SLAM_STATUS_QUERY_CONTRACT,
  SYSTEM_READINESS_QUERY_CONTRACT,
} from '../ros/queryContracts'
import {
  EXECUTION_SERVICE,
  MAP_CATALOG_SERVICE,
  SCHEDULE_SERVICE,
  SITE_SERVICE_NAMES,
  TASK_SERVICE,
} from '../ros/serviceNames'
import {
  addCleanSchedule,
  deleteCleanSchedule,
  fetchCleanScheduleDetail,
  fetchCleanSchedules,
  modifyCleanSchedule,
} from '../ros/scheduleServices'
import {
  getSlamWorkflowJob as fetchRosSlamWorkflowJob,
  getSlamWorkflowState as fetchRosSlamWorkflowState,
  submitRelocalize,
  submitSaveMapping,
  submitStartMapping,
  submitStopMapping,
  submitSwitchMap,
} from '../ros/slamWorkflowServices'
import { fetchProfileCatalog } from '../ros/profileCatalogServices'
import {
  addCleanTask,
  deleteCleanTask,
  fetchCleanTaskDetail,
  fetchCleanTasks,
  modifyCleanTask,
} from '../ros/taskServices'
import { executeTaskCommand as executeRosTaskCommand } from '../ros/executionServices'
import { fetchSystemReadiness } from '../ros/systemReadinessServices'
import {
  exportGatewayDiagnostics,
  fetchCapabilityMap,
  fetchGatewayOdometryState,
  fetchGatewayProfileCatalog,
  fetchGatewaySlamJob,
  fetchGatewaySlamState,
  fetchGatewaySystemReadiness,
  requestConfirmWorkbenchAlignment,
  requestCreateWorkbenchNoGoArea,
  requestCreateWorkbenchVirtualWall,
  requestMapCatalog,
  requestWorkbenchAlignment,
  requestWorkbenchCoverageCommit,
  requestWorkbenchCoveragePreview,
  requestWorkbenchNoGoAreaDetail,
  requestWorkbenchNoGoAreaList,
  requestWorkbenchRectZonePreview,
  requestWorkbenchVirtualWallDetail,
  requestWorkbenchVirtualWallList,
  requestWorkbenchZoneDetail,
  requestWorkbenchZoneList,
  requestWorkbenchZonePlanPath,
  requestDeleteWorkbenchNoGoArea,
  requestDeleteWorkbenchVirtualWall,
  requestDeleteWorkbenchZone,
  requestImportCurrentMapAsset,
  requestMapImportPreflight,
  requestUpdateWorkbenchNoGoArea,
  requestUpdateWorkbenchVirtualWall,
  requestCreateSchedule,
  requestCreateTask,
  requestDeleteSchedule,
  requestDeleteTask,
  requestExecutionCommand,
  requestScheduleDetail,
  requestScheduleList,
  requestSlamAction,
  requestTaskDetail,
  requestTaskList,
  requestUpdateSchedule,
  requestUpdateTask,
} from './siteGatewayClient'

import {
  APP_MODULE_KEYS,
  getAppConfig,
  getApiBaseUrl,
  isModuleEnabled,
  sanitizeAppConfig,
} from '../../config/appConfig'
import { fetchCurrentMapFromWorker } from '../ros/mapWorkerClient'
import { getRosDebugSnapshot } from '../ros/debug'
import { useAppShellStore } from '../../stores/appShellStore'
import { useRuntimeMonitorStore } from '../../stores/runtimeMonitorStore'
import { recordAuditEvent } from './auditTrail'
import { assertCapabilityAllowed, normalizeGatewayError } from './accessControl'
import type {
  CapabilityFlag,
  GatewayErrorShape,
} from '../../types/appShell'
import type { RobotDiagnosticsBundle } from '../../types/diagnostics'
import type { ExecutionCommandName } from '../../types/execution'
import type {
  AreaEntity,
  MapAlignment,
  MapEntity,
  Point2D,
} from '../../types/map-editor'
import type { ImportCurrentMapAssetInput } from '../ros/mapCatalogServices'
import type { ProfileKind } from '../../types/profileCatalog'
import type { ScheduleDraftInput, ScheduleEntity } from '../../types/schedule'
import type {
  SlamActionKind,
  SubmitSlamWorkflowRequest,
} from '../../types/slam-workflow'
import type { SystemReadinessServiceResult } from '../../types/systemReadiness'
import type { TaskDraftInput, TaskEntity } from '../../types/task'
import type { RosConnectionSnapshot, RosServiceRequest } from '../../types/ros'

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

function buildGatewayWorkbenchUrl(pathname: string) {
  const baseUrl = getApiBaseUrl()

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return new URL(pathname.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString()
  }

  const normalizedPath = `${baseUrl.replace(/\/+$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`

  if (typeof window !== 'undefined') {
    return new URL(normalizedPath, window.location.origin).toString()
  }

  return normalizedPath
}

export function getConnectionStatus(): RosConnectionSnapshot {
  return {
    status: 'mock',
    url: 'ws://127.0.0.1:4173/ws/rosbridge',
    isConnected: true,
    lastError: null,
    connectedAt: Date.now(),
    sessionId: 1,
    gatewayStatus: 'mock',
    gatewayLastError: null,
  }
}

export function getRuntimeSnapshot() {
  return useRuntimeMonitorStore.getState().topicMap
}

export function subscribeRuntime(
  listener: (topicMap: ReturnType<typeof getRuntimeSnapshot>) => void,
) {
  return useRuntimeMonitorStore.subscribe((state) => listener(state.topicMap))
}

export function getAuditEvents() {
  return useAppShellStore.getState().auditEvents
}

export function getEnabledCapabilities() {
  const capabilitySet = new Set<CapabilityFlag>(useAppShellStore.getState().grantedCapabilities)

  for (const moduleKey of APP_MODULE_KEYS) {
    if (isModuleEnabled(moduleKey)) {
      continue
    }

    switch (moduleKey) {
      case 'overview':
        capabilitySet.delete('overview')
        break
      case 'workbench':
        capabilitySet.delete('mapWorkbench')
        break
      case 'tasks':
        capabilitySet.delete('taskManagement')
        break
      case 'schedules':
        capabilitySet.delete('scheduleManagement')
        break
      case 'execution':
        capabilitySet.delete('executionControl')
        break
      case 'slam':
        capabilitySet.delete('slamWorkbench')
        break
      case 'runtime':
        capabilitySet.delete('runtimeMonitoring')
        break
      case 'actuator-control':
        capabilitySet.delete('actuatorControl')
        capabilitySet.delete('chargingControl')
        break
      default:
        break
    }
  }

  capabilitySet.add('overview')
  return Array.from(capabilitySet)
}

export async function getCapabilities(enabledCapabilities: CapabilityFlag[]) {
  if (USE_MOCK_DATA) {
    const { fetchCapabilityStatuses } = await import('./capabilityProbe')
    return fetchCapabilityStatuses(getConnectionStatus(), enabledCapabilities)
  }

  return fetchCapabilityMap()
}

export async function exportDiagnostics(): Promise<{
  filename: string
  bundle: RobotDiagnosticsBundle
}> {
  if (!USE_MOCK_DATA) {
    return exportGatewayDiagnostics() as Promise<{
      filename: string
      bundle: RobotDiagnosticsBundle
    }>
  }

  const connection = getConnectionStatus()
  const runtimeStore = useRuntimeMonitorStore.getState()
  const rosDebug = getRosDebugSnapshot()
  const { fetchCapabilityStatuses } = await import('./capabilityProbe')
  const capabilityMap = await fetchCapabilityStatuses(
    connection,
    getEnabledCapabilities(),
  )

  const errors = [
    connection.lastError
      ? {
          source: 'ros-connection',
          message: connection.lastError,
        }
      : null,
    runtimeStore.metaError
      ? {
          source: 'runtime-monitor',
          message: runtimeStore.metaError,
        }
      : null,
    ...runtimeStore.topicList.flatMap((topic) =>
      [topic.metaError, topic.subscribeError]
        .filter((message): message is string => Boolean(message))
        .map((message) => ({
          source: topic.topicName,
          message,
        })),
    ),
  ].filter((entry): entry is RobotDiagnosticsBundle['errors'][number] => entry !== null)

  const bundle: RobotDiagnosticsBundle = {
    generatedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    buildTime: __APP_BUILD_TIME__,
    config: sanitizeAppConfig(getAppConfig()),
    connection,
    capabilities: Object.values(capabilityMap),
    runtimeTopics: runtimeStore.topicList.map((topic) => ({
      key: topic.key,
      topicName: topic.topicName,
      health: topic.health,
      messageType: topic.messageType,
      lastMessageAt: topic.lastMessageAt,
      ageMs: topic.ageMs,
      metaError: topic.metaError,
      subscribeError: topic.subscribeError,
    })),
    recentAuditEvents: getAuditEvents().slice(0, 50).map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      role: event.role,
      category: event.category,
      action: event.action,
      target: event.target,
      status: event.status,
      message: event.message,
    })),
    lastRosDebugEvent: {
      event: rosDebug.lastEvent,
      updatedAt: rosDebug.lastUpdatedAt,
    },
    errors,
  }

  const safeRobotId = getAppConfig().robotId.replace(/[^a-zA-Z0-9_-]+/g, '-')

  return {
    filename: `clean-robot-diagnostics-${safeRobotId || 'robot'}-${Date.now()}.json`,
    bundle,
  }
}

export async function queryProfileCatalog(options: {
  profileKind: ProfileKind
  includeDisabled?: boolean
  mapName?: string | null
}) {
  assertCapabilityAllowed('profileCatalog', 'Profile catalog 查询')

  try {
    if (!USE_MOCK_DATA) {
      return await fetchGatewayProfileCatalog(options)
    }

    return await fetchProfileCatalog(options)
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'PROFILE_CATALOG_FAILED',
      source: 'robot-gateway',
      message: 'Profile catalog 查询失败。',
      recoverable: true,
      missingDependency: PROFILE_CATALOG_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

export async function fetchMapCatalog() {
  try {
    if (!USE_MOCK_DATA) {
      return await requestMapCatalog()
    }

    return await fetchRosMapCatalog()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'MAP_CATALOG_FAILED',
      source: 'robot-gateway',
      message: '地图目录加载失败。',
      recoverable: true,
      missingDependency: MAP_CATALOG_SERVICE.canonicalName,
    })
  }
}

export async function getSystemReadiness(taskId: number): Promise<SystemReadinessServiceResult> {
  assertCapabilityAllowed('systemReadiness', '系统就绪检查')

  try {
    if (!USE_MOCK_DATA) {
      return await fetchGatewaySystemReadiness(taskId)
    }

    return await fetchSystemReadiness(taskId)
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'SYSTEM_READINESS_FAILED',
      source: 'robot-gateway',
      message: '系统就绪检查失败。',
      recoverable: true,
      missingDependency: SYSTEM_READINESS_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

export async function getOdometryState() {
  assertCapabilityAllowed('slamWorkbench', '閲岀▼璁″仴搴锋鏌?')

  try {
    if (!USE_MOCK_DATA) {
      return await fetchGatewayOdometryState()
    }

    return await fetchOdometryStatus()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'ODOMETRY_STATUS_FAILED',
      source: 'robot-gateway',
      message: '閲岀▼璁″仴搴锋鏌ュけ璐ャ€?',
      recoverable: true,
      missingDependency: ODOMETRY_STATUS_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

export async function getSlamState() {
  assertCapabilityAllowed('slamWorkbench', 'SLAM 状态查询')

  try {
    if (!USE_MOCK_DATA) {
      return await fetchGatewaySlamState()
    }

    return await fetchRosSlamWorkflowState()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'SLAM_STATE_FAILED',
      source: 'robot-gateway',
      message: 'SLAM 状态查询失败。',
      recoverable: true,
      missingDependency: SLAM_STATUS_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

export async function getSlamJob(jobId: string) {
  assertCapabilityAllowed('slamWorkbench', 'SLAM 作业查询')

  try {
    if (!USE_MOCK_DATA) {
      return await fetchGatewaySlamJob(jobId)
    }

    return await fetchRosSlamWorkflowJob(jobId)
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'SLAM_JOB_FAILED',
      source: 'robot-gateway',
      message: 'SLAM 作业查询失败。',
      recoverable: true,
      missingDependency: SLAM_JOB_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

async function runWorkbenchRead<T>(
  actionLabel: string,
  missingDependency: string | null,
  runner: () => Promise<T>,
) {
  assertCapabilityAllowed('mapWorkbench', actionLabel)

  try {
    return await runner()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'MAP_WORKBENCH_QUERY_FAILED',
      source: 'robot-gateway',
      message: `${actionLabel} 失败。`,
      recoverable: true,
      missingDependency,
    })
  }
}

async function runWorkbenchMutation<T>(
  actionLabel: string,
  target: string,
  detail: Record<string, unknown>,
  missingDependency: string | null,
  runner: () => Promise<T>,
) {
  assertCapabilityAllowed('mapWorkbench', actionLabel)

  try {
    const result = await runner()
    recordAuditEvent({
      category: 'system',
      action: actionLabel,
      target,
      status: 'success',
      message: `${actionLabel} 已完成。`,
      detail,
    })
    return result
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'MAP_WORKBENCH_ACTION_FAILED',
      source: 'robot-gateway',
      message: `${actionLabel} 失败。`,
      recoverable: true,
      missingDependency,
    })
    recordAuditEvent({
      category: 'system',
      action: actionLabel,
      target,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail,
    })
    throw normalizedError
  }
}

function requireWorkbenchValue<T>(
  value: T | null | undefined,
  errorMessage: string,
) {
  if (value === null || value === undefined) {
    throw new Error(errorMessage)
  }

  return value
}

function pickStringFromRecords(
  records: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
) {
  for (const record of records) {
    if (!record) {
      continue
    }

    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim()
      }
    }
  }

  return ''
}

function resolveRequestedMapRevisionId(
  map: MapEntity | null,
  alignment?: MapAlignment | null,
) {
  return pickStringFromRecords([map?.raw, alignment?.raw], [
    'map_revision_id',
    'mapRevisionId',
    'active_revision_id',
    'activeRevisionId',
    'latest_head_revision_id',
    'latestHeadRevisionId',
    'runtime_map_revision_id',
    'runtimeMapRevisionId',
    'active_map_revision_id',
    'activeMapRevisionId',
    'revision_id',
    'revisionId',
  ])
}

export function fetchCurrentMap() {
  return runWorkbenchRead(
    '加载当前地图',
    MAP_CATALOG_SERVICE.canonicalName,
    async () => {
      if (!USE_MOCK_DATA) {
        const currentMapUrl = buildGatewayWorkbenchUrl('/maps/current')
        return fetchCurrentMapFromWorker(currentMapUrl, 'http')
      }

      const mockMap = normalizeMapPayload({
        id: 'mock-map-001',
        map_name: 'Demo Lobby',
        display_name: 'Demo Lobby',
        map_id: 'mock-map-001',
        is_active: true,
      })

      if (!mockMap) {
        throw new Error('Current map mock payload returned no usable map payload.')
      }

      return mockMap
    },
  )
}

export function fetchActiveAlignment(
  map: MapEntity | null,
  mapName?: string | null,
) {
  return runWorkbenchRead(
    '加载地图对齐配置',
    SITE_SERVICE_NAMES.alignment,
    async () => {
      if (USE_MOCK_DATA) {
        return fetchRosActiveAlignment(map, mapName)
      }

      const payload = await requestWorkbenchAlignment(
        resolveRequestedMapName(map, mapName),
      )

      return payload === null ? null : normalizeAlignment(payload)
    },
  )
}

export function confirmMapAlignmentByPoints(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  points: [Point2D, Point2D]
}) {
  return runWorkbenchMutation(
    '确认地图对齐',
    SITE_SERVICE_NAMES.alignmentByPoints,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      points: options.points,
      alignmentVersion: options.alignment?.alignmentVersion ?? '',
    },
    SITE_SERVICE_NAMES.alignmentByPoints,
    async () => {
      if (USE_MOCK_DATA) {
        return confirmRosMapAlignmentByPoints(options)
      }

      const mapName = resolveRequestedMapName(options.map, options.mapName)

      if (!mapName) {
        throw new Error('The current map is not ready for alignment.')
      }

      const payload = await requestConfirmWorkbenchAlignment({
        map_name: mapName,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        raw_frame: options.alignment?.rawFrame ?? 'map',
        aligned_frame: options.alignment?.alignedFrame ?? 'site_map',
        p1: {
          x: options.points[0].x,
          y: options.points[0].y,
          z: 0,
        },
        p2: {
          x: options.points[1].x,
          y: options.points[1].y,
          z: 0,
        },
        pivot_x: options.alignment?.pivot?.x ?? 0,
        pivot_y: options.alignment?.pivot?.y ?? 0,
        source:
          (typeof options.alignment?.raw.source === 'string'
            ? options.alignment.raw.source
            : null) ?? 'frontend',
        status: options.alignment?.status ?? 'active',
        activate: true,
      })

      return requireWorkbenchValue(
        normalizeAlignment(payload),
        'Alignment confirm service returned no usable config.',
      )
    },
  )
}

export function previewRectZoneByPoints(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  points: [Point2D, Point2D]
  minSideM?: number
}) {
  return runWorkbenchRead(
    '矩形区域预览',
    SITE_SERVICE_NAMES.rectZonePreview,
    async () => {
      if (USE_MOCK_DATA) {
        return previewRosRectZoneByPoints(options)
      }

      const mapName = resolveRequestedMapName(options.map, options.mapName)

      if (!mapName) {
        throw new Error('The current map is not ready for zone creation.')
      }

      const payload = await requestWorkbenchRectZonePreview({
        map_name: mapName,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        p1: {
          x: options.points[0].x,
          y: options.points[0].y,
          z: 0,
        },
        p2: {
          x: options.points[1].x,
          y: options.points[1].y,
          z: 0,
        },
        min_side_m: options.minSideM ?? 0.2,
      })

      return requireWorkbenchValue(
        normalizeRectZonePreview(payload),
        'Rect zone preview service returned no usable display_region.',
      )
    },
  )
}

export function previewCoverageRegion(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  region: RosServiceRequest
  profileName: string
}) {
  return runWorkbenchRead(
    '覆盖区域预览',
    SITE_SERVICE_NAMES.coveragePreview,
    async () => {
      if (USE_MOCK_DATA) {
        return previewRosCoverageRegion(options)
      }

      const mapName = resolveRequestedMapName(options.map, options.mapName)

      if (!mapName) {
        throw new Error('The current map is not ready for coverage preview.')
      }

      const mapRevisionId = resolveRequestedMapRevisionId(options.map, options.alignment)

      if (!mapRevisionId) {
        throw new Error('The current map revision is not ready for coverage preview.')
      }

      if (!options.profileName.trim()) {
        throw new Error('A profile name is required before previewing a zone.')
      }

      const payload = await requestWorkbenchCoveragePreview({
        map_name: mapName,
        map_revision_id: mapRevisionId,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        region: options.region,
        profile_name: options.profileName.trim(),
        debug_publish_markers: false,
      })

      return requireWorkbenchValue(
        normalizeCoveragePreview(payload),
        'Coverage preview service returned no usable preview data.',
      )
    },
  )
}

export function commitCoverageRegion(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  region: RosServiceRequest
  displayName: string
  profileName: string
  zoneId?: string | null
  baseZoneVersion?: number | null
}) {
  return runWorkbenchMutation(
    options.zoneId ? '更新覆盖区域' : '创建覆盖区域',
    SITE_SERVICE_NAMES.coverageCommit,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      zoneId: options.zoneId ?? '',
      displayName: options.displayName,
      profileName: options.profileName,
      baseZoneVersion: options.baseZoneVersion ?? 0,
    },
    SITE_SERVICE_NAMES.coverageCommit,
    async () => {
      if (USE_MOCK_DATA) {
        return commitRosCoverageRegion(options)
      }

      const mapName = resolveRequestedMapName(options.map, options.mapName)

      if (!mapName) {
        throw new Error('The current map is not ready for zone commit.')
      }

      const mapRevisionId = resolveRequestedMapRevisionId(options.map, options.alignment)

      if (!mapRevisionId) {
        throw new Error('The current map revision is not ready for zone commit.')
      }

      if (!options.displayName.trim()) {
        throw new Error('A zone display name is required before commit.')
      }

      if (!options.profileName.trim()) {
        throw new Error('A profile name is required before commit.')
      }

      const payload = await requestWorkbenchCoverageCommit({
        map_name: mapName,
        map_revision_id: mapRevisionId,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        zone_id: options.zoneId ?? '',
        base_zone_version: options.baseZoneVersion ?? 0,
        display_name: options.displayName.trim(),
        region: options.region,
        profile_name: options.profileName.trim(),
        set_active_plan: true,
      })

      return requireWorkbenchValue(
        normalizeCoverageCommit(payload),
        'Coverage commit service returned no usable zone result.',
      )
    },
  )
}

export function fetchCoverageZones(
  map: MapEntity | null,
  mapName?: string | null,
) {
  return runWorkbenchRead(
    '加载覆盖区域列表',
    SITE_SERVICE_NAMES.zone,
    async () => {
      if (USE_MOCK_DATA) {
        return fetchRosCoverageZones(map, mapName)
      }

      const records = await requestWorkbenchZoneList(
        resolveRequestedMapName(map, mapName),
      )

      return records.map((record, index) => normalizeAreaEntity(record, 'zone', index))
    },
  )
}

export function fetchCoverageZoneDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
  profileName?: string
}) {
  return runWorkbenchRead(
    '加载覆盖区域详情',
    SITE_SERVICE_NAMES.zone,
    async () => {
      if (USE_MOCK_DATA) {
        return fetchRosCoverageZoneDetail(options)
      }

      if (!options.zoneId.trim()) {
        throw new Error('A zone_id is required before loading zone detail.')
      }

      const record = await requestWorkbenchZoneDetail({
        zoneId: options.zoneId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
        profileName: options.profileName,
      })

      return record ? normalizeAreaEntity(record, 'zone', 0) : null
    },
  )
}

export function fetchZonePlanPath(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
  alignmentVersion?: string | null
  planProfileName?: string | null
}) {
  return runWorkbenchRead(
    '加载区域规划路径',
    SITE_SERVICE_NAMES.zonePlanPath,
    async () => {
      if (USE_MOCK_DATA) {
        return fetchRosZonePlanPath(options)
      }

      if (!options.zoneId.trim()) {
        throw new Error('A zone_id is required before loading a zone plan path.')
      }

      const payload = await requestWorkbenchZonePlanPath({
        zoneId: options.zoneId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
        alignmentVersion: options.alignmentVersion,
        planProfileName: options.planProfileName,
      })

      return requireWorkbenchValue(
        normalizeZonePlanPath(payload),
        'Zone plan path service returned no usable path result.',
      )
    },
  )
}

export function deleteCoverageZone(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
}) {
  return runWorkbenchMutation(
    '删除覆盖区域',
    SITE_SERVICE_NAMES.zone,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      zoneId: options.zoneId,
    },
    SITE_SERVICE_NAMES.zone,
    async () => {
      if (USE_MOCK_DATA) {
        return deleteRosCoverageZone(options)
      }

      if (!options.zoneId.trim()) {
        throw new Error('A zone_id is required before deleting a zone.')
      }

      return requestDeleteWorkbenchZone({
        zoneId: options.zoneId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })
    },
  )
}

export function fetchNoGoAreas(map: MapEntity | null) {
  return runWorkbenchRead(
    '加载禁行区列表',
    SITE_SERVICE_NAMES.noGoArea,
    async () => {
      if (USE_MOCK_DATA) {
        return fetchRosNoGoAreas(map)
      }

      const records = await requestWorkbenchNoGoAreaList(resolveRequestedMapName(map))
      return records.map((record, index) =>
        normalizeAreaEntity(record, 'noGoArea', index),
      )
    },
  )
}

export function fetchNoGoAreaDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  areaId: string
}) {
  return runWorkbenchRead(
    '加载禁行区详情',
    SITE_SERVICE_NAMES.noGoArea,
    async () => {
      if (USE_MOCK_DATA) {
        return fetchRosNoGoAreaDetail(options)
      }

      const record = await requestWorkbenchNoGoAreaDetail({
        areaId: options.areaId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })

      return record ? normalizeAreaEntity(record, 'noGoArea', 0) : null
    },
  )
}

export function addNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  areaId?: string | null
  displayName: string
  enabled?: boolean
  displayRegion: RosServiceRequest
  displayFrame: string
}) {
  return runWorkbenchMutation(
    '创建禁行区',
    SITE_SERVICE_NAMES.noGoArea,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.areaId ?? '',
      displayName: options.displayName,
      enabled: options.enabled ?? true,
    },
    SITE_SERVICE_NAMES.noGoArea,
    async () => {
      if (USE_MOCK_DATA) {
        return addRosNoGoArea(options)
      }

      const payload = await requestCreateWorkbenchNoGoArea({
        operation: 2,
        map_name: resolveRequestedMapName(options.map, options.mapName),
        area_id: options.areaId?.trim() ?? '',
        alignment_version: options.alignment?.alignmentVersion ?? '',
        area: buildNoGoAreaRequest({
          map: options.map,
          mapName: options.mapName,
          alignment: options.alignment,
          areaId: options.areaId,
          displayName: options.displayName,
          enabled: options.enabled ?? true,
          displayRegion: options.displayRegion,
          displayFrame: options.displayFrame,
        }),
        include_disabled: true,
      })

      return {
        area: payload.entity
          ? normalizeAreaEntity(payload.entity, 'noGoArea', 0)
          : null,
        constraintVersion: payload.constraintVersion,
        warnings: payload.warnings,
        raw: payload.raw,
      }
    },
  )
}

export function modifyNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  area: AreaEntity
  displayName: string
  enabled?: boolean
  displayRegion: RosServiceRequest
  displayFrame: string
}) {
  return runWorkbenchMutation(
    '更新禁行区',
    SITE_SERVICE_NAMES.noGoArea,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.area.id,
      displayName: options.displayName,
      enabled: options.enabled ?? true,
    },
    SITE_SERVICE_NAMES.noGoArea,
    async () => {
      if (USE_MOCK_DATA) {
        return modifyRosNoGoArea(options)
      }

      const payload = await requestUpdateWorkbenchNoGoArea(options.area.id, {
        operation: 3,
        map_name: resolveRequestedMapName(options.map, options.mapName),
        area_id: options.area.id,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        area: buildNoGoAreaRequest({
          map: options.map,
          mapName: options.mapName,
          alignment: options.alignment,
          areaId: options.area.id,
          displayName: options.displayName,
          enabled:
            options.enabled ??
            (typeof options.area.raw.enabled === 'boolean'
              ? options.area.raw.enabled
              : true),
          displayRegion: options.displayRegion,
          displayFrame: options.displayFrame,
          baseArea: options.area,
        }),
        include_disabled: true,
      })

      const area = payload.entity
        ? normalizeAreaEntity(payload.entity, 'noGoArea', 0)
        : null

      if (area && area.id !== options.area.id) {
        throw new Error('No-go modify returned a different area_id than the selected item.')
      }

      return {
        area,
        constraintVersion: payload.constraintVersion,
        warnings: payload.warnings,
        raw: payload.raw,
      }
    },
  )
}

export function deleteNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  areaId: string
}) {
  return runWorkbenchMutation(
    '删除禁行区',
    SITE_SERVICE_NAMES.noGoArea,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.areaId,
    },
    SITE_SERVICE_NAMES.noGoArea,
    async () => {
      if (USE_MOCK_DATA) {
        return deleteRosNoGoArea(options)
      }

      return requestDeleteWorkbenchNoGoArea({
        areaId: options.areaId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })
    },
  )
}

export function fetchVirtualWalls(map: MapEntity | null) {
  return runWorkbenchRead(
    '加载虚拟墙列表',
    SITE_SERVICE_NAMES.virtualWall,
    async () => {
      if (USE_MOCK_DATA) {
        return fetchRosVirtualWalls(map)
      }

      const records = await requestWorkbenchVirtualWallList(resolveRequestedMapName(map))
      return records.map((record, index) =>
        normalizeAreaEntity(record, 'virtualWall', index),
      )
    },
  )
}

export function fetchVirtualWallDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  wallId: string
}) {
  return runWorkbenchRead(
    '加载虚拟墙详情',
    SITE_SERVICE_NAMES.virtualWall,
    async () => {
      if (USE_MOCK_DATA) {
        return fetchRosVirtualWallDetail(options)
      }

      const record = await requestWorkbenchVirtualWallDetail({
        wallId: options.wallId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })

      return record ? normalizeAreaEntity(record, 'virtualWall', 0) : null
    },
  )
}

export function addVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  wallId?: string | null
  displayName: string
  enabled?: boolean
  displayPath: RosServiceRequest
  displayFrame: string
  bufferM: number
}) {
  return runWorkbenchMutation(
    '创建虚拟墙',
    SITE_SERVICE_NAMES.virtualWall,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wallId ?? '',
      displayName: options.displayName,
      enabled: options.enabled ?? true,
      bufferM: options.bufferM,
    },
    SITE_SERVICE_NAMES.virtualWall,
    async () => {
      if (USE_MOCK_DATA) {
        return addRosVirtualWall(options)
      }

      const payload = await requestCreateWorkbenchVirtualWall({
        operation: 2,
        map_name: resolveRequestedMapName(options.map, options.mapName),
        wall_id: options.wallId?.trim() ?? '',
        alignment_version: options.alignment?.alignmentVersion ?? '',
        wall: buildVirtualWallRequest({
          map: options.map,
          mapName: options.mapName,
          alignment: options.alignment,
          wallId: options.wallId,
          displayName: options.displayName,
          enabled: options.enabled ?? true,
          displayPath: options.displayPath,
          displayFrame: options.displayFrame,
          bufferM: options.bufferM,
        }),
        include_disabled: true,
      })

      return {
        wall: payload.entity
          ? normalizeAreaEntity(payload.entity, 'virtualWall', 0)
          : null,
        constraintVersion: payload.constraintVersion,
        warnings: payload.warnings,
        raw: payload.raw,
      }
    },
  )
}

export function modifyVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  wall: AreaEntity
  displayName: string
  enabled?: boolean
  displayPath: RosServiceRequest
  displayFrame: string
  bufferM: number
}) {
  return runWorkbenchMutation(
    '更新虚拟墙',
    SITE_SERVICE_NAMES.virtualWall,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wall.id,
      displayName: options.displayName,
      enabled: options.enabled ?? true,
      bufferM: options.bufferM,
    },
    SITE_SERVICE_NAMES.virtualWall,
    async () => {
      if (USE_MOCK_DATA) {
        return modifyRosVirtualWall(options)
      }

      const payload = await requestUpdateWorkbenchVirtualWall(options.wall.id, {
        operation: 3,
        map_name: resolveRequestedMapName(options.map, options.mapName),
        wall_id: options.wall.id,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        wall: buildVirtualWallRequest({
          map: options.map,
          mapName: options.mapName,
          alignment: options.alignment,
          wallId: options.wall.id,
          displayName: options.displayName,
          enabled:
            options.enabled ??
            (typeof options.wall.raw.enabled === 'boolean'
              ? options.wall.raw.enabled
              : true),
          displayPath: options.displayPath,
          displayFrame: options.displayFrame,
          bufferM: options.bufferM,
          baseWall: options.wall,
        }),
        include_disabled: true,
      })

      const wall = payload.entity
        ? normalizeAreaEntity(payload.entity, 'virtualWall', 0)
        : null

      if (wall && wall.id !== options.wall.id) {
        throw new Error('Virtual wall modify returned a different wall_id than the selected item.')
      }

      return {
        wall,
        constraintVersion: payload.constraintVersion,
        warnings: payload.warnings,
        raw: payload.raw,
      }
    },
  )
}

export function deleteVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  wallId: string
}) {
  return runWorkbenchMutation(
    '删除虚拟墙',
    SITE_SERVICE_NAMES.virtualWall,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wallId,
    },
    SITE_SERVICE_NAMES.virtualWall,
    async () => {
      if (USE_MOCK_DATA) {
        return deleteRosVirtualWall(options)
      }

      return requestDeleteWorkbenchVirtualWall({
        wallId: options.wallId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })
    },
  )
}

export function importCurrentMapAsset(input: ImportCurrentMapAssetInput) {
  return runWorkbenchMutation(
    '导入当前地图资产',
    MAP_CATALOG_SERVICE.canonicalName,
    {
      mapName: input.mapName,
      setActive: input.setActive,
    },
    MAP_CATALOG_SERVICE.canonicalName,
    () => (USE_MOCK_DATA ? importRosCurrentMapAsset(input) : requestImportCurrentMapAsset(input)),
  )
}

export function checkMapImportPreflight(mapName: string) {
  if (USE_MOCK_DATA) {
    return Promise.resolve({
      canImport: true,
      status: 'MAP_IMPORT_READY',
      message: 'Mock 模式已跳过 pbstream 文件检查。',
      expectedPath: null,
    })
  }

  return requestMapImportPreflight(mapName)
}

export async function executeTaskCommand(
  command: ExecutionCommandName,
  taskId: number,
) {
  try {
    assertCapabilityAllowed('executionControl', `任务执行命令 ${command}`)
    if (!USE_MOCK_DATA) {
      return await requestExecutionCommand(command, taskId)
    }

    const result = await executeRosTaskCommand(command, taskId)

    recordAuditEvent({
      category: 'task',
      action: command,
      target: `${EXECUTION_SERVICE.canonicalName} task_id=${taskId}`,
      status: result.success ? 'success' : 'failed',
      message: result.message || 'execution service completed',
      detail: {
        command,
        taskId,
        result: result.raw,
      },
    })

    return result
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'TASK_EXECUTION_FAILED',
      source: 'robot-gateway',
      message: '任务执行命令下发失败。',
      recoverable: true,
    })

    recordAuditEvent({
      category: 'task',
      action: command,
      target: `${EXECUTION_SERVICE.canonicalName} task_id=${taskId}`,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: {
        command,
        taskId,
        errorCode: normalizedError.code,
      },
    })

    throw normalizedError
  }
}

export async function publishActuatorCommand<T>(
  capability: CapabilityFlag,
  actionLabel: string,
  target: string,
  detail: Record<string, unknown>,
  publisher: () => Promise<T> | T,
) {
  try {
    assertCapabilityAllowed(capability, actionLabel)
    const result = await publisher()

    recordAuditEvent({
      category:
        capability === 'chargingControl' ? 'charging' : 'actuator',
      action: actionLabel,
      target,
      status: 'success',
      message: `${actionLabel} 已下发。`,
      detail,
    })

    return result
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'ACTUATOR_COMMAND_FAILED',
      source: 'robot-gateway',
      message: `${actionLabel} 下发失败。`,
      recoverable: true,
      requiresEngineer: capability === 'actuatorControl' || capability === 'chargingControl',
    })

    recordAuditEvent({
      category:
        capability === 'chargingControl' ? 'charging' : 'actuator',
      action: actionLabel,
      target,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: {
        ...detail,
        errorCode: normalizedError.code,
      },
    })

    throw normalizedError
  }
}

export function normalizeRobotGatewayError(error: unknown): GatewayErrorShape {
  return normalizeGatewayError(error, {
    code: 'ROBOT_GATEWAY_ERROR',
    source: 'robot-gateway',
    message: '机器人网关操作失败。',
    recoverable: true,
  })
}

export async function manageTask(options: {
  action: 'list'
}): Promise<Awaited<ReturnType<typeof fetchCleanTasks>>>
export async function manageTask(options: {
  action: 'detail'
  taskId: number
}): Promise<Awaited<ReturnType<typeof fetchCleanTaskDetail>>>
export async function manageTask(options: {
  action: 'create'
  input: TaskDraftInput
}): Promise<Awaited<ReturnType<typeof addCleanTask>>>
export async function manageTask(options: {
  action: 'update'
  task: TaskEntity
  input: TaskDraftInput
}): Promise<Awaited<ReturnType<typeof modifyCleanTask>>>
export async function manageTask(options: {
  action: 'delete'
  taskId: number
}): Promise<Awaited<ReturnType<typeof deleteCleanTask>>>
export async function manageTask(options: {
  action: 'list' | 'detail' | 'create' | 'update' | 'delete'
  taskId?: number
  input?: TaskDraftInput
  task?: TaskEntity
}) {
  try {
    assertCapabilityAllowed('taskManagement', `任务操作 ${options.action}`)
    if (!USE_MOCK_DATA) {
      switch (options.action) {
        case 'list':
          return await requestTaskList()
        case 'detail':
          return await requestTaskDetail(options.taskId ?? 0)
        case 'create':
          return await requestCreateTask(options.input as TaskDraftInput)
        case 'update':
          return await requestUpdateTask(
            options.task as TaskEntity,
            options.input as TaskDraftInput,
          )
        case 'delete':
          return await requestDeleteTask(options.taskId ?? 0)
        default:
          return null
      }
    }

    let result: unknown

    switch (options.action) {
      case 'list':
        result = await fetchCleanTasks()
        break
      case 'detail':
        result = await fetchCleanTaskDetail(options.taskId ?? 0)
        break
      case 'create':
        result = await addCleanTask(options.input as TaskDraftInput)
        break
      case 'update':
        result = await modifyCleanTask(options.task as TaskEntity, options.input as TaskDraftInput)
        break
      case 'delete':
        result = await deleteCleanTask(options.taskId ?? 0)
        break
      default:
        result = null
    }

    recordAuditEvent({
      category: 'system',
      action: `task:${options.action}`,
      target: TASK_SERVICE.canonicalName,
      status: 'success',
      message: '任务管理操作已完成。',
      detail: options as Record<string, unknown>,
    })

    return result
  } catch (error) {
    const normalizedError = normalizeRobotGatewayError(error)
    recordAuditEvent({
      category: 'system',
      action: `task:${options.action}`,
      target: TASK_SERVICE.canonicalName,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: options as Record<string, unknown>,
    })
    throw normalizedError
  }
}

export async function manageSchedule(options: {
  action: 'list'
}): Promise<Awaited<ReturnType<typeof fetchCleanSchedules>>>
export async function manageSchedule(options: {
  action: 'detail'
  scheduleId: string
  taskId?: number
}): Promise<Awaited<ReturnType<typeof fetchCleanScheduleDetail>>>
export async function manageSchedule(options: {
  action: 'create'
  input: ScheduleDraftInput
  task: TaskEntity | null
}): Promise<Awaited<ReturnType<typeof addCleanSchedule>>>
export async function manageSchedule(options: {
  action: 'update'
  schedule: ScheduleEntity
  input: ScheduleDraftInput
  task: TaskEntity | null
}): Promise<Awaited<ReturnType<typeof modifyCleanSchedule>>>
export async function manageSchedule(options: {
  action: 'delete'
  scheduleId: string
  taskId?: number
}): Promise<Awaited<ReturnType<typeof deleteCleanSchedule>>>
export async function manageSchedule(options: {
  action: 'list' | 'detail' | 'create' | 'update' | 'delete'
  scheduleId?: string
  taskId?: number
  task?: TaskEntity | null
  input?: ScheduleDraftInput
  schedule?: ScheduleEntity
}) {
  try {
    assertCapabilityAllowed('scheduleManagement', `调度操作 ${options.action}`)
    if (!USE_MOCK_DATA) {
      switch (options.action) {
        case 'list':
          return await requestScheduleList()
        case 'detail':
          return await requestScheduleDetail(options.scheduleId ?? '', options.taskId ?? 0)
        case 'create':
          return await requestCreateSchedule(
            options.input as ScheduleDraftInput,
            options.task ?? null,
          )
        case 'update':
          return await requestUpdateSchedule(
            options.schedule as ScheduleEntity,
            options.input as ScheduleDraftInput,
            options.task ?? null,
          )
        case 'delete':
          return await requestDeleteSchedule(options.scheduleId ?? '', options.taskId ?? 0)
        default:
          return null
      }
    }

    let result: unknown

    switch (options.action) {
      case 'list':
        result = await fetchCleanSchedules()
        break
      case 'detail':
        result = await fetchCleanScheduleDetail(options.scheduleId ?? '', options.taskId ?? 0)
        break
      case 'create':
        result = await addCleanSchedule(options.input as ScheduleDraftInput, options.task ?? null)
        break
      case 'update':
        result = await modifyCleanSchedule(
          options.schedule as ScheduleEntity,
          options.input as ScheduleDraftInput,
          options.task ?? null,
        )
        break
      case 'delete':
        result = await deleteCleanSchedule(options.scheduleId ?? '', options.taskId ?? 0)
        break
      default:
        result = null
    }

    recordAuditEvent({
      category: 'system',
      action: `schedule:${options.action}`,
      target: SCHEDULE_SERVICE.canonicalName,
      status: 'success',
      message: '调度管理操作已完成。',
      detail: options as Record<string, unknown>,
    })

    return result
  } catch (error) {
    const normalizedError = normalizeRobotGatewayError(error)
    recordAuditEvent({
      category: 'system',
      action: `schedule:${options.action}`,
      target: SCHEDULE_SERVICE.canonicalName,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: options as Record<string, unknown>,
    })
    throw normalizedError
  }
}

export async function runSlamAction(
  actionKind: SlamActionKind,
  payload: SubmitSlamWorkflowRequest | undefined = undefined,
) {
  const normalizedActionKind =
    actionKind === 'restart_localization' ? 'relocalize' : actionKind

  try {
    assertCapabilityAllowed('slamWorkbench', `SLAM 动作 ${normalizedActionKind}`)
    if (!USE_MOCK_DATA) {
      return await requestSlamAction(normalizedActionKind, payload)
    }

    let result: unknown
    const workflowPayload = (payload ?? {}) as SubmitSlamWorkflowRequest

    switch (normalizedActionKind) {
      case 'switch_map':
        result = await submitSwitchMap(workflowPayload)
        break
      case 'relocalize':
        result = await submitRelocalize(workflowPayload)
        break
      case 'start_mapping':
        result = await submitStartMapping(workflowPayload)
        break
      case 'save_mapping':
        result = await submitSaveMapping(workflowPayload)
        break
      case 'stop_mapping':
        result = await submitStopMapping(workflowPayload)
        break
      default:
        result = null
    }

    recordAuditEvent({
      category: 'slam',
      action: normalizedActionKind,
      target: '/clean_robot_server/*',
      status: 'success',
      message: 'SLAM 动作已通过统一网关下发。',
      detail: (payload ?? {}) as Record<string, unknown>,
    })

    return result
  } catch (error) {
    const normalizedError = normalizeRobotGatewayError(error)
    recordAuditEvent({
      category: 'slam',
      action: normalizedActionKind,
      target: '/clean_robot_server/*',
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: (payload ?? {}) as Record<string, unknown>,
    })
    throw normalizedError
  }
}
