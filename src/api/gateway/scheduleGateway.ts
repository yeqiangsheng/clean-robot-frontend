import {
  requestCreateSchedule,
  requestDeleteSchedule,
  requestScheduleDetail,
  requestScheduleList,
  requestUpdateSchedule,
} from './siteGatewayScheduleClient'
import { recordAuditEvent } from './auditTrail'
import { assertCapabilityAllowed } from './accessControl'
import { normalizeGatewayOperationError } from './gatewayShared'
import { SCHEDULE_SERVICE } from '../contracts/serviceNames'
import { USE_MOCK_DATA } from '../../config/runtimeMode'
import type { ScheduleDraftInput, ScheduleEntity } from '../../types/schedule'
import type { TaskEntity } from '../../types/task'

type ScheduleCreateOrUpdateResult = {
  schedule: ScheduleEntity
  raw: Record<string, unknown>
  auditEvent?: unknown
}

type ScheduleDeleteResult = {
  message?: string
  raw: Record<string, unknown>
  auditEvent?: unknown
}

const mockSchedules: ScheduleEntity[] = [
  {
    id: 'daily_f2q_morning',
    taskId: 1,
    taskName: '测试任务1',
    enabled: true,
    type: 'daily',
    dow: [],
    time: '09:00',
    at: '',
    timezone: 'Asia/Shanghai',
    startDate: '2026-05-27',
    endDate: '',
    mapName: 'F2Q区精密装配车间',
    zoneId: 'zone_ae68ffc8',
    loops: 1,
    planProfileName: 'cover_standard',
    sysProfileName: 'standard',
    cleanMode: 'scrub',
    returnToDockOnFinish: false,
    repeatAfterFullCharge: false,
    lastFireTs: null,
    lastDoneTs: null,
    lastStatus: '',
    metadata: {},
    raw: {},
  },
  {
    id: 'weekly_f2q_friday',
    taskId: 2,
    taskName: '测试任务2',
    enabled: false,
    type: 'weekly',
    dow: [4],
    time: '18:30',
    at: '',
    timezone: 'Asia/Shanghai',
    startDate: '2026-05-27',
    endDate: '',
    mapName: 'F2Q区精密装配车间',
    zoneId: 'zone_b17c2a10',
    loops: 1,
    planProfileName: 'cover_standard',
    sysProfileName: 'standard',
    cleanMode: 'scrub',
    returnToDockOnFinish: false,
    repeatAfterFullCharge: false,
    lastFireTs: null,
    lastDoneTs: null,
    lastStatus: '',
    metadata: {},
    raw: {},
  },
]

function cloneSchedule(schedule: ScheduleEntity): ScheduleEntity {
  return {
    ...schedule,
    dow: [...schedule.dow],
    metadata: { ...schedule.metadata },
    raw: { ...schedule.raw },
  }
}

function buildScheduleFromInput(
  input: ScheduleDraftInput,
  task: TaskEntity | null,
): ScheduleEntity {
  return {
    id: input.scheduleId,
    taskId: input.taskId,
    taskName: task?.name ?? `task-${input.taskId}`,
    enabled: input.enabled,
    type: input.type,
    dow: [...input.dow],
    time: input.time,
    at: input.at,
    timezone: input.timezone,
    startDate: input.startDate,
    endDate: input.endDate,
    mapName: task?.mapName ?? '',
    zoneId: task?.zoneId ?? '',
    loops: task?.loops ?? 1,
    planProfileName: task?.planProfileName ?? '',
    sysProfileName: task?.sysProfileName ?? '',
    cleanMode: task?.cleanMode ?? 'scrub',
    returnToDockOnFinish: task?.returnToDockOnFinish ?? false,
    repeatAfterFullCharge: task?.repeatAfterFullCharge ?? false,
    lastFireTs: null,
    lastDoneTs: null,
    lastStatus: '',
    metadata: {},
    raw: {},
  }
}

function manageMockSchedule(options: {
  action: 'list' | 'detail' | 'create' | 'update' | 'delete'
  scheduleId?: string
  input?: ScheduleDraftInput
  task?: TaskEntity | null
}) {
  switch (options.action) {
    case 'list':
      return mockSchedules.map(cloneSchedule)
    case 'detail': {
      const schedule = mockSchedules.find((item) => item.id === options.scheduleId)
      return schedule ? cloneSchedule(schedule) : null
    }
    case 'create':
    case 'update':
      return {
        schedule: buildScheduleFromInput(
          options.input as ScheduleDraftInput,
          options.task ?? null,
        ),
        raw: { mock: true },
      }
    case 'delete':
      return {
        message: 'mock deleted',
        raw: { mock: true },
      }
    default:
      return null
  }
}

export async function manageSchedule(options: {
  action: 'list'
}): Promise<ScheduleEntity[]>
export async function manageSchedule(options: {
  action: 'detail'
  scheduleId: string
  taskId?: number
}): Promise<ScheduleEntity | null>
export async function manageSchedule(options: {
  action: 'create'
  input: ScheduleDraftInput
  task: TaskEntity | null
}): Promise<ScheduleCreateOrUpdateResult>
export async function manageSchedule(options: {
  action: 'update'
  schedule: ScheduleEntity
  input: ScheduleDraftInput
  task: TaskEntity | null
}): Promise<ScheduleCreateOrUpdateResult>
export async function manageSchedule(options: {
  action: 'delete'
  scheduleId: string
  taskId?: number
}): Promise<ScheduleDeleteResult>
export async function manageSchedule(options: {
  action: 'list' | 'detail' | 'create' | 'update' | 'delete'
  scheduleId?: string
  taskId?: number
  task?: TaskEntity | null
  input?: ScheduleDraftInput
  schedule?: ScheduleEntity
}): Promise<
  ScheduleEntity[] | ScheduleEntity | ScheduleCreateOrUpdateResult | ScheduleDeleteResult | null
> {
  if (USE_MOCK_DATA) {
    return manageMockSchedule(options)
  }

  try {
    assertCapabilityAllowed('scheduleManagement', `schedule ${options.action}`)

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
  } catch (error) {
    const normalizedError = normalizeGatewayOperationError(error)
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
