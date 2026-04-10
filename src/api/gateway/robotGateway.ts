import {
  fetchActiveAlignment as fetchRosActiveAlignment,
  fetchCoverageZoneDetail as fetchRosCoverageZoneDetail,
  fetchCoverageZones as fetchRosCoverageZones,
  fetchCurrentMap as fetchRosCurrentMap,
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
} from '../ros/services'
import {
  importCurrentMapAsset as importRosCurrentMapAsset,
  fetchMapCatalog as fetchRosMapCatalog,
} from '../ros/mapCatalogServices'
import {
  addCleanSchedule,
  deleteCleanSchedule,
  fetchCleanScheduleDetail,
  fetchCleanSchedules,
  modifyCleanSchedule,
} from '../ros/scheduleServices'
import {
  cancelSlamWorkflowJob,
  submitPrepareForTask,
  submitRelocalize,
  submitSaveMap,
  submitStartMapping,
  submitStopMapping,
  submitSwitchMapAndLocalize,
  syncSlamRuntimeState,
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
import { fetchCapabilityStatuses } from './capabilityProbe'

import {
  APP_MODULE_KEYS,
  getAppConfig,
  getDefaultRolePolicy,
  isModuleEnabled,
  sanitizeAppConfig,
} from '../../config/appConfig'
import { getRosConnectionManager } from '../ros/client'
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
import type { RosServiceRequest } from '../../types/ros'

export function getConnectionStatus() {
  return getRosConnectionManager().getSnapshot()
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
  const rolePolicy = getDefaultRolePolicy()
  const capabilitySet = new Set<CapabilityFlag>()

  for (const role of Object.keys(rolePolicy) as Array<keyof typeof rolePolicy>) {
    for (const capability of rolePolicy[role] ?? []) {
      capabilitySet.add(capability)
    }
  }

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
  return fetchCapabilityStatuses(getConnectionStatus(), enabledCapabilities)
}

export async function exportDiagnostics(): Promise<{
  filename: string
  bundle: RobotDiagnosticsBundle
}> {
  const connection = getConnectionStatus()
  const runtimeStore = useRuntimeMonitorStore.getState()
  const rosDebug = getRosDebugSnapshot()
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
  profileKind: Exclude<ProfileKind, ''>
  includeDisabled?: boolean
  mapName?: string | null
}) {
  assertCapabilityAllowed('profileCatalog', 'Profile catalog 查询')

  try {
    return await fetchProfileCatalog(options)
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'PROFILE_CATALOG_FAILED',
      source: 'robot-gateway',
      message: 'Profile catalog 查询失败。',
      recoverable: true,
      missingDependency: '/database_server/profile_catalog_service',
    })
  }
}

export async function fetchMapCatalog() {
  try {
    return await fetchRosMapCatalog()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'MAP_CATALOG_FAILED',
      source: 'robot-gateway',
      message: '地图目录加载失败。',
      recoverable: true,
      missingDependency: '/clean_robot_server/map_server',
    })
  }
}

export async function getSystemReadiness(taskId: number): Promise<SystemReadinessServiceResult> {
  assertCapabilityAllowed('systemReadiness', '系统就绪检查')

  try {
    return await fetchSystemReadiness(taskId)
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'SYSTEM_READINESS_FAILED',
      source: 'robot-gateway',
      message: '系统就绪检查失败。',
      recoverable: true,
      missingDependency: '/coverage_task_manager/get_system_readiness',
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

export function fetchCurrentMap() {
  return runWorkbenchRead(
    '加载当前地图',
    '/clean_robot_server/map_server',
    () => fetchRosCurrentMap(),
  )
}

export function fetchActiveAlignment(
  map: MapEntity | null,
  mapName?: string | null,
) {
  return runWorkbenchRead(
    '加载地图对齐配置',
    '/database_server/map_alignment_service',
    () => fetchRosActiveAlignment(map, mapName),
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
    '/database_server/map_alignment_by_points_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      points: options.points,
      alignmentVersion: options.alignment?.alignmentVersion ?? '',
    },
    '/database_server/map_alignment_by_points_service',
    () => confirmRosMapAlignmentByPoints(options),
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
    '/database_server/rect_zone_preview_service',
    () => previewRosRectZoneByPoints(options),
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
    '/database_server/coverage_preview_service',
    () => previewRosCoverageRegion(options),
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
    '/database_server/coverage_commit_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      zoneId: options.zoneId ?? '',
      displayName: options.displayName,
      profileName: options.profileName,
      baseZoneVersion: options.baseZoneVersion ?? 0,
    },
    '/database_server/coverage_commit_service',
    () => commitRosCoverageRegion(options),
  )
}

export function fetchCoverageZones(
  map: MapEntity | null,
  mapName?: string | null,
) {
  return runWorkbenchRead(
    '加载覆盖区域列表',
    '/database_server/coverage_zone_service',
    () => fetchRosCoverageZones(map, mapName),
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
    '/database_server/coverage_zone_service',
    () => fetchRosCoverageZoneDetail(options),
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
    '/database_server/zone_plan_path_service',
    () => fetchRosZonePlanPath(options),
  )
}

export function deleteCoverageZone(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
}) {
  return runWorkbenchMutation(
    '删除覆盖区域',
    '/database_server/coverage_zone_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      zoneId: options.zoneId,
    },
    '/database_server/coverage_zone_service',
    () => deleteRosCoverageZone(options),
  )
}

