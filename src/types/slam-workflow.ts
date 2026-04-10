export type JsonRecord = Record<string, unknown>

export type SlamActionKind =
  | 'switch_map_and_localize'
  | 'relocalize'
  | 'start_mapping'
  | 'save_map'
  | 'stop_mapping'
  | 'prepare_for_task'

export type SlamJobTerminalState =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'MANUAL_ASSIST_REQUIRED'
  | 'CANCELED'

export type SlamTopicHealth =
  | 'disconnected'
  | 'waiting'
  | 'live'
  | 'stale'
  | 'unavailable'

export interface SubmitSlamWorkflowRequest {
  robotId?: string
  mapName?: string
  frameId?: string
  hasInitialPose?: boolean
  initialPoseX?: number
  initialPoseY?: number
  initialPoseYaw?: number
  saveMapName?: string
  includeUnfinishedSubmaps?: boolean
  setActiveOnSave?: boolean
  switchToLocalizationAfterSave?: boolean
  relocalizeAfterSwitch?: boolean
}

export interface SlamWorkflowState {
  workflowState: string
  workflowPhase: string
  busy: boolean
  activeJobId: string
  runtimeMode: string
  runtimeMapName: string
  runtimeMapId: string
  runtimeMapMd5: string
  assetActiveMapName: string
  runtimeMapMatch: boolean | null
  localizationState: string
  localizationValid: boolean | null
  mappingSessionActive: boolean
  taskReady: boolean
  manualAssistRequired: boolean
  progressText: string
  blockingReason: string
  lastErrorCode: string
  lastErrorMessage: string
  updatedTs: number | null
  raw: JsonRecord
}

export interface SlamWorkflowJob {
  jobId: string
  jobType: string
  jobState: string
  workflowPhase: string
  progressPercent: number | null
  progressText: string
  resultSuccess: boolean | null
  resultCode: string
  resultMessage: string
  runtimeMapName: string
  runtimeMapMatch: boolean | null
  localizationState: string
  localizationValid: boolean | null
  manualAssistRequired: boolean
  createdTs: number | null
  updatedTs: number | null
  finishedTs: number | null
  raw: JsonRecord
}

export interface SlamSubmitJobResponse {
  accepted: boolean
  message: string
  jobId: string
  jobType: string
  workflowState: string
  manualAssistRequired: boolean
  raw: JsonRecord
}

export interface SlamCancelJobResponse {
  success: boolean
  message: string
  jobState: string
  raw: JsonRecord
}

export interface SlamSyncRuntimeStateResponse {
  success: boolean
  message: string
  state: SlamWorkflowState | null
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

export interface SlamCommandPreview {
  title: string
  payload: unknown
}
