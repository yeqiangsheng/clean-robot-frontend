import {
  buildNoGoAreaRequest,
  buildVirtualWallRequest,
  normalizeAlignment,
  normalizeAreaEntity,
  normalizeCoverageCommit,
  normalizeCoveragePreview,
  normalizeRectZonePreview,
  normalizeZonePlanPath,
  resolveRequestedMapName,
} from './mapWorkbenchTransforms'
import {
  MAP_CATALOG_SERVICE,
  SITE_SERVICE_NAMES,
} from '../contracts/serviceNames'
import { getApiBaseUrl } from '../../config/appConfig'
import { USE_MOCK_DATA } from '../../config/runtimeMode'
import { recordAuditEvent } from './auditTrail'
import { assertCapabilityAllowed, normalizeGatewayError } from './accessControl'
import { fetchCurrentMapFromWorker } from './mapWorkerClient'
import {
  requestCleanupDisabledMapAssets,
  requestConfirmWorkbenchAlignment,
  requestCreateWorkbenchNoGoArea,
  requestCreateWorkbenchVirtualWall,
  requestDeleteWorkbenchNoGoArea,
  requestDeleteWorkbenchVirtualWall,
  requestDeleteWorkbenchZone,
  requestHardDeleteMapAsset,
  requestImportCurrentMapAsset,
  requestMapCatalog,
  requestMapImportPreflight,
  requestSoftDeleteMapAsset,
  requestUpdateWorkbenchNoGoArea,
  requestUpdateWorkbenchVirtualWall,
  requestWorkbenchAlignment,
  requestWorkbenchCoverageCommit,
  requestWorkbenchCoveragePreview,
  requestWorkbenchNoGoAreaDetail,
  requestWorkbenchNoGoAreaList,
  requestWorkbenchRectZonePreview,
  requestWorkbenchVirtualWallDetail,
  requestWorkbenchVirtualWallList,
  requestWorkbenchZoneDetail,
  requestWorkbenchZoneList,
  requestWorkbenchZonePlanPath,
} from './siteGatewayMapClient'
import type {
  CleanupDisabledMapAssetsInput,
  HardDeleteMapAssetInput,
  ImportCurrentMapAssetInput,
  MapAssetCleanupResult,
  MapCatalogEntry,
  MapSoftDeleteResult,
} from '../../types/mapCatalog'
import type {
  AreaEntity,
  MapAlignment,
  MapEntity,
  Point2D,
} from '../../types/map-editor'
import type { GatewayPayload } from '../../types/gateway'

const MOCK_MAP_NAME = 'F2Q区精密装配车间'
const MOCK_MAP_REVISION_ID = 'mock-revision-20260527'

function createMockOccupancyData(width: number, height: number) {
  const data = Array.from({ length: width * height }, () => 0)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const isBorder = x < 3 || y < 3 || x > width - 4 || y > height - 4
      const isUpperWall = y > 16 && y < 19 && x > 18 && x < 112
      const isLowerWall = y > 76 && y < 79 && x > 20 && x < 118
      const isLeftRoom = x > 18 && x < 21 && y > 18 && y < 78
      const isRightRoom = x > 112 && x < 115 && y > 18 && y < 78
      const isInnerObstacle = x > 66 && x < 76 && y > 42 && y < 50

      if (isBorder || isUpperWall || isLowerWall || isLeftRoom || isRightRoom || isInnerObstacle) {
        data[index] = 92
      } else {
        data[index] = 0
      }
    }
  }

  return data
}

const mockMapCatalog: MapCatalogEntry[] = [
  {
    mapName: MOCK_MAP_NAME,
    displayName: MOCK_MAP_NAME,
    enabled: true,
    isActive: true,
    isRuntime: true,
    isPendingSwitch: false,
    mapId: 'mock-map-f2q',
    mapMd5: 'mock-map-md5',
    revisionId: MOCK_MAP_REVISION_ID,
    activeRevisionId: MOCK_MAP_REVISION_ID,
    runtimeRevisionId: MOCK_MAP_REVISION_ID,
    raw: {
      map_name: MOCK_MAP_NAME,
      map_revision_id: MOCK_MAP_REVISION_ID,
      source: 'mock',
    },
  },
]

