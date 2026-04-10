import type { AreaEntity } from './map-editor'

export type ZoneCatalogAvailability = 'active' | 'historical' | 'unknown'

export interface ZoneCatalogEntry {
  zoneId: string
  displayName: string
  enabled: boolean
  availability: ZoneCatalogAvailability
  planProfileName: string
  estimatedLengthM: number | null
  estimatedDurationS: number | null
  zone: AreaEntity
}
