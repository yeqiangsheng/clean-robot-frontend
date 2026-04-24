const CLEAN_MODE_ALIASES = {
  scrub: 'scrub',
  dry: 'dry',
  vacuum: 'vacuum',
  inspect: 'inspect',
  inspection: 'inspect',
  patrol: 'inspect',
  巡检: 'inspect',
  eco_inspect: 'inspect',
  inspect_eco: 'inspect',
  vac: 'vacuum',
  vacuum_only: 'vacuum',
  suction: 'vacuum',
  suction_only: 'vacuum',
  sweep: 'dry',
  sweep_dry: 'dry',
  dry_sweep: 'dry',
  wet: 'scrub',
  wash: 'scrub',
  wet_scrub: 'scrub',
  deep: 'scrub',
  deep_clean: 'scrub',
  coverage: 'scrub',
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseMaybeJson(value) {
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

export function pickValue(record, keys) {
  for (const key of keys) {
    if (key in record) {
      return parseMaybeJson(record[key])
    }
  }

  return null
}

export function pickString(record, keys) {
  const value = pickValue(record, keys)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

export function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function toBoolean(value) {
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

export function toStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

export function toNumberArray(value) {
  const parsed = parseMaybeJson(value)

  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed.map((item) => toNumber(item)).filter((item) => item !== null)
}

export function findFirstValue(root, candidateKeys, predicate, maxDepth = 5) {
  const queue = [{ value: parseMaybeJson(root), depth: 0 }]

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
      for (const item of value) {
        queue.push({ value: item, depth: current.depth + 1 })
      }
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

      for (const child of Object.values(value)) {
        queue.push({ value: child, depth: current.depth + 1 })
      }
    }
  }

  return null
}

export function findFirstRecord(root, candidateKeys, maxDepth = 5) {
  const queue = [{ value: parseMaybeJson(root), depth: 0 }]

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

      if (current.depth < maxDepth) {
        for (const child of Object.values(value)) {
          queue.push({ value: child, depth: current.depth + 1 })
        }
      }

      continue
    }

    if (Array.isArray(value) && current.depth < maxDepth) {
      for (const child of value) {
        queue.push({ value: child, depth: current.depth + 1 })
      }
    }
  }

  return null
}

export function summarizeMetadata(record, omitKeys = []) {
  const summary = {}

  for (const [key, value] of Object.entries(record)) {
    if (omitKeys.includes(key)) {
      continue
    }

    if (Array.isArray(value) && value.length > 12) {
      summary[key] = `[${value.length} items]`
      continue
    }

    if (isRecord(value) && Object.keys(value).length > 12) {
      summary[key] = `{${Object.keys(value).length} keys}`
      continue
    }

    summary[key] = value
  }

  return summary
}

export function normalizeCleanMode(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return CLEAN_MODE_ALIASES[normalized] ?? 'scrub'
}