const mockCurrentMap: MapEntity = {
  id: 'mock-map-f2q',
  name: MOCK_MAP_NAME,
  kind: 'map',
  displayRegion: [
    [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ],
  ],
  displayPath: [],
  displayFrame: {
    frameId: 'map',
    rotationDeg: 0,
    scale: 1,
    origin: { x: 0, y: 0 },
    raw: { frame_id: 'map' },
  },
  metadata: {
    mapName: MOCK_MAP_NAME,
    revisionId: MOCK_MAP_REVISION_ID,
  },
  raw: {
    map_name: MOCK_MAP_NAME,
    map_revision_id: MOCK_MAP_REVISION_ID,
    source: 'mock',
  },
  resolution: 0.1,
  rasterImageUrl: null,
  occupancyGrid: {
    width: 140,
    height: 100,
    resolution: 0.1,
    origin: { x: 0, y: 0 },
    data: createMockOccupancyData(140, 100),
  },
  size: {
    width: 14,
    height: 10,
  },
}

function createMockArea(
  id: string,
  name: string,
  kind: AreaEntity['kind'],
  color: string,
  displayRegion: AreaEntity['displayRegion'],
  displayPath: AreaEntity['displayPath'] = [],
): AreaEntity {
  return {
    id,
    name,
    kind,
    color,
    displayRegion,
    displayPath,
    displayFrame: {
      frameId: 'map',
      rotationDeg: 0,
      scale: 1,
      origin: { x: 0, y: 0 },
      raw: { frame_id: 'map' },
    },
    metadata: {
      mapName: MOCK_MAP_NAME,
      enabled: true,
    },
    raw: {
      map_name: MOCK_MAP_NAME,
      id,
      display_name: name,
      enabled: true,
      source: 'mock',
    },
  }
}

const mockCoverageZones: AreaEntity[] = [
  createMockArea(
    'zone_mock_assembly',
    '装配区',
    'zone',
    '#1f8a78',
    [
      [
        { x: 2.2, y: 2.2 },
        { x: 6.4, y: 2.2 },
        { x: 6.4, y: 7.4 },
        { x: 2.2, y: 7.4 },
        { x: 2.2, y: 2.2 },
      ],
    ],
  ),
  createMockArea(
    'zone_mock_packaging',
    '包装区',
    'zone',
    '#2f6bd8',
    [
      [
        { x: 7.4, y: 2.3 },
        { x: 11.7, y: 2.3 },
        { x: 11.7, y: 7.3 },
        { x: 7.4, y: 7.3 },
        { x: 7.4, y: 2.3 },
      ],
    ],
  ),
]

const mockNoGoAreas: AreaEntity[] = [
  createMockArea(
    'no_go_mock_charger',
    '充电桩缓冲区',
    'noGoArea',
    '#d86b43',
    [
      [
        { x: 11.8, y: 4.1 },
        { x: 13.0, y: 4.1 },
        { x: 13.0, y: 5.9 },
        { x: 11.8, y: 5.9 },
        { x: 11.8, y: 4.1 },
      ],
    ],
  ),
]

const mockVirtualWalls: AreaEntity[] = [
  createMockArea(
    'virtual_wall_mock_lane',
    '临时通道边界',
    'virtualWall',
    '#8b5cf6',
    [],
    [
      [
        { x: 6.9, y: 1.5 },
        { x: 6.9, y: 8.4 },
      ],
    ],
  ),
]

