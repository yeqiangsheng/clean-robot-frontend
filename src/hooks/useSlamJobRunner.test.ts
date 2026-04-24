import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSlamWorkbenchStore } from '../stores/slamWorkbenchStore'
import type { SlamSubmitJobResponse } from '../types/slam-workflow'
import { useSlamJobRunner } from './useSlamJobRunner'

const runSlamAction = vi.hoisted(() => vi.fn())

vi.mock('../api/gateway/slamGateway', () => ({
  runSlamAction,
}))

function createAcceptedResponse(
  overrides: Partial<SlamSubmitJobResponse> = {},
): SlamSubmitJobResponse {
  return {
    accepted: true,
    message: 'accepted',
    errorCode: '',
    jobId: 'slam-job-submit-1',
    operation: 7,
    mapName: 'site_map_live',
    job: null,
    raw: {},
    ...overrides,
  }
}

describe('useSlamJobRunner', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useSlamWorkbenchStore.getState().reset()
    runSlamAction.mockReset()
  })

  afterEach(() => {
    cleanup()
    useSlamWorkbenchStore.getState().reset()
  })

  it('tracks the job_id returned by canonical submit before refreshing state', async () => {
    const refreshState = vi.fn().mockResolvedValue(undefined)
    useSlamWorkbenchStore.getState().setActiveJobId('topic-active-job')
    runSlamAction.mockResolvedValue(
      createAcceptedResponse({
        jobId: 'submit-job-42',
      }),
    )

    const { result } = renderHook(() => useSlamJobRunner({ refreshState }))

    await act(async () => {
      await result.current.runJob({
        actionKind: 'switch_map',
        payload: {
          mapName: 'site_map_live',
          setActive: true,
          restartLocalizationAfterSwitch: true,
          description: 'switch during live acceptance',
        },
      })
    })

    expect(runSlamAction).toHaveBeenCalledWith('switch_map', {
      mapName: 'site_map_live',
      setActive: true,
      restartLocalizationAfterSwitch: true,
      description: 'switch during live acceptance',
    })
    expect(useSlamWorkbenchStore.getState().activeJobId).toBe('submit-job-42')
    expect(result.current.lastSubmittedJob).toMatchObject({
      actionKind: 'switch_map',
      jobId: 'submit-job-42',
      message: 'accepted',
    })
    expect(refreshState).toHaveBeenCalledTimes(1)
    expect(runSlamAction.mock.invocationCallOrder[0]).toBeLessThan(
      refreshState.mock.invocationCallOrder[0],
    )
  })

  it('does not replace the active job or refresh state when submit is rejected', async () => {
    const refreshState = vi.fn().mockResolvedValue(undefined)
    useSlamWorkbenchStore.getState().setActiveJobId('stable-existing-job')
    runSlamAction.mockResolvedValue(
      createAcceptedResponse({
        accepted: false,
        message: 'mapping is busy',
        jobId: '',
      }),
    )

    const { result } = renderHook(() => useSlamJobRunner({ refreshState }))

    await act(async () => {
      await result.current.runJob({
        actionKind: 'start_mapping',
        payload: {
          mapName: 'new_map',
          setActive: true,
        },
      })
    })

    expect(useSlamWorkbenchStore.getState().activeJobId).toBe('stable-existing-job')
    expect(result.current.submitError).toBe('mapping is busy')
    expect(result.current.lastSubmittedJob).toBeNull()
    expect(refreshState).not.toHaveBeenCalled()
  })
})
