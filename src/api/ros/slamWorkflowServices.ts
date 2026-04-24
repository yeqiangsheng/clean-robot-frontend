import { getRosConnectionManager } from './client'
import { setRosDebugEvent } from './debug'
import {
  SLAM_JOB_QUERY_CONTRACT,
  SLAM_STATUS_QUERY_CONTRACT,
} from './queryContracts'
import { callAppFirstReadQueryService } from './readQueryFallback'
import {
  SLAM_SUBMIT_SERVICE,
  SLAM_SWITCH_MAP_FALLBACK_SERVICE,
} from './serviceNames'

import type { RosServiceRequest } from '../../types/ros'
import type {
  JsonRecord,
  SlamActionKind,
  SlamSubmitJobResponse,
  SlamWorkflowJob,
  SlamWorkflowState,
  SubmitSlamWorkflowRequest,
} from '../../types/slam-workflow'

export const SLAM_DEFAULT_ROBOT_ID = 'local_robot'

const CANONICAL_SLAM_OPERATIONS = {
  getStatus: 0,
  switchMap: 7,
  restartLocalization: 8,
  startMapping: 3,
  saveMapping: 4,
  stopMapping: 5,
  prepareForTask: 6,
  verifyMapRevision: 9,
  activateMapRevision: 10,
} as const

const DEPRECATED_SLAM_OPERATIONS = {
  switchMap: 1,
  restartLocalization: 2,
  startMapping: 3,
  saveMapping: 4,
  stopMapping: 5,
} as const

const SUBMIT_SLAM_COMMAND_SERVICE_NAME = SLAM_SUBMIT_SERVICE.canonicalName
const SUBMIT_SLAM_COMMAND_SERVICE_TYPE = SLAM_SUBMIT_SERVICE.serviceType
const SUBMIT_SLAM_COMMAND_DEPRECATED_FALLBACK_SERVICE_NAME =
  SLAM_SUBMIT_SERVICE.deprecatedFallbackName
const SUBMIT_SLAM_COMMAND_DEPRECATED_FALLBACK_SERVICE_TYPE =
  SLAM_SUBMIT_SERVICE.serviceType
const SWITCH_MAP_DEPRECATED_FALLBACK_SERVICE_NAME =
  SLAM_SWITCH_MAP_FALLBACK_SERVICE.serviceName