const mockAlignment: MapAlignment = {
  id: 'mock-alignment',
  name: MOCK_MAP_NAME,
  status: 'active',
  alignmentVersion: 'mock-alignment-v1',
  rawFrame: 'map',
  alignedFrame: 'site_map',
  active: true,
  displayFrame: {
    frameId: 'map',
    rotationDeg: 0,
    scale: 1,
    origin: { x: 0, y: 0 },
    raw: { frame_id: 'map' },
  },
  rotationDeg: 0,
  pivot: { x: 0, y: 0 },
  metadata: {
    mapName: MOCK_MAP_NAME,
  },
  raw: {
    map_name: MOCK_MAP_NAME,
    alignment_version: 'mock-alignment-v1',
    source: 'mock',
  },
}

function resolveMockAreaDetail(
  collection: AreaEntity[],
  fallbackKind: AreaEntity['kind'],
  fallbackId: string,
) {
  const matched = collection.find((entity) => entity.id === fallbackId) ?? collection[0]

  if (matched) {
    return matched.id === fallbackId
      ? matched
      : {
          ...matched,
          id: fallbackId,
          raw: {
            ...matched.raw,
            id: fallbackId,
            zone_id: fallbackKind === 'zone' ? fallbackId : undefined,
            area_id: fallbackKind === 'noGoArea' ? fallbackId : undefined,
            wall_id: fallbackKind === 'virtualWall' ? fallbackId : undefined,
          },
        }
  }

  return null
}

function buildGatewayWorkbenchUrl(pathname: string) {
  const baseUrl = getApiBaseUrl()

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return new URL(pathname.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString()
  }

  const normalizedPath = `${baseUrl.replace(/\/+$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`

  if (typeof window !== 'undefined') {
    return new URL(normalizedPath, window.location.origin).toString()
  }

  return normalizedPath
}

export async function fetchMapCatalog() {
  if (USE_MOCK_DATA) {
    return mockMapCatalog
  }

  try {
    return await requestMapCatalog()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'MAP_CATALOG_FAILED',
      source: 'site-gateway',
      message: 'Map catalog load failed.',
      recoverable: true,
      missingDependency: MAP_CATALOG_SERVICE.canonicalName,
    })
  }
}
async function runWorkbenchRead<T>(
  actionLabel: string,
  missingDependency: string | null,
  runner: () => Promise<T>,
) {
  assertCapabilityAllowed('mapWorkbench', actionLabel)

  try {
    return await runner()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'MAP_WORKBENCH_QUERY_FAILED',
      source: 'site-gateway',
      message: `${actionLabel} failed.`,
      recoverable: true,
      missingDependency,
    })
  }
}

async function runWorkbenchMutation<T>(
  actionLabel: string,
  target: string,
  detail: Record<string, unknown>,
  missingDependency: string | null,
  runner: () => Promise<T>,
) {
  assertCapabilityAllowed('mapWorkbench', actionLabel)

  try {
    const result = await runner()
    recordAuditEvent({
      category: 'system',
      action: actionLabel,
      target,
      status: 'success',
      message: `${actionLabel} completed.`,
      detail,
    })
    return result
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'MAP_WORKBENCH_ACTION_FAILED',
      source: 'site-gateway',
      message: `${actionLabel} failed.`,
      recoverable: true,
      missingDependency,
    })
    recordAuditEvent({
      category: 'system',
      action: actionLabel,
      target,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail,
    })
    throw normalizedError
  }
}

function requireWorkbenchValue<T>(
  value: T | null | undefined,
  errorMessage: string,
) {
  if (value === null || value === undefined) {
    throw new Error(errorMessage)
  }

  return value
}

function pickStringFromRecords(
  records: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
) {
  for (const record of records) {
    if (!record) {
      continue
    }

    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim()
      }
    }
  }

  return ''
}

function resolveRequestedMapRevisionId(
  map: MapEntity | null,
  alignment?: MapAlignment | null,
) {
  return pickStringFromRecords([map?.raw, alignment?.raw], [
    'map_revision_id',
    'mapRevisionId',
    'active_revision_id',
    'activeRevisionId',
    'latest_head_revision_id',
    'latestHeadRevisionId',
    'runtime_map_revision_id',
    'runtimeMapRevisionId',
    'active_map_revision_id',
    'activeMapRevisionId',
    'revision_id',
    'revisionId',
  ])
}

