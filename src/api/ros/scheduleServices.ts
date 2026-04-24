import { getRosConnectionManager } from './client'
import { setRosDebugEvent } from './debug'
import { SCHEDULE_SERVICE } from './serviceNames'

import type { TaskEntity } from '../../types/task'
import type { ScheduleDraftInput, ScheduleEntity } from '../../types/schedule'
import type { RosServiceRequest } from '../../types/ros'
import { normalizeCleanMode } from '../../utils/cleanMode'
import { normalizeTaskFinishBehavior } from '../../utils/taskFinishBehavior'

type JsonRecord = Record<string, unknown>

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

const SCHEDULE_SERVICE_TYPE = SCHEDULE_SERVICE.serviceType
const SCHEDULE_CANONICAL_SERVICE_NAME = SCHEDULE_SERVICE.canonicalName
const SCHEDULE_DEPRECATED_FALLBACK_SERVICE_NAME =
  SCHEDULE_SERVICE.deprecatedFallbackName
const SCHEDULE_OPERATIONS = {
  get: 0,
  add: 1,
  modify: 2,
  delete: 3,
  getAll: 4,
} as const

const SCHEDULE_ENABLED_STATE = {
  keep: 0,
  disable: 1,
  enable: 2,
} as const

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMaybeJson<T>(value: T): T | unknown {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
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

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }

  if (typeof value === 'number') {
    return value === 1
  }

  return false
}

function pickValue(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (key in record) {
      return parseMaybeJson(record[key])
    }
  }

  return null
}

