import { startTransition, useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'
import { Topic } from 'roslib'

import { getSystemReadiness } from '../api/gateway/robotGateway'
import { getRosConnectionManager } from '../api/ros/client'
import {
  fetchSystemReadinessTopicMeta,
  normalizeSystemReadiness,
  SYSTEM_READINESS_STALE_AFTER_MS,
  SYSTEM_READINESS_TOPIC_NAME,
  SYSTEM_READINESS_TOPIC_TYPE,
} from '../api/ros/systemReadinessServices'
import type { RosConnectionSnapshot } from '../types/ros'
import type {
  SystemReadiness,
  SystemReadinessTopicSnapshot,
} from '../types/systemReadiness'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getTopicHealth(
  isConnected: boolean,
  messageType: string,
  publishers: string[],
  lastMessageAt: number | null,
  now: number,
) {
  if (!isConnected) {
    return 'disconnected' as const
  }

  if (!messageType && publishers.length === 0) {
    return 'unavailable' as const
  }

  if (lastMessageAt === null) {
    return publishers.length > 0 ? ('waiting' as const) : ('unavailable' as const)
  }

  return now - lastMessageAt > SYSTEM_READINESS_STALE_AFTER_MS
    ? ('stale' as const)
    : ('live' as const)
}

export function useSystemReadiness(
  taskId: number,
  snapshot: RosConnectionSnapshot,
) {
  const manager = getRosConnectionManager()
  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'
  const [clock, setClock] = useState(0)
  const [topicMeta, setTopicMeta] = useState({
    messageType: '',
    publishers: [] as string[],
    subscribers: [] as string[],
    metaError: null as string | null,
  })
  const [topicMessage, setTopicMessage] = useState<SystemReadiness | null>(null)
  const [messageCount, setMessageCount] = useState(0)
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  const serviceQuery = useQuery({
    queryKey: ['system-readiness', taskId, snapshot.url, snapshot.sessionId],
    queryFn: () => getSystemReadiness(taskId),
    enabled: servicesReady,
    retry: false,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
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
    if (!servicesReady) {
      const resetHandle = globalThis.setTimeout(() => {
        setTopicMeta({
          messageType: '',
          publishers: [],
          subscribers: [],
          metaError: null,
        })
        setTopicMessage(null)
        setMessageCount(0)
        setLastMessageAt(null)
        setSubscribeError(null)
      }, 0)

      return () => {
        globalThis.clearTimeout(resetHandle)
      }
    }

    if (snapshot.status === 'mock') {
      const resetHandle = globalThis.setTimeout(() => {
        setTopicMeta({
          messageType: SYSTEM_READINESS_TOPIC_TYPE,
          publishers: [],
          subscribers: [],
          metaError: null,
        })
        setTopicMessage(null)
        setMessageCount(0)
        setLastMessageAt(null)
        setSubscribeError(null)
      }, 0)

      return () => {
        globalThis.clearTimeout(resetHandle)
      }
    }

    let disposed = false

    void fetchSystemReadinessTopicMeta()
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
              : 'System readiness topic metadata failed to load.',
        })
      })

    return () => {
      disposed = true
    }
  }, [servicesReady, snapshot.sessionId, snapshot.status, snapshot.url])

  useEffect(() => {
    if (!servicesReady || snapshot.status === 'mock') {
      return
    }

    const ros = manager.getRos()
    if (!ros) {
      return
    }

    let disposed = false
    const topic = new Topic<JsonRecord>({
      ros,
      name: SYSTEM_READINESS_TOPIC_NAME,
      messageType: topicMeta.messageType || SYSTEM_READINESS_TOPIC_TYPE,
      queue_length: 1,
      throttle_rate: 0,
      reconnect_on_close: true,
    })

    topic.on('warning', (warning) => {
      if (disposed) {
        return
      }

      startTransition(() => {
        setSubscribeError(warning)
      })
    })

    topic.subscribe((message) => {
      if (disposed) {
        return
      }

      startTransition(() => {
        setTopicMessage(normalizeSystemReadiness(isRecord(message) ? message : null))
        setMessageCount((count) => count + 1)
        setLastMessageAt(Date.now())
        setSubscribeError(null)
      })
    })

    return () => {
      disposed = true
      topic.unsubscribe()
    }
  }, [manager, servicesReady, snapshot.sessionId, snapshot.status, topicMeta.messageType])

  const topicSnapshot = useMemo(() => {
    const ageMs = lastMessageAt === null ? null : clock - lastMessageAt

    return {
      topicName: SYSTEM_READINESS_TOPIC_NAME,
      messageType: topicMeta.messageType || SYSTEM_READINESS_TOPIC_TYPE,
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
      readiness: topicMessage,
    } satisfies SystemReadinessTopicSnapshot
  }, [
    clock,
    lastMessageAt,
    messageCount,
    servicesReady,
    subscribeError,
    topicMessage,
    topicMeta,
  ])

  const topicMatchesTask = Boolean(
    topicMessage && (taskId === 0 ? topicMessage.taskId === 0 : topicMessage.taskId === taskId),
  )

  const effectiveReadiness = useMemo(() => {
    if (topicSnapshot.readiness && topicMatchesTask) {
      return topicSnapshot.readiness
    }

    return serviceQuery.data?.readiness ?? null
  }, [serviceQuery.data?.readiness, topicMatchesTask, topicSnapshot.readiness])

  return {
    serviceQuery,
    topicSnapshot,
    effectiveReadiness,
    topicMatchesTask,
  }
}