export function fetchCurrentMap() {
  if (USE_MOCK_DATA) {
    return Promise.resolve(mockCurrentMap)
  }

  return runWorkbenchRead(
    'Load current map',
    MAP_CATALOG_SERVICE.canonicalName,
    async () => {
      const currentMapUrl = buildGatewayWorkbenchUrl('/maps/current')
      return fetchCurrentMapFromWorker(currentMapUrl)
    },
  )
}

export function fetchActiveAlignment(
  map: MapEntity | null,
  mapName?: string | null,
) {
  if (USE_MOCK_DATA) {
    return Promise.resolve(mockAlignment)
  }

  return runWorkbenchRead(
    'Load map alignment',
    SITE_SERVICE_NAMES.alignment,
    async () => {

      const payload = await requestWorkbenchAlignment(
        resolveRequestedMapName(map, mapName),
      )

      return payload === null ? null : normalizeAlignment(payload)
    },
  )
}

export function confirmMapAlignmentByPoints(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  points: [Point2D, Point2D]
}) {
  return runWorkbenchMutation(
    '纭鍦板浘瀵归綈',
    SITE_SERVICE_NAMES.alignmentByPoints,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      points: options.points,
      alignmentVersion: options.alignment?.alignmentVersion ?? '',
    },
    SITE_SERVICE_NAMES.alignmentByPoints,
    async () => {

      const mapName = resolveRequestedMapName(options.map, options.mapName)

      if (!mapName) {
        throw new Error('The current map is not ready for alignment.')
      }

      const payload = await requestConfirmWorkbenchAlignment({
        map_name: mapName,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        raw_frame: options.alignment?.rawFrame ?? 'map',
        aligned_frame: options.alignment?.alignedFrame ?? 'site_map',
        p1: {
          x: options.points[0].x,
          y: options.points[0].y,
          z: 0,
        },
        p2: {
          x: options.points[1].x,
          y: options.points[1].y,
          z: 0,
        },
        pivot_x: options.alignment?.pivot?.x ?? 0,
        pivot_y: options.alignment?.pivot?.y ?? 0,
        source:
          (typeof options.alignment?.raw.source === 'string'
            ? options.alignment.raw.source
            : null) ?? 'frontend',
        status: options.alignment?.status ?? 'active',
        activate: true,
      })

      return requireWorkbenchValue(
        normalizeAlignment(payload),
        'Alignment confirm service returned no usable config.',
      )
    },
  )
}

export function previewRectZoneByPoints(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  points: [Point2D, Point2D]
  minSideM?: number
}) {
  return runWorkbenchRead(
    '鐭╁舰鍖哄煙棰勮',
    SITE_SERVICE_NAMES.rectZonePreview,
    async () => {

      const mapName = resolveRequestedMapName(options.map, options.mapName)

      if (!mapName) {
        throw new Error('The current map is not ready for zone creation.')
      }

      const payload = await requestWorkbenchRectZonePreview({
        map_name: mapName,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        p1: {
          x: options.points[0].x,
          y: options.points[0].y,
          z: 0,
        },
        p2: {
          x: options.points[1].x,
          y: options.points[1].y,
          z: 0,
        },
        min_side_m: options.minSideM ?? 0.2,
      })

      return requireWorkbenchValue(
        normalizeRectZonePreview(payload),
        'Rect zone preview service returned no usable display_region.',
      )
    },
  )
}

export function previewCoverageRegion(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  region: GatewayPayload
  profileName: string
}) {
  return runWorkbenchRead(
    '覆盖区域预览',
    SITE_SERVICE_NAMES.coveragePreview,
    async () => {

      const mapName = resolveRequestedMapName(options.map, options.mapName)

      if (!mapName) {
        throw new Error('The current map is not ready for coverage preview.')
      }

      const mapRevisionId = resolveRequestedMapRevisionId(options.map, options.alignment)

      if (!mapRevisionId) {
        throw new Error('The current map revision is not ready for coverage preview.')
      }

      if (!options.profileName.trim()) {
        throw new Error('A profile name is required before previewing a zone.')
      }

      const payload = await requestWorkbenchCoveragePreview({
        map_name: mapName,
        map_revision_id: mapRevisionId,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        region: options.region,
        profile_name: options.profileName.trim(),
        debug_publish_markers: false,
      })

      return requireWorkbenchValue(
        normalizeCoveragePreview(payload),
        'Coverage preview service returned no usable preview data.',
      )
    },
  )
}