export function normalizeCleanModeList(values) {
  const seen = new Set()
  const result = []

  for (const rawValue of values) {
    const normalizedKey =
      typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : ''
    const normalized = CLEAN_MODE_ALIASES[normalizedKey]

    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export function normalizeTaskFinishBehavior(state) {
  const repeatAfterFullCharge = Boolean(state?.repeatAfterFullCharge)
  const returnToDockOnFinish = repeatAfterFullCharge
    ? true
    : Boolean(state?.returnToDockOnFinish)

  return {
    returnToDockOnFinish,
    repeatAfterFullCharge,
  }
}

export function delay(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

export function getResponseSuccess(payload) {
  return isRecord(payload) && typeof payload.success === 'boolean' ? payload.success : null
}

export function getResponseMessage(payload) {
  return isRecord(payload) && typeof payload.message === 'string' ? payload.message : null
}

export function getResponseErrorCode(payload) {
  return isRecord(payload) &&
    typeof payload.error_code === 'string' &&
    payload.error_code.trim().length > 0
    ? payload.error_code.trim()
    : null
}

export function createServiceError(payload, fallbackMessage) {
  const error = new Error(getResponseMessage(payload) ?? fallbackMessage)
  error.code = getResponseErrorCode(payload)
  return error
}

export function toTimestamp(value) {
  if (isRecord(value)) {
    const secs = toNumber(value.secs)
    const nsecs = toNumber(value.nsecs) ?? 0
    if (secs !== null) {
      return secs * 1000 + Math.floor(nsecs / 1000000)
    }
  }

  const numeric = toNumber(value)
  if (numeric !== null) {
    return numeric > 1000000000000 ? numeric : numeric * 1000
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

export function deriveTimeFromAt(at) {
  const trimmed = at.trim()
  return /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed) ? trimmed.slice(-5) : ''
}

export function deriveDateFromAt(at) {
  const trimmed = at.trim()
  return /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed) ? trimmed.slice(0, 10) : ''
}

export function normalizeTaskEntity(record, index) {
  const taskId = toNumber(pickValue(record, ['task_id', 'taskId', 'id']))
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
    name: pickString(record, ['name', 'task_name', 'display_name']) || `task-${index + 1}`,
    enabled: Boolean(toBoolean(pickValue(record, ['enabled', 'is_enabled']))),
    status: toNumber(pickValue(record, ['status', 'state'])),
    mapName: pickString(record, ['map_name', 'mapName']),
    zoneId: pickString(record, ['zone_id', 'zoneId']),
    planProfileName: pickString(record, ['plan_profile_name', 'planProfileName']),
    sysProfileName: pickString(record, ['sys_profile_name', 'sysProfileName']),
    cleanMode: normalizeCleanMode(pickString(record, ['clean_mode', 'cleanMode', 'mode'])),
    returnToDockOnFinish: finishBehavior.returnToDockOnFinish,
    repeatAfterFullCharge: finishBehavior.repeatAfterFullCharge,
    loops: toNumber(pickValue(record, ['loops', 'loop_count', 'loopCount'])),
    metadata: summarizeMetadata(record),
    raw: record,
  }
}

export function normalizeTaskList(payload) {
  const records = Array.isArray(payload)
    ? payload.filter((item) => isRecord(item))
    : findFirstValue(
        payload,
        ['tasks', 'task_list', 'items', 'list', 'data'],
        (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
      ) ?? []

  return records.map((record, index) => normalizeTaskEntity(record, index))
}

export function normalizeMapCatalogEntry(record) {
  const mapName = pickString(record, ['map_name', 'mapName', 'name'])

  return {
    mapName,
    displayName: pickString(record, ['display_name', 'displayName']) || mapName,
    enabled: Boolean(toBoolean(pickValue(record, ['enabled']))),
    isActive: Boolean(toBoolean(pickValue(record, ['is_active', 'isActive']))),
    mapId: pickString(record, ['map_id', 'mapId', 'id']),
    mapMd5: pickString(record, ['map_md5', 'mapMd5']),
    raw: record,
  }
}

export function normalizeMapCatalogList(payload) {
  const records = Array.isArray(payload)
    ? payload.filter((item) => isRecord(item))
    : findFirstValue(
        payload,
        ['maps', 'map_list', 'items', 'list', 'data'],
        (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
      ) ?? []

  return records
    .map((record) => normalizeMapCatalogEntry(record))
    .filter((entry) => entry.mapName.length > 0)
}

export function normalizeTaskDetail(payload) {
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

export function buildTaskRequest(input, baseTask = null) {
  const baseRecord = isRecord(baseTask?.raw) ? baseTask.raw : {}
  const finishBehavior = normalizeTaskFinishBehavior(input)

  return {
    ...baseRecord,
    task_id: Math.max(0, Math.round(input.taskId)),
    name: input.name.trim(),
    enabled: Boolean(input.enabled),
    status: Math.round(input.status),
    map_name: input.mapName.trim(),
    zone_id: input.zoneId.trim(),
    plan_profile_name: input.planProfileName.trim(),
    sys_profile_name: input.sysProfileName.trim(),
    clean_mode: normalizeCleanMode(input.cleanMode),
    return_to_dock_on_finish: finishBehavior.returnToDockOnFinish,
    repeat_after_full_charge: finishBehavior.repeatAfterFullCharge,
    loops: input.loops === null ? 1 : Math.max(1, Math.round(input.loops)),
  }
}

export function normalizeScheduleEntity(record, index) {
  const finishBehavior = normalizeTaskFinishBehavior({
    returnToDockOnFinish: toBoolean(
      pickValue(record, ['return_to_dock_on_finish', 'returnToDockOnFinish']),
    ),
    repeatAfterFullCharge: toBoolean(
      pickValue(record, ['repeat_after_full_charge', 'repeatAfterFullCharge']),
    ),
  })

  return {
    id: pickString(record, ['schedule_id', 'scheduleId', 'id']) || `schedule-${index + 1}`,
    taskId: toNumber(pickValue(record, ['task_id', 'taskId'])) ?? 0,
    taskName: pickString(record, ['task_name', 'taskName']),
    enabled: Boolean(toBoolean(pickValue(record, ['enabled', 'is_enabled']))),
    type: pickString(record, ['type', 'schedule_type', 'scheduleType']),
    dow: toNumberArray(pickValue(record, ['dow', 'days_of_week'])),
    time: pickString(record, ['time']),
    at: pickString(record, ['at']),
    timezone: pickString(record, ['timezone', 'tz']),
    startDate: pickString(record, ['start_date', 'startDate']),
    endDate: pickString(record, ['end_date', 'endDate']),
    mapName: pickString(record, ['map_name', 'mapName']),
    zoneId: pickString(record, ['zone_id', 'zoneId']),
    loops: toNumber(pickValue(record, ['loops'])),
    planProfileName: pickString(record, ['plan_profile_name', 'planProfileName']),
    sysProfileName: pickString(record, ['sys_profile_name', 'sysProfileName']),
    cleanMode: normalizeCleanMode(pickString(record, ['clean_mode', 'cleanMode'])),
    returnToDockOnFinish: finishBehavior.returnToDockOnFinish,
    repeatAfterFullCharge: finishBehavior.repeatAfterFullCharge,
    lastFireTs: toNumber(pickValue(record, ['last_fire_ts', 'lastFireTs'])),
    lastDoneTs: toNumber(pickValue(record, ['last_done_ts', 'lastDoneTs'])),
    lastStatus: pickString(record, ['last_status', 'lastStatus']),
    metadata: summarizeMetadata(record),
    raw: record,
  }
}

export function normalizeScheduleList(payload) {
  const records = Array.isArray(payload)
    ? payload.filter((item) => isRecord(item))
    : findFirstValue(
        payload,
        ['schedules', 'schedule_list', 'items', 'list', 'data'],
        (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
      ) ?? []

  return records.map((record, index) => normalizeScheduleEntity(record, index))
}

export function normalizeScheduleDetail(payload) {
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

export function buildScheduleRequest(input, task, baseSchedule = null) {
  const baseRecord = isRecord(baseSchedule?.raw) ? baseSchedule.raw : {}
  const finishBehavior = normalizeTaskFinishBehavior({
    returnToDockOnFinish:
      task?.returnToDockOnFinish ?? baseSchedule?.returnToDockOnFinish ?? false,
    repeatAfterFullCharge:
      task?.repeatAfterFullCharge ?? baseSchedule?.repeatAfterFullCharge ?? false,
  })
  const normalizedType = input.type?.trim?.().toLowerCase?.() ?? ''
  const normalizedAt = input.at?.trim?.() ?? ''
  const normalizedTimeInput = input.time?.trim?.() ?? ''
  const normalizedTimezone = input.timezone?.trim?.() ?? ''
  const normalizedStartDateInput = input.startDate?.trim?.() ?? ''
  const normalizedEndDateInput = input.endDate?.trim?.() ?? ''
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
    schedule_id: input.scheduleId?.trim?.() ?? '',
    task_id: Math.max(0, Math.round(input.taskId)),
    task_name: task?.name ?? baseSchedule?.taskName ?? '',
    enabled: Boolean(input.enabled),
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
  }
}

export function normalizeProfileKind(value) {
  return value === 'plan' || value === 'sys' ? value : ''
}

export function normalizeProfileEntry(record) {
  return {
    profileName: pickString(record, ['profile_name', 'profileName']),
    displayName:
      pickString(record, ['display_name', 'displayName']) ||
      pickString(record, ['profile_name', 'profileName']),
    profileKind: normalizeProfileKind(pickString(record, ['profile_kind', 'profileKind'])),
    enabled: Boolean(toBoolean(pickValue(record, ['enabled']))),
    isDefault: Boolean(toBoolean(pickValue(record, ['is_default', 'isDefault']))),
    description: pickString(record, ['description']),
    version: pickString(record, ['version']),
    tags: toStringArray(pickValue(record, ['tags'])),
    supportedCleanModes: normalizeCleanModeList(
      toStringArray(pickValue(record, ['supported_clean_modes', 'supportedCleanModes'])),
    ),
    supportedMaps: toStringArray(pickValue(record, ['supported_maps', 'supportedMaps'])),
    warnings: toStringArray(pickValue(record, ['warnings'])),
    raw: record,
  }
}

export function normalizeSystemReadinessCheck(value) {
  if (!isRecord(value)) {
    return null
  }

  return {
    key: typeof value.key === 'string' ? value.key : '',
    level: typeof value.level === 'string' ? value.level : '',
    ok: Boolean(toBoolean(value.ok)),
    fresh: Boolean(toBoolean(value.fresh)),
    stale: Boolean(toBoolean(value.stale)),
    missing: Boolean(toBoolean(value.missing)),
    ageS: toNumber(value.age_s),
    summary: typeof value.summary === 'string' ? value.summary : '',
    raw: value,
  }
}

export function normalizeSystemReadiness(value) {
  if (!isRecord(value)) {
    return null
  }

  return {
    overallReady: Boolean(toBoolean(value.overall_ready)),
    canStartTask: Boolean(toBoolean(value.can_start_task)),
    taskId: Math.round(toNumber(value.task_id) ?? 0),
    taskName: typeof value.task_name === 'string' ? value.task_name : '',
    taskMapName: typeof value.task_map_name === 'string' ? value.task_map_name : '',
    taskZoneId: typeof value.task_zone_id === 'string' ? value.task_zone_id : '',
    taskPlanProfile: typeof value.task_plan_profile === 'string' ? value.task_plan_profile : '',
    activeMapName: typeof value.active_map_name === 'string' ? value.active_map_name : '',
    activeMapId: typeof value.active_map_id === 'string' ? value.active_map_id : '',
    activeMapMd5: typeof value.active_map_md5 === 'string' ? value.active_map_md5 : '',
    runtimeMapName: typeof value.runtime_map_name === 'string' ? value.runtime_map_name : '',
    runtimeMapId: typeof value.runtime_map_id === 'string' ? value.runtime_map_id : '',
    runtimeMapMd5: typeof value.runtime_map_md5 === 'string' ? value.runtime_map_md5 : '',
    missionState: typeof value.mission_state === 'string' ? value.mission_state : '',
    phase: typeof value.phase === 'string' ? value.phase : '',
    publicState: typeof value.public_state === 'string' ? value.public_state : '',
    executorState: typeof value.executor_state === 'string' ? value.executor_state : '',
    dockSupplyState: typeof value.dock_supply_state === 'string' ? value.dock_supply_state : '',
    batterySoc: toNumber(value.battery_soc),
    batteryValid: toBoolean(value.battery_valid),
    blockingReasons: toStringArray(value.blocking_reasons),
    warnings: toStringArray(value.warnings),
    checks: Array.isArray(value.checks)
      ? value.checks.map((entry) => normalizeSystemReadinessCheck(entry)).filter(Boolean)
      : [],
    stampMs: toTimestamp(value.stamp),
    raw: value,
  }
}

export function normalizeSlamWorkflowStateRecord(record) {
  return {
    desiredMode: pickString(record, ['desired_mode', 'desiredMode']),
    currentMode: pickString(record, ['current_mode', 'currentMode']),
    activeMapName: pickString(record, ['active_map_name', 'activeMapName']),
    activeMapId: pickString(record, ['active_map_id', 'activeMapId']),
    activeMapMd5: pickString(record, ['active_map_md5', 'activeMapMd5']),
    activeJobId: pickString(record, ['active_job_id', 'activeJobId']),
    runtimeMapName: pickString(record, ['runtime_map_name', 'runtimeMapName']),
    runtimeMapId: pickString(record, ['runtime_map_id', 'runtimeMapId']),
    runtimeMapMd5: pickString(record, ['runtime_map_md5', 'runtimeMapMd5']),
    localizationState: pickString(record, ['localization_state', 'localizationState']),
    localizationValid: toBoolean(pickValue(record, ['localization_valid', 'localizationValid'])),
    runtimeMapReady: toBoolean(pickValue(record, ['runtime_map_ready', 'runtimeMapReady'])),
    activeMapMatch: toBoolean(pickValue(record, ['active_map_match', 'activeMapMatch'])),
    lifecycleState: pickString(record, ['lifecycle_state', 'lifecycleState']),
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
    canSwitchMap: Boolean(
      toBoolean(
        pickValue(record, [
          'can_switch_map',
          'canSwitchMap',
          'can_switch_map_and_localize',
          'canSwitchMapAndLocalize',
        ]),
      ),
    ),
    canRestartLocalization: Boolean(
      toBoolean(
        pickValue(record, [
          'can_restart_localization',
          'canRestartLocalization',
          'can_relocalize',
          'canRelocalize',
        ]),
      ),
    ),
    canStartMapping: Boolean(
      toBoolean(pickValue(record, ['can_start_mapping', 'canStartMapping'])),
    ),
    canSaveMapping: Boolean(
      toBoolean(pickValue(record, ['can_save_mapping', 'canSaveMapping'])),
    ),
    canStopMapping: Boolean(
      toBoolean(pickValue(record, ['can_stop_mapping', 'canStopMapping'])),
    ),
    lastErrorCode: pickString(record, ['last_error_code', 'lastErrorCode']),
    lastErrorMessage: pickString(record, ['last_error_msg', 'lastErrorMsg', 'last_error_message']),
    blockingReasons: toStringArray(pickValue(record, ['blocking_reasons', 'blockingReasons'])),
    warnings: toStringArray(pickValue(record, ['warnings'])),
    stampMs: toTimestamp(pickValue(record, ['stamp'])),
    raw: record,
  }
}

export function normalizeSlamWorkflowState(payload) {
  const parsed = parseMaybeJson(payload)

  const record =
    (isRecord(parsed) && isRecord(parsed.state) ? parsed.state : null) ??
    findFirstRecord(parsed, ['current_mode', 'localization_state', 'active_job_id']) ??
    (isRecord(parsed) ? parsed : null)

  return record ? normalizeSlamWorkflowStateRecord(record) : null
}

export function normalizeSlamWorkflowJobRecord(record) {
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
    done: Boolean(toBoolean(pickValue(record, ['done']))),
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

export function normalizeSlamWorkflowJob(payload) {
  const parsed = parseMaybeJson(payload)

  if (isRecord(parsed) && parsed.found === false) {
    return null
  }

  const record =
    (isRecord(parsed) && isRecord(parsed.job) ? parsed.job : null) ??
    findFirstRecord(parsed, ['job_id', 'status', 'operation_name']) ??
    (isRecord(parsed) ? parsed : null)

  return record ? normalizeSlamWorkflowJobRecord(record) : null
}

export function normalizeSubmitRequest(request, robotId) {
  return {
    robot_id: request.robotId ?? robotId,
    map_name: request.mapName ?? '',
    set_active: request.setActive ?? true,
    description: request.description ?? '',
    refresh_map_identity: request.refreshMapIdentity ?? false,
    restart_localization_after_switch:
      request.restartLocalizationAfterSwitch ?? true,
  }
}

export function normalizeSubmitJobResponse(payload) {
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

export function normalizeOdometryState(value) {
  if (!isRecord(value)) {
    return null
  }

  return {
    robotId: pickString(value, ['robot_id', 'robotId']),
    odomSource: pickString(value, ['odom_source', 'odomSource']),
    odomTopic: pickString(value, ['odom_topic', 'odomTopic']),
    rawOdomTopic: pickString(value, ['raw_odom_topic', 'rawOdomTopic']),
    imuTopic: pickString(value, ['imu_topic', 'imuTopic']),
    connected: toBoolean(pickValue(value, ['connected'])),
    wheelSpeedNodeReady: toBoolean(
      pickValue(value, ['wheel_speed_node_ready', 'wheelSpeedNodeReady']),
    ),
    imuPreprocessNodeReady: toBoolean(
      pickValue(value, ['imu_preprocess_node_ready', 'imuPreprocessNodeReady']),
    ),
    ekfNodeReady: toBoolean(pickValue(value, ['ekf_node_ready', 'ekfNodeReady'])),
    wheelSpeedFresh: toBoolean(
      pickValue(value, ['wheel_speed_fresh', 'wheelSpeedFresh']),
    ),
    imuFresh: toBoolean(pickValue(value, ['imu_fresh', 'imuFresh'])),
    odomFresh: toBoolean(pickValue(value, ['odom_fresh', 'odomFresh'])),
    odomValid: toBoolean(pickValue(value, ['odom_valid', 'odomValid'])),
    wheelSpeedAgeS: toNumber(pickValue(value, ['wheel_speed_age_s', 'wheelSpeedAgeS'])),
    imuAgeS: toNumber(pickValue(value, ['imu_age_s', 'imuAgeS'])),
    odomAgeS: toNumber(pickValue(value, ['odom_age_s', 'odomAgeS'])),
    errorCode: pickString(value, ['error_code', 'errorCode']),
    message: pickString(value, ['message']),
    warnings: toStringArray(pickValue(value, ['warnings'])),
    stampMs: toTimestamp(pickValue(value, ['stamp'])),
    raw: value,
  }
}
