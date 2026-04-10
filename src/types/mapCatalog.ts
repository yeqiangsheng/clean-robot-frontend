export interface MapCatalogEntry {
  mapName: string
  displayName: string
  enabled: boolean
  isActive: boolean
  mapId: string
  mapMd5: string
  raw: Record<string, unknown>
}
