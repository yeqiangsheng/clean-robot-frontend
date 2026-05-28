import {
  requestCreateTask,
  requestDeleteTask,
  requestTaskDetail,
  requestTaskList,
  requestUpdateTask,
} from './siteGatewayTaskClient'
import { recordAuditEvent } from './auditTrail'
import { assertCapabilityAllowed } from './accessControl'
import {
  assertAnyCapabilityAllowed,
  normalizeGatewayOperationError,
} from './gatewayShared'
import { TASK_SERVICE } from '../contracts/serviceNames'
import { USE_MOCK_DATA } from '../../config/runtimeMode'
import type { TaskDraftInput, TaskEntity } from '../../types/task'

type TaskCreateOrUpdateResult = {
  task: TaskEntity
  raw: Record<string, unknown>
  auditEvent?: unknown
}

type TaskDeleteResult = {
  raw: Record<string, unknown>
  auditEvent?: unknown
}

const mockTasks: TaskEntity[] = [
  {
    id: 1,
    name: '测试任务1',
    enabled: true,
    status: 0,
    mapName: 'F2Q区精密装配车间',
    zoneId: 'zone_ae68ffc8',
    planProfileName: 'cover_standard',
    sysProfileName: 'standard',
    cleanMode: 'scrub',
    returnToDockOnFinish: false,
    repeatAfterFullCharge: false,
    loops: 1,
    metadata: {},
    raw: {},
  },
  {
    id: 2,
    name: '测试任务2',
    enabled: true,
    status: 0,
    mapName: 'F2Q区精密装配车间',
    zoneId: 'zone_b17c2a10',
    planProfileName: 'cover_standard',
    sysProfileName: 'standard',
    cleanMode: 'scrub',
    returnToDockOnFinish: false,
    repeatAfterFullCharge: false,
    loops: 1,
    metadata: {},
    raw: {},
  },
  {
    id: 3,
    name: '测试任务3',
    enabled: true,
    status: 0,
    mapName: 'F2Q区精密装配车间',
    zoneId: 'zone_c3021f84',
    planProfileName: 'cover_standard',
    sysProfileName: 'standard',
    cleanMode: 'scrub',
    returnToDockOnFinish: false,
    repeatAfterFullCharge: false,
    loops: 1,
    metadata: {},
    raw: {},
  },
]

function cloneTask(task: TaskEntity): TaskEntity {
  return {
    ...task,
    metadata: { ...task.metadata },
    raw: { ...task.raw },
  }
}

function buildTaskFromInput(input: TaskDraftInput): TaskEntity {
  const taskId = input.taskId > 0 ? input.taskId : Math.max(...mockTasks.map((task) => task.id)) + 1

  return {
    id: taskId,
    name: input.name,
    enabled: input.enabled,
    status: input.status,
    mapName: input.mapName,
    zoneId: input.zoneId,
    planProfileName: input.planProfileName,
    sysProfileName: input.sysProfileName,
    cleanMode: input.cleanMode,
    returnToDockOnFinish: input.returnToDockOnFinish,
    repeatAfterFullCharge: input.repeatAfterFullCharge,
    loops: input.loops,
    metadata: {},
    raw: {},
  }
}

function manageMockTask(options: {
  action: 'list' | 'detail' | 'create' | 'update' | 'delete'
  taskId?: number
  input?: TaskDraftInput
}) {
  switch (options.action) {
    case 'list':
      return mockTasks.map(cloneTask)
    case 'detail': {
      const task = mockTasks.find((item) => item.id === options.taskId)
      return task ? cloneTask(task) : null
    }
    case 'create':
    case 'update':
      return {
        task: buildTaskFromInput(options.input as TaskDraftInput),
        raw: { mock: true },
      }
    case 'delete':
      return {
        raw: { mock: true },
      }
    default:
      return null
  }
}

export async function manageTask(options: {
  action: 'list'
}): Promise<TaskEntity[]>
export async function manageTask(options: {
  action: 'detail'
  taskId: number
}): Promise<TaskEntity | null>
export async function manageTask(options: {
  action: 'create'
  input: TaskDraftInput
}): Promise<TaskCreateOrUpdateResult>
export async function manageTask(options: {
  action: 'update'
  task: TaskEntity
  input: TaskDraftInput
}): Promise<TaskCreateOrUpdateResult>
export async function manageTask(options: {
  action: 'delete'
  taskId: number
}): Promise<TaskDeleteResult>
export async function manageTask(options: {
  action: 'list' | 'detail' | 'create' | 'update' | 'delete'
  taskId?: number
  input?: TaskDraftInput
  task?: TaskEntity
}): Promise<
  TaskEntity[] | TaskEntity | TaskCreateOrUpdateResult | TaskDeleteResult | null
> {
  if (USE_MOCK_DATA) {
    return manageMockTask(options)
  }

  try {
    if (options.action === 'list') {
      assertAnyCapabilityAllowed(
        ['taskManagement', 'executionControl', 'overview'],
        'task list',
      )
    } else {
      assertCapabilityAllowed('taskManagement', `task ${options.action}`)
    }

    switch (options.action) {
      case 'list':
        return await requestTaskList()
      case 'detail':
        return await requestTaskDetail(options.taskId ?? 0)
      case 'create':
        return await requestCreateTask(options.input as TaskDraftInput)
      case 'update':
        return await requestUpdateTask(
          options.task as TaskEntity,
          options.input as TaskDraftInput,
        )
      case 'delete':
        return await requestDeleteTask(options.taskId ?? 0)
      default:
        return null
    }
  } catch (error) {
    const normalizedError = normalizeGatewayOperationError(error)
    recordAuditEvent({
      category: 'system',
      action: `task:${options.action}`,
      target: TASK_SERVICE.canonicalName,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: options as Record<string, unknown>,
    })
    throw normalizedError
  }
}
