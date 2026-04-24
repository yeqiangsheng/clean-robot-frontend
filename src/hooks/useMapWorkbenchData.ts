import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import {
  fetchActiveAlignment,
  fetchCoverageZones,
  fetchCurrentMap,
  fetchNoGoAreas,
  fetchVirtualWalls,
} from '../api/gateway/robotGateway'
import type { MapWorkbenchData } from '../types/map-editor'
import type { RosConnectionSnapshot } from '../types/ros'

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

function resolveFallbackMapName(
  ...collections: Array<Array<{ raw?: Record<string, unknown> }> | undefined>
) {
  for (const collection of collections) {
    for (const entity of collection ?? []) {
      const mapName = entity?.raw?.map_name

      if (typeof mapName === 'string' && mapName.trim().length > 0) {
        return mapName.trim()
      }
    }
  }

  return ''
}

export function useMapWorkbenchData(connection: RosConnectionSnapshot) {
  const servicesReady = USE_MOCK_DATA || connection.status !== 'connecting'

  const mapQuery = useQuery({
    queryKey: ['workbench', 'map', connection.url, connection.sessionId, USE_MOCK_DATA],
    queryFn: fetchCurrentMap,
    enabled: servicesReady,
    retry: false,
    structuralSharing: false,
    staleTime: 15_000,
  })

  const workbenchMapReady = Boolean(mapQuery.data)

  const zonesQuery = useQuery({
    queryKey: [
      'workbench',
      'zones',
      mapQuery.data?.id ?? 'none',
      connection.sessionId,
      USE_MOCK_DATA,
    ],
    queryFn: () => fetchCoverageZones(mapQuery.data ?? null),
    enabled: servicesReady && workbenchMapReady,
    retry: false,
    staleTime: 15_000,
  })

  const noGoAreasQuery = useQuery({
    queryKey: [
      'workbench',
      'no-go-areas',
      mapQuery.data?.id ?? 'none',
      connection.sessionId,
      USE_MOCK_DATA,
    ],
    queryFn: () => fetchNoGoAreas(mapQuery.data ?? null),
    enabled: servicesReady && workbenchMapReady,
    retry: false,
    staleTime: 15_000,
  })

  const virtualWallsQuery = useQuery({
    queryKey: [
      'workbench',
      'virtual-walls',
      mapQuery.data?.id ?? 'none',
      connection.sessionId,
      USE_MOCK_DATA,
    ],
    queryFn: () => fetchVirtualWalls(mapQuery.data ?? null),
    enabled: servicesReady && workbenchMapReady,
    retry: false,
    staleTime: 15_000,
  })

  const fallbackMapName = useMemo(
    () =>
      resolveFallbackMapName(
        zonesQuery.data,
        noGoAreasQuery.data,
        virtualWallsQuery.data,
      ),
    [noGoAreasQuery.data, virtualWallsQuery.data, zonesQuery.data],
  )

  const alignmentQuery = useQuery({
    queryKey: [
      'workbench',
      'alignment',
      mapQuery.data?.id ?? (fallbackMapName || 'none'),
      connection.sessionId,
      USE_MOCK_DATA,
    ],
    queryFn: () => fetchActiveAlignment(mapQuery.data ?? null, fallbackMapName),
    enabled: servicesReady && workbenchMapReady,
    retry: false,
    staleTime: 15_000,
  })

  const warnings = useMemo(() => {
    const nextWarnings: string[] = []

    if (mapQuery.error && (zonesQuery.data?.length || noGoAreasQuery.data?.length || virtualWallsQuery.data?.length)) {
      nextWarnings.push('Base map metadata failed to load, but drawable layers are still available in their display frame.')
    }

    if (zonesQuery.error) {
      nextWarnings.push('Zone layer failed to load. Other layers are still available.')
    }

    if (noGoAreasQuery.error) {
      nextWarnings.push('No-go area layer failed to load. Other layers are still available.')
    }

    if (virtualWallsQuery.error) {
      nextWarnings.push('Virtual wall layer failed to load. Other layers are still available.')
    }

    if (
      mapQuery.data &&
      mapQuery.data.displayRegion.length === 0 &&
      mapQuery.data.displayPath.length === 0 &&
      !mapQuery.data.occupancyGrid &&
      !mapQuery.data.rasterImageUrl
    ) {
      nextWarnings.push('The current map returned no occupancy grid or drawable geometry.')
    }

    return nextWarnings
  }, [
    mapQuery.data,
    mapQuery.error,
    noGoAreasQuery.data,
    noGoAreasQuery.error,
    virtualWallsQuery.data,
    virtualWallsQuery.error,
    zonesQuery.data,
    zonesQuery.error,
  ])

  const data: MapWorkbenchData = useMemo(
    () => ({
      map: mapQuery.data ?? null,
      alignment: alignmentQuery.data ?? null,
      zones: zonesQuery.data ?? [],
      noGoAreas: noGoAreasQuery.data ?? [],
      virtualWalls: virtualWallsQuery.data ?? [],
      warnings,
    }),
    [
      alignmentQuery.data,
      mapQuery.data,
      noGoAreasQuery.data,
      virtualWallsQuery.data,
      warnings,
      zonesQuery.data,
    ],
  )

  const isInitialLoading =
    connection.status === 'connecting' ||
    mapQuery.isLoading ||
    (servicesReady && mapQuery.isFetching && !mapQuery.data)

  return {
    data,
    isInitialLoading,
    mapError: mapQuery.error instanceof Error ? mapQuery.error : null,
    mapQueryFetchStatus: mapQuery.fetchStatus,
    mapQueryStatus: mapQuery.status,
    zonesQueryFetchStatus: zonesQuery.fetchStatus,
    zonesQueryStatus: zonesQuery.status,
    zonesError: zonesQuery.error instanceof Error ? zonesQuery.error : null,
    noGoAreasError:
      noGoAreasQuery.error instanceof Error ? noGoAreasQuery.error : null,
    virtualWallsError:
      virtualWallsQuery.error instanceof Error ? virtualWallsQuery.error : null,
  }
}
