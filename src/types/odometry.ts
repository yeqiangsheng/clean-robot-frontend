import type { RuntimeTopicHealth } from './runtime'
import type { Pose2D } from './map-editor'

export interface OdometryState {
  robotId: string
  odomSource: string
  odomTopic: string
  rawOdomTopic: string
  imuTopic: string
  connected: boolean | null
  wheelSpeedNodeReady: boolean | null
  imuPreprocessNodeReady: boolean | null
  ekfNodeReady: boolean | null
  wheelSpeedFresh: boolean | null
  imuFresh: boolean | null
  odomFresh: boolean | null
  odomValid: boolean | null
  wheelSpeedAgeS: number | null
  imuAgeS: number | null
  odomAgeS: number | null
  errorCode: string
  message: string
  warnings: string[]
  stampMs: number | null
  robotPose?: Pose2D | null
  raw: Record<string, unknown>
}

export interface OdometryServiceResult {
  success: boolean
  message: string
  state: OdometryState | null
  raw: Record<string, unknown>
}

export interface OdometryTopicSnapshot {
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
  state: OdometryState | null
}
