import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { queryProfileCatalog } from '../api/gateway/robotStatusGateway'
import { useRosConnection } from './useRosConnection'
import type { ProfileCatalogEntry, ProfileKind } from '../types/profileCatalog'
import {
  buildUnknownProfileEntry,
  formatProfileOptionLabel,
  mergeProfileCatalogEntries,
} from '../utils/profileCatalog'

interface UseProfileCatalogOptions {
  profileKind: Exclude<ProfileKind, ''>
  mapName?: string | null
  selectedProfileNames?: Array<string | null | undefined>
}

function normalizeSelectedProfileNames(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim() ?? '')
        .filter((value) => value.length > 0),
    ),
  )
}

export function useProfileCatalog({
  profileKind,
  mapName,
  selectedProfileNames = [],
}: UseProfileCatalogOptions) {
  const { snapshot } = useRosConnection()
  const servicesReady = snapshot.status !== 'connecting'
  const normalizedMapName = mapName?.trim() ?? ''
  const normalizedSelected = useMemo(
    () => normalizeSelectedProfileNames(selectedProfileNames),
    [selectedProfileNames],
  )

  const enabledQuery = useQuery({
    queryKey: [
      'profile-catalog',
      profileKind,
      'enabled',
      normalizedMapName || 'all-maps',
      snapshot.sessionId,
    ],
    queryFn: () =>
      queryProfileCatalog({
        profileKind,
        includeDisabled: false,
        mapName: normalizedMapName,
      }),
    enabled: servicesReady,
    retry: false,
    staleTime: 30_000,
  })

  const enabledNames = useMemo(
    () => new Set((enabledQuery.data ?? []).map((entry) => entry.profileName)),
    [enabledQuery.data],
  )

  const needsHistoricalQuery = normalizedSelected.some((name) => !enabledNames.has(name))

  const allQuery = useQuery({
    queryKey: [
      'profile-catalog',
      profileKind,
      'all',
      normalizedMapName || 'all-maps',
      snapshot.sessionId,
    ],
    queryFn: () =>
      queryProfileCatalog({
        profileKind,
        includeDisabled: true,
        mapName: normalizedMapName,
      }),
    enabled: servicesReady && needsHistoricalQuery,
    retry: false,
    staleTime: 30_000,
  })

  const entries = useMemo(() => {
    const mergedEntries = mergeProfileCatalogEntries(
      enabledQuery.data ?? [],
      allQuery.data ?? [],
    )

    const knownNames = new Set(mergedEntries.map((entry) => entry.profileName))
    const unknownEntries = normalizedSelected
      .filter((profileName) => !knownNames.has(profileName))
      .map((profileName) => buildUnknownProfileEntry(profileName))

    return mergeProfileCatalogEntries(mergedEntries, unknownEntries)
  }, [allQuery.data, enabledQuery.data, normalizedSelected])

  const entryByName = useMemo(
    () =>
      entries.reduce((result, entry) => {
        result.set(entry.profileName, entry)
        return result
      }, new Map<string, ProfileCatalogEntry>()),
    [entries],
  )

  const defaultEntry = useMemo(
    () =>
      entries.find((entry) => entry.enabled && entry.isDefault) ??
      entries.find((entry) => entry.enabled) ??
      entries[0] ??
      null,
    [entries],
  )

  const selectOptions = useMemo(
    () =>
      entries.map((entry) => ({
        label: formatProfileOptionLabel(entry),
        value: entry.profileName,
        title: entry.description || entry.profileName,
      })),
    [entries],
  )

  return {
    entries,
    entryByName,
    selectOptions,
    defaultEntry,
    isLoading: enabledQuery.isLoading || allQuery.isLoading,
    isFetching: enabledQuery.isFetching || allQuery.isFetching,
    error:
      enabledQuery.error instanceof Error
        ? enabledQuery.error
        : allQuery.error instanceof Error
          ? allQuery.error
          : null,
  }
}