function pickString(record: JsonRecord, keys: string[]) {
  const value = pickValue(record, keys)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toNumberArray(value: unknown) {
  const parsed = parseMaybeJson(value)

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .map((item) => toNumber(item))
    .filter((item): item is number => item !== null)
}

function findFirstValue(
  root: unknown,
  candidateKeys: string[],
  predicate: (value: unknown) => boolean,
  maxDepth = 5,
) {
  const queue: Array<{ value: unknown; depth: number }> = [
    { value: parseMaybeJson(root), depth: 0 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      break
    }

    const value = parseMaybeJson(current.value)

    if (predicate(value)) {
      return value
    }

    if (current.depth >= maxDepth) {
      continue
    }

    if (Array.isArray(value)) {
      value.forEach((item) => queue.push({ value: item, depth: current.depth + 1 }))
      continue
    }

    if (isRecord(value)) {
      for (const key of candidateKeys) {
        if (key in value) {
          const candidate = parseMaybeJson(value[key])
          if (predicate(candidate)) {
            return candidate
          }
        }
      }

      Object.values(value).forEach((child) =>
        queue.push({
          value: child,
          depth: current.depth + 1,
        }),
      )
    }
  }

  return null
}

function summarizeMetadata(record: JsonRecord, omitKeys: string[]) {
  const summary: JsonRecord = {}

  Object.entries(record).forEach(([key, value]) => {
    if (omitKeys.includes(key)) {
      return
    }

    if (Array.isArray(value) && value.length > 12) {
      summary[key] = `[${value.length} items]`
      return
    }

    if (isRecord(value) && Object.keys(value).length > 12) {
      summary[key] = `{${Object.keys(value).length} keys}`
      return
    }

    summary[key] = value
  })

  return summary
}

function getResponseSuccess(payload: unknown) {
  return isRecord(payload) && typeof payload.success === 'boolean' ? payload.success : null
}

function getResponseMessage(payload: unknown) {
  return isRecord(payload) && typeof payload.message === 'string' ? payload.message : null
}

function getResponseErrorCode(payload: unknown) {
  return isRecord(payload) &&
    typeof payload.error_code === 'string' &&
    payload.error_code.trim().length > 0
    ? payload.error_code.trim()
    : null
}

function createServiceError(payload: unknown, fallbackMessage: string) {
  const message = getResponseMessage(payload) ?? fallbackMessage
  const errorCode = getResponseErrorCode(payload)

  const error = new Error(message) as Error & { code?: string | null }
  error.code = errorCode
  return error
}

async function callRosService(payload: RosServiceRequest) {
  const client = getRosConnectionManager()

  const callService = (serviceName: string) =>
    client.callService<RosServiceRequest, JsonRecord>({
      serviceName,
      serviceType: SCHEDULE_SERVICE_TYPE,
      request: payload,
    })

  try {
    return await callService(SCHEDULE_CANONICAL_SERVICE_NAME)
  } catch (canonicalError) {
    setRosDebugEvent(
      `schedule:deprecated-fallback:${SCHEDULE_DEPRECATED_FALLBACK_SERVICE_NAME}`,
    )

    try {
      return await callService(SCHEDULE_DEPRECATED_FALLBACK_SERVICE_NAME)
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : `Deprecated fallback schedule service ${SCHEDULE_DEPRECATED_FALLBACK_SERVICE_NAME} failed.`
      const normalizedFallbackError = new Error(fallbackMessage)

      if (canonicalError instanceof Error && canonicalError.message.trim().length > 0) {
        normalizedFallbackError.message = `${normalizedFallbackError.message} (canonical failure: ${canonicalError.message})`
      }

      throw normalizedFallbackError
    }
  }
}

function normalizeScheduleEntity(record: JsonRecord, index: number): ScheduleEntity {
  const finishBehavior = normalizeTaskFinishBehavior({
    returnToDockOnFinish: toBoolean(
      pickValue(record, ['return_to_dock_on_finish', 'returnToDockOnFinish']),
    ),
    repeatAfterFullCharge: toBoolean(
      pickValue(record, ['repeat_after_full_charge', 'repeatAfterFullCharge']),
    ),
  })

  return {
    id: pickString(record, ['schedule_id', 'scheduleId', 'id']) ?? `schedule-${index + 1}`,
    taskId: toNumber(pickValue(record, ['task_id', 'taskId'])) ?? 0,
    taskName: pickString(record, ['task_name', 'taskName']) ?? '',
    enabled: toBoolean(pickValue(record, ['enabled', 'is_enabled'])),
    type: pickString(record, ['type', 'schedule_type', 'scheduleType']) ?? '',
    dow: toNumberArray(pickValue(record, ['dow', 'days_of_week'])),
    time: pickString(record, ['time']) ?? '',
    at: pickString(record, ['at']) ?? '',
    timezone: pickString(record, ['timezone', 'tz']) ?? '',
    startDate: pickString(record, ['start_date', 'startDate']) ?? '',
    endDate: pickString(record, ['end_date', 'endDate']) ?? '',
    mapName: pickString(record, ['map_name', 'mapName']) ?? '',
    zoneId: pickString(record, ['zone_id', 'zoneId']) ?? '',
    loops: toNumber(pickValue(record, ['loops'])),
    planProfileName:
      pickString(record, ['plan_profile_name', 'planProfileName']) ?? '',
    sysProfileName:
      pickString(record, ['sys_profile_name', 'sysProfileName']) ?? '',
    cleanMode: normalizeCleanMode(pickString(record, ['clean_mode', 'cleanMode'])),
    returnToDockOnFinish: finishBehavior.returnToDockOnFinish,
    repeatAfterFullCharge: finishBehavior.repeatAfterFullCharge,
    lastFireTs: toNumber(pickValue(record, ['last_fire_ts', 'lastFireTs'])),
    lastDoneTs: toNumber(pickValue(record, ['last_done_ts', 'lastDoneTs'])),
    lastStatus: pickString(record, ['last_status', 'lastStatus']) ?? '',
    metadata: summarizeMetadata(record, []),
    raw: record,
  }
}

function normalizeScheduleList(payload: unknown) {
  const collection = Array.isArray(payload)
    ? payload.filter((item) => isRecord(item))
    : ((findFirstValue(
        payload,
        ['schedules', 'schedule_list', 'items', 'list', 'data'],
        (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
      ) as JsonRecord[] | null) ?? [])

  return collection.map((record, index) => normalizeScheduleEntity(record, index))
}

function normalizeScheduleDetail(payload: unknown) {
  if (isRecord(payload) && isRecord(payload.schedule)) {
    return normalizeScheduleEntity(payload.schedule, 0)
  }

  if (
    isRecord(payload) &&
    ['schedule_id', 'task_id', 'type', 'timezone'].some((key) => key in payload)
  ) {
    return normalizeScheduleEntity(payload, 0)
  }

  const fallback = findFirstValue(
    payload,
    ['schedule', 'schedules', 'schedule_list', 'items', 'list', 'data'],
    (value) => isRecord(value),
  )

  return isRecord(fallback) ? normalizeScheduleEntity(fallback, 0) : null
}

function deriveTimeFromAt(at: string) {
  const trimmed = at.trim()

  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed.slice(-5)
  }

  return ''
}

function deriveDateFromAt(at: string) {
  const trimmed = at.trim()

  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }

  return ''
}

