export const DOCK_CALIBRATION_OPERATIONS = {
  GET: 0,
  SAVE_STAGE1: 1,
  SAVE_STAGE2: 2,
  SET_STAGE1: 3,
  SET_STAGE2: 4,
  RELOAD: 5,
} as const

export type DockCalibrationOperation =
  (typeof DOCK_CALIBRATION_OPERATIONS)[keyof typeof DOCK_CALIBRATION_OPERATIONS]

export interface DockCalibrationState {
  trackedPoseFresh: boolean
  trackedPoseFrame: string
  currentX: number | null
  currentY: number | null
  currentYaw: number | null
  stage1Set: boolean
  stage1X: number | null
  stage1Y: number | null
  stage1Yaw: number | null
  stage2Set: boolean
  stage2X: number | null
  stage2Y: number | null
  stage2Yaw: number | null
  dockPoseFresh: boolean
  dockPoseX: number | null
  dockPoseY: number | null
  dockPoseYaw: number | null
  dockScoreFresh: boolean
  dockScore: number | null
  dockScoreThreshold: number | null
  dockScoreLowerIsBetter: boolean
  dockPoseQualityOk: boolean
  stage2SaveRecommended: boolean
  warnings: string[]
  storagePath: string
  raw: Record<string, unknown>
}

export interface DockCalibrationStatusResult {
  success: boolean
  message: string
  state: DockCalibrationState | null
  raw: Record<string, unknown>
}

export interface DockCalibrationCommandInput {
  operation: DockCalibrationOperation
  robotId?: string
  requireStage2Quality?: boolean
  x?: number
  y?: number
  yaw?: number
}

export interface DockCalibrationCommandResult extends DockCalibrationStatusResult {
  operation: DockCalibrationOperation
}
