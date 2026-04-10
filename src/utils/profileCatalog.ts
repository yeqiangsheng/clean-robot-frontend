import type { ProfileCatalogEntry } from '../types/profileCatalog'

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

export function formatProfileDisplayName(entry: ProfileCatalogEntry | null, fallback = '') {
  if (!entry) {
    return fallback || '--'
  }

  const baseLabel =
    entry.displayName.trim().length > 0 && entry.displayName !== entry.profileName
      ? `${entry.displayName} (${entry.profileName})`
      : entry.displayName.trim().length > 0
        ? entry.displayName
        : entry.profileName

  if (!entry.enabled) {
    return `${baseLabel} (historical)`
  }

  return entry.isDefault ? `${baseLabel} (default)` : baseLabel
}

export function formatProfileOptionLabel(entry: ProfileCatalogEntry) {
  const tokens = uniqueStrings([
    entry.isDefault ? 'default' : '',
    !entry.enabled ? 'historical' : '',
    ...entry.tags.slice(0, 2),
  ])

  const base = formatProfileDisplayName(entry, entry.profileName)
  return tokens.length > 0 ? `${base} / ${tokens.join(', ')}` : base
}

export function mergeProfileCatalogEntries(
  primaryEntries: ProfileCatalogEntry[],
  secondaryEntries: ProfileCatalogEntry[],
) {
  const byName = new Map<string, ProfileCatalogEntry>()

  primaryEntries.forEach((entry) => {
    byName.set(entry.profileName, entry)
  })

  secondaryEntries.forEach((entry) => {
    if (!byName.has(entry.profileName)) {
      byName.set(entry.profileName, entry)
    }
  })

  return Array.from(byName.values())
}

export function buildUnknownProfileEntry(profileName: string) {
  return {
    profileName,
    displayName: profileName,
    profileKind: '' as const,
    enabled: false,
    isDefault: false,
    description: '',
    version: '',
    tags: [],
    supportedCleanModes: [],
    supportedMaps: [],
    warnings: [],
    raw: {},
  } satisfies ProfileCatalogEntry
}
