export type ManualDriveAction = 'move' | 'stop'

export type ManualDriveDirection = 'forward' | 'backward' | 'turn_left' | 'turn_right'

export interface ManualDriveCommandInput {
  action: ManualDriveAction
  direction?: ManualDriveDirection
  linear_mps?: number
  angular_radps?: number
  duration_ms?: number
}

export interface ManualDriveCommandResult {
  success: boolean
  message: string
  action?: ManualDriveAction
  direction?: ManualDriveDirection
  active?: boolean
  allowed?: boolean | null
  blockedReasons: string[]
  raw: Record<string, unknown>
}

export interface ManualDriveStatus {
  enabled: boolean
  active: boolean
  allowed: boolean
  blockedReasons: string[]
  lastDirection: ManualDriveDirection | null
  lastCommandAt: number | null
  watchdogTimeoutMs: number
  linearMpsLimit: number
  angularRadpsLimit: number
  supportsStrafe: boolean
  raw: Record<string, unknown>
}
