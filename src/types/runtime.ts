export type RuntimeTopicKey =
  | 'taskState'
  | 'taskEvent'
  | 'executorState'
  | 'runProgress'
  | 'dockSupplyState'
  | 'batteryState'
  | 'combinedStatus'
  | 'stationStatus'

export type RuntimeTopicHealth =
  | 'disconnected'
  | 'unavailable'
  | 'waiting'
  | 'live'
  | 'stale'

export interface RuntimeTopicConfig {
  key: RuntimeTopicKey
  label: string
  topicName: string
  staleAfterMs: number
}

export interface RuntimeTopicMeta {
  messageType: string
  publishers: string[]
  subscribers: string[]
  metaError: string | null
}

export interface RuntimeTopicEntry extends RuntimeTopicConfig, RuntimeTopicMeta {
  rawMessage: Record<string, unknown> | null
  messageCount: number
  lastMessageAt: number | null
  subscribeError: string | null
}

export interface RuntimeTopicSnapshot extends RuntimeTopicEntry {
  health: RuntimeTopicHealth
  ageMs: number | null
}