function buildScheduleRequest(
  input: ScheduleDraftInput,
  task: TaskEntity | null,
  baseSchedule?: ScheduleEntity | null,
) {
  const baseRecord = isRecord(baseSchedule?.raw) ? baseSchedule.raw : {}
  const finishBehavior = normalizeTaskFinishBehavior({
    returnToDockOnFinish:
      task?.returnToDockOnFinish ?? baseSchedule?.returnToDockOnFinish ?? false,
    repeatAfterFullCharge:
      task?.repeatAfterFullCharge ?? baseSchedule?.repeatAfterFullCharge ?? false,
  })
  const normalizedType = input.type?.trim().toLowerCase() ?? ''
  const normalizedAt = input.at?.trim() ?? ''
  const normalizedTimeInput = input.time?.trim() ?? ''
  const normalizedTimezone = input.timezone?.trim() ?? ''
  const normalizedStartDateInput = input.startDate?.trim() ?? ''
  const normalizedEndDateInput = input.endDate?.trim() ?? ''
  const normalizedTime =
    normalizedType === 'once'
      ? normalizedTimeInput || deriveTimeFromAt(normalizedAt)
      : normalizedTimeInput
  const normalizedStartDate =
    normalizedType === 'once'
      ? normalizedStartDateInput || deriveDateFromAt(normalizedAt)
      : normalizedStartDateInput

  return {
    ...baseRecord,
    schedule_id: input.scheduleId?.trim() ?? '',
    task_id: Math.max(0, Math.round(input.taskId)),
    task_name: task?.name ?? baseSchedule?.taskName ?? '',
    enabled: input.enabled,
    type: normalizedType,
    dow: normalizedType === 'weekly' ? input.dow.map((item) => Math.round(item)) : [],
    time: normalizedTime,
    at: normalizedType === 'once' ? normalizedAt : '',
    timezone: normalizedTimezone,
    start_date: normalizedStartDate,
    end_date: normalizedType === 'once' ? '' : normalizedEndDateInput,
    map_name: task?.mapName ?? baseSchedule?.mapName ?? '',
    zone_id: task?.zoneId ?? baseSchedule?.zoneId ?? '',
    loops: task?.loops ?? baseSchedule?.loops ?? 1,
    plan_profile_name: task?.planProfileName ?? baseSchedule?.planProfileName ?? '',
    sys_profile_name: task?.sysProfileName ?? baseSchedule?.sysProfileName ?? '',
    clean_mode: normalizeCleanMode(task?.cleanMode ?? baseSchedule?.cleanMode ?? ''),
    return_to_dock_on_finish: finishBehavior.returnToDockOnFinish,
    repeat_after_full_charge: finishBehavior.repeatAfterFullCharge,
    last_fire_ts: baseSchedule?.lastFireTs ?? 0,
    last_done_ts: baseSchedule?.lastDoneTs ?? 0,
    last_status: baseSchedule?.lastStatus ?? '',
  } satisfies RosServiceRequest
}

const mockSchedules: ScheduleEntity[] = [
  {
    id: 'schedule_mock_once_001',
    taskId: 1,
    taskName: 'mock_daily_zone_a',
    enabled: true,
    type: 'once',
    dow: [],
    time: '09:30',
    at: '2026-03-24 09:30',
    timezone: 'Asia/Shanghai',
    startDate: '2026-03-24',
    endDate: '',
    mapName: 'mock_map',
    zoneId: 'zone-1',
    loops: 1,
    planProfileName: 'cover_standard',
    sysProfileName: 'default_sys',
    cleanMode: 'scrub',
    returnToDockOnFinish: true,
    repeatAfterFullCharge: false,
    lastFireTs: 0,
    lastDoneTs: 0,
    lastStatus: '',
    metadata: {
      schedule_id: 'schedule_mock_once_001',
      task_id: 1,
      type: 'once',
      at: '2026-03-24 09:30',
      timezone: 'Asia/Shanghai',
    },
    raw: {
      schedule_id: 'schedule_mock_once_001',
      task_id: 1,
      task_name: 'mock_daily_zone_a',
      enabled: true,
      type: 'once',
      dow: [],
      time: '09:30',
      at: '2026-03-24 09:30',
      timezone: 'Asia/Shanghai',
      start_date: '2026-03-24',
      end_date: '',
      map_name: 'mock_map',
      zone_id: 'zone-1',
      loops: 1,
      plan_profile_name: 'cover_standard',
      sys_profile_name: 'default_sys',
      clean_mode: 'scrub',
      return_to_dock_on_finish: true,
      repeat_after_full_charge: false,
      last_fire_ts: 0,
      last_done_ts: 0,
      last_status: '',
    },
  },
]

