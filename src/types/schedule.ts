export interface ScheduleEntity {
  id: string
  taskId: number
  taskName: string
  enabled: boolean
  type: string
  dow: number[]
  time: string
  at: string
  timezone: string
  startDate: string
  endDate: string
  mapName: string
  zoneId: string
  loops: number | null
  planProfileName: string
  sysProfileName: string
  cleanMode: string
  returnToDockOnFinish: boolean
  repeatAfterFullCharge: boolean
  lastFireTs: number | null
  lastDoneTs: number | null
  lastStatus: string
  metadata: Record<string, unknown>
  raw: Record<string, unknown>
}

export interface ScheduleDraftInput {
  scheduleId: string
  taskId: number
  enabled: boolean
  type: string
  dow: number[]
  time: string
  at: string
  timezone: string
  startDate: string
  endDate: string
}
