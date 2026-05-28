import type {
  CleanupDisabledMapAssetsInput,
  HardDeleteMapAssetInput,
  MapAssetCleanupResult,
  MapCatalogEntry,
  MapSoftDeleteResult,
} from '../../types/mapCatalog'
import {
  buildQueryString,
  requestJson,
  type GatewayLiveMapSnapshot,
} from './siteGatewayHttp'

export async function requestMapCatalog() {
  return requestJson<MapCatalogEntry[]>('/maps')
}

export async function requestCurrentMap() {
  return requestJson<Record<string, unknown> | null>('/maps/current') as Promise<
    Record<string, unknown> | null
  >
}

export async function requestLiveMapSnapshot(afterMs = 0) {
  return requestJson<GatewayLiveMapSnapshot>(
    `/maps/live?after=${Math.max(0, Math.floor(afterMs))}`,
  )
}

export async function requestImportCurrentMapAsset(input: {
  mapName: string
  description?: string | null
  setActive: boolean
}) {
  return requestJson<{
    message: string
    map: MapCatalogEntry | null
    raw: Record<string, unknown>
  }>('/maps/import-current', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function requestSoftDeleteMapAsset(input: {
  mapName: string
  mapRevisionId?: string
}) {
  return requestJson<MapSoftDeleteResult>('/maps/soft-delete', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function requestHardDeleteMapAsset(input: HardDeleteMapAssetInput) {
  return requestJson<MapAssetCleanupResult>('/maps/hard-delete', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function requestCleanupDisabledMapAssets(
  input: CleanupDisabledMapAssetsInput,
) {
  return requestJson<MapAssetCleanupResult>('/maps/cleanup-disabled', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function requestMapImportPreflight(mapName: string) {
  return requestJson<{
    canImport: boolean
    status: string
    message: string
    expectedPath: string | null
  }>(`/maps/import-current/preflight${buildQueryString({ mapName })}`)
}

export async function requestWorkbenchAlignment(mapName: string) {
  return requestJson<Record<string, unknown> | null>(
    `/workbench/alignment${buildQueryString({ mapName })}`,
  )
}

export async function requestConfirmWorkbenchAlignment(
  payload: Record<string, unknown>,
) {
  return requestJson<Record<string, unknown>>('/workbench/alignment/confirm', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWorkbenchRectZonePreview(
  payload: Record<string, unknown>,
) {
  return requestJson<Record<string, unknown>>('/workbench/zones/rect-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWorkbenchCoveragePreview(
  payload: Record<string, unknown>,
) {
  return requestJson<Record<string, unknown>>('/workbench/zones/coverage-preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWorkbenchCoverageCommit(
  payload: Record<string, unknown>,
) {
  return requestJson<Record<string, unknown>>('/workbench/zones', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestWorkbenchZoneList(mapName: string) {
  return requestJson<Array<Record<string, unknown>>>(
    `/workbench/zones${buildQueryString({ mapName })}`,
  )
}

export async function requestWorkbenchZoneDetail(options: {
  zoneId: string
  mapName?: string | null
  profileName?: string | null
}) {
  return requestJson<Record<string, unknown> | null>(
    `/workbench/zones/${encodeURIComponent(options.zoneId.trim())}${buildQueryString({
      mapName: options.mapName,
      profileName: options.profileName,
    })}`,
  )
}

export async function requestWorkbenchZonePlanPath(options: {
  zoneId: string
  mapName?: string | null
  alignmentVersion?: string | null
  planProfileName?: string | null
}) {
  return requestJson<Record<string, unknown>>(
    `/workbench/zones/${encodeURIComponent(options.zoneId.trim())}/plan-path${buildQueryString({
      mapName: options.mapName,
      alignmentVersion: options.alignmentVersion,
      planProfileName: options.planProfileName,
    })}`,
  )
}

export async function requestDeleteWorkbenchZone(options: {
  zoneId: string
  mapName?: string | null
}) {
  return requestJson<{
    message: string
    raw: Record<string, unknown>
  }>(
    `/workbench/zones/${encodeURIComponent(options.zoneId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
    {
      method: 'DELETE',
    },
  )
}

export async function requestWorkbenchNoGoAreaList(mapName: string) {
  return requestJson<Array<Record<string, unknown>>>(
    `/workbench/no-go-areas${buildQueryString({ mapName })}`,
  )
}

export async function requestWorkbenchNoGoAreaDetail(options: {
  areaId: string
  mapName?: string | null
}) {
  return requestJson<Record<string, unknown> | null>(
    `/workbench/no-go-areas/${encodeURIComponent(options.areaId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
  )
}

export async function requestCreateWorkbenchNoGoArea(
  payload: Record<string, unknown>,
) {
  return requestJson<{
    entity: Record<string, unknown> | null
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>('/workbench/no-go-areas', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestUpdateWorkbenchNoGoArea(
  areaId: string,
  payload: Record<string, unknown>,
) {
  return requestJson<{
    entity: Record<string, unknown> | null
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>(`/workbench/no-go-areas/${encodeURIComponent(areaId.trim())}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function requestDeleteWorkbenchNoGoArea(options: {
  areaId: string
  mapName?: string | null
}) {
  return requestJson<{
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>(
    `/workbench/no-go-areas/${encodeURIComponent(options.areaId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
    {
      method: 'DELETE',
    },
  )
}

export async function requestWorkbenchVirtualWallList(mapName: string) {
  return requestJson<Array<Record<string, unknown>>>(
    `/workbench/virtual-walls${buildQueryString({ mapName })}`,
  )
}

export async function requestWorkbenchVirtualWallDetail(options: {
  wallId: string
  mapName?: string | null
}) {
  return requestJson<Record<string, unknown> | null>(
    `/workbench/virtual-walls/${encodeURIComponent(options.wallId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
  )
}

export async function requestCreateWorkbenchVirtualWall(
  payload: Record<string, unknown>,
) {
  return requestJson<{
    entity: Record<string, unknown> | null
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>('/workbench/virtual-walls', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function requestUpdateWorkbenchVirtualWall(
  wallId: string,
  payload: Record<string, unknown>,
) {
  return requestJson<{
    entity: Record<string, unknown> | null
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>(`/workbench/virtual-walls/${encodeURIComponent(wallId.trim())}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function requestDeleteWorkbenchVirtualWall(options: {
  wallId: string
  mapName?: string | null
}) {
  return requestJson<{
    constraintVersion: string | null
    warnings: string[]
    raw: Record<string, unknown>
  }>(
    `/workbench/virtual-walls/${encodeURIComponent(options.wallId.trim())}${buildQueryString({
      mapName: options.mapName,
    })}`,
    {
      method: 'DELETE',
    },
  )
}

