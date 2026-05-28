export interface MapCatalogEntry {
  mapName: string
  displayName: string
  enabled: boolean
  isActive: boolean
  isRuntime?: boolean
  isPendingSwitch?: boolean
  mapId: string
  mapMd5: string
  revisionId?: string
  activeRevisionId?: string
  runtimeRevisionId?: string
  raw: Record<string, unknown>
}

export interface MapAssetCleanupResult {
  success: boolean
  message: string
  maps: MapCatalogEntry[]
  dryRun: boolean
  cascade: boolean
  candidateCount: number
  deletedCount: number
  reclaimableBytes: number
  reclaimedBytes: number
  affectedZonesCount: number
  affectedPlansCount: number
  affectedTasksCount: number
  affectedSchedulesCount: number
  affectedZoneVersionsCount: number
  confirmToken: string
  deletedBusinessRefs: string
  deletedPaths: string[]
  blockedReasons: string[]
  raw: Record<string, unknown>
}

export interface MapSoftDeleteResult {
  success: boolean
  message: string
  map: MapCatalogEntry | null
  blockedReasons: string[]
  raw: Record<string, unknown>
}

export interface HardDeleteMapAssetInput {
  mapName?: string
  mapRevisionId: string
  dryRun: boolean
  cascade?: boolean
  confirmToken?: string
}

export interface CleanupDisabledMapAssetsInput {
  mapName?: string
  dryRun: boolean
  minAgeDays?: number
  maxReclaimBytes?: number
  confirmToken?: string
}

export interface ImportCurrentMapAssetInput {
  mapName: string
  description?: string | null
  setActive: boolean
}
