import type { RuntimeTopicHealth } from './runtime'

export interface SystemReadinessCheck {
  key: string
  level: string
  ok: boolean
  fresh: boolean
  stale: boolean
  missing: boolean
  ageS: number | null
  summary: string
  raw: Record<string, unknown>
}

export interface SystemReadiness {
  overallReady: boolean
  canStartTask: boolean
  taskId: number
  taskName: string
  taskMapName: string
  taskZoneId: string
  taskPlanProfile: string
  activeMapName: string
  activeMapId: string
  activeMapMd5: string
  runtimeMapName: string
  runtimeMapId: string
  runtimeMapMd5: string
  missionState: string
  phase: string
  publicState: string
  executorState: string
  dockSupplyState: string
  batterySoc: number | null
  batteryValid: boolean | null
  blockingReasons: string[]
  warnings: string[]
  checks: SystemReadinessCheck[]
  stampMs: number | null
  raw: Record<string, unknown>
}

export interface SystemReadinessServiceResult {
  success: boolean
  message: string
  readiness: SystemReadiness | null
  raw: Record<string, unknown>
}

export interface SystemReadinessTopicSnapshot {
  topicName: string
  messageType: string
  publishers: string[]
  subscribers: string[]
  metaError: string | null
  subscribeError: string | null
  health: RuntimeTopicHealth
  messageCount: number
  lastMessageAt: number | null
  ageMs: number | null
  readiness: SystemReadiness | null
}
