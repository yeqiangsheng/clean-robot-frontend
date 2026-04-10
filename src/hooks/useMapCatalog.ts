import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { fetchMapCatalog } from '../api/gateway/robotGateway'
import { useRosConnection } from './useRosConnection'
import type { MapCatalogEntry } from '../types/mapCatalog'

export function useMapCatalog() {
  const { snapshot } = useRosConnection()
  const servicesReady = snapshot.isConnected || snapshot.status === 'mock'

  const query = useQuery({
    queryKey: ['map-catalog', snapshot.url, snapshot.sessionId],
    queryFn: fetchMapCatalog,
    enabled: servicesReady,
    retry: false,
    staleTime: 30_000,
  })

  const entries = useMemo(() => {
    const items = query.data ?? []

    return [...items].sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1
      }

      if (left.enabled !== right.enabled) {
        return left.enabled ? -1 : 1
      }

      return left.mapName.localeCompare(right.mapName)
    })
  }, [query.data])

  const entryByName = useMemo(
    () =>
      entries.reduce((result, entry) => {
        result.set(entry.mapName, entry)
        return result
      }, new Map<string, MapCatalogEntry>()),
    [entries],
  )

  const selectableEntries = useMemo(
    () => entries.filter((entry) => entry.enabled),
    [entries],
  )

  const selectableEntryByName = useMemo(
    () =>
      selectableEntries.reduce((result, entry) => {
        result.set(entry.mapName, entry)
        return result
      }, new Map<string, MapCatalogEntry>()),
    [selectableEntries],
  )

  const defaultEntry = useMemo(
    () => entries.find((entry) => entry.isActive) ?? entries.find((entry) => entry.enabled) ?? entries[0] ?? null,
    [entries],
  )

  const defaultSelectableEntry = useMemo(
    () =>
      selectableEntries.find((entry) => entry.isActive) ??
      selectableEntries[0] ??
      null,
    [selectableEntries],
  )

  return {
    entries,
    entryByName,
    selectableEntries,
    selectableEntryByName,
    defaultEntry,
    defaultSelectableEntry,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error : null,
  }
}
