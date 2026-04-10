import type { AppConfig, CapabilityStatusItem } from './appShell'
import type { RosConnectionSnapshot } from './ros'
import type { RuntimeTopicSnapshot } from './runtime'

export interface DiagnosticTopicSummary {
  key: RuntimeTopicSnapshot['key']
  topicName: string
  health: RuntimeTopicSnapshot['health']
  messageType: string
  lastMessageAt: number | null
  ageMs: number | null
  metaError: string | null
  subscribeError: string | null
}

export interface DiagnosticErrorSummary {
  source: string
  message: string
}

export interface RobotDiagnosticsBundle {
  generatedAt: string
  appVersion: string
  buildTime: string
  config: AppConfig
  connection: RosConnectionSnapshot
  capabilities: CapabilityStatusItem[]
  runtimeTopics: DiagnosticTopicSummary[]
  recentAuditEvents: Array<{
    id: string
    timestamp: number
    role: string
    category: string
    action: string
    target: string
    status: string
    message: string
  }>
  lastRosDebugEvent: {
    event: string
    updatedAt: number | null
  }
  errors: DiagnosticErrorSummary[]
}
