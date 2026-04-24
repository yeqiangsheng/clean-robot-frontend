import { PROFILE_CATALOG_QUERY_CONTRACT } from './queryContracts'
import { callAppFirstReadQueryService } from './readQueryFallback'

import type { ProfileCatalogEntry, ProfileKind } from '../../types/profileCatalog'
import { normalizeCleanModeList } from '../../utils/cleanMode'

type JsonRecord = Record<string, unknown>

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMaybeJson<T>(value: T): T | unknown {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }

  return value
}

function pickValue(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (key in record) {
      return parseMaybeJson(record[key])
    }
  }

  return null
}

function pickString(record: JsonRecord, keys: string[]) {
  const value = pickValue(record, keys)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''
}

function pickBoolean(record: JsonRecord, keys: string[]) {
  const value = pickValue(record, keys)

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }

  return false
}

function pickStringArray(record: JsonRecord, keys: string[]) {
  const value = pickValue(record, keys)

  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function getResponseSuccess(payload: unknown) {
  return isRecord(payload) && typeof payload.success === 'boolean' ? payload.success : null
}

function getResponseMessage(payload: unknown) {
  return isRecord(payload) && typeof payload.message === 'string' ? payload.message : null
}

function createServiceError(payload: unknown, fallbackMessage: string) {
  return new Error(getResponseMessage(payload) ?? fallbackMessage)
}

function normalizeProfileKind(value: string): ProfileKind {
  return value === 'plan' || value === 'sys' ? value : ''
}

function normalizeProfileEntry(record: JsonRecord): ProfileCatalogEntry {
  return {
    profileName: pickString(record, ['profile_name', 'profileName']),
    displayName:
      pickString(record, ['display_name', 'displayName']) ||
      pickString(record, ['profile_name', 'profileName']),
    profileKind: normalizeProfileKind(
      pickString(record, ['profile_kind', 'profileKind']),
    ),
    enabled: pickBoolean(record, ['enabled']),
    isDefault: pickBoolean(record, ['is_default', 'isDefault']),
    description: pickString(record, ['description']),
    version: pickString(record, ['version']),
    tags: pickStringArray(record, ['tags']),
    supportedCleanModes: normalizeCleanModeList(
      pickStringArray(record, [
        'supported_clean_modes',
        'supportedCleanModes',
      ]),
    ),
    supportedMaps: pickStringArray(record, ['supported_maps', 'supportedMaps']),
    warnings: pickStringArray(record, ['warnings']),
    raw: record,
  }
}

const mockProfiles: ProfileCatalogEntry[] = [
  {
    profileName: 'cover_standard',
    displayName: 'cover_standard',
    profileKind: 'plan',
    enabled: true,
    isDefault: true,
    description: '',
    version: '',
    tags: ['normal'],
    supportedCleanModes: [],
    supportedMaps: [],
    warnings: [],
    raw: {},
  },
  {
    profileName: 'standard',
    displayName: 'standard',
    profileKind: 'sys',
    enabled: true,
    isDefault: true,
    description: '',
    version: '',
    tags: [],
    supportedCleanModes: [],
    supportedMaps: [],
    warnings: [],
    raw: {},
  },
]

function normalizeProfileCatalogEntries(payload: unknown) {
  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Profile catalog query returned an error.')
  }

  const profiles = Array.isArray(payload)
    ? payload.filter((item) => isRecord(item))
    : isRecord(payload) && Array.isArray(payload.profiles)
      ? payload.profiles.filter((item) => isRecord(item))
      : null

  if (!profiles) {
    return null
  }

  return profiles
    .map((record) => normalizeProfileEntry(record))
    .filter((entry) => entry.profileName.length > 0)
}

export async function fetchProfileCatalog(options: {
  profileKind: ProfileKind
  includeDisabled?: boolean
  mapName?: string | null
}) {
  if (USE_MOCK_DATA) {
    return mockProfiles.filter(
      (profile) =>
        profile.profileKind === options.profileKind &&
        (options.includeDisabled ? true : profile.enabled),
    )
  }

  const request = {
    profile_kind: options.profileKind,
    include_disabled: options.includeDisabled ?? false,
    map_name: options.mapName?.trim() ?? '',
  }

  return callAppFirstReadQueryService({
    contract: PROFILE_CATALOG_QUERY_CONTRACT,
    request,
    evaluateAppResponse: (payload) => {
      try {
        const normalized = normalizeProfileCatalogEntries(payload)

        return normalized
          ? {
              kind: 'success',
              value: normalized,
            }
          : {
              kind: 'fallback',
              reason: 'App profile catalog query returned no usable profiles list.',
            }
      } catch (error) {
        return {
          kind: 'error',
          error:
            error instanceof Error
              ? error
              : new Error('Profile catalog query returned an error.'),
        }
      }
    },
    mapLegacyResponse: (payload) => {
      const normalized = normalizeProfileCatalogEntries(payload)

      if (!normalized) {
        throw new Error(
          'Legacy profile catalog query returned no usable profiles list.',
        )
      }

      return normalized
    },
  })
}
