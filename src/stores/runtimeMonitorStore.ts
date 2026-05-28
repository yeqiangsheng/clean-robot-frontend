import { create } from 'zustand'

import { RUNTIME_TOPIC_CONFIGS } from '../api/contracts/runtimeTopicConfigs'
import type {
  RuntimeTopicKey,
  RuntimeTopicSnapshot,
} from '../types/runtime'

interface RuntimeMonitorState {
  metaError: string | null
  topicList: RuntimeTopicSnapshot[]
  topicMap: Record<RuntimeTopicKey, RuntimeTopicSnapshot>
  setMonitorData: (payload: {
    metaError: string | null
    topicList: RuntimeTopicSnapshot[]
    topicMap: Record<RuntimeTopicKey, RuntimeTopicSnapshot>
  }) => void
  reset: () => void
}

function createEmptyTopicMap() {
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
        health: 'disconnected',
        ageMs: null,
      }

      return collection
    },
    {} as Record<RuntimeTopicKey, RuntimeTopicSnapshot>,
  )
}

function createEmptyTopicList(topicMap: Record<RuntimeTopicKey, RuntimeTopicSnapshot>) {
  return RUNTIME_TOPIC_CONFIGS.map((config) => topicMap[config.key])
}

const initialTopicMap = createEmptyTopicMap()

const initialState = {
  metaError: null,
  topicMap: initialTopicMap,
  topicList: createEmptyTopicList(initialTopicMap),
}

export const useRuntimeMonitorStore = create<RuntimeMonitorState>((set) => ({
  ...initialState,
  setMonitorData: ({ metaError, topicList, topicMap }) =>
    set({
      metaError,
      topicList,
      topicMap,
    }),
  reset: () =>
    set({
      metaError: null,
      topicMap: createEmptyTopicMap(),
      topicList: createEmptyTopicList(createEmptyTopicMap()),
    }),
}))
