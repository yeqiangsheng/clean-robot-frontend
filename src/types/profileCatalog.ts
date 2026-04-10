export type ProfileKind = '' | 'plan' | 'sys'

export interface ProfileCatalogEntry {
  profileName: string
  displayName: string
  profileKind: ProfileKind
  enabled: boolean
  isDefault: boolean
  description: string
  version: string
  tags: string[]
  supportedCleanModes: string[]
  supportedMaps: string[]
  warnings: string[]
  raw: Record<string, unknown>
}
