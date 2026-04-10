import { useCallback, useState } from 'react'

import { runSlamAction } from '../api/gateway/slamGateway'
import { useSlamWorkbenchStore } from '../stores/slamWorkbenchStore'
import type {
  SlamActionKind,
  SlamSubmitJobResponse,
  SubmitSlamWorkflowRequest,
} from '../types/slam-workflow'

export function useSlamJobRunner(options: {
  refreshState: () => Promise<unknown>
  onManualAssistRequired?: () => void
}) {
  const setActiveJobId = useSlamWorkbenchStore((state) => state.setActiveJobId)
  const [runningAction, setRunningAction] = useState<SlamActionKind | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const runJob = useCallback(
    async ({
      actionKind,
      payload,
    }: {
      actionKind: SlamActionKind
      payload?: SubmitSlamWorkflowRequest
    }) => {
      setSubmitError(null)
      setRunningAction(actionKind)

      try {
        const response = (await runSlamAction(
          actionKind,
          payload,
        )) as SlamSubmitJobResponse

        if (!response.accepted) {
          const message =
            response.message ||
            'A SLAM job is already running. Wait for it to finish before submitting another action.'
          setSubmitError(message)
          return {
            ok: false as const,
            response,
          }
        }

        if (response.jobId) {
          setActiveJobId(response.jobId)
        }

        await options.refreshState()

        if (response.manualAssistRequired) {
          options.onManualAssistRequired?.()
        }

        return {
          ok: true as const,
          response,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'SLAM workflow submit failed.'
        setSubmitError(message)
        return {
          ok: false as const,
          response: null,
          error: message,
        }
      } finally {
        setRunningAction(null)
      }
    },
    [options, setActiveJobId],
  )

  return {
    runningAction,
    submitError,
    clearSubmitError: () => setSubmitError(null),
    runJob,
  }
}
