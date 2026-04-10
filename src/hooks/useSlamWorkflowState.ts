import { startTransition, useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import {
  getSlamWorkflowState,
  SLAM_DEFAULT_ROBOT_ID,
  SLAM_STATE_QUERY_INTERVAL_MS,
} from '../api/ros/slamWorkflowServices'
import {
  fetchSlamWorkflowTopicMeta,
  SLAM_WORKFLOW_STATE_TOPIC_TYPE,
  SLAM_WORKFLOW_TOPIC_STALE_AFTER_MS,
  subscribeToSlamWorkflowState,
} from '../api/ros/slamWorkflowTopics'
import type { RosConnectionSnapshot } from '../types/ros'
import type {
  SlamTopicHealth,
  SlamWorkflowState,
  SlamWorkflowTopicSnapshot,
} from '../types/slam-workflow'

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

  if (!messageType && publishers.length === 0) {
    return 'unavailable'
  }

  if (lastMessageAt === null) {
    return messageType || publishers.length > 0 ? 'waiting' : 'unavailable'
  }

  return now - lastMessageAt > SLAM_WORKFLOW_TOPIC_STALE_AFTER_MS ? 'stale' : 'live'
}

function createMockSlamWorkflowState(): SlamWorkflowState {
  return {
    workflowState: 'READY',
    workflowPhase: 'mock',
    busy: false,
    activeJobId: '',
    runtimeMode: 'LOCALIZATION',
    runtimeMapName: 'mock_map',
    runtimeMapId: 'mock-map-001',
    runtimeMapMd5: 'mock-map-md5',
    assetActiveMapName: 'mock_map',
    runtimeMapMatch: true,
    localizationState: 'localized',
    localizationValid: true,
    mappingSessionActive: false,
    taskReady: true,
    manualAssistRequired: false,
    progressText: 'mock slam state ready',
    blockingReason: '',
    lastErrorCode: '',
    lastErrorMessage: '',
    updatedTs: Date.now(),
    raw: {
      source: 'mock',
    },
  }
}

export function useSlamWorkflowState(snapshot: RosConnectionSnapshot) {
  const servicesReady = snapshot.isConnected
  const useMockState = snapshot.status === 'mock'
  const [clock, setClock] = useState(() => Date.now())
  const [topicMeta, setTopicMeta] = useState({
    messageType: '',
    publishers: [] as string[],
    subscribers: [] as string[],
    metaError: null as string | null,
  })
  const [topicState, setTopicState] = useState<SlamWorkflowState | null>(null)
  const [messageCount, setMessageCount] = useState(0)
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const mockState = useMemo(() => createMockSlamWorkflowState(), [])

  const serviceQuery = useQuery({
    queryKey: ['slam-workflow', 'state', snapshot.url, snapshot.sessionId],
    queryFn: () => getSlamWorkflowState(SLAM_DEFAULT_ROBOT_ID),
    enabled: servicesReady && !useMockState,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: servicesReady ? SLAM_STATE_QUERY_INTERVAL_MS : false,
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
    if (!servicesReady && !useMockState) {
      const resetHandle = globalThis.setTimeout(() => {
        setTopicMeta({
          messageType: '',
          publishers: [],
          subscribers: [],
          metaError: null,
        })
        setTopicState(null)
        setMessageCount(0)
        setLastMessageAt(null)
        setSubscribeError(null)
      }, 0)

      return () => {
        globalThis.clearTimeout(resetHandle)
      }
    }

    if (useMockState) {
      const mockHandle = globalThis.setTimeout(() => {
        setTopicMeta({
          messageType: SLAM_WORKFLOW_STATE_TOPIC_TYPE,
          publishers: ['mock://slam-workflow-state'],
          subscribers: ['clean-robot-frontend'],
          metaError: null,
        })
        setTopicState(mockState)
        setMessageCount(1)
        setLastMessageAt(Date.now())
        setSubscribeError(null)
      }, 0)

      return () => {
        globalThis.clearTimeout(mockHandle)
      }
    }

    let disposed = false

    void fetchSlamWorkflowTopicMeta()
      .then((meta) => {
        if (disposed) {
          return
        }

        setTopicMeta(meta)
      })
      .catch((error) => {
        if (disposed) {
          return
        }

        setTopicMeta({
          messageType: '',
          publishers: [],
          subscribers: [],
          metaError:
            error instanceof Error
              ? error.message
              : 'SLAM workflow topic metadata failed to load.',
        })
      })

    return () => {
      disposed = true
    }
  }, [mockState, servicesReady, snapshot.sessionId, snapshot.url, useMockState])

  useEffect(() => {
    if (!servicesReady || useMockState) {
      return
    }

    let disposed = false

    const unsubscribe = subscribeToSlamWorkflowState({
      onMessage: (state) => {
        if (disposed) {
          return
        }

        startTransition(() => {
          setTopicState(state)
          setMessageCount((count) => count + 1)
          setLastMessageAt(Date.now())
          setSubscribeError(null)
        })
      },
      onWarning: (warning) => {
        if (disposed) {
          return
        }

        startTransition(() => {
          setSubscribeError(warning)
        })
      },
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [servicesReady, snapshot.sessionId, useMockState])

  const topicSnapshot = useMemo(() => {
    const ageMs =
      lastMessageAt === null ? null : Math.max(0, clock - lastMessageAt)

    if (useMockState) {
      return {
        messageType: SLAM_WORKFLOW_STATE_TOPIC_TYPE,
        publishers: ['mock://slam-workflow-state'],
        subscribers: ['clean-robot-frontend'],
        metaError: null,
        subscribeError: null,
        health: 'live',
        messageCount: 1,
        lastMessageAt: lastMessageAt ?? clock,
        ageMs: 0,
        state: mockState,
      } satisfies SlamWorkflowTopicSnapshot
    }

    return {
      messageType: topicMeta.messageType || SLAM_WORKFLOW_STATE_TOPIC_TYPE,
      publishers: topicMeta.publishers,
      subscribers: topicMeta.subscribers,
      metaError: topicMeta.metaError,
      subscribeError,
      health: getTopicHealth(
        servicesReady,
        topicMeta.messageType,
        topicMeta.publishers,
        lastMessageAt,
        clock,
      ),
      messageCount,
      lastMessageAt,
      ageMs,
      state: topicState,
    } satisfies SlamWorkflowTopicSnapshot
  }, [
    clock,
    lastMessageAt,
    messageCount,
    mockState,
    servicesReady,
    subscribeError,
    topicMeta,
    topicState,
    useMockState,
  ])

  const effectiveState = useMemo(
    () => (useMockState ? mockState : topicSnapshot.state ?? serviceQuery.data ?? null),
    [mockState, serviceQuery.data, topicSnapshot.state, useMockState],
  )

  return {
    serviceQuery,
    topicSnapshot,
    effectiveState,
    isStateStale: topicSnapshot.health === 'stale',
    refresh: () => serviceQuery.refetch(),
  }
}
