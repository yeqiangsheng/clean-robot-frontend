import { startTransition, useEffect, useMemo, useState } from 'react'

import { Topic } from 'roslib'

import { getRosConnectionManager } from '../api/ros/client'
import {
  RUNTIME_TOPIC_CONFIGS,
  fetchRuntimeTopicMetas,
} from '../api/ros/runtimeServices'
import type { RosConnectionSnapshot } from '../types/ros'
import type {
  RuntimeTopicEntry,
  RuntimeTopicHealth,
  RuntimeTopicKey,
  RuntimeTopicSnapshot,
} from '../types/runtime'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createInitialTopicState(): Record<RuntimeTopicKey, RuntimeTopicEntry> {
  return RUNTIME_TOPIC_CONFIGS.reduce(
    (collection, config) => {
      collection[config.key] = {
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

      return collection
    },
    {} as Record<RuntimeTopicKey, RuntimeTopicEntry>,
  )
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
    return topic.publishers.length > 0 ? 'waiting' : 'unavailable'
  }

  return now - topic.lastMessageAt > topic.staleAfterMs ? 'stale' : 'live'
}

export function useRuntimeMonitor(snapshot: RosConnectionSnapshot) {
  const manager = getRosConnectionManager()
  const [topics, setTopics] = useState<Record<RuntimeTopicKey, RuntimeTopicEntry>>(
    createInitialTopicState,
  )
  const [metaError, setMetaError] = useState<string | null>(null)
  const [clock, setClock] = useState(0)

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setClock(Date.now())
    }, 1000)

    return () => {
      globalThis.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const isConnected = snapshot.isConnected || snapshot.status === 'mock'

    if (!isConnected) {
      return
    }

    const ros = manager.getRos()

    if (!ros) {
      return
    }

    let disposed = false
    const subscriptions: Array<Topic<unknown>> = []

    const setup = async () => {
      setMetaError(null)

      const metas = await fetchRuntimeTopicMetas()

      if (disposed) {
        return
      }

      startTransition(() => {
        setTopics((previous) =>
          Object.fromEntries(
            RUNTIME_TOPIC_CONFIGS.map((config) => {
              const prior = previous[config.key]
              const meta = metas[config.key]

              return [
                config.key,
                {
                  ...config,
                  ...meta,
                  rawMessage: prior?.rawMessage ?? null,
                  messageCount: prior?.messageCount ?? 0,
                  lastMessageAt: prior?.lastMessageAt ?? null,
                  subscribeError: null,
                },
              ]
            }),
          ) as Record<RuntimeTopicKey, RuntimeTopicEntry>,
        )
      })

      const topicMetaErrors = Object.values(metas)
        .map((topic) => topic.metaError)
        .filter((value): value is string => Boolean(value))

      if (topicMetaErrors.length > 0) {
        setMetaError(topicMetaErrors[0])
      }

      for (const config of RUNTIME_TOPIC_CONFIGS) {
        const meta = metas[config.key]

        if (!meta.messageType) {
          continue
        }

        const topic = new Topic<JsonRecord>({
          ros,
          name: config.topicName,
          messageType: meta.messageType,
          queue_length: 1,
          throttle_rate: 0,
          reconnect_on_close: true,
        })

        topic.on('warning', (warning) => {
          if (disposed) {
            return
          }

          startTransition(() => {
            setTopics((previous) => ({
              ...previous,
              [config.key]: {
                ...previous[config.key],
                subscribeError: warning,
              },
            }))
          })
        })

        topic.subscribe((message) => {
          if (disposed) {
            return
          }

          startTransition(() => {
            setTopics((previous) => ({
              ...previous,
              [config.key]: {
                ...previous[config.key],
                rawMessage: isRecord(message) ? message : { value: message },
                messageCount: previous[config.key].messageCount + 1,
                lastMessageAt: Date.now(),
                subscribeError: null,
              },
            }))
          })
        })

        subscriptions.push(topic)
      }
    }

    void setup().catch((error) => {
      if (disposed) {
        return
      }

      setMetaError(
        error instanceof Error ? error.message : 'Runtime topic setup failed.',
      )
    })

    return () => {
      disposed = true
      subscriptions.forEach((topic) => topic.unsubscribe())
    }
  }, [manager, snapshot.isConnected, snapshot.sessionId, snapshot.status])

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
