export interface TaskEntity {
  id: number
  name: string
  enabled: boolean
  status: number | null
  mapName: string
  zoneId: string
  planProfileName: string
  sysProfileName: string
  cleanMode: string
  returnToDockOnFinish: boolean
  repeatAfterFullCharge: boolean
  loops: number | null
  metadata: Record<string, unknown>
  raw: Record<string, unknown>
}

export interface TaskDraftInput {
  taskId: number
  name: string
  enabled: boolean
  status: number
  mapName: string
  zoneId: string
  planProfileName: string
  sysProfileName: string
  cleanMode: string
  returnToDockOnFinish: boolean
  repeatAfterFullCharge: boolean
  loops: number | null
}