export function fetchNoGoAreas(map: MapEntity | null) {
  return runWorkbenchRead(
    '加载禁行区列表',
    '/database_server/no_go_area_service',
    () => fetchRosNoGoAreas(map),
  )
}

export function fetchNoGoAreaDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  areaId: string
}) {
  return runWorkbenchRead(
    '加载禁行区详情',
    '/database_server/no_go_area_service',
    () => fetchRosNoGoAreaDetail(options),
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
    '/database_server/no_go_area_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.areaId ?? '',
      displayName: options.displayName,
      enabled: options.enabled ?? true,
    },
    '/database_server/no_go_area_service',
    () => addRosNoGoArea(options),
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
    '/database_server/no_go_area_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.area.id,
      displayName: options.displayName,
      enabled: options.enabled ?? true,
    },
    '/database_server/no_go_area_service',
    () => modifyRosNoGoArea(options),
  )
}

export function deleteNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  areaId: string
}) {
  return runWorkbenchMutation(
    '删除禁行区',
    '/database_server/no_go_area_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.areaId,
    },
    '/database_server/no_go_area_service',
    () => deleteRosNoGoArea(options),
  )
}

export function fetchVirtualWalls(map: MapEntity | null) {
  return runWorkbenchRead(
    '加载虚拟墙列表',
    '/database_server/virtual_wall_service',
    () => fetchRosVirtualWalls(map),
  )
}

export function fetchVirtualWallDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  wallId: string
}) {
  return runWorkbenchRead(
    '加载虚拟墙详情',
    '/database_server/virtual_wall_service',
    () => fetchRosVirtualWallDetail(options),
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
    '/database_server/virtual_wall_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wallId ?? '',
      displayName: options.displayName,
      enabled: options.enabled ?? true,
      bufferM: options.bufferM,
    },
    '/database_server/virtual_wall_service',
    () => addRosVirtualWall(options),
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
    '/database_server/virtual_wall_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wall.id,
      displayName: options.displayName,
      enabled: options.enabled ?? true,
      bufferM: options.bufferM,
    },
    '/database_server/virtual_wall_service',
    () => modifyRosVirtualWall(options),
  )
}

export function deleteVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  wallId: string
}) {
  return runWorkbenchMutation(
    '删除虚拟墙',
    '/database_server/virtual_wall_service',
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wallId,
    },
    '/database_server/virtual_wall_service',
    () => deleteRosVirtualWall(options),
  )
}

export function importCurrentMapAsset(input: ImportCurrentMapAssetInput) {
  return runWorkbenchMutation(
    '导入当前地图资产',
    '/clean_robot_server/map_server',
    {
      mapName: input.mapName,
      setActive: input.setActive,
    },
    '/clean_robot_server/map_server',
    () => importRosCurrentMapAsset(input),
  )
}

export async function executeTaskCommand(
  command: ExecutionCommandName,
  taskId: number,
) {
  try {
    assertCapabilityAllowed('executionControl', `任务执行命令 ${command}`)
    const result = await executeRosTaskCommand(command, taskId)

    recordAuditEvent({
      category: 'task',
      action: command,
      target: `/exe_task_server task_id=${taskId}`,
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
      target: `/exe_task_server task_id=${taskId}`,
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
      target: '/database_server/clean_task_service',
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
      target: '/database_server/clean_task_service',
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
      target: '/database_server/clean_schedule_service',
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
      target: '/database_server/clean_schedule_service',
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: options as Record<string, unknown>,
    })
    throw normalizedError
  }
}

export async function runSlamAction(
  actionKind: SlamActionKind | 'cancel_job' | 'sync_runtime_state',
  payload: SubmitSlamWorkflowRequest | { jobId: string } | undefined = undefined,
) {
  try {
    assertCapabilityAllowed('slamWorkbench', `SLAM 动作 ${actionKind}`)
    let result: unknown
    const workflowPayload = (payload ?? {}) as SubmitSlamWorkflowRequest

    switch (actionKind) {
      case 'prepare_for_task':
        result = await submitPrepareForTask(workflowPayload)
        break
      case 'switch_map_and_localize':
        result = await submitSwitchMapAndLocalize(workflowPayload)
        break
      case 'relocalize':
        result = await submitRelocalize(workflowPayload)
        break
      case 'start_mapping':
        result = await submitStartMapping(workflowPayload)
        break
      case 'save_map':
        result = await submitSaveMap(workflowPayload)
        break
      case 'stop_mapping':
        result = await submitStopMapping(workflowPayload)
        break
      case 'cancel_job':
        result = await cancelSlamWorkflowJob((payload as { jobId: string } | undefined)?.jobId ?? '')
        break
      case 'sync_runtime_state':
        result = await syncSlamRuntimeState()
        break
      default:
        result = null
    }

    recordAuditEvent({
      category: 'slam',
      action: actionKind,
      target: '/slam_workflow/*',
      status: 'success',
      message: 'SLAM 动作已通过统一网关下发。',
      detail: (payload ?? {}) as Record<string, unknown>,
    })

    return result
  } catch (error) {
    const normalizedError = normalizeRobotGatewayError(error)
    recordAuditEvent({
      category: 'slam',
      action: actionKind,
      target: '/slam_workflow/*',
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: (payload ?? {}) as Record<string, unknown>,
    })
    throw normalizedError
  }
}
