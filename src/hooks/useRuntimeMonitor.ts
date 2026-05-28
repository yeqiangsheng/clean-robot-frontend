import { useEffect, useMemo, useState } from 'react'

import { useQuery } from '@tanstack/react-query'

import { fetchGatewayRuntimeTopicSnapshots } from '../api/gateway/siteGatewayStatusClient'
import { getRuntimeTopicConfigs, RUNTIME_TOPIC_CONFIGS } from '../api/contracts/runtimeTopicConfigs'
import type { RosConnectionSnapshot } from '../types/ros'
import type {
  RuntimeMonitorOptions,
  RuntimeTopicEntry,
  RuntimeTopicHealth,
  RuntimeTopicKey,
  RuntimeTopicSnapshot,
} from '../types/runtime'

function createEmptyTopicEntry(config: (typeof RUNTIME_TOPIC_CONFIGS)[number]): RuntimeTopicEntry {
  return {
    ...config,
    messageType: '',
    publishers: [],
    subscribers: [],
    metaError: null,
    rawMessage: null,
    messageCount: 0,
    lastMessageAt: null,
    subscribeError: null,
  }
}

function getTopicHealth(
  topic: RuntimeTopicEntry,
  isConnected: boolean,
  now: number,
): RuntimeTopicHealth {
  if (!isConnected) {
    return 'disconnected'
  }

  if (!topic.messageType) {
    return 'unavailable'
  }

  if (topic.lastMessageAt === null) {
    if (topic.messageCount > 0) {
      return 'live'
    }

    return topic.publishers.length > 0 || topic.messageType ? 'waiting' : 'unavailable'
  }

  return now - topic.lastMessageAt > topic.staleAfterMs ? 'stale' : 'live'
}

export function useRuntimeMonitor(
  snapshot: RosConnectionSnapshot,
  options: RuntimeMonitorOptions = {},
) {
  const activeTopicKeys = useMemo(() => options.topicKeys ?? [], [options.topicKeys])
  const activeConfigs = useMemo(
    () => getRuntimeTopicConfigs(activeTopicKeys),
    [activeTopicKeys],
  )
  const activeKeySet = useMemo(
    () => new Set(activeConfigs.map((config) => config.key)),
    [activeConfigs],
  )
  const activeKeySignature = useMemo(
    () => activeConfigs.map((config) => config.key).join('|'),
    [activeConfigs],
  )
  const includeEndpointInfo = options.includeEndpointInfo !== false
  const [clock, setClock] = useState(0)

  const runtimeQuery = useQuery({
    queryKey: ['runtime-topics', snapshot.sessionId, activeKeySignature, includeEndpointInfo],
    queryFn: () =>
      fetchGatewayRuntimeTopicSnapshots({
        topicKeys: activeConfigs.map((config) => config.key),
        includeEndpointInfo,
      }),
    enabled: snapshot.isConnected && snapshot.status !== 'mock',
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: snapshot.isConnected ? 1000 : false,
  })

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setClock(Date.now())
    }, 1000)

    return () => {
      globalThis.clearInterval(timer)
    }
  }, [])

  const topics = useMemo(
    () =>
      Object.fromEntries(
        RUNTIME_TOPIC_CONFIGS.map((config) => {
          if (!activeKeySet.has(config.key)) {
            return [config.key, createEmptyTopicEntry(config)]
          }

          const snapshotEntry = runtimeQuery.data?.[config.key]
          if (!snapshotEntry) {
            return [config.key, createEmptyTopicEntry(config)]
          }

          return [
            config.key,
            {
              ...config,
              messageType: snapshotEntry.messageType,
              publishers: snapshotEntry.publishers,
              subscribers: snapshotEntry.subscribers,
              metaError: snapshotEntry.metaError,
              rawMessage: snapshotEntry.payload ?? null,
              messageCount: snapshotEntry.messageCount,
              lastMessageAt: snapshotEntry.lastMessageAt,
              subscribeError: snapshotEntry.subscribeError,
            },
          ]
        }),
      ) as Record<RuntimeTopicKey, RuntimeTopicEntry>,
    [activeKeySet, runtimeQuery.data],
  )

  const metaError = useMemo(() => {
    if (runtimeQuery.error instanceof Error) {
      return runtimeQuery.error.message
    }

    return activeConfigs
      .map((config) => topics[config.key].metaError)
      .find((value): value is string => Boolean(value)) ?? null
  }, [activeConfigs, runtimeQuery.error, topics])

  const topicList = useMemo(() => {
    const isConnected = snapshot.isConnected || snapshot.status === 'mock'

    return RUNTIME_TOPIC_CONFIGS.map((config) => {
      const topic = topics[config.key]
      const ageMs = topic.lastMessageAt === null ? null : clock - topic.lastMessageAt

      return {
        ...topic,
        health: getTopicHealth(topic, isConnected, clock),
        ageMs,
      } satisfies RuntimeTopicSnapshot
    })
  }, [clock, snapshot.isConnected, snapshot.status, topics])

  const topicMap = useMemo(
    () =>
      Object.fromEntries(topicList.map((topic) => [topic.key, topic])) as Record<
        RuntimeTopicKey,
        RuntimeTopicSnapshot
      >,
    [topicList],
  )

  return {
    metaError,
    topicList,
    topicMap,
  }
}
