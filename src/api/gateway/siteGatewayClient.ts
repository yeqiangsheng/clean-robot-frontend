import { getApiBaseUrl } from '../../config/appConfig'
import { useAppShellStore } from '../../stores/appShellStore'
import type {
  AuditEventRecord,
  CapabilityStatusItem,
  GatewayErrorShape,
  SessionPayload,
} from '../../types/appShell'
import type { ExecutionCommandName } from '../../types/execution'
import type { MapCatalogEntry } from '../../types/mapCatalog'
import type { OdometryState } from '../../types/odometry'
import type { OdometryServiceResult } from '../../types/odometry'
import type { ProfileCatalogEntry, ProfileKind } from '../../types/profileCatalog'
import type { ScheduleDraftInput, ScheduleEntity } from '../../types/schedule'
import type {
  SlamActionKind,
  SlamWorkflowJob,
  SlamWorkflowState,
  SubmitSlamWorkflowRequest,
} from '../../types/slam-workflow'
import type { SystemReadiness } from '../../types/systemReadiness'
import type { SystemReadinessServiceResult } from '../../types/systemReadiness'
import type { TaskDraftInput, TaskEntity } from '../../types/task'
import type { RuntimeTopicKey } from '../../types/runtime'
import type { RosConnectionSnapshot } from '../../types/ros'

export interface GatewayLiveMapSnapshot {
  changed: boolean
  available: boolean
  receivedAtMs: number | null
  messageCount: number
  payload: Record<string, unknown> | null
  error: string | null
}

export interface GatewayRosTopicSnapshot<TPayload> {
  topicName: string
  messageType: string
  publishers: string[]
  subscribers: string[]
  metaError: string | null
  subscribeError: string | null
  messageCount: number
  lastMessageAt: number | null
  payload: TPayload | null
}

export type GatewayRuntimeTopicSnapshotMap = Partial<
  Record<RuntimeTopicKey, GatewayRosTopicSnapshot<Record<string, unknown>>>
>