export function commitCoverageRegion(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  region: GatewayPayload
  displayName: string
  profileName: string
  zoneId?: string | null
  baseZoneVersion?: number | null
}) {
  return runWorkbenchMutation(
    options.zoneId ? 'Update coverage zone' : 'Create coverage zone',
    SITE_SERVICE_NAMES.coverageCommit,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      zoneId: options.zoneId ?? '',
      displayName: options.displayName,
      profileName: options.profileName,
      baseZoneVersion: options.baseZoneVersion ?? 0,
    },
    SITE_SERVICE_NAMES.coverageCommit,
    async () => {

      const mapName = resolveRequestedMapName(options.map, options.mapName)

      if (!mapName) {
        throw new Error('The current map is not ready for zone commit.')
      }

      const mapRevisionId = resolveRequestedMapRevisionId(options.map, options.alignment)

      if (!mapRevisionId) {
        throw new Error('The current map revision is not ready for zone commit.')
      }

      if (!options.displayName.trim()) {
        throw new Error('A zone display name is required before commit.')
      }

      if (!options.profileName.trim()) {
        throw new Error('A profile name is required before commit.')
      }

      const payload = await requestWorkbenchCoverageCommit({
        map_name: mapName,
        map_revision_id: mapRevisionId,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        zone_id: options.zoneId ?? '',
        base_zone_version: options.baseZoneVersion ?? 0,
        display_name: options.displayName.trim(),
        region: options.region,
        profile_name: options.profileName.trim(),
        set_active_plan: true,
      })

      return requireWorkbenchValue(
        normalizeCoverageCommit(payload),
        'Coverage commit service returned no usable zone result.',
      )
    },
  )
}

export function fetchCoverageZones(
  map: MapEntity | null,
  mapName?: string | null,
) {
  if (USE_MOCK_DATA) {
    return Promise.resolve(mockCoverageZones)
  }

  return runWorkbenchRead(
    'Load coverage zones',
    SITE_SERVICE_NAMES.zone,
    async () => {

      const records = await requestWorkbenchZoneList(
        resolveRequestedMapName(map, mapName),
      )

      return records.map((record, index) => normalizeAreaEntity(record, 'zone', index))
    },
  )
}

export function fetchCoverageZoneDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
  profileName?: string
}) {
  if (USE_MOCK_DATA) {
    return Promise.resolve(
      resolveMockAreaDetail(mockCoverageZones, 'zone', options.zoneId.trim()),
    )
  }

  return runWorkbenchRead(
    'Load coverage zone detail',
    SITE_SERVICE_NAMES.zone,
    async () => {

      if (!options.zoneId.trim()) {
        throw new Error('A zone_id is required before loading zone detail.')
      }

      const record = await requestWorkbenchZoneDetail({
        zoneId: options.zoneId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
        profileName: options.profileName,
      })

      return record ? normalizeAreaEntity(record, 'zone', 0) : null
    },
  )
}

export function fetchZonePlanPath(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
  alignmentVersion?: string | null
  planProfileName?: string | null
}) {
  return runWorkbenchRead(
    'Load zone plan path',
    SITE_SERVICE_NAMES.zonePlanPath,
    async () => {

      if (!options.zoneId.trim()) {
        throw new Error('A zone_id is required before loading a zone plan path.')
      }

      const payload = await requestWorkbenchZonePlanPath({
        zoneId: options.zoneId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
        alignmentVersion: options.alignmentVersion,
        planProfileName: options.planProfileName,
      })

      return requireWorkbenchValue(
        normalizeZonePlanPath(payload),
        'Zone plan path service returned no usable path result.',
      )
    },
  )
}

