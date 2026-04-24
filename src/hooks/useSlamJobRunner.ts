import { useCallback, useState } from 'react'

import { runSlamAction } from '../api/gateway/slamGateway'
import { useSlamWorkbenchStore } from '../stores/slamWorkbenchStore'
import { getSlamActionLabel } from '../utils/slam'

import type {
  SlamActionKind,
  SlamSubmitJobResponse,
  SubmitSlamWorkflowRequest,
} from '../types/slam-workflow'

export type SlamSubmittedJobSnapshot = {
  actionKind: SlamActionKind
  actionLabel: string
  jobId: string
  message: string
  submittedAt: number
}

export function useSlamJobRunner(options: {
  refreshState: () => Promise<unknown>
}) {
  const setActiveJobId = useSlamWorkbenchStore((state) => state.setActiveJobId)
  const [runningAction, setRunningAction] = useState<SlamActionKind | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastSubmittedJob, setLastSubmittedJob] = useState<SlamSubmittedJobSnapshot | null>(
    null,
  )

  const runJob = useCallback(
    async ({
      actionKind,
      payload,
    }: {
      actionKind: SlamActionKind
      payload?: SubmitSlamWorkflowRequest
    }) => {
      const actionLabel = getSlamActionLabel(actionKind)
      setSubmitError(null)
      setRunningAction(actionKind)

      try {
        const response = (await runSlamAction(actionKind, payload)) as SlamSubmitJobResponse

        if (!response.accepted) {
          const message = response.message || `后端没有接受这次${actionLabel}请求，请先处理当前阻塞条件。`
          setSubmitError(message)
          return {
            ok: false as const,
            response,
          }
        }

        const submittedJobId = response.jobId || response.job?.jobId || ''

        if (submittedJobId) {
          setActiveJobId(submittedJobId)
        }

        setLastSubmittedJob({
          actionKind,
          actionLabel,
          jobId: submittedJobId,
          message: response.message || '',
          submittedAt: Date.now(),
        })

        await options.refreshState()

        return {
          ok: true as const,
          response,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : `${actionLabel}提交失败。`
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
    lastSubmittedJob,
    clearSubmitError: () => setSubmitError(null),
    runJob,
  }
}