const SWITCH_MAP_DEPRECATED_FALLBACK_SERVICE_TYPE =
  SLAM_SWITCH_MAP_FALLBACK_SERVICE.serviceType

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
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
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

    if (['true', '1', 'yes'].includes(normalized)) {
      return true
    }

    if (['false', '0', 'no'].includes(normalized)) {
      return false
    }
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  return null
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function toTimestamp(value: unknown): number | null {
  if (isRecord(value)) {
    const secs = toNumber(value.secs)
    const nsecs = toNumber(value.nsecs) ?? 0

    if (secs !== null) {
      return secs * 1000 + Math.floor(nsecs / 1_000_000)
    }
  }

  const numeric = toNumber(value)

  if (numeric !== null) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

function findFirstRecord(
  root: unknown,
  candidateKeys: string[],
  maxDepth = 5,
): JsonRecord | null {
  const queue: Array<{ value: unknown; depth: number }> = [
    { value: parseMaybeJson(root), depth: 0 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      break
    }

    const value = parseMaybeJson(current.value)

    if (isRecord(value)) {
      if (candidateKeys.every((key) => key in value)) {
        return value
      }

      if (current.depth >= maxDepth) {
        continue
      }

      Object.values(value).forEach((child) => {
        queue.push({
          value: child,
          depth: current.depth + 1,
        })
      })
      continue
    }

    if (Array.isArray(value) && current.depth < maxDepth) {
      value.forEach((child) => {
        queue.push({
          value: child,
          depth: current.depth + 1,
        })
      })
    }
  }

  return null
}

function callRosService(request: {
  serviceName: string
  serviceType: string
  payload: RosServiceRequest
}) {
  const client = getRosConnectionManager()
  return client.callService<RosServiceRequest, JsonRecord>({
    serviceName: request.serviceName,
    serviceType: request.serviceType,
    request: request.payload,
  })
}

function normalizeSlamWorkflowStateRecord(record: JsonRecord): SlamWorkflowState {
  return {
    desiredMode: pickString(record, ['desired_mode', 'desiredMode']),
    currentMode: pickString(record, ['current_mode', 'currentMode']),
    activeMapName: pickString(record, ['active_map_name', 'activeMapName']),
    activeMapId: pickString(record, ['active_map_id', 'activeMapId']),
    activeMapMd5: pickString(record, ['active_map_md5', 'activeMapMd5']),
    runtimeMapName: pickString(record, ['runtime_map_name', 'runtimeMapName']),
    runtimeMapId: pickString(record, ['runtime_map_id', 'runtimeMapId']),
    runtimeMapMd5: pickString(record, ['runtime_map_md5', 'runtimeMapMd5']),
    localizationState: pickString(record, ['localization_state', 'localizationState']),
    localizationValid: toBoolean(pickValue(record, ['localization_valid', 'localizationValid'])),
    runtimeMapReady: toBoolean(pickValue(record, ['runtime_map_ready', 'runtimeMapReady'])),
    activeMapMatch: toBoolean(pickValue(record, ['active_map_match', 'activeMapMatch'])),
    lifecycleState: pickString(record, ['lifecycle_state', 'lifecycleState']),
    activeJobId: pickString(record, ['active_job_id', 'activeJobId']),
    activeJobStatus: pickString(record, ['active_job_status', 'activeJobStatus']),
    activeJobPhase: pickString(record, ['active_job_phase', 'activeJobPhase']),
    activeJobProgress01: toNumber(
      pickValue(record, ['active_job_progress_0_1', 'activeJobProgress01']),
    ),
    mapTopicFresh: toBoolean(pickValue(record, ['map_topic_fresh', 'mapTopicFresh'])),
    mapAgeS: toNumber(pickValue(record, ['map_age_s', 'mapAgeS'])),
    trackedPoseFresh: toBoolean(
      pickValue(record, ['tracked_pose_fresh', 'trackedPoseFresh']),
    ),
    trackedPoseAgeS: toNumber(
      pickValue(record, ['tracked_pose_age_s', 'trackedPoseAgeS']),
    ),
    missionState: pickString(record, ['mission_state', 'missionState']),
    phase: pickString(record, ['phase']),
    publicState: pickString(record, ['public_state', 'publicState']),
    executorState: pickString(record, ['executor_state', 'executorState']),
    taskRunning: toBoolean(pickValue(record, ['task_running', 'taskRunning'])),
    canRestartLocalization:
      toBoolean(
        pickValue(record, [
          'can_restart_localization',
          'canRestartLocalization',
          'can_relocalize',
          'canRelocalize',
        ]),
      ) ?? false,
    canSwitchMap:
      toBoolean(
        pickValue(record, [
          'can_switch_map',
          'canSwitchMap',
          'can_switch_map_and_localize',
          'canSwitchMapAndLocalize',
        ]),
      ) ?? false,
    canStartMapping:
      toBoolean(pickValue(record, ['can_start_mapping', 'canStartMapping'])) ?? false,
    canSaveMapping:
      toBoolean(pickValue(record, ['can_save_mapping', 'canSaveMapping'])) ?? false,
    canStopMapping:
      toBoolean(pickValue(record, ['can_stop_mapping', 'canStopMapping'])) ?? false,
    lastErrorCode: pickString(record, ['last_error_code', 'lastErrorCode']),
    lastErrorMessage: pickString(record, ['last_error_msg', 'lastErrorMsg', 'last_error_message']),
    blockingReasons: toStringArray(
      pickValue(record, ['blocking_reasons', 'blockingReasons']),
    ),
    warnings: toStringArray(pickValue(record, ['warnings'])),
    stampMs: toTimestamp(pickValue(record, ['stamp'])),
    raw: record,
  }
}

export function normalizeSlamWorkflowState(payload: unknown): SlamWorkflowState | null {
  const parsed = parseMaybeJson(payload)

  const stateRecord =
    (isRecord(parsed) && isRecord(parsed.state) ? parsed.state : null) ??
    findFirstRecord(parsed, ['current_mode', 'localization_state', 'active_job_id']) ??
    (isRecord(parsed) ? parsed : null)

  return stateRecord ? normalizeSlamWorkflowStateRecord(stateRecord) : null
}

function normalizeSlamWorkflowJobRecord(record: JsonRecord): SlamWorkflowJob {
  return {
    jobId: pickString(record, ['job_id', 'jobId']),
    robotId: pickString(record, ['robot_id', 'robotId']),
    operation: toNumber(pickValue(record, ['operation'])),
    operationName: pickString(record, ['operation_name', 'operationName']),
    requestedMapName: pickString(record, ['requested_map_name', 'requestedMapName']),
    resolvedMapName: pickString(record, ['resolved_map_name', 'resolvedMapName']),
    setActive: toBoolean(pickValue(record, ['set_active', 'setActive'])),
    description: pickString(record, ['description']),
    status: pickString(record, ['status']) || '--',
    phase: pickString(record, ['phase']),
    progress01: toNumber(pickValue(record, ['progress_0_1', 'progress01'])),
    done: toBoolean(pickValue(record, ['done'])) ?? false,
    success: toBoolean(pickValue(record, ['success'])),
    errorCode: pickString(record, ['error_code', 'errorCode']),
    message: pickString(record, ['message']),
    currentMode: pickString(record, ['current_mode', 'currentMode']),
    localizationState: pickString(record, ['localization_state', 'localizationState']),
    createdAtMs: toTimestamp(pickValue(record, ['created_at', 'createdAt'])),
    startedAtMs: toTimestamp(pickValue(record, ['started_at', 'startedAt'])),
    finishedAtMs: toTimestamp(pickValue(record, ['finished_at', 'finishedAt'])),
    updatedAtMs: toTimestamp(pickValue(record, ['updated_at', 'updatedAt'])),
    raw: record,
  }
}

export function normalizeSlamWorkflowJob(payload: unknown): SlamWorkflowJob | null {
  const parsed = parseMaybeJson(payload)

  if (isRecord(parsed) && parsed.found === false) {
    return null
  }

  const jobRecord =
    (isRecord(parsed) && isRecord(parsed.job) ? parsed.job : null) ??
    findFirstRecord(parsed, ['job_id', 'status', 'operation_name']) ??
    (isRecord(parsed) ? parsed : null)

  return jobRecord ? normalizeSlamWorkflowJobRecord(jobRecord) : null
}

function getOperationForAction(
  actionKind: SlamActionKind,
  useDeprecatedFallback = false,
) {
  const operations = useDeprecatedFallback
    ? DEPRECATED_SLAM_OPERATIONS
    : CANONICAL_SLAM_OPERATIONS

  switch (actionKind) {
    case 'switch_map':
      return operations.switchMap
    case 'relocalize':
    case 'restart_localization':
      return operations.restartLocalization
    case 'start_mapping':
      return operations.startMapping
    case 'save_mapping':
      return operations.saveMapping
    case 'stop_mapping':
      return operations.stopMapping
    default:
      return null
  }
}

export function normalizeSubmitJobResponse(payload: JsonRecord): SlamSubmitJobResponse {
  return {
    accepted: Boolean(toBoolean(pickValue(payload, ['accepted']))),
    message: pickString(payload, ['message']),
    errorCode: pickString(payload, ['error_code', 'errorCode']),
    jobId: pickString(payload, ['job_id', 'jobId']),
    operation: toNumber(pickValue(payload, ['operation'])),
    mapName: pickString(payload, ['map_name', 'mapName']),
    job: normalizeSlamWorkflowJob(payload.job),
    raw: payload,
  }
}

function buildSubmitSlamCommandPayload(
  actionKind: SlamActionKind,
  request: SubmitSlamWorkflowRequest = {},
  useDeprecatedFallback = false,
) {
  const operation = getOperationForAction(actionKind, useDeprecatedFallback)

  if (operation === null) {
    throw new Error(`Unsupported long-running SLAM action: ${String(actionKind)}`)
  }

  const basePayload = {
    operation,
    robot_id: request.robotId ?? SLAM_DEFAULT_ROBOT_ID,
    map_name: request.mapName?.trim() ?? '',
    set_active: request.setActive ?? true,
    description: request.description?.trim() ?? '',
  } satisfies RosServiceRequest

  if (useDeprecatedFallback && actionKind === 'switch_map') {
    return {
      ...basePayload,
      refresh_map_identity: request.refreshMapIdentity ?? false,
      restart_localization_after_switch: request.restartLocalizationAfterSwitch ?? true,
    } satisfies RosServiceRequest
  }

  return basePayload
}

function normalizeErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return fallbackMessage
}

