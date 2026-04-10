import { getRosConnectionManager } from './client'
import { fetchRuntimeTopicMeta } from './runtimeServices'

import type { RosServiceRequest } from '../../types/ros'
import type {
  SystemReadiness,
  SystemReadinessCheck,
  SystemReadinessServiceResult,
} from '../../types/systemReadiness'

type JsonRecord = Record<string, unknown>

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

export const SYSTEM_READINESS_SERVICE_NAME =
  '/coverage_task_manager/get_system_readiness'
export const SYSTEM_READINESS_SERVICE_TYPE = 'my_msg_srv/GetSystemReadiness'
export const SYSTEM_READINESS_TOPIC_NAME =
  '/coverage_task_manager/system_readiness'
export const SYSTEM_READINESS_TOPIC_TYPE = 'my_msg_srv/SystemReadiness'
export const SYSTEM_READINESS_STALE_AFTER_MS = 15_000

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false
    }
  }

  return null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function toStampMs(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const secs = toNumber(value.secs)
  const nsecs = toNumber(value.nsecs) ?? 0

  if (secs === null) {
    return null
  }

  return secs * 1000 + Math.floor(nsecs / 1_000_000)
}

function normalizeCheck(value: unknown): SystemReadinessCheck | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    key: toString(value.key),
    level: toString(value.level),
    ok: toBoolean(value.ok) ?? false,
    fresh: toBoolean(value.fresh) ?? false,
    stale: toBoolean(value.stale) ?? false,
    missing: toBoolean(value.missing) ?? false,
    ageS: toNumber(value.age_s),
    summary: toString(value.summary),
    raw: value,
  }
}

export function normalizeSystemReadiness(value: unknown): SystemReadiness | null {
  if (!isRecord(value)) {
    return null
  }

  const checks = Array.isArray(value.checks)
    ? value.checks
        .map((item) => normalizeCheck(item))
        .filter((item): item is SystemReadinessCheck => Boolean(item))
    : []

  return {
    overallReady: toBoolean(value.overall_ready) ?? false,
    canStartTask: toBoolean(value.can_start_task) ?? false,
    taskId: Math.round(toNumber(value.task_id) ?? 0),
    taskName: toString(value.task_name),
    taskMapName: toString(value.task_map_name),
    taskZoneId: toString(value.task_zone_id),
    taskPlanProfile: toString(value.task_plan_profile),
    activeMapName: toString(value.active_map_name),
    activeMapId: toString(value.active_map_id),
    activeMapMd5: toString(value.active_map_md5),
    runtimeMapName: toString(value.runtime_map_name),
    runtimeMapId: toString(value.runtime_map_id),
    runtimeMapMd5: toString(value.runtime_map_md5),
    missionState: toString(value.mission_state),
    phase: toString(value.phase),
    publicState: toString(value.public_state),
    executorState: toString(value.executor_state),
    dockSupplyState: toString(value.dock_supply_state),
    batterySoc: toNumber(value.battery_soc),
    batteryValid: toBoolean(value.battery_valid),
    blockingReasons: toStringArray(value.blocking_reasons),
    warnings: toStringArray(value.warnings),
    checks,
    stampMs: toStampMs(value.stamp),
    raw: value,
  }
}

async function callSystemReadinessService(request: RosServiceRequest) {
  const client = getRosConnectionManager()
  return client.callService<RosServiceRequest, JsonRecord>({
    serviceName: SYSTEM_READINESS_SERVICE_NAME,
    serviceType: SYSTEM_READINESS_SERVICE_TYPE,
    request,
  })
}

export async function fetchSystemReadiness(taskId: number) {
  if (USE_MOCK_DATA) {
    return {
      success: true,
      message: 'mock readiness snapshot',
      readiness: {
        overallReady: taskId === 0,
        canStartTask: taskId === 0,
        taskId: Math.max(0, Math.round(taskId)),
        taskName: taskId > 0 ? `mock_task_${taskId}` : '',
        taskMapName: taskId > 0 ? 'mock_map' : '',
        taskZoneId: taskId > 0 ? 'mock_zone' : '',
        taskPlanProfile: taskId > 0 ? 'cover_standard' : '',
        activeMapName: 'mock_map',
        activeMapId: 'mock_map_id',
        activeMapMd5: 'mock_map_md5',
        runtimeMapName: 'mock_map',
        runtimeMapId: 'mock_runtime_map_id',
        runtimeMapMd5: 'mock_runtime_map_md5',
        missionState: 'IDLE',
        phase: 'IDLE',
        publicState: 'IDLE',
        executorState: 'IDLE',
        dockSupplyState: 'READY',
        batterySoc: 0.8,
        batteryValid: true,
        blockingReasons:
          taskId === 0 ? [] : ['mock task config has not been verified against live backend'],
        warnings: taskId === 0 ? ['mock data'] : ['mock data', 'task-aware readiness is mocked'],
        checks: [
          {
            key: 'runtime_map',
            level: 'ok',
            ok: true,
            fresh: true,
            stale: false,
            missing: false,
            ageS: 0,
            summary: 'Mock runtime map is ready.',
            raw: {},
          },
        ],
        stampMs: Date.now(),
        raw: {},
      },
      raw: {},
    } satisfies SystemReadinessServiceResult
  }

  const payload = await callSystemReadinessService({
    task_id: Math.max(0, Math.round(taskId)),
    refresh_map_identity: true,
  })

  return {
    success: toBoolean(payload.success) ?? false,
    message: toString(payload.message),
    readiness: normalizeSystemReadiness(payload.readiness),
    raw: payload,
  } satisfies SystemReadinessServiceResult
}

export async function fetchSystemReadinessTopicMeta() {
  return fetchRuntimeTopicMeta(SYSTEM_READINESS_TOPIC_NAME)
}