export interface GatewayHealthResponse {
  status: string
  version: string
  siteName: string
  robotId: string
  ros: Pick<
    RosConnectionSnapshot,
    'status' | 'url' | 'isConnected' | 'lastError' | 'connectedAt' | 'sessionId'
  >
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function joinApiUrl(pathname: string) {
  const baseUrl = getApiBaseUrl()

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return new URL(pathname.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString()
  }

  return `${baseUrl.replace(/\/+$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

function buildQueryString(
  values: Record<string, string | number | boolean | null | undefined>,
) {
  const query = new URLSearchParams()

  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) {
        return
      }
      query.set(key, trimmed)
      return
    }

    query.set(key, String(value))
  })

  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

function createGatewayError(
  message: string,
  options: {
    code: string
    source: string
    recoverable?: boolean
    requiresEngineer?: boolean
    missingDependency?: string | null
    requestId?: string | null
  },
) {
  const error = new Error(message) as GatewayErrorShape
  error.code = options.code
  error.source = options.source
  error.recoverable = options.recoverable ?? true
  error.requiresEngineer = options.requiresEngineer ?? false
  error.missingDependency = options.missingDependency ?? null
  error.requestId = options.requestId ?? null
  return error
}

async function parseError(response: Response) {
  let payload: unknown = null

  try {
    payload = await response.json()
  } catch {
    // Ignore JSON parse failures for gateway errors.
  }

  if (isRecord(payload) && typeof payload.message === 'string') {
    return createGatewayError(payload.message, {
      code: typeof payload.code === 'string' ? payload.code : 'GATEWAY_ERROR',
      source: 'site-gateway',
      recoverable: payload.recoverable !== false,
      requiresEngineer: payload.requiresEngineer === true,
      missingDependency:
        typeof payload.missingDependency === 'string' ? payload.missingDependency : null,
      requestId: typeof payload.requestId === 'string' ? payload.requestId : null,
    })
  }

  return createGatewayError(`Gateway request failed with HTTP ${response.status}.`, {
    code: 'GATEWAY_HTTP_ERROR',
    source: 'site-gateway',
  })
}

async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(joinApiUrl(pathname), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const error = await parseError(response)

    if (response.status === 401) {
      useAppShellStore.getState().clearClientSession()
    }

    throw error
  }

  return (await response.json()) as T
}

export function appendAuditEventFromResponse(value: unknown) {
  if (!isRecord(value) || !isRecord(value.auditEvent)) {
    return
  }

  useAppShellStore.getState().appendAuditEvent(value.auditEvent as unknown as AuditEventRecord)
}

export async function fetchCurrentSession() {
  return requestJson<SessionPayload>('/session/me')
}

export async function fetchGatewayHealth() {
  return requestJson<GatewayHealthResponse>('/health')
}

export async function loginToSiteGateway(username: string, password: string) {
  return requestJson<SessionPayload>('/session/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logoutFromSiteGateway() {
  await requestJson<{ success: boolean }>('/session/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function requestGatewayRosReconnect(url = '') {
  return requestJson<{ success: boolean; ros: RosConnectionSnapshot }>('/ros/reconnect', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function fetchCapabilityMap() {
  return requestJson<Record<string, CapabilityStatusItem>>('/capabilities')
}

export async function fetchAuditLog(limit = 50) {
  return requestJson<AuditEventRecord[]>(`/audit?limit=${Math.max(1, Math.round(limit))}`)
}

export async function bridgeAuditEvent(event: Omit<AuditEventRecord, 'id' | 'timestamp' | 'role'>) {
  const record = await requestJson<AuditEventRecord>('/audit/records', {
    method: 'POST',
    body: JSON.stringify(event),
  })
  useAppShellStore.getState().appendAuditEvent(record)
  return record
}

export async function exportGatewayDiagnostics() {
  const result = await requestJson<{ filename: string; bundle: unknown; auditEvent?: AuditEventRecord }>(
    '/diagnostics/export',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  )

  if (result.auditEvent) {
    useAppShellStore.getState().appendAuditEvent(result.auditEvent)
  }

  return {
    filename: result.filename,
    bundle: result.bundle,
  }
}

export async function fetchGatewaySystemReadiness(taskId: number) {
  return requestJson<SystemReadinessServiceResult>(
    `/system/readiness?taskId=${Math.max(0, Math.round(taskId))}`,
  )
}

export async function fetchGatewaySystemReadinessTopicSnapshot() {
  return requestJson<GatewayRosTopicSnapshot<SystemReadiness>>('/system/readiness/topic')
}

export async function fetchGatewayOdometryState() {
  return requestJson<OdometryServiceResult>('/odometry/state')
}

export async function fetchGatewayOdometryTopicSnapshot() {
  return requestJson<GatewayRosTopicSnapshot<OdometryState>>('/odometry/topic')
}

export async function fetchGatewaySlamState() {
  return requestJson<SlamWorkflowState | null>('/slam/state')
}

export async function fetchGatewaySlamStateTopicSnapshot() {
  return requestJson<GatewayRosTopicSnapshot<SlamWorkflowState>>('/slam/state/topic')
}

export async function fetchGatewaySlamJob(jobId: string) {
  return requestJson<SlamWorkflowJob | null>(`/slam/jobs/${encodeURIComponent(jobId.trim())}`)
}

export async function fetchGatewaySlamJobTopicSnapshot() {
  return requestJson<GatewayRosTopicSnapshot<SlamWorkflowJob>>('/slam/jobs/topic')
}

export async function fetchGatewayRuntimeTopicSnapshots(options: {
  topicKeys?: RuntimeTopicKey[]
  includeEndpointInfo?: boolean
}) {
  const query = new URLSearchParams()

  if (options.topicKeys && options.topicKeys.length > 0) {
    query.set('keys', options.topicKeys.join(','))
  }

  query.set('includeEndpointInfo', String(options.includeEndpointInfo !== false))

  return requestJson<GatewayRuntimeTopicSnapshotMap>(`/runtime/topics?${query.toString()}`)
}

export async function requestMapCatalog() {
  return requestJson<MapCatalogEntry[]>('/maps')
}

export async function requestCurrentMap() {
  return requestJson<Record<string, unknown> | null>('/maps/current') as Promise<
    Record<string, unknown> | null
  >
}

export async function requestLiveMapSnapshot(afterMs = 0) {
  return requestJson<GatewayLiveMapSnapshot>(
    `/maps/live?after=${Math.max(0, Math.floor(afterMs))}`,
  )
}

export async function requestImportCurrentMapAsset(input: {
  mapName: string
  description?: string | null
  setActive: boolean
}) {
  return requestJson<{
    message: string
    map: MapCatalogEntry | null
    raw: Record<string, unknown>
  }>('/maps/import-current', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function requestMapImportPreflight(mapName: string) {
  return requestJson<{
    canImport: boolean
    status: string
    message: string
    expectedPath: string | null
  }>(`/maps/import-current/preflight${buildQueryString({ mapName })}`)
}

export async function requestWorkbenchAlignment(mapName: string) {
  return requestJson<Record<string, unknown> | null>(
    `/workbench/alignment${buildQueryString({ mapName })}`,
  )
}

export async function requestConfirmWorkbenchAlignment(
  payload: Record<string, unknown>,
) {
  return requestJson<Record<string, unknown>>('/workbench/alignment/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWorkbenchRectZonePreview(
  payload: Record<string, unknown>,
) {
  return requestJson<Record<string, unknown>>('/workbench/zones/rect-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWorkbenchCoveragePreview(
  payload: Record<string, unknown>,
) {
  return requestJson<Record<string, unknown>>('/workbench/zones/coverage-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWorkbenchCoverageCommit(
  payload: Record<string, unknown>,
) {
  return requestJson<Record<string, unknown>>('/workbench/zones', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWorkbenchZoneList(mapName: string) {
  return requestJson<Array<Record<string, unknown>>>(
    `/workbench/zones${buildQueryString({ mapName })}`,
  )
}

export async function requestWorkbenchZoneDetail(options: {
  zoneId: string
  mapName?: string | null
  profileName?: string | null
}) {
  return requestJson<Record<string, unknown> | null>(
    `/workbench/zones/${encodeURIComponent(options.zoneId.trim())}${buildQueryString({
      mapName: options.mapName,
      profileName: options.profileName,
    })}`,
  )
}

export async function requestWorkbenchZonePlanPath(options: {
  zoneId: string
  mapName?: string | null
  alignmentVersion?: string | null
  planProfileName?: string | null
}) {
  return requestJson<Record<string, unknown>>(
    `/workbench/zones/${encodeURIComponent(options.zoneId.trim())}/plan-path${buildQueryString({
      mapName: options.mapName,
      alignmentVersion: options.alignmentVersion,
      planProfileName: options.planProfileName,
    })}`,
  )
}

export async function requestDeleteWorkbenchZone(options: {
  zoneId: string
  mapName?: string | null
}) {
  return requestJson<{
    message: string
    raw: Record<string, unknown>
  }>(
    `/workbench/zones/${encodeURIComponent(options.zoneId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
    {
      method: 'DELETE',
    },
  )
}

export async function requestWorkbenchNoGoAreaList(mapName: string) {
  return requestJson<Array<Record<string, unknown>>>(
    `/workbench/no-go-areas${buildQueryString({ mapName })}`,
  )
}

export async function requestWorkbenchNoGoAreaDetail(options: {
  areaId: string
  mapName?: string | null
}) {
  return requestJson<Record<string, unknown> | null>(
    `/workbench/no-go-areas/${encodeURIComponent(options.areaId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
  )
}

export async function requestCreateWorkbenchNoGoArea(
  payload: Record<string, unknown>,
) {
  return requestJson<{
    entity: Record<string, unknown> | null
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>('/workbench/no-go-areas', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestUpdateWorkbenchNoGoArea(
  areaId: string,
  payload: Record<string, unknown>,
) {
  return requestJson<{
    entity: Record<string, unknown> | null
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>(`/workbench/no-go-areas/${encodeURIComponent(areaId.trim())}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function requestDeleteWorkbenchNoGoArea(options: {
  areaId: string
  mapName?: string | null
}) {
  return requestJson<{
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>(
    `/workbench/no-go-areas/${encodeURIComponent(options.areaId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
    {
      method: 'DELETE',
    },
  )
}

export async function requestWorkbenchVirtualWallList(mapName: string) {
  return requestJson<Array<Record<string, unknown>>>(
    `/workbench/virtual-walls${buildQueryString({ mapName })}`,
  )
}

export async function requestWorkbenchVirtualWallDetail(options: {
  wallId: string
  mapName?: string | null
}) {
  return requestJson<Record<string, unknown> | null>(
    `/workbench/virtual-walls/${encodeURIComponent(options.wallId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
  )
}

export async function requestCreateWorkbenchVirtualWall(
  payload: Record<string, unknown>,
) {
  return requestJson<{
    entity: Record<string, unknown> | null
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>('/workbench/virtual-walls', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestUpdateWorkbenchVirtualWall(
  wallId: string,
  payload: Record<string, unknown>,
) {
  return requestJson<{
    entity: Record<string, unknown> | null
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>(`/workbench/virtual-walls/${encodeURIComponent(wallId.trim())}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function requestDeleteWorkbenchVirtualWall(options: {
  wallId: string
  mapName?: string | null
}) {
  return requestJson<{
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>(
    `/workbench/virtual-walls/${encodeURIComponent(options.wallId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
    {
      method: 'DELETE',
    },
  )
}

export async function fetchGatewayProfileCatalog(options: {
  profileKind: ProfileKind
  includeDisabled?: boolean
  mapName?: string | null
}) {
  const query = new URLSearchParams({
    profileKind: options.profileKind,
    includeDisabled: String(options.includeDisabled === true),
  })

  if (options.mapName?.trim()) {
    query.set('mapName', options.mapName.trim())
  }

  return requestJson<ProfileCatalogEntry[]>(`/profile-catalog?${query.toString()}`)
}

export async function requestTaskList() {
  return requestJson<TaskEntity[]>('/tasks')
}

export async function requestTaskDetail(taskId: number) {
  return requestJson<TaskEntity | null>(`/tasks/${Math.max(0, Math.round(taskId))}`)
}

export async function requestCreateTask(input: TaskDraftInput) {
  const result = await requestJson<{
    task: TaskEntity
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestUpdateTask(task: TaskEntity, input: TaskDraftInput) {
  const result = await requestJson<{
    task: TaskEntity
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>(`/tasks/${task.id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestDeleteTask(taskId: number) {
  const result = await requestJson<{
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>(`/tasks/${Math.max(0, Math.round(taskId))}`, {
    method: 'DELETE',
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestScheduleList() {
  return requestJson<ScheduleEntity[]>('/schedules')
}

export async function requestScheduleDetail(scheduleId: string, taskId = 0) {
  return requestJson<ScheduleEntity | null>(
    `/schedules/${encodeURIComponent(scheduleId)}?taskId=${Math.max(0, Math.round(taskId))}`,
  )
}

export async function requestCreateSchedule(input: ScheduleDraftInput, task: TaskEntity | null) {
  const result = await requestJson<{
    schedule: ScheduleEntity
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>('/schedules', {
    method: 'POST',
    body: JSON.stringify({ input, task }),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestUpdateSchedule(
  schedule: ScheduleEntity,
  input: ScheduleDraftInput,
  task: TaskEntity | null,
) {
  const result = await requestJson<{
    schedule: ScheduleEntity
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>(`/schedules/${encodeURIComponent(schedule.id)}`, {
    method: 'PUT',
    body: JSON.stringify({ input, task }),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestDeleteSchedule(scheduleId: string, taskId = 0) {
  const result = await requestJson<{
    message: string
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>(`/schedules/${encodeURIComponent(scheduleId)}?taskId=${Math.max(0, Math.round(taskId))}`, {
    method: 'DELETE',
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestExecutionCommand(command: ExecutionCommandName, taskId: number) {
  const result = await requestJson<{
    success: boolean
    message: string
    command: ExecutionCommandName
    taskId: number
    raw: Record<string, unknown>
    auditEvent?: AuditEventRecord
  }>('/execution/commands', {
    method: 'POST',
    body: JSON.stringify({ command, taskId }),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestSlamAction(
  actionKind: SlamActionKind,
  payload: SubmitSlamWorkflowRequest | undefined = undefined,
) {
  const result = await requestJson<Record<string, unknown>>('/slam/actions', {
    method: 'POST',
    body: JSON.stringify({ actionKind, payload }),
  })
  appendAuditEventFromResponse(result)
  return result
}

export async function requestActuatorCommand(command: Record<string, unknown>) {
  const result = await requestJson<{ success: boolean; auditEvent?: AuditEventRecord }>(
    '/actuator/commands',
    {
      method: 'POST',
      body: JSON.stringify({ command }),
    },
  )
  appendAuditEventFromResponse(result)
  return result
}
