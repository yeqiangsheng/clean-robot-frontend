import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { fetchGatewaySystemReadinessTopicSnapshot } from '../api/gateway/siteGatewayStatusClient'
import { getSystemReadiness } from '../api/gateway/robotStatusGateway'
import {
  SYSTEM_READINESS_TOPIC_NAME,
  SYSTEM_READINESS_TOPIC_TYPE,
} from '../api/contracts/queryContracts'
import type { RosConnectionSnapshot } from '../types/ros'
import type {
  SystemReadiness,
  SystemReadinessTopicSnapshot,
} from '../types/systemReadiness'
import { SYSTEM_READINESS_STALE_AFTER_MS } from '../utils/topicFreshness'

const SYSTEM_READINESS_TOPIC_POLL_INTERVAL_MS = 1000

function getTopicHealth(
  isConnected: boolean,
  _messageType: string,
  publishers: string[],
  lastMessageAt: number | null,
  now: number,
) {
  if (!isConnected) {
    return 'disconnected' as const
  }

  if (lastMessageAt === null) {
    return publishers.length > 0 ? ('waiting' as const) : ('unavailable' as const)
  }

  return now - lastMessageAt > SYSTEM_READINESS_STALE_AFTER_MS
    ? ('stale' as const)
    : ('live' as const)
}

function createMockSystemReadiness(taskId: number): SystemReadiness {
  return {
    overallReady: taskId === 0,
    canStartTask: taskId === 0,
    taskId: Math.max(0, Math.round(taskId)),
    taskName: taskId > 0 ? `mock_task_${taskId}` : '',
    taskMapName: taskId > 0 ? 'mock_map' : '',
    taskZoneId: taskId > 0 ? 'mock_zone' : '',
    taskPlanProfile: taskId > 0 ? 'cover_standard' : '',
    activeMapName: 'mock_map',
    activeMapId: 'mock_map_id',
    activeMapMd5: 'mock_map_md5',
    runtimeMapName: 'mock_map',
    runtimeMapId: 'mock_runtime_map_id',
    runtimeMapMd5: 'mock_runtime_map_md5',
    missionState: 'IDLE',
    phase: 'IDLE',
    publicState: 'IDLE',
    executorState: 'IDLE',
    dockSupplyState: 'READY',
    batterySoc: 0.8,
    batteryValid: true,
    blockingReasons:
      taskId === 0 ? [] : ['mock task config has not been verified against live backend'],
    warnings: taskId === 0 ? ['mock data'] : ['mock data', 'task-aware readiness is mocked'],
    checks: [
      {
        key: 'runtime_map',
        level: 'ok',
        ok: true,
        fresh: true,
        stale: false,
        missing: false,
        ageS: 0,
        summary: 'Mock runtime map is ready.',
        raw: {},
      },
    ],
    stampMs: Date.now(),
    raw: {},
  }
}

export function useSystemReadiness(
  taskId: number,
  snapshot: RosConnectionSnapshot,
) {
  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'
  const [clock, setClock] = useState(0)

  const serviceQuery = useQuery({
    queryKey: ['system-readiness', taskId, snapshot.sessionId],
    queryFn: () => getSystemReadiness(taskId),
    enabled: servicesReady,
    retry: false,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
    refetchInterval: servicesReady && snapshot.status !== 'mock' ? 1_000 : false,
    refetchIntervalInBackground: true,
  })

  const topicQuery = useQuery({
    queryKey: ['system-readiness-topic', snapshot.sessionId],
    queryFn: () => fetchGatewaySystemReadinessTopicSnapshot(),
    enabled: servicesReady && snapshot.status !== 'mock',
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval:
      servicesReady && snapshot.status !== 'mock'
        ? SYSTEM_READINESS_TOPIC_POLL_INTERVAL_MS
        : false,
  })

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setClock(Date.now())
    }, 1000)

    return () => {
      globalThis.clearInterval(timer)
    }
  }, [])

  const topicSnapshot = useMemo(() => {
    if (snapshot.status === 'mock') {
      return {
        topicName: SYSTEM_READINESS_TOPIC_NAME,
        messageType: SYSTEM_READINESS_TOPIC_TYPE,
        publishers: ['mock://coverage_task_manager/system_readiness'],
        subscribers: ['site-gateway'],
        metaError: null,
        subscribeError: null,
        health: 'live',
        messageCount: 1,
        lastMessageAt: clock,
        ageMs: 0,
        readiness: createMockSystemReadiness(taskId),
      } satisfies SystemReadinessTopicSnapshot
    }

    const topicData = topicQuery.data
    const lastMessageAt = topicData?.lastMessageAt ?? null
    const ageMs = lastMessageAt === null ? null : Math.max(0, clock - lastMessageAt)
    const publishers = topicData?.publishers ?? []

    return {
      topicName: topicData?.topicName || SYSTEM_READINESS_TOPIC_NAME,
      messageType: topicData?.messageType || SYSTEM_READINESS_TOPIC_TYPE,
      publishers,
      subscribers: topicData?.subscribers ?? [],
      metaError: topicData?.metaError ?? null,
      subscribeError: topicData?.subscribeError ?? null,
      health: getTopicHealth(servicesReady, '', publishers, lastMessageAt, clock),
      messageCount: topicData?.messageCount ?? 0,
      lastMessageAt,
      ageMs,
      readiness: topicData?.payload ?? null,
    } satisfies SystemReadinessTopicSnapshot
  }, [clock, servicesReady, snapshot.status, taskId, topicQuery.data])

  const topicMatchesTask = Boolean(
    topicSnapshot.readiness &&
      (taskId === 0
        ? topicSnapshot.readiness.taskId === 0
        : topicSnapshot.readiness.taskId === taskId),
  )

  const effectiveReadiness = useMemo(() => {
    if (topicSnapshot.health === 'live' && topicSnapshot.readiness && topicMatchesTask) {
      return topicSnapshot.readiness
    }

    return serviceQuery.data?.readiness ?? null
  }, [serviceQuery.data?.readiness, topicMatchesTask, topicSnapshot.health, topicSnapshot.readiness])

  return {
    serviceQuery,
    topicSnapshot,
    effectiveReadiness,
    topicMatchesTask,
  }
}
