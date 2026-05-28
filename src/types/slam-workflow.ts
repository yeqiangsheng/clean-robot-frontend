export type JsonRecord = Record<string, unknown>

export type SlamActionKind =
  | 'switch_map'
  | 'relocalize'
  | 'restart_localization'
  | 'start_mapping'
  | 'save_mapping'
  | 'stop_mapping'

export type SlamTopicHealth =
  | 'disconnected'
  | 'waiting'
  | 'live'
  | 'stale'
  | 'unavailable'

export interface SubmitSlamWorkflowRequest {
  robotId?: string
  mapName?: string
  setActive?: boolean
  description?: string
  refreshMapIdentity?: boolean
  restartLocalizationAfterSwitch?: boolean
}

export interface SlamWorkflowState {
  desiredMode: string
  currentMode: string
  activeMapName: string
  activeMapId: string
  activeMapMd5: string
  runtimeMapName: string
  runtimeMapId: string
  runtimeMapMd5: string
  localizationState: string
  localizationValid: boolean | null
  runtimeMapReady: boolean | null
  activeMapMatch: boolean | null
  lifecycleState: string
  activeJobId: string
  activeJobStatus: string
  activeJobPhase: string
  activeJobProgress01: number | null
  mapTopicFresh: boolean | null
  mapAgeS: number | null
  trackedPoseFresh: boolean | null
  trackedPoseAgeS: number | null
  trackedPoseFrame: string
  trackedPoseX: number | null
  trackedPoseY: number | null
  trackedPoseTheta: number | null
  trackedPoseStampMs: number | null
  trackedPoseSource: string
  missionState: string
  phase: string
  publicState: string
  executorState: string
  taskRunning: boolean | null
  canSwitchMap: boolean
  canRestartLocalization: boolean
  canStartMapping: boolean
  canSaveMapping: boolean
  canStopMapping: boolean
  lastErrorCode: string
  lastErrorMessage: string
  blockingReasons: string[]
  warnings: string[]
  stampMs: number | null
  raw: JsonRecord
}

export interface SlamWorkflowJob {
  jobId: string
  robotId: string
  operation: number | null
  operationName: string
  requestedMapName: string
  resolvedMapName: string
  setActive: boolean | null
  description: string
  status: string
  phase: string
  progress01: number | null
  done: boolean
  success: boolean | null
  errorCode: string
  message: string
  currentMode: string
  localizationState: string
  createdAtMs: number | null
  startedAtMs: number | null
  finishedAtMs: number | null
  updatedAtMs: number | null
  raw: JsonRecord
}

export interface SlamSubmitJobResponse {
  accepted: boolean
  message: string
  errorCode: string
  jobId: string
  operation: number | null
  mapName: string
  job: SlamWorkflowJob | null
  raw: JsonRecord
}

export interface SlamTopicMeta {
  messageType: string
  publishers: string[]
  subscribers: string[]
  metaError: string | null
}

export interface SlamWorkflowTopicSnapshot extends SlamTopicMeta {
  health: SlamTopicHealth
  messageCount: number
  lastMessageAt: number | null
  ageMs: number | null
  subscribeError: string | null
  state: SlamWorkflowState | null
}

export interface SlamJobTopicSnapshot extends SlamTopicMeta {
  health: SlamTopicHealth
  messageCount: number
  lastMessageAt: number | null
  ageMs: number | null
  subscribeError: string | null
  job: SlamWorkflowJob | null
}

export interface SlamCommandPreview {
  title: string
  payload: unknown
}
