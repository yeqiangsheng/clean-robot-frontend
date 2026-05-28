import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { fetchGatewaySlamJobTopicSnapshot } from '../api/gateway/siteGatewayStatusClient'
import { getSlamJob } from '../api/gateway/robotStatusGateway'
import {
  SLAM_WORKFLOW_JOB_TOPIC_TYPE,
  SLAM_WORKFLOW_TOPIC_STALE_AFTER_MS,
} from '../api/contracts/slamWorkflowTopicConfig'
import { useSlamWorkbenchStore } from '../stores/slamWorkbenchStore'
import type { RosConnectionSnapshot } from '../types/ros'
import type {
  SlamJobTopicSnapshot,
  SlamTopicHealth,
} from '../types/slam-workflow'
import {
  isSlamJobTerminalState,
  SLAM_JOB_POLL_INTERVAL_MS,
} from '../utils/slam'

const SLAM_JOB_TOPIC_POLL_INTERVAL_MS = 1000

function getTopicHealth(
  isConnected: boolean,
  _messageType: string,
  publishers: string[],
  lastMessageAt: number | null,
  now: number,
): SlamTopicHealth {
  if (!isConnected) {
    return 'disconnected'
  }

  if (lastMessageAt === null) {
    return publishers.length > 0 ? 'waiting' : 'unavailable'
  }

  return now - lastMessageAt > SLAM_WORKFLOW_TOPIC_STALE_AFTER_MS ? 'stale' : 'live'
}

export function useSlamWorkflowJob(snapshot: RosConnectionSnapshot) {
  const activeJobId = useSlamWorkbenchStore((state) => state.activeJobId)
  const setActiveJobId = useSlamWorkbenchStore((state) => state.setActiveJobId)
  const upsertJobHistory = useSlamWorkbenchStore((state) => state.upsertJobHistory)
  const servicesReady = snapshot.isConnected
  const useMockState = snapshot.status === 'mock'
  const [clock, setClock] = useState(() => Date.now())

  const jobQuery = useQuery({
    queryKey: ['slam-job', activeJobId, snapshot.sessionId],
    queryFn: () => getSlamJob(activeJobId),
    enabled: servicesReady && !useMockState && activeJobId.trim().length > 0,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const job = query.state.data

      if (!activeJobId) {
        return false
      }

      return !job || !isSlamJobTerminalState(job.status, job.done)
        ? SLAM_JOB_POLL_INTERVAL_MS
        : false
    },
  })

  const topicQuery = useQuery({
    queryKey: ['slam-job-topic', snapshot.sessionId],
    queryFn: () => fetchGatewaySlamJobTopicSnapshot(),
    enabled: servicesReady && !useMockState,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: servicesReady ? SLAM_JOB_TOPIC_POLL_INTERVAL_MS : false,
  })

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setClock(Date.now())
    }, 1000)

    return () => {
      globalThis.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const topicJob = topicQuery.data?.payload
    if (!topicJob) {
      return
    }

    upsertJobHistory(topicJob)

    if (topicJob.jobId.trim()) {
      setActiveJobId(topicJob.jobId)
    }
  }, [setActiveJobId, topicQuery.data?.payload, upsertJobHistory])

  useEffect(() => {
    if (!jobQuery.data) {
      return
    }

    upsertJobHistory(jobQuery.data)
  }, [jobQuery.data, upsertJobHistory])

  const topicJob = topicQuery.data?.payload ?? null

  const effectiveJob = useMemo(() => {
    if (activeJobId && topicJob?.jobId === activeJobId) {
      return topicJob
    }

    return jobQuery.data ?? topicJob ?? null
  }, [activeJobId, jobQuery.data, topicJob])

  const isPolling = useMemo(() => {
    if (!activeJobId || !effectiveJob) {
      return false
    }

    return !isSlamJobTerminalState(effectiveJob.status, effectiveJob.done)
  }, [activeJobId, effectiveJob])

  const topicSnapshot = useMemo(() => {
    const topicData = topicQuery.data
    const lastMessageAt = topicData?.lastMessageAt ?? null
    const ageMs = lastMessageAt === null ? null : Math.max(0, clock - lastMessageAt)
    const publishers = topicData?.publishers ?? []

    return {
      messageType: topicData?.messageType || SLAM_WORKFLOW_JOB_TOPIC_TYPE,
      publishers,
      subscribers: topicData?.subscribers ?? [],
      metaError: topicData?.metaError ?? null,
      subscribeError: topicData?.subscribeError ?? null,
      health: getTopicHealth(servicesReady, '', publishers, lastMessageAt, clock),
      messageCount: topicData?.messageCount ?? 0,
      lastMessageAt,
      ageMs,
      job: topicJob,
    } satisfies SlamJobTopicSnapshot
  }, [clock, servicesReady, topicJob, topicQuery.data])

  return {
    activeJobId,
    job: effectiveJob,
    topicSnapshot,
    loading: jobQuery.isLoading || jobQuery.isFetching,
    error: jobQuery.error instanceof Error ? jobQuery.error.message : null,
    isPolling,
    refetch: async () => {
      await Promise.all([jobQuery.refetch(), topicQuery.refetch()])
    },
    startPolling: (jobId: string) => setActiveJobId(jobId),
    stopPolling: () => setActiveJobId(''),
  }
}