export async function fetchCleanSchedules() {
  if (USE_MOCK_DATA) {
    return mockSchedules
  }

  const payload = await callRosService({
    operation: SCHEDULE_OPERATIONS.getAll,
    schedule_id: '',
    task_id: 0,
    schedule: {},
    enabled_state: SCHEDULE_ENABLED_STATE.keep,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule list query returned an error.')
  }

  return normalizeScheduleList(payload)
}

export async function fetchCleanScheduleDetail(scheduleId: string, taskId = 0) {
  if (USE_MOCK_DATA) {
    return mockSchedules.find((schedule) => schedule.id === scheduleId) ?? null
  }

  const payload = await callRosService({
    operation: SCHEDULE_OPERATIONS.get,
    schedule_id: scheduleId.trim(),
    task_id: taskId,
    schedule: {},
    enabled_state: SCHEDULE_ENABLED_STATE.keep,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule detail query returned an error.')
  }

  return normalizeScheduleDetail(payload)
}

export async function addCleanSchedule(input: ScheduleDraftInput, task: TaskEntity | null) {
  if (USE_MOCK_DATA) {
    const schedule = normalizeScheduleEntity(buildScheduleRequest(input, task), 0)
    return { schedule, raw: schedule.raw }
  }

  const payload = await callRosService({
    operation: SCHEDULE_OPERATIONS.add,
    schedule_id: input.scheduleId.trim(),
    task_id: Math.max(0, Math.round(input.taskId)),
    enabled_state: input.enabled
      ? SCHEDULE_ENABLED_STATE.enable
      : SCHEDULE_ENABLED_STATE.disable,
    schedule: buildScheduleRequest(input, task),
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule add returned an error.')
  }

  return {
    schedule:
      normalizeScheduleDetail(payload) ??
      normalizeScheduleEntity(buildScheduleRequest(input, task), 0),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function modifyCleanSchedule(
  schedule: ScheduleEntity,
  input: ScheduleDraftInput,
  task: TaskEntity | null,
) {
  if (USE_MOCK_DATA) {
    const nextSchedule = normalizeScheduleEntity(
      buildScheduleRequest(input, task, schedule),
      0,
    )
    return { schedule: nextSchedule, raw: nextSchedule.raw }
  }

  const payload = await callRosService({
    operation: SCHEDULE_OPERATIONS.modify,
    schedule_id: schedule.id,
    task_id: Math.max(0, Math.round(input.taskId)),
    enabled_state: input.enabled
      ? SCHEDULE_ENABLED_STATE.enable
      : SCHEDULE_ENABLED_STATE.disable,
    schedule: buildScheduleRequest(
      {
        ...input,
        scheduleId: schedule.id,
      },
      task,
      schedule,
    ),
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule modify returned an error.')
  }

  return {
    schedule:
      normalizeScheduleDetail(payload) ??
      normalizeScheduleEntity(
        buildScheduleRequest(
          {
            ...input,
            scheduleId: schedule.id,
          },
          task,
          schedule,
        ),
        0,
      ),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function deleteCleanSchedule(scheduleId: string, taskId = 0) {
  if (USE_MOCK_DATA) {
    return { raw: {} }
  }

  const payload = await callRosService({
    operation: SCHEDULE_OPERATIONS.delete,
    schedule_id: scheduleId.trim(),
    task_id: taskId,
    schedule: {},
    enabled_state: SCHEDULE_ENABLED_STATE.keep,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Schedule delete returned an error.')
  }

  return {
    message: isRecord(payload) ? getResponseMessage(payload) ?? '' : '',
    raw: isRecord(payload) ? payload : {},
  }
}
