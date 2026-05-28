import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import {
  fetchCoverageZoneDetail,
  fetchCoverageZones,
} from '../api/gateway/mapWorkbenchGateway'
import { useRosConnection } from './useRosConnection'
import type { ZoneCatalogEntry } from '../types/zoneCatalog'
import type { ZoneCatalogAvailability } from '../types/zoneCatalog'
import type { AreaEntity } from '../types/map-editor'

function toNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toBoolean(value: unknown) {
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

function normalizeZoneCatalogEntry(
  zone: AreaEntity,
  availability: Exclude<ZoneCatalogAvailability, 'unknown'>,
): ZoneCatalogEntry {
  return {
    zoneId: zone.id,
    displayName: zone.name,
    enabled: toBoolean(zone.raw.enabled),
    availability,
    planProfileName:
      typeof zone.raw.plan_profile_name === 'string'
        ? zone.raw.plan_profile_name.trim()
        : '',
    estimatedLengthM: toNumber(zone.raw.estimated_length_m),
    estimatedDurationS: toNumber(zone.raw.estimated_duration_s),
    zone,
  }
}

function mergeZoneCatalogEntries(
  primaryEntries: ZoneCatalogEntry[],
  secondaryEntries: ZoneCatalogEntry[],
) {
  const byId = new Map<string, ZoneCatalogEntry>()

  primaryEntries.forEach((entry) => {
    byId.set(entry.zoneId, entry)
  })

  secondaryEntries.forEach((entry) => {
    if (!byId.has(entry.zoneId)) {
      byId.set(entry.zoneId, entry)
    }
  })

  return Array.from(byId.values())
}

function isNotFoundMessage(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('not found')
}

interface UseCoverageZoneCatalogOptions {
  mapName?: string | null
  selectedZoneIds?: Array<string | null | undefined>
}

export function useCoverageZoneCatalog({
  mapName,
  selectedZoneIds = [],
}: UseCoverageZoneCatalogOptions) {
  const { snapshot } = useRosConnection()
  const servicesReady = snapshot.status !== 'connecting'
  const normalizedMapName = mapName?.trim() ?? ''
  const normalizedSelectedZoneIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedZoneIds
            .map((value) => value?.trim() ?? '')
            .filter((value) => value.length > 0),
        ),
      ),
    [selectedZoneIds],
  )

  const enabledZonesQuery = useQuery({
    queryKey: [
      'coverage-zone-catalog',
      'enabled',
      normalizedMapName || 'no-map',
      snapshot.sessionId,
    ],
    queryFn: () => fetchCoverageZones(null, normalizedMapName),
    enabled: servicesReady && normalizedMapName.length > 0,
    retry: false,
    staleTime: 15_000,
  })

  const enabledZoneIds = useMemo(
    () => new Set((enabledZonesQuery.data ?? []).map((zone) => zone.id)),
    [enabledZonesQuery.data],
  )

  const missingSelectedZoneIds = useMemo(
    () =>
      normalizedSelectedZoneIds.filter((zoneId) => !enabledZoneIds.has(zoneId)),
    [enabledZoneIds, normalizedSelectedZoneIds],
  )

  const historicalZonesQuery = useQuery({
    queryKey: [
      'coverage-zone-catalog',
      'historical',
      normalizedMapName || 'no-map',
      missingSelectedZoneIds.join(',') || 'none',
      snapshot.sessionId,
    ],
    queryFn: async () => {
      const zones = await Promise.all(
        missingSelectedZoneIds.map((zoneId) =>
          fetchCoverageZoneDetail({
            map: null,
            mapName: normalizedMapName,
            zoneId,
          }).catch((error) => {
            if (error instanceof Error && isNotFoundMessage(error.message)) {
              return null
            }

            throw error
          }),
        ),
      )

      return zones.filter((zone): zone is AreaEntity => Boolean(zone))
    },
    enabled:
      servicesReady &&
      normalizedMapName.length > 0 &&
      missingSelectedZoneIds.length > 0,
    retry: false,
    staleTime: 15_000,
  })

  const entries = useMemo(
    () => {
      const mergedEntries = mergeZoneCatalogEntries(
        (enabledZonesQuery.data ?? []).map((zone) =>
          normalizeZoneCatalogEntry(zone, 'active'),
        ),
        (historicalZonesQuery.data ?? []).map((zone) =>
          normalizeZoneCatalogEntry(zone, 'historical'),
        ),
      )
      const knownZoneIds = new Set(mergedEntries.map((entry) => entry.zoneId))
      const fallbackEntries = normalizedSelectedZoneIds
        .filter((zoneId) => !knownZoneIds.has(zoneId))
        .map(
          (zoneId) =>
            ({
              zoneId,
              displayName: zoneId,
              enabled: false,
              availability: 'unknown',
              planProfileName: '',
              estimatedLengthM: null,
              estimatedDurationS: null,
              zone: {
                id: zoneId,
                name: zoneId,
                kind: 'zone',
                color: '#18b38a',
                displayRegion: [],
                displayPath: [],
                displayFrame: null,
                metadata: {},
                raw: {},
              },
            }) satisfies ZoneCatalogEntry,
        )

      return mergeZoneCatalogEntries(mergedEntries, fallbackEntries)
    },
    [enabledZonesQuery.data, historicalZonesQuery.data, normalizedSelectedZoneIds],
  )

  const entryById = useMemo(
    () =>
      entries.reduce((result, entry) => {
        result.set(entry.zoneId, entry)
        return result
      }, new Map<string, ZoneCatalogEntry>()),
    [entries],
  )

  const selectOptions = useMemo(
    () =>
      entries.map((entry) => {
        const mainLabel =
          entry.displayName !== entry.zoneId
            ? `${entry.displayName} / ${entry.zoneId}`
            : entry.zoneId
        const detailTokens = [
          entry.planProfileName ? `plan=${entry.planProfileName}` : '',
          entry.estimatedLengthM !== null
            ? `len=${entry.estimatedLengthM.toFixed(1)}m`
            : '',
          entry.estimatedDurationS !== null
            ? `dur=${entry.estimatedDurationS.toFixed(0)}s`
            : '',
          entry.availability === 'historical'
            ? 'historical'
            : entry.availability === 'unknown'
              ? 'unavailable'
              : '',
        ].filter((token) => token.length > 0)

        return {
          label:
            detailTokens.length > 0
              ? `${mainLabel} / ${detailTokens.join(' / ')}`
              : mainLabel,
          value: entry.zoneId,
          title: entry.displayName,
        }
      }),
    [entries],
  )

  return {
    entries,
    entryById,
    selectOptions,
    isLoading: enabledZonesQuery.isLoading || historicalZonesQuery.isLoading,
    isFetching: enabledZonesQuery.isFetching || historicalZonesQuery.isFetching,
    error:
      enabledZonesQuery.error instanceof Error
        ? enabledZonesQuery.error
        : historicalZonesQuery.error instanceof Error
          ? historicalZonesQuery.error
          : null,
  }
}
