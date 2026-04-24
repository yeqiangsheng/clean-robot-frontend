import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TASK_SERVICE } from './serviceNames'
import type { TaskDraftInput, TaskEntity } from '../../types/task'

const callService = vi.hoisted(() => vi.fn())
const setRosDebugEvent = vi.hoisted(() => vi.fn())

vi.mock('./client', () => ({
  getRosConnectionManager: () => ({
    callService,
  }),
}))

vi.mock('./debug', () => ({
  setRosDebugEvent,
}))

const draft: TaskDraftInput = {
  taskId: 0,
  name: '  task_live_zone  ',
  enabled: true,
  status: 0,
  mapName: '  site_map_live  ',
  zoneId: '  zone_live  ',
  planProfileName: '  cover_standard  ',
  sysProfileName: '  standard  ',
  cleanMode: 'coverage',
  returnToDockOnFinish: false,
  repeatAfterFullCharge: true,
  loops: 2,
}

const existingTask: TaskEntity = {
  id: 7,
  name: 'task_live_zone',
  enabled: true,
  status: 0,
  mapName: 'site_map_live',
  zoneId: 'zone_live',
  planProfileName: 'cover_standard',
  sysProfileName: 'standard',
  cleanMode: 'scrub',
  returnToDockOnFinish: false,
  repeatAfterFullCharge: false,
  loops: 1,
  metadata: {},
  raw: {
    task_id: 7,
    preserved_backend_field: 'keep-me',
  },
}

function mockTaskResponse(taskId: number) {
  callService.mockResolvedValue({
    success: true,
    message: 'ok',
    task: {
      task_id: taskId,
      name: 'task_live_zone',
      enabled: true,
      status: 0,
      map_name: 'site_map_live',
      zone_id: 'zone_live',
      plan_profile_name: 'cover_standard',
      sys_profile_name: 'standard',
      clean_mode: 'scrub',
      return_to_dock_on_finish: true,
      repeat_after_full_charge: true,
      loops: 2,
    },
  })
}

describe('taskServices', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_USE_MOCK_DATA', 'false')
    callService.mockReset()
    setRosDebugEvent.mockReset()
    mockTaskResponse(7)
  })

  it('creates tasks with the canonical service and official backend fields', async () => {
    const { addCleanTask } = await import('./taskServices')

    await addCleanTask(draft)

    expect(callService).toHaveBeenCalledTimes(1)
    expect(callService).toHaveBeenCalledWith({
      serviceName: TASK_SERVICE.canonicalName,
      serviceType: TASK_SERVICE.serviceType,
      request: {
        operation: 1,
        task_id: 0,
        map_name: 'site_map_live',
        enabled_state: 2,
        return_to_dock_state: 2,
        repeat_after_full_charge_state: 2,
        task: {
          task_id: 0,
          name: 'task_live_zone',
          enabled: true,
          status: 0,
          map_name: 'site_map_live',
          zone_id: 'zone_live',
          plan_profile_name: 'cover_standard',
          sys_profile_name: 'standard',
          clean_mode: 'scrub',
          return_to_dock_on_finish: true,
          repeat_after_full_charge: true,
          loops: 2,
        },
      },
    })
  })

  it('updates tasks without inventing alias fields', async () => {
    const { modifyCleanTask } = await import('./taskServices')

    await modifyCleanTask(existingTask, {
      ...draft,
      taskId: 999,
      enabled: false,
      repeatAfterFullCharge: false,
      returnToDockOnFinish: true,
    })

    expect(callService).toHaveBeenCalledTimes(1)
    const request = callService.mock.calls[0]?.[0]

    expect(request).toMatchObject({
      serviceName: TASK_SERVICE.canonicalName,
      serviceType: TASK_SERVICE.serviceType,
      request: {
        operation: 2,
        task_id: 7,
        map_name: 'site_map_live',
        enabled_state: 1,
        return_to_dock_state: 2,
        repeat_after_full_charge_state: 1,
        task: {
          task_id: 7,
          preserved_backend_field: 'keep-me',
          map_name: 'site_map_live',
          zone_id: 'zone_live',
          plan_profile_name: 'cover_standard',
          sys_profile_name: 'standard',
          clean_mode: 'scrub',
          return_to_dock_on_finish: true,
          repeat_after_full_charge: false,
        },
      },
    })
    expect(request.request.task).not.toHaveProperty('planProfileName')
    expect(request.request.task).not.toHaveProperty('sysProfileName')
    expect(request.request.task).not.toHaveProperty('cleanMode')
    expect(request.request.task).not.toHaveProperty('returnToDockOnFinish')
    expect(request.request.task).not.toHaveProperty('repeatAfterFullCharge')
  })
})
