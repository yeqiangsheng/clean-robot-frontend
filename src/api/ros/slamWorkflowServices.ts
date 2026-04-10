import { getRosConnectionManager } from './client'

import type { RosServiceRequest } from '../../types/ros'
import type {
  JsonRecord,
  SlamCancelJobResponse,
  SlamSubmitJobResponse,
  SlamSyncRuntimeStateResponse,
  SlamWorkflowJob,
  SlamWorkflowState,
  SubmitSlamWorkflowRequest,
} from '../../types/slam-workflow'

export const SLAM_DEFAULT_ROBOT_ID = 'local_robot'
export const SLAM_DEFAULT_FRAME_ID = 'map'
export const SLAM_STATE_QUERY_INTERVAL_MS = 2_000
export const SLAM_JOB_POLL_INTERVAL_MS = 1_000
export const SLAM_JOB_TERMINAL_STATES = [
  'SUCCEEDED',
  'FAILED',
  'MANUAL_ASSIST_REQUIRED',
  'CANCELED',
] as const

const GET_STATE_SERVICE_NAME = '/slam_workflow/get_state'
const GET_STATE_SERVICE_TYPE = 'my_msg_srv/GetSlamWorkflowState'
const GET_JOB_SERVICE_NAME = '/slam_workflow/get_job'
const GET_JOB_SERVICE_TYPE = 'my_msg_srv/GetSlamWorkflowJob'
const CANCEL_JOB_SERVICE_NAME = '/slam_workflow/cancel_job'
const CANCEL_JOB_SERVICE_TYPE = 'my_msg_srv/CancelSlamWorkflowJob'
const SYNC_RUNTIME_STATE_SERVICE_NAME = '/slam_workflow/sync_runtime_state'
const SYNC_RUNTIME_STATE_SERVICE_TYPE = 'my_msg_srv/SyncSlamRuntimeState'
const SUBMIT_SERVICE_TYPE = 'my_msg_srv/SubmitSlamWorkflow'
const SUBMIT_PREPARE_FOR_TASK_SERVICE_NAME = '/slam_workflow/submit_prepare_for_task'
const SUBMIT_SWITCH_MAP_AND_LOCALIZE_SERVICE_NAME =
  '/slam_workflow/submit_switch_map_and_localize'
const SUBMIT_RELOCALIZE_SERVICE_NAME = '/slam_workflow/submit_relocalize'
const SUBMIT_START_MAPPING_SERVICE_NAME = '/slam_workflow/submit_start_mapping'
const SUBMIT_SAVE_MAP_SERVICE_NAME = '/slam_workflow/submit_save_map'
const SUBMIT_STOP_MAPPING_SERVICE_NAME = '/slam_workflow/submit_stop_mapping'

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

function isSlamJobTerminalState(jobState: string) {
  return SLAM_JOB_TERMINAL_STATES.includes(jobState as (typeof SLAM_JOB_TERMINAL_STATES)[number])
}

function normalizeSlamWorkflowStateRecord(record: JsonRecord): SlamWorkflowState {
  return {
    workflowState: pickString(record, ['workflow_state', 'workflowState']) || '--',
    workflowPhase: pickString(record, ['workflow_phase', 'workflowPhase']),
    busy: toBoolean(pickValue(record, ['busy'])) ?? false,
    activeJobId: pickString(record, ['active_job_id', 'activeJobId']),
    runtimeMode: pickString(record, ['runtime_mode', 'runtimeMode']),
    runtimeMapName: pickString(record, ['runtime_map_name', 'runtimeMapName']),
    runtimeMapId: pickString(record, ['runtime_map_id', 'runtimeMapId']),
    runtimeMapMd5: pickString(record, ['runtime_map_md5', 'runtimeMapMd5']),
    assetActiveMapName: pickString(record, ['asset_active_map_name', 'assetActiveMapName']),
    runtimeMapMatch: toBoolean(pickValue(record, ['runtime_map_match', 'runtimeMapMatch'])),
    localizationState: pickString(record, ['localization_state', 'localizationState']),
    localizationValid: toBoolean(pickValue(record, ['localization_valid', 'localizationValid'])),
    mappingSessionActive:
      toBoolean(pickValue(record, ['mapping_session_active', 'mappingSessionActive'])) ?? false,
    taskReady: toBoolean(pickValue(record, ['task_ready', 'taskReady'])) ?? false,
    manualAssistRequired:
      toBoolean(pickValue(record, ['manual_assist_required', 'manualAssistRequired'])) ?? false,
    progressText: pickString(record, ['progress_text', 'progressText']),
    blockingReason: pickString(record, ['blocking_reason', 'blockingReason']),
    lastErrorCode: pickString(record, ['last_error_code', 'lastErrorCode']),
    lastErrorMessage: pickString(record, ['last_error_message', 'lastErrorMessage']),
    updatedTs: toTimestamp(pickValue(record, ['updated_ts', 'updatedTs'])),
    raw: record,
  }
}