async function callDeprecatedSwitchMapFallback(request: SubmitSlamWorkflowRequest = {}) {
  const payload = await callRosService({
    serviceName: SWITCH_MAP_DEPRECATED_FALLBACK_SERVICE_NAME,
    serviceType: SWITCH_MAP_DEPRECATED_FALLBACK_SERVICE_TYPE,
    payload: {
      operation: DEPRECATED_SLAM_OPERATIONS.switchMap,
      robot_id: request.robotId ?? SLAM_DEFAULT_ROBOT_ID,
      map_name: request.mapName?.trim() ?? '',
      refresh_map_identity: request.refreshMapIdentity ?? false,
      restart_localization_after_switch:
        request.restartLocalizationAfterSwitch ?? true,
      set_active: request.setActive ?? true,
      description: request.description?.trim() ?? '',
    },
  })

  return {
    accepted: Boolean(toBoolean(pickValue(payload, ['success']))),
    message: pickString(payload, ['message']),
    errorCode: pickString(payload, ['error_code', 'errorCode']),
    jobId: '',
    operation: DEPRECATED_SLAM_OPERATIONS.switchMap,
    mapName: pickString(payload, ['map_name', 'mapName']) || request.mapName?.trim() || '',
    job: null,
    raw: isRecord(payload) ? payload : {},
  } satisfies SlamSubmitJobResponse
}

