import { getRosConnectionManager } from './client'
import { setRosDebugEvent } from './debug'
import { MAP_CATALOG_SERVICE } from './serviceNames'

import type { MapCatalogEntry } from '../../types/mapCatalog'
import type { RosServiceRequest } from '../../types/ros'

type JsonRecord = Record<string, unknown>

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

const MAP_SERVICE_NAME = MAP_CATALOG_SERVICE.canonicalName
const MAP_SERVICE_TYPE = MAP_CATALOG_SERVICE.serviceType
const MAP_DEPRECATED_FALLBACK_SERVICE_NAME =
  MAP_CATALOG_SERVICE.deprecatedFallbackName
const MAP_OPERATIONS = {
  add: 1,
  getAll: 4,
} as const

export interface ImportCurrentMapAssetInput {
  mapName: string
  description?: string | null
  setActive: boolean
}

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

function getResponseSuccess(payload: unknown) {
  return isRecord(payload) && typeof payload.success === 'boolean' ? payload.success : null
}

function getResponseMessage(payload: unknown) {
  return isRecord(payload) && typeof payload.message === 'string' ? payload.message : null
}

function createServiceError(payload: unknown, fallbackMessage: string) {
  return new Error(getResponseMessage(payload) ?? fallbackMessage)
}

async function callRosService(payload: RosServiceRequest) {
  const client = getRosConnectionManager()

  const callService = (serviceName: string) =>
    client.callService<RosServiceRequest, JsonRecord>({
      serviceName,
      serviceType: MAP_SERVICE_TYPE,
      request: payload,
    })

  try {
    return await callService(MAP_SERVICE_NAME)
  } catch (canonicalError) {
    setRosDebugEvent(`map:deprecated-fallback:${MAP_DEPRECATED_FALLBACK_SERVICE_NAME}`)

    try {
      return await callService(MAP_DEPRECATED_FALLBACK_SERVICE_NAME)
    } catch (fallbackError) {
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : `Deprecated fallback map service ${MAP_DEPRECATED_FALLBACK_SERVICE_NAME} failed.`
      const normalizedFallbackError = new Error(fallbackMessage)

      if (canonicalError instanceof Error && canonicalError.message.trim().length > 0) {
        normalizedFallbackError.message = `${normalizedFallbackError.message} (canonical failure: ${canonicalError.message})`
      }

      throw normalizedFallbackError
    }
  }
}

function normalizeMapEntry(record: JsonRecord): MapCatalogEntry {
  const mapName = pickString(record, ['map_name', 'mapName', 'name'])

  return {
    mapName,
    displayName: pickString(record, ['display_name', 'displayName']) || mapName,
    enabled: pickBoolean(record, ['enabled']),
    isActive: pickBoolean(record, ['is_active', 'isActive']),
    mapId: pickString(record, ['map_id', 'mapId', 'id']),
    mapMd5: pickString(record, ['map_md5', 'mapMd5']),
    raw: record,
  }
}

const mockMaps: MapCatalogEntry[] = [
  {
    mapName: 'mock_map',
    displayName: 'mock_map',
    enabled: true,
    isActive: true,
    mapId: 'mock-map-001',
    mapMd5: '',
    raw: {},
  },
]

export async function importCurrentMapAsset(input: ImportCurrentMapAssetInput) {
  const mapName = input.mapName.trim()

  if (!mapName) {
    throw new Error('map_name is required before importing a map asset.')
  }

  if (USE_MOCK_DATA) {
    return {
      message: `mock import completed for ${mapName}`,
      map: {
        mapName,
        displayName: mapName,
        enabled: true,
        isActive: input.setActive,
        mapId: `mock-${mapName}`,
        mapMd5: '',
        raw: {
          map_name: mapName,
          description: input.description?.trim() ?? '',
          is_active: input.setActive,
        },
      } satisfies MapCatalogEntry,
      raw: {},
    }
  }

  const payload = await callRosService({
    operation: MAP_OPERATIONS.add,
    map_name: mapName,
    map: {
      map_name: mapName,
      description: input.description?.trim() ?? '',
    },
    set_active: input.setActive,
    enabled_state: 0,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Map import returned an error.')
  }

  const mapRecord = isRecord(payload.map) ? payload.map : null

  return {
    message: getResponseMessage(payload) ?? 'ok',
    map: mapRecord ? normalizeMapEntry(mapRecord) : null,
    raw: payload,
  }
}

export async function fetchMapCatalog() {
  if (USE_MOCK_DATA) {
    return mockMaps
  }

  const payload = await callRosService({
    operation: MAP_OPERATIONS.getAll,
    map_name: '',
    map: {},
    set_active: false,
    enabled_state: 0,
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Map catalog query returned an error.')
  }

  const maps = Array.isArray(payload.maps)
    ? payload.maps.filter((item) => isRecord(item))
    : []

  return maps
    .map((record) => normalizeMapEntry(record))
    .filter((entry) => entry.mapName.length > 0)
}