export function normalizeSlamWorkflowState(payload: unknown): SlamWorkflowState | null {
  const parsed = parseMaybeJson(payload)

  if (isRecord(parsed) && parsed.found === false) {
    return null
  }

  const stateRecord =
    (isRecord(parsed) && isRecord(parsed.state) ? parsed.state : null) ??
    findFirstRecord(parsed, [
      'workflow_state',
      'runtime_mode',
      'localization_state',
    ]) ??
    (isRecord(parsed) ? parsed : null)

  return stateRecord ? normalizeSlamWorkflowStateRecord(stateRecord) : null
}

function normalizeSlamWorkflowJobRecord(record: JsonRecord): SlamWorkflowJob {
  return {
    jobId: pickString(record, ['job_id', 'jobId']),
    jobType: pickString(record, ['job_type', 'jobType']),
    jobState: pickString(record, ['job_state', 'jobState']) || '--',
    workflowPhase: pickString(record, ['workflow_phase', 'workflowPhase']),
    progressPercent: toNumber(pickValue(record, ['progress_percent', 'progressPercent'])),
    progressText: pickString(record, ['progress_text', 'progressText']),
    resultSuccess: toBoolean(pickValue(record, ['result_success', 'resultSuccess'])),
    resultCode: pickString(record, ['result_code', 'resultCode']),
    resultMessage: pickString(record, ['result_message', 'resultMessage']),
    runtimeMapName: pickString(record, ['runtime_map_name', 'runtimeMapName']),
    runtimeMapMatch: toBoolean(pickValue(record, ['runtime_map_match', 'runtimeMapMatch'])),
    localizationState: pickString(record, ['localization_state', 'localizationState']),
    localizationValid: toBoolean(pickValue(record, ['localization_valid', 'localizationValid'])),
    manualAssistRequired:
      toBoolean(pickValue(record, ['manual_assist_required', 'manualAssistRequired'])) ?? false,
    createdTs: toTimestamp(pickValue(record, ['created_ts', 'createdTs'])),
    updatedTs: toTimestamp(pickValue(record, ['updated_ts', 'updatedTs'])),
    finishedTs: toTimestamp(pickValue(record, ['finished_ts', 'finishedTs'])),
    raw: record,
  }
}

export function normalizeSlamWorkflowJob(payload: unknown): SlamWorkflowJob | null {
  const parsed = parseMaybeJson(payload)

  if (isRecord(parsed) && parsed.found === false) {
    return null
  }

  const jobRecord =
    findFirstRecord(parsed, ['job_id', 'job_state', 'job_type']) ??
    (isRecord(parsed) ? parsed : null)

  return jobRecord ? normalizeSlamWorkflowJobRecord(jobRecord) : null
}

function normalizeSubmitRequest(
  request: SubmitSlamWorkflowRequest,
): RosServiceRequest {
  return {
    robot_id: request.robotId ?? SLAM_DEFAULT_ROBOT_ID,
    map_name: request.mapName ?? '',
    frame_id: request.frameId ?? SLAM_DEFAULT_FRAME_ID,
    has_initial_pose: request.hasInitialPose ?? false,
    initial_pose_x: request.initialPoseX ?? 0,
    initial_pose_y: request.initialPoseY ?? 0,
    initial_pose_yaw: request.initialPoseYaw ?? 0,
    save_map_name: request.saveMapName ?? '',
    include_unfinished_submaps: request.includeUnfinishedSubmaps ?? false,
    set_active_on_save: request.setActiveOnSave ?? true,
    switch_to_localization_after_save:
      request.switchToLocalizationAfterSave ?? false,
    relocalize_after_switch: request.relocalizeAfterSwitch ?? false,
  }
}

async function callRosService<TResponse extends JsonRecord>({
  serviceName,
  serviceType,
  request,
}: {
  serviceName: string
  serviceType: string
  request: RosServiceRequest
}) {
  const client = getRosConnectionManager()

  return client.callService<RosServiceRequest, TResponse>({
    serviceName,
    serviceType,
    request,
  })
}

