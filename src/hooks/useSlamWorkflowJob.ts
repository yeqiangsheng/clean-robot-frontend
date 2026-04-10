import { useEffect, useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import {
  getSlamWorkflowJob,
  isSlamJobTerminalState,
  SLAM_JOB_POLL_INTERVAL_MS,
} from '../api/ros/slamWorkflowServices'
import { useSlamWorkbenchStore } from '../stores/slamWorkbenchStore'
import type { RosConnectionSnapshot } from '../types/ros'

export function useSlamWorkflowJob(snapshot: RosConnectionSnapshot) {
  const activeJobId = useSlamWorkbenchStore((state) => state.activeJobId)
  const setActiveJobId = useSlamWorkbenchStore((state) => state.setActiveJobId)
  const upsertJobHistory = useSlamWorkbenchStore((state) => state.upsertJobHistory)
  const servicesReady = snapshot.isConnected

  const jobQuery = useQuery({
    queryKey: ['slam-workflow', 'job', activeJobId, snapshot.url, snapshot.sessionId],
    queryFn: () => getSlamWorkflowJob(activeJobId),
    enabled: servicesReady && activeJobId.trim().length > 0,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const job = query.state.data

      if (!activeJobId) {
        return false
      }

      return !job || !isSlamJobTerminalState(job.jobState)
        ? SLAM_JOB_POLL_INTERVAL_MS
        : false
    },
  })

  useEffect(() => {
    if (!jobQuery.data) {
      return
    }

    upsertJobHistory(jobQuery.data)
  }, [jobQuery.data, upsertJobHistory])

  const isPolling = useMemo(() => {
    if (!activeJobId || !jobQuery.data) {
      return false
    }

    return !isSlamJobTerminalState(jobQuery.data.jobState)
  }, [activeJobId, jobQuery.data])

  return {
    activeJobId,
    job: jobQuery.data ?? null,
    loading: jobQuery.isLoading || jobQuery.isFetching,
    error: jobQuery.error instanceof Error ? jobQuery.error.message : null,
    isPolling,
    refetch: () => jobQuery.refetch(),
    startPolling: (jobId: string) => setActiveJobId(jobId),
    stopPolling: () => setActiveJobId(''),
  }
}
