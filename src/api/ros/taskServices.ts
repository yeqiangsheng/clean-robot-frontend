import { getRosConnectionManager } from './client'
import { setRosDebugEvent } from './debug'
import { TASK_SERVICE } from './serviceNames'

import type { TaskDraftInput, TaskEntity } from '../../types/task'
import type { RosServiceRequest } from '../../types/ros'
import { normalizeCleanMode } from '../../utils/cleanMode'
import { normalizeTaskFinishBehavior } from '../../utils/taskFinishBehavior'

type JsonRecord = Record<string, unknown>

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

const TASK_SERVICE_TYPE = TASK_SERVICE.serviceType
const TASK_CANONICAL_SERVICE_NAME = TASK_SERVICE.canonicalName
const TASK_DEPRECATED_FALLBACK_SERVICE_NAME = TASK_SERVICE.deprecatedFallbackName
const TASK_OPERATIONS = {
  get: 0,
  add: 1,
  modify: 2,
  delete: 3,
  getAll: 4,
} as const

const TASK_ENABLED_STATE = {
  keep: 0,
  disable: 1,
  enable: 2,
} as const

const TASK_RETURN_TO_DOCK_STATE = {
  keep: 0,
  disable: 1,
  enable: 2,
} as const

const TASK_REPEAT_AFTER_FULL_CHARGE_STATE = {
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
      serviceType: TASK_SERVICE_TYPE,
      request: payload,
    })

  try {
    return await callService(TASK_CANONICAL_SERVICE_NAME)
  } catch (canonicalError) {
    setRosDebugEvent(`task:deprecated-fallback:${TASK_DEPRECATED_FALLBACK_SERVICE_NAME}`)

    try {
      return await callService(TASK_DEPRECATED_FALLBACK_SERVICE_NAME)
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : `Deprecated fallback task service ${TASK_DEPRECATED_FALLBACK_SERVICE_NAME} failed.`
      const normalizedFallbackError = new Error(fallbackMessage)

      if (canonicalError instanceof Error && canonicalError.message.trim().length > 0) {
        normalizedFallbackError.message = `${normalizedFallbackError.message} (canonical failure: ${canonicalError.message})`
      }

      throw normalizedFallbackError
    }
  }
}

function normalizeTaskEntity(record: JsonRecord, index: number): TaskEntity {
  const taskId = toNumber(pickValue(record, ['task_id', 'taskId', 'id']))
  const status = toNumber(pickValue(record, ['status', 'state']))
  const finishBehavior = normalizeTaskFinishBehavior({
    returnToDockOnFinish: toBoolean(
      pickValue(record, ['return_to_dock_on_finish', 'returnToDockOnFinish']),
    ),
    repeatAfterFullCharge: toBoolean(
      pickValue(record, ['repeat_after_full_charge', 'repeatAfterFullCharge']),
    ),
  })

  return {
    id: taskId ?? index + 1,
    name: pickString(record, ['name', 'task_name', 'display_name']) ?? `task-${index + 1}`,
    enabled: toBoolean(pickValue(record, ['enabled', 'is_enabled'])),
    status,
    mapName: pickString(record, ['map_name', 'mapName']) ?? '',
    zoneId: pickString(record, ['zone_id', 'zoneId']) ?? '',
    planProfileName:
      pickString(record, ['plan_profile_name', 'planProfileName']) ?? '',
    sysProfileName:
      pickString(record, ['sys_profile_name', 'sysProfileName']) ?? '',
    cleanMode: normalizeCleanMode(
      pickString(record, ['clean_mode', 'cleanMode', 'mode']),
    ),
    returnToDockOnFinish: finishBehavior.returnToDockOnFinish,
    repeatAfterFullCharge: finishBehavior.repeatAfterFullCharge,
    loops: toNumber(pickValue(record, ['loops', 'loop_count', 'loopCount'])),
    metadata: summarizeMetadata(record, []),
    raw: record,
  }
}