function normalizeSubmitJobResponse(payload: JsonRecord): SlamSubmitJobResponse {
  return {
    accepted: toBoolean(pickValue(payload, ['accepted'])) ?? false,
    message: pickString(payload, ['message']),
    jobId: pickString(payload, ['job_id', 'jobId']),
    jobType: pickString(payload, ['job_type', 'jobType']),
    workflowState: pickString(payload, ['workflow_state', 'workflowState']),
    manualAssistRequired:
      toBoolean(pickValue(payload, ['manual_assist_required', 'manualAssistRequired'])) ?? false,
    raw: payload,
  }
}

function normalizeCancelJobResponse(payload: JsonRecord): SlamCancelJobResponse {
  return {
    success: toBoolean(pickValue(payload, ['success'])) ?? false,
    message: pickString(payload, ['message']),
    jobState: pickString(payload, ['job_state', 'jobState']),
    raw: payload,
  }
}

function normalizeSyncRuntimeStateResponse(payload: JsonRecord): SlamSyncRuntimeStateResponse {
  return {
    success: toBoolean(pickValue(payload, ['success'])) ?? false,
    message: pickString(payload, ['message']),
    state: normalizeSlamWorkflowState(payload.state),
    raw: payload,
  }
}

export async function getSlamWorkflowState(robotId = SLAM_DEFAULT_ROBOT_ID) {
  const payload = await callRosService<JsonRecord>({
    serviceName: GET_STATE_SERVICE_NAME,
    serviceType: GET_STATE_SERVICE_TYPE,
    request: {
      robot_id: robotId,
    },
  })

  return normalizeSlamWorkflowState(payload)
}

export async function syncSlamRuntimeState(robotId = SLAM_DEFAULT_ROBOT_ID) {
  const payload = await callRosService<JsonRecord>({
    serviceName: SYNC_RUNTIME_STATE_SERVICE_NAME,
    serviceType: SYNC_RUNTIME_STATE_SERVICE_TYPE,
    request: {
      robot_id: robotId,
    },
  })

  return normalizeSyncRuntimeStateResponse(payload)
}

export async function getSlamWorkflowJob(jobId: string) {
  const payload = await callRosService<JsonRecord>({
    serviceName: GET_JOB_SERVICE_NAME,
    serviceType: GET_JOB_SERVICE_TYPE,
    request: {
      job_id: jobId,
    },
  })

  return normalizeSlamWorkflowJob(payload)
}

export async function cancelSlamWorkflowJob(jobId: string) {
  const payload = await callRosService<JsonRecord>({
    serviceName: CANCEL_JOB_SERVICE_NAME,
    serviceType: CANCEL_JOB_SERVICE_TYPE,
    request: {
      job_id: jobId,
    },
  })

  return normalizeCancelJobResponse(payload)
}

async function submitWorkflowAction(
  serviceName: string,
  request: SubmitSlamWorkflowRequest,
) {
  const payload = await callRosService<JsonRecord>({
    serviceName,
    serviceType: SUBMIT_SERVICE_TYPE,
    request: normalizeSubmitRequest(request),
  })

  return normalizeSubmitJobResponse(payload)
}

export function submitPrepareForTask(request: SubmitSlamWorkflowRequest) {
  return submitWorkflowAction(SUBMIT_PREPARE_FOR_TASK_SERVICE_NAME, request)
}

export function submitSwitchMapAndLocalize(request: SubmitSlamWorkflowRequest) {
  return submitWorkflowAction(SUBMIT_SWITCH_MAP_AND_LOCALIZE_SERVICE_NAME, request)
}

export function submitRelocalize(request: SubmitSlamWorkflowRequest) {
  return submitWorkflowAction(SUBMIT_RELOCALIZE_SERVICE_NAME, request)
}

export function submitStartMapping(request: SubmitSlamWorkflowRequest) {
  return submitWorkflowAction(SUBMIT_START_MAPPING_SERVICE_NAME, request)
}

export function submitSaveMap(request: SubmitSlamWorkflowRequest) {
  return submitWorkflowAction(SUBMIT_SAVE_MAP_SERVICE_NAME, request)
}

export function submitStopMapping(request: SubmitSlamWorkflowRequest) {
  return submitWorkflowAction(SUBMIT_STOP_MAPPING_SERVICE_NAME, request)
}

export function formatSlamRosserviceCommand(
  serviceName: string,
  request: SubmitSlamWorkflowRequest,
) {
  const normalizedRequest = normalizeSubmitRequest(request)
  return `rosservice call ${serviceName} '${JSON.stringify(normalizedRequest)}'`
}

export { isSlamJobTerminalState }