export function deleteCoverageZone(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
}) {
  return runWorkbenchMutation(
    'Delete coverage zone',
    SITE_SERVICE_NAMES.zone,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      zoneId: options.zoneId,
    },
    SITE_SERVICE_NAMES.zone,
    async () => {

      if (!options.zoneId.trim()) {
        throw new Error('A zone_id is required before deleting a zone.')
      }

      return requestDeleteWorkbenchZone({
        zoneId: options.zoneId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })
    },
  )
}

export function fetchNoGoAreas(map: MapEntity | null) {
  if (USE_MOCK_DATA) {
    return Promise.resolve(mockNoGoAreas)
  }

  return runWorkbenchRead(
    'Load no-go areas',
    SITE_SERVICE_NAMES.noGoArea,
    async () => {

      const records = await requestWorkbenchNoGoAreaList(resolveRequestedMapName(map))
      return records.map((record, index) =>
        normalizeAreaEntity(record, 'noGoArea', index),
      )
    },
  )
}

export function fetchNoGoAreaDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  areaId: string
}) {
  if (USE_MOCK_DATA) {
    return Promise.resolve(
      resolveMockAreaDetail(mockNoGoAreas, 'noGoArea', options.areaId.trim()),
    )
  }

  return runWorkbenchRead(
    'Load no-go area detail',
    SITE_SERVICE_NAMES.noGoArea,
    async () => {

      const record = await requestWorkbenchNoGoAreaDetail({
        areaId: options.areaId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })

      return record ? normalizeAreaEntity(record, 'noGoArea', 0) : null
    },
  )
}

export function addNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  areaId?: string | null
  displayName: string
  enabled?: boolean
  displayRegion: GatewayPayload
  displayFrame: string
}) {
  return runWorkbenchMutation(
    'Create no-go area',
    SITE_SERVICE_NAMES.noGoArea,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.areaId ?? '',
      displayName: options.displayName,
      enabled: options.enabled ?? true,
    },
    SITE_SERVICE_NAMES.noGoArea,
    async () => {

      const payload = await requestCreateWorkbenchNoGoArea({
        operation: 2,
        map_name: resolveRequestedMapName(options.map, options.mapName),
        area_id: options.areaId?.trim() ?? '',
        alignment_version: options.alignment?.alignmentVersion ?? '',
        area: buildNoGoAreaRequest({
          map: options.map,
          mapName: options.mapName,
          alignment: options.alignment,
          areaId: options.areaId,
          displayName: options.displayName,
          enabled: options.enabled ?? true,
          displayRegion: options.displayRegion,
          displayFrame: options.displayFrame,
        }),
        include_disabled: true,
      })

      return {
        area: payload.entity
          ? normalizeAreaEntity(payload.entity, 'noGoArea', 0)
          : null,
        constraintVersion: payload.constraintVersion,
        warnings: payload.warnings,
        raw: payload.raw,
      }
    },
  )
}

export function modifyNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  area: AreaEntity
  displayName: string
  enabled?: boolean
  displayRegion: GatewayPayload
  displayFrame: string
}) {
  return runWorkbenchMutation(
    'Update no-go area',
    SITE_SERVICE_NAMES.noGoArea,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.area.id,
      displayName: options.displayName,
      enabled: options.enabled ?? true,
    },
    SITE_SERVICE_NAMES.noGoArea,
    async () => {

      const payload = await requestUpdateWorkbenchNoGoArea(options.area.id, {
        operation: 3,
        map_name: resolveRequestedMapName(options.map, options.mapName),
        area_id: options.area.id,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        area: buildNoGoAreaRequest({
          map: options.map,
          mapName: options.mapName,
          alignment: options.alignment,
          areaId: options.area.id,
          displayName: options.displayName,
          enabled:
            options.enabled ??
            (typeof options.area.raw.enabled === 'boolean'
              ? options.area.raw.enabled
              : true),
          displayRegion: options.displayRegion,
          displayFrame: options.displayFrame,
          baseArea: options.area,
        }),
        include_disabled: true,
      })

      const area = payload.entity
        ? normalizeAreaEntity(payload.entity, 'noGoArea', 0)
        : null

      if (area && area.id !== options.area.id) {
        throw new Error('No-go modify returned a different area_id than the selected item.')
      }

      return {
        area,
        constraintVersion: payload.constraintVersion,
        warnings: payload.warnings,
        raw: payload.raw,
      }
    },
  )
}