function normalizeTaskList(payload: unknown) {
  const records = Array.isArray(payload)
    ? payload.filter((item) => isRecord(item))
    : ((findFirstValue(
        payload,
        ['tasks', 'task_list', 'items', 'list', 'data'],
        (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
      ) as JsonRecord[] | null) ?? [])

  return records.map((record, index) => normalizeTaskEntity(record, index))
}

function normalizeTaskDetail(payload: unknown) {
  if (isRecord(payload) && isRecord(payload.task)) {
    return normalizeTaskEntity(payload.task, 0)
  }

  if (
    isRecord(payload) &&
    ['task_id', 'name', 'zone_id', 'plan_profile_name', 'sys_profile_name'].some(
      (key) => key in payload,
    )
  ) {
    return normalizeTaskEntity(payload, 0)
  }

  const fallback = findFirstValue(
    payload,
    ['task', 'tasks', 'task_list', 'items', 'list', 'data'],
    (value) => isRecord(value),
  )

  return isRecord(fallback) ? normalizeTaskEntity(fallback, 0) : null
}

function buildTaskRequest(input: TaskDraftInput, baseTask?: TaskEntity | null) {
  const baseRecord = isRecord(baseTask?.raw) ? baseTask.raw : {}
  const finishBehavior = normalizeTaskFinishBehavior(input)

  return {
    ...baseRecord,
    task_id: Math.max(0, Math.round(input.taskId)),
    name: input.name.trim(),
    enabled: input.enabled,
    status: Math.round(input.status),
    map_name: input.mapName.trim(),
    zone_id: input.zoneId.trim(),
    plan_profile_name: input.planProfileName.trim(),
    sys_profile_name: input.sysProfileName.trim(),
    clean_mode: normalizeCleanMode(input.cleanMode),
    return_to_dock_on_finish: finishBehavior.returnToDockOnFinish,
    repeat_after_full_charge: finishBehavior.repeatAfterFullCharge,
    loops: input.loops === null ? 1 : Math.max(1, Math.round(input.loops)),
  } satisfies RosServiceRequest
}

const mockTasks: TaskEntity[] = [
  {
    id: 1,
    name: 'mock_daily_zone_a',
    enabled: true,
    status: 0,
    mapName: 'mock_map',
    zoneId: 'zone-1',
    planProfileName: 'cover_standard',
    sysProfileName: 'default_sys',
    cleanMode: 'scrub',
    returnToDockOnFinish: true,
    repeatAfterFullCharge: false,
    loops: 1,
    metadata: {
      task_id: 1,
      name: 'mock_daily_zone_a',
      enabled: true,
      status: 0,
      map_name: 'mock_map',
      zone_id: 'zone-1',
      plan_profile_name: 'cover_standard',
      sys_profile_name: 'default_sys',
      clean_mode: 'scrub',
      return_to_dock_on_finish: true,
      repeat_after_full_charge: false,
      loops: 1,
    },
    raw: {
      task_id: 1,
      name: 'mock_daily_zone_a',
      enabled: true,
      status: 0,
      map_name: 'mock_map',
      zone_id: 'zone-1',
      plan_profile_name: 'cover_standard',
      sys_profile_name: 'default_sys',
      clean_mode: 'scrub',
      return_to_dock_on_finish: true,
      repeat_after_full_charge: false,
      loops: 1,
    },
  },
]

export async function fetchCleanTasks() {
  if (USE_MOCK_DATA) {
    return mockTasks
  }

  const payload = await callRosService({
    operation: TASK_OPERATIONS.getAll,
    task_id: 0,
    map_name: '',
    enabled_state: 0,
    return_to_dock_state: TASK_RETURN_TO_DOCK_STATE.keep,
    repeat_after_full_charge_state: TASK_REPEAT_AFTER_FULL_CHARGE_STATE.keep,
    task: {},
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Task list query returned an error.')
  }

  return normalizeTaskList(payload)
}

export async function fetchCleanTaskDetail(taskId: number) {
  if (USE_MOCK_DATA) {
    return mockTasks.find((task) => task.id === taskId) ?? null
  }

  const payload = await callRosService({
    operation: TASK_OPERATIONS.get,
    task_id: taskId,
    map_name: '',
    enabled_state: 0,
    return_to_dock_state: TASK_RETURN_TO_DOCK_STATE.keep,
    repeat_after_full_charge_state: TASK_REPEAT_AFTER_FULL_CHARGE_STATE.keep,
    task: {},
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Task detail query returned an error.')
  }

  return normalizeTaskDetail(payload)
}

export async function addCleanTask(input: TaskDraftInput) {
  const finishBehavior = normalizeTaskFinishBehavior(input)

  if (USE_MOCK_DATA) {
    const task = normalizeTaskEntity(buildTaskRequest({ ...input, ...finishBehavior }), 0)
    return { task, raw: task.raw }
  }

  const payload = await callRosService({
    operation: TASK_OPERATIONS.add,
    task_id: Math.max(0, Math.round(input.taskId)),
    map_name: input.mapName.trim(),
    enabled_state: input.enabled
      ? TASK_ENABLED_STATE.enable
      : TASK_ENABLED_STATE.disable,
    return_to_dock_state: finishBehavior.returnToDockOnFinish
      ? TASK_RETURN_TO_DOCK_STATE.enable
      : TASK_RETURN_TO_DOCK_STATE.disable,
    repeat_after_full_charge_state: finishBehavior.repeatAfterFullCharge
      ? TASK_REPEAT_AFTER_FULL_CHARGE_STATE.enable
      : TASK_REPEAT_AFTER_FULL_CHARGE_STATE.disable,
    task: buildTaskRequest(input),
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Task add returned an error.')
  }

  return {
    task: normalizeTaskDetail(payload) ?? normalizeTaskEntity(buildTaskRequest(input), 0),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function modifyCleanTask(task: TaskEntity, input: TaskDraftInput) {
  const finishBehavior = normalizeTaskFinishBehavior(input)

  if (USE_MOCK_DATA) {
    const nextTask = normalizeTaskEntity(
      buildTaskRequest({ ...input, ...finishBehavior }, task),
      0,
    )
    return { task: nextTask, raw: nextTask.raw }
  }

  const payload = await callRosService({
    operation: TASK_OPERATIONS.modify,
    task_id: task.id,
    map_name: input.mapName.trim(),
    enabled_state: input.enabled
      ? TASK_ENABLED_STATE.enable
      : TASK_ENABLED_STATE.disable,
    return_to_dock_state: finishBehavior.returnToDockOnFinish
      ? TASK_RETURN_TO_DOCK_STATE.enable
      : TASK_RETURN_TO_DOCK_STATE.disable,
    repeat_after_full_charge_state: finishBehavior.repeatAfterFullCharge
      ? TASK_REPEAT_AFTER_FULL_CHARGE_STATE.enable
      : TASK_REPEAT_AFTER_FULL_CHARGE_STATE.disable,
    task: buildTaskRequest(
      {
        ...input,
        taskId: task.id,
      },
      task,
    ),
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Task modify returned an error.')
  }

  return {
    task:
      normalizeTaskDetail(payload) ??
      normalizeTaskEntity(
        buildTaskRequest(
          {
            ...input,
            taskId: task.id,
          },
          task,
        ),
        0,
      ),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function deleteCleanTask(taskId: number) {
  if (USE_MOCK_DATA) {
    return { raw: {} }
  }

  const payload = await callRosService({
    operation: TASK_OPERATIONS.delete,
    task_id: taskId,
    map_name: '',
    enabled_state: 0,
    return_to_dock_state: TASK_RETURN_TO_DOCK_STATE.keep,
    repeat_after_full_charge_state: TASK_REPEAT_AFTER_FULL_CHARGE_STATE.keep,
    task: {},
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Task delete returned an error.')
  }

  return {
    raw: isRecord(payload) ? payload : {},
  }
}