export async function getSlamWorkflowState(
  robotId = SLAM_DEFAULT_ROBOT_ID,
  refreshMapIdentity = false,
) {
  return callAppFirstReadQueryService({
    contract: SLAM_STATUS_QUERY_CONTRACT,
    request: {
      robot_id: robotId,
      refresh_map_identity: refreshMapIdentity,
    },
    evaluateAppResponse: (payload) => {
      const normalized = normalizeSlamWorkflowState(payload)

      return normalized
        ? {
            kind: 'success',
            value: normalized,
          }
        : {
            kind: 'fallback',
            reason: 'App SLAM status query returned no usable workflow state.',
          }
    },
    mapLegacyResponse: (payload) => {
      const normalized = normalizeSlamWorkflowState(payload)

      if (!normalized) {
        throw new Error('Legacy SLAM status query returned no usable workflow state.')
      }

      return normalized
    },
  })
}

export async function getSlamWorkflowJob(
  jobId: string,
  robotId = SLAM_DEFAULT_ROBOT_ID,
) {
  return callAppFirstReadQueryService({
    contract: SLAM_JOB_QUERY_CONTRACT,
    request: {
      job_id: jobId.trim(),
      robot_id: robotId,
    },
    evaluateAppResponse: (payload) => {
      if (isRecord(payload) && payload.found === false) {
        return {
          kind: 'success',
          value: null,
        }
      }

      const normalized = normalizeSlamWorkflowJob(payload)

      return normalized
        ? {
            kind: 'success',
            value: normalized,
          }
        : {
            kind: 'fallback',
            reason: 'App SLAM job query returned no usable job payload.',
          }
    },
    mapLegacyResponse: (payload) => {
      if (isRecord(payload) && payload.found === false) {
        return null
      }

      const normalized = normalizeSlamWorkflowJob(payload)

      if (!normalized) {
        throw new Error('Legacy SLAM job query returned no usable job payload.')
      }

      return normalized
    },
  })
}