export function deleteNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  areaId: string
}) {
  return runWorkbenchMutation(
    'Delete no-go area',
    SITE_SERVICE_NAMES.noGoArea,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      areaId: options.areaId,
    },
    SITE_SERVICE_NAMES.noGoArea,
    async () => {

      return requestDeleteWorkbenchNoGoArea({
        areaId: options.areaId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })
    },
  )
}

export function fetchVirtualWalls(map: MapEntity | null) {
  if (USE_MOCK_DATA) {
    return Promise.resolve(mockVirtualWalls)
  }

  return runWorkbenchRead(
    'Load virtual walls',
    SITE_SERVICE_NAMES.virtualWall,
    async () => {

      const records = await requestWorkbenchVirtualWallList(resolveRequestedMapName(map))
      return records.map((record, index) =>
        normalizeAreaEntity(record, 'virtualWall', index),
      )
    },
  )
}

export function fetchVirtualWallDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  wallId: string
}) {
  if (USE_MOCK_DATA) {
    return Promise.resolve(
      resolveMockAreaDetail(mockVirtualWalls, 'virtualWall', options.wallId.trim()),
    )
  }

  return runWorkbenchRead(
    'Load virtual wall detail',
    SITE_SERVICE_NAMES.virtualWall,
    async () => {

      const record = await requestWorkbenchVirtualWallDetail({
        wallId: options.wallId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })

      return record ? normalizeAreaEntity(record, 'virtualWall', 0) : null
    },
  )
}

export function addVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  wallId?: string | null
  displayName: string
  enabled?: boolean
  displayPath: GatewayPayload
  displayFrame: string
  bufferM: number
}) {
  return runWorkbenchMutation(
    'Create virtual wall',
    SITE_SERVICE_NAMES.virtualWall,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wallId ?? '',
      displayName: options.displayName,
      enabled: options.enabled ?? true,
      bufferM: options.bufferM,
    },
    SITE_SERVICE_NAMES.virtualWall,
    async () => {

      const payload = await requestCreateWorkbenchVirtualWall({
        operation: 2,
        map_name: resolveRequestedMapName(options.map, options.mapName),
        wall_id: options.wallId?.trim() ?? '',
        alignment_version: options.alignment?.alignmentVersion ?? '',
        wall: buildVirtualWallRequest({
          map: options.map,
          mapName: options.mapName,
          alignment: options.alignment,
          wallId: options.wallId,
          displayName: options.displayName,
          enabled: options.enabled ?? true,
          displayPath: options.displayPath,
          displayFrame: options.displayFrame,
          bufferM: options.bufferM,
        }),
        include_disabled: true,
      })

      return {
        wall: payload.entity
          ? normalizeAreaEntity(payload.entity, 'virtualWall', 0)
          : null,
        constraintVersion: payload.constraintVersion,
        warnings: payload.warnings,
        raw: payload.raw,
      }
    },
  )
}

