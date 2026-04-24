import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { fetchGatewaySlamStateTopicSnapshot } from '../api/gateway/siteGatewayClient'
import { getSlamState } from '../api/gateway/robotGateway'
import {
  SLAM_WORKFLOW_STATE_TOPIC_TYPE,
  SLAM_WORKFLOW_TOPIC_STALE_AFTER_MS,
} from '../api/ros/slamWorkflowTopics'
import type { RosConnectionSnapshot } from '../types/ros'
import type {
  SlamTopicHealth,
  SlamWorkflowState,
  SlamWorkflowTopicSnapshot,
} from '../types/slam-workflow'
import { SLAM_STATE_QUERY_INTERVAL_MS } from '../utils/slam'

const SLAM_STATE_TOPIC_POLL_INTERVAL_MS = 1000

function getTopicHealth(
  isConnected: boolean,
  messageType: string,
  publishers: string[],
  lastMessageAt: number | null,
  now: number,
): SlamTopicHealth {
  if (!isConnected) {
    return 'disconnected'
  }

  if (lastMessageAt === null) {
    return messageType || publishers.length > 0 ? 'waiting' : 'unavailable'
  }

  return now - lastMessageAt > SLAM_WORKFLOW_TOPIC_STALE_AFTER_MS ? 'stale' : 'live'
}

function createMockSlamWorkflowState(): SlamWorkflowState {
  return {
    desiredMode: 'localization',
    currentMode: 'localization',
    activeMapName: 'mock_map',
    activeMapId: 'mock-map-001',
    activeMapMd5: 'mock-map-md5',
    runtimeMapName: 'mock_map',
    runtimeMapId: 'mock-map-001',
    runtimeMapMd5: 'mock-map-md5',
    localizationState: 'localized',
    localizationValid: true,
    runtimeMapReady: true,
    activeMapMatch: true,
    lifecycleState: 'active',
    activeJobId: '',
    activeJobStatus: '',
    activeJobPhase: '',
    activeJobProgress01: null,
    mapTopicFresh: true,
    mapAgeS: 0,
    trackedPoseFresh: true,
    trackedPoseAgeS: 0,
    missionState: 'IDLE',
    phase: 'IDLE',
    publicState: 'IDLE',
    executorState: 'IDLE',
    taskRunning: false,
    canSwitchMap: true,
    canRestartLocalization: true,
    canStartMapping: true,
    canSaveMapping: false,
    canStopMapping: false,
    lastErrorCode: '',
    lastErrorMessage: '',
    blockingReasons: [],
    warnings: ['mock data'],
    stampMs: Date.now(),
    raw: {
      source: 'mock',
    },
  }
}

export function useSlamWorkflowState(snapshot: RosConnectionSnapshot) {
  const servicesReady = snapshot.isConnected
  const useMockState = snapshot.status === 'mock'
  const [clock, setClock] = useState(() => Date.now())
  const mockState = useMemo(() => createMockSlamWorkflowState(), [])

  const serviceQuery = useQuery({
    queryKey: ['slam-state', snapshot.url, snapshot.sessionId],
    queryFn: () => getSlamState(),
    enabled: servicesReady && !useMockState,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: servicesReady ? SLAM_STATE_QUERY_INTERVAL_MS : false,
  })

  const topicQuery = useQuery({
    queryKey: ['slam-state-topic', snapshot.sessionId],
    queryFn: () => fetchGatewaySlamStateTopicSnapshot(),
    enabled: servicesReady && !useMockState,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: servicesReady ? SLAM_STATE_TOPIC_POLL_INTERVAL_MS : false,
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
    if (useMockState) {
      return {
        messageType: SLAM_WORKFLOW_STATE_TOPIC_TYPE,
        publishers: ['mock://clean_robot_server/slam_state'],
        subscribers: ['site-gateway'],
        metaError: null,
        subscribeError: null,
        health: 'live',
        messageCount: 1,
        lastMessageAt: clock,
        ageMs: 0,
        state: mockState,
      } satisfies SlamWorkflowTopicSnapshot
    }

    const topicData = topicQuery.data
    const lastMessageAt = topicData?.lastMessageAt ?? null
    const ageMs = lastMessageAt === null ? null : Math.max(0, clock - lastMessageAt)
    const messageType = topicData?.messageType || SLAM_WORKFLOW_STATE_TOPIC_TYPE
    const publishers = topicData?.publishers ?? []

    return {
      messageType,
      publishers,
      subscribers: topicData?.subscribers ?? [],
      metaError: topicData?.metaError ?? null,
      subscribeError: topicData?.subscribeError ?? null,
      health: getTopicHealth(servicesReady, messageType, publishers, lastMessageAt, clock),
      messageCount: topicData?.messageCount ?? 0,
      lastMessageAt,
      ageMs,
      state: topicData?.payload ?? null,
    } satisfies SlamWorkflowTopicSnapshot
  }, [clock, mockState, servicesReady, topicQuery.data, useMockState])

  const effectiveState = useMemo(() => {
    if (topicSnapshot.state) {
      return topicSnapshot.state
    }

    return serviceQuery.data ?? null
  }, [serviceQuery.data, topicSnapshot.state])

  return {
    serviceQuery,
    topicSnapshot,
    effectiveState,
    isStateStale:
      topicSnapshot.health === 'stale' ||
      (effectiveState?.mapTopicFresh === false && (effectiveState.mapAgeS ?? 0) > 5),
    refresh: async () => {
      await Promise.all([serviceQuery.refetch(), topicQuery.refetch()])
    },
  }
}
