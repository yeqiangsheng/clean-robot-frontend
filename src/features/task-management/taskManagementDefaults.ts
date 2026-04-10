import type { MapCatalogEntry } from '../../types/mapCatalog'
import type { TaskDraftInput, TaskEntity } from '../../types/task'
import type { ZoneCatalogAvailability, ZoneCatalogEntry } from '../../types/zoneCatalog'
import { normalizeTaskFinishBehavior } from '../../utils/taskFinishBehavior'

export function getTaskStatusTagColor(status: number | null) {
  if (status === 1) {
    return 'green'
  }

  if (status === 2) {
    return 'orange'
  }

  if (status !== null && status < 0) {
    return 'red'
  }

  return 'default'
}

export function getReturnToDockTag(returnToDockOnFinish: boolean) {
  return returnToDockOnFinish
    ? { color: 'cyan', label: '完成后回桩' }
    : { color: 'default', label: '原地结束' }
}

export function getRepeatAfterFullChargeTag(repeatAfterFullCharge: boolean) {
  return repeatAfterFullCharge
    ? { color: 'purple', label: '满电后续扫' }
    : { color: 'default', label: '不续扫' }
}

export function buildCreateTaskDefaults(source?: TaskEntity | null): TaskDraftInput {
  const finishBehavior = normalizeTaskFinishBehavior(source)

  return {
    taskId: 0,
    name: source ? `${source.name}_copy` : `task_${Date.now()}`,
    enabled: true,
    status: source?.status ?? 0,
    mapName: source?.mapName ?? '',
    zoneId: source?.zoneId ?? '',
    planProfileName: source?.planProfileName ?? '',
    sysProfileName: source?.sysProfileName ?? '',
    cleanMode: source?.cleanMode ?? 'scrub',
    returnToDockOnFinish: finishBehavior.returnToDockOnFinish,
    repeatAfterFullCharge: finishBehavior.repeatAfterFullCharge,
    loops: source?.loops ?? 1,
  }
}

export function buildEditTaskDefaults(source: TaskEntity): TaskDraftInput {
  const finishBehavior = normalizeTaskFinishBehavior(source)

  return {
    taskId: source.id,
    name: source.name,
    enabled: source.enabled,
    status: source.status ?? 0,
    mapName: source.mapName,
    zoneId: source.zoneId,
    planProfileName: source.planProfileName,
    sysProfileName: source.sysProfileName,
    cleanMode: source.cleanMode,
    returnToDockOnFinish: finishBehavior.returnToDockOnFinish,
    repeatAfterFullCharge: finishBehavior.repeatAfterFullCharge,
    loops: source.loops,
  }
}

export function getTaskMetadataEntries(task: TaskEntity | null) {
  if (!task) {
    return []
  }

  return Object.entries(task.metadata).slice(0, 12)
}

export function getZonePrimaryLabel(entry: ZoneCatalogEntry) {
  return entry.displayName.trim().length > 0 ? entry.displayName : entry.zoneId
}

export function getZoneReferenceLabel(entry: ZoneCatalogEntry) {
  return getZonePrimaryLabel(entry) === entry.zoneId
    ? entry.zoneId
    : `${getZonePrimaryLabel(entry)} (${entry.zoneId})`
}

export function getZoneAvailabilityLabel(availability: ZoneCatalogAvailability) {
  switch (availability) {
    case 'historical':
      return '历史'
    case 'unknown':
      return '不可用'
    default:
      return ''
  }
}

export function getMapPrimaryLabel(entry: Pick<MapCatalogEntry, 'displayName' | 'mapName'>) {
  return entry.displayName.trim().length > 0 ? entry.displayName : entry.mapName
}

export function getMapReferenceLabel(entry: Pick<MapCatalogEntry, 'displayName' | 'mapName'>) {
  return getMapPrimaryLabel(entry) === entry.mapName
    ? entry.mapName
    : `${getMapPrimaryLabel(entry)} (${entry.mapName})`
}