export function modifyVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  wall: AreaEntity
  displayName: string
  enabled?: boolean
  displayPath: GatewayPayload
  displayFrame: string
  bufferM: number
}) {
  return runWorkbenchMutation(
    'Update virtual wall',
    SITE_SERVICE_NAMES.virtualWall,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wall.id,
      displayName: options.displayName,
      enabled: options.enabled ?? true,
      bufferM: options.bufferM,
    },
    SITE_SERVICE_NAMES.virtualWall,
    async () => {

      const payload = await requestUpdateWorkbenchVirtualWall(options.wall.id, {
        operation: 3,
        map_name: resolveRequestedMapName(options.map, options.mapName),
        wall_id: options.wall.id,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        wall: buildVirtualWallRequest({
          map: options.map,
          mapName: options.mapName,
          alignment: options.alignment,
          wallId: options.wall.id,
          displayName: options.displayName,
          enabled:
            options.enabled ??
            (typeof options.wall.raw.enabled === 'boolean'
              ? options.wall.raw.enabled
              : true),
          displayPath: options.displayPath,
          displayFrame: options.displayFrame,
          bufferM: options.bufferM,
          baseWall: options.wall,
        }),
        include_disabled: true,
      })

      const wall = payload.entity
        ? normalizeAreaEntity(payload.entity, 'virtualWall', 0)
        : null

      if (wall && wall.id !== options.wall.id) {
        throw new Error('Virtual wall modify returned a different wall_id than the selected item.')
      }

      return {
        wall,
        constraintVersion: payload.constraintVersion,
        warnings: payload.warnings,
        raw: payload.raw,
      }
    },
  )
}

export function deleteVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  wallId: string
}) {
  return runWorkbenchMutation(
    'Delete virtual wall',
    SITE_SERVICE_NAMES.virtualWall,
    {
      mapName: options.mapName ?? options.map?.name ?? '',
      wallId: options.wallId,
    },
    SITE_SERVICE_NAMES.virtualWall,
    async () => {

      return requestDeleteWorkbenchVirtualWall({
        wallId: options.wallId,
        mapName: resolveRequestedMapName(options.map, options.mapName),
      })
    },
  )
}

export function importCurrentMapAsset(input: ImportCurrentMapAssetInput) {
  return runWorkbenchMutation(
    'Import current map asset',
    MAP_CATALOG_SERVICE.canonicalName,
    {
      mapName: input.mapName,
      setActive: input.setActive,
    },
    MAP_CATALOG_SERVICE.canonicalName,
    async () => requestImportCurrentMapAsset(input),
  )
}

export function softDeleteMapAsset(input: {
  mapName: string
  mapRevisionId?: string
}): Promise<MapSoftDeleteResult> {
  return runWorkbenchMutation(
    'Soft delete map asset',
    input.mapRevisionId || input.mapName,
    {
      mapName: input.mapName,
      mapRevisionId: input.mapRevisionId,
      operation: 'softDelete',
    },
    MAP_CATALOG_SERVICE.canonicalName,
    async () => requestSoftDeleteMapAsset(input),
  )
}

export function hardDeleteMapAsset(
  input: HardDeleteMapAssetInput,
): Promise<MapAssetCleanupResult> {
  return runWorkbenchMutation(
    input.dryRun ? 'Preview hard delete map asset' : 'Reclaim map disk space',
    input.mapRevisionId,
    {
      mapName: input.mapName ?? '',
      mapRevisionId: input.mapRevisionId,
      dryRun: input.dryRun,
      cascade: input.cascade === true,
      operation: 'hardDelete',
    },
    MAP_CATALOG_SERVICE.canonicalName,
    async () => requestHardDeleteMapAsset(input),
  )
}

export function cleanupDisabledMapAssets(
  input: CleanupDisabledMapAssetsInput,
): Promise<MapAssetCleanupResult> {
  return runWorkbenchMutation(
    input.dryRun ? 'Preview disabled map asset cleanup' : 'Clean disabled map assets',
    input.mapName || 'all-disabled-map-assets',
    {
      mapName: input.mapName ?? '',
      dryRun: input.dryRun,
      minAgeDays: input.minAgeDays ?? 0,
      maxReclaimBytes: input.maxReclaimBytes ?? 0,
      operation: 'cleanupDisabled',
    },
    MAP_CATALOG_SERVICE.canonicalName,
    async () => requestCleanupDisabledMapAssets(input),
  )
}

export function checkMapImportPreflight(mapName: string) {
  return requestMapImportPreflight(mapName)
}

