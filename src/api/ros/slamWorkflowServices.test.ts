import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SLAM_SUBMIT_SERVICE } from './serviceNames'

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

import { submitSlamCommand } from './slamWorkflowServices'

describe('slamWorkflowServices', () => {
  beforeEach(() => {
    callService.mockReset()
    setRosDebugEvent.mockReset()
    callService.mockResolvedValue({
      accepted: true,
      message: 'accepted',
      job_id: 'job-1',
      operation: 0,
      map_name: 'map-a',
    })
  })

  it('uses the canonical relocalize operation code', async () => {
    await submitSlamCommand('relocalize', {
      robotId: 'robot-a',
      description: 'manual relocalize',
    })

    expect(callService).toHaveBeenCalledTimes(1)
    expect(callService).toHaveBeenCalledWith({
      serviceName: SLAM_SUBMIT_SERVICE.canonicalName,
      serviceType: 'my_msg_srv/SubmitSlamCommand',
      request: {
        operation: 8,
        robot_id: 'robot-a',
        map_name: '',
        set_active: true,
        description: 'manual relocalize',
      },
    })
  })

  it('keeps switch_map on the canonical submit schema', async () => {
    await submitSlamCommand('switch_map', {
      robotId: 'robot-a',
      mapName: 'map-b',
      setActive: true,
      description: 'switch to map-b',
      refreshMapIdentity: true,
      restartLocalizationAfterSwitch: false,
    })

    expect(callService).toHaveBeenCalledTimes(1)
    const request = callService.mock.calls[0]?.[0]

    expect(request).toMatchObject({
      serviceName: SLAM_SUBMIT_SERVICE.canonicalName,
      serviceType: 'my_msg_srv/SubmitSlamCommand',
      request: {
        operation: 7,
        robot_id: 'robot-a',
        map_name: 'map-b',
        set_active: true,
        description: 'switch to map-b',
      },
    })
    expect(request.request).not.toHaveProperty('refresh_map_identity')
    expect(request.request).not.toHaveProperty('restart_localization_after_switch')
  })
})
