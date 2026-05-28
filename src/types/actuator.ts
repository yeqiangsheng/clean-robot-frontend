export type ActuatorCommand =
  | { kind: 'waterSequence'; enabled: boolean; level?: number }
  | { kind: 'vacuumChain'; enabled: boolean; level?: number }
  | { kind: 'brushWorkPosition' }
  | { kind: 'brushRetract' }
  | { kind: 'scraperDeploy' }
  | { kind: 'scraperStow' }
  | { kind: 'dockSupplyStart' }
  | { kind: 'dockSupplyCancel' }
  | { kind: 'dockSupplyDeferExit'; enabled: boolean }
  | { kind: 'dockSupplyExit' }
  | { kind: 'chargingSequence'; enabled: boolean }
  | { kind: 'stationRefillSequence'; enabled: boolean }
  | { kind: 'stationDrainSequence'; enabled: boolean }
  | { kind: 'stationRodConnect' }
  | { kind: 'stationRodReset' }

export type ActuatorCommandState = 'idle' | 'sending' | 'sent' | 'failed'

export interface ActuatorLastCommand {
  kind: string
  state: ActuatorCommandState
  startedAtMs: number
  sentAtMs: number
  failedAtMs: number | null
  message: string
}

export interface ActuatorPositionState {
  position: number | null
  label: string
}

export interface ActuatorTopicStatus {
  topicName: string
  messageType: string
  fresh: boolean
  ageMs: number | null
}

export interface ActuatorStatus {
  ok?: boolean
  success: boolean
  rosbridge?: string
  available: boolean
  disabledReasons: string[]
  mcoreConnected: boolean
  stationConnected?: boolean
  dockSupplyState?: string
  cleanLevel: number | null
  sewageLevel: number | null
  batteryPercentage: number | null
  batteryVoltage: number | null
  batteryCurrent?: number | null
  station?: {
    agvInPlace: boolean
    rodConnected: boolean
    rodReset: boolean
    rawStatus: boolean[]
  }
  battery?: {
    percentage: number | null
    voltage: number | null
    current: number | null
  }
  levels?: {
    cleanLevel: number | null
    sewageLevel: number | null
  }
  capabilities?: {
    dockSupply: boolean
    stationIo: boolean
    mechanicalConnect: boolean
  }
  brush: ActuatorPositionState
  scraper: ActuatorPositionState
  lastCommand: ActuatorLastCommand
  topics: {
    combinedStatus: ActuatorTopicStatus
    mcoreConnected: ActuatorTopicStatus
    stationConnected?: ActuatorTopicStatus
    dockSupplyState?: ActuatorTopicStatus
    stationStatus?: ActuatorTopicStatus
    batteryState?: ActuatorTopicStatus
  }
}