export async function submitSlamCommand(
  actionKind: SlamActionKind,
  request: SubmitSlamWorkflowRequest = {},
) {
  const payload = buildSubmitSlamCommandPayload(actionKind, request)

  try {
    const response = await callRosService({
      serviceName: SUBMIT_SLAM_COMMAND_SERVICE_NAME,
      serviceType: SUBMIT_SLAM_COMMAND_SERVICE_TYPE,
      payload,
    })

    return normalizeSubmitJobResponse(response)
  } catch (canonicalError) {
    if (actionKind === 'switch_map') {
      setRosDebugEvent(
        `slam:deprecated-fallback:${SWITCH_MAP_DEPRECATED_FALLBACK_SERVICE_NAME}`,
      )

      try {
        return await callDeprecatedSwitchMapFallback(request)
      } catch (fallbackError) {
        throw new Error(
          `${normalizeErrorMessage(
            fallbackError,
            `Deprecated fallback switch-map service ${SWITCH_MAP_DEPRECATED_FALLBACK_SERVICE_NAME} failed.`,
          )} (canonical failure: ${normalizeErrorMessage(
            canonicalError,
            `Canonical submit service ${SUBMIT_SLAM_COMMAND_SERVICE_NAME} failed.`,
          )})`,
        )
      }
    }

    setRosDebugEvent(
      `slam:deprecated-fallback:${SUBMIT_SLAM_COMMAND_DEPRECATED_FALLBACK_SERVICE_NAME}`,
    )

    try {
      const response = await callRosService({
        serviceName: SUBMIT_SLAM_COMMAND_DEPRECATED_FALLBACK_SERVICE_NAME,
        serviceType: SUBMIT_SLAM_COMMAND_DEPRECATED_FALLBACK_SERVICE_TYPE,
        payload: buildSubmitSlamCommandPayload(actionKind, request, true),
      })

      return normalizeSubmitJobResponse(response)
    } catch (fallbackError) {
      throw new Error(
        `${normalizeErrorMessage(
          fallbackError,
          `Deprecated fallback submit service ${SUBMIT_SLAM_COMMAND_DEPRECATED_FALLBACK_SERVICE_NAME} failed.`,
        )} (canonical failure: ${normalizeErrorMessage(
          canonicalError,
          `Canonical submit service ${SUBMIT_SLAM_COMMAND_SERVICE_NAME} failed.`,
        )})`,
      )
    }
  }
}

export function submitSwitchMap(request: SubmitSlamWorkflowRequest) {
  return submitSlamCommand('switch_map', request)
}

export function submitRelocalize(request: SubmitSlamWorkflowRequest) {
  return submitSlamCommand('relocalize', request)
}

export function submitStartMapping(request: SubmitSlamWorkflowRequest) {
  return submitSlamCommand('start_mapping', request)
}

export function submitSaveMapping(request: SubmitSlamWorkflowRequest) {
  return submitSlamCommand('save_mapping', request)
}

export function submitStopMapping(request: SubmitSlamWorkflowRequest) {
  return submitSlamCommand('stop_mapping', request)
}
