import { getRosConnectionManager } from './client'
import { setRosDebugEvent } from './debug'
import { fetchCurrentMapFromWorker } from './mapWorkerClient'

import type {
  AreaEntity,
  DisplayFrame,
  MapAlignment,
  ZoneCommitResult,
  MapEntity,
  OccupancyGrid,
  Point2D,
  Pose2D,
  ZonePlanPathResult,
  ZoneRectDraft,
  ZoneDraftPreview,
} from '../../types/map-editor'
import type { RosServiceRequest } from '../../types/ros'
import { closePolygon } from '../../utils/geometry'

type JsonRecord = Record<string, unknown>
type AreaKind = AreaEntity['kind']

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

const SERVICE_NAMES = {
  map: '/clean_robot_server/map_server',
  alignment: '/database_server/map_alignment_service',
  alignmentByPoints: '/database_server/map_alignment_by_points_service',
  rectZonePreview: '/database_server/rect_zone_preview_service',
  zone: '/database_server/coverage_zone_service',
  zonePlanPath: '/database_server/zone_plan_path_service',
  coveragePreview: '/database_server/coverage_preview_service',
  coverageCommit: '/database_server/coverage_commit_service',
  noGoArea: '/database_server/no_go_area_service',
  virtualWall: '/database_server/virtual_wall_service',
} as const

const SERVICE_TYPES = {
  map: 'my_msg_srv/OperateMap',
  alignment: 'my_msg_srv/OperateMapAlignment',
  alignmentByPoints: 'my_msg_srv/ConfirmMapAlignmentByPoints',
  rectZonePreview: 'my_msg_srv/PreviewAlignedRectSelection',
  zone: 'my_msg_srv/OperateCoverageZone',
  zonePlanPath: 'my_msg_srv/GetZonePlanPath',
  coveragePreview: 'my_msg_srv/PreviewCoverageRegion',
  coverageCommit: 'my_msg_srv/CommitCoverageRegion',
  noGoArea: 'my_msg_srv/OperateMapNoGoArea',
  virtualWall: 'my_msg_srv/OperateMapVirtualWall',
} as const

const MAP_OPERATIONS = {
  get: 0,
  add: 1,
  modify: 2,
  delete: 3,
  getAll: 4,
} as const

const ALIGNMENT_OPERATIONS = {
  get: 0,
  add: 1,
  modify: 2,
  delete: 3,
  getAll: 4,
  activate: 5,
} as const

const ZONE_OPERATIONS = {
  get: 0,
  getAll: 1,
  delete: 2,
} as const

const CONSTRAINT_OPERATIONS = {
  get: 0,
  getAll: 1,
  add: 2,
  modify: 3,
  delete: 4,
} as const

const ENTITY_COLORS: Record<AreaKind, string> = {
  zone: '#18b38a',
  noGoArea: '#ef7d32',
  virtualWall: '#3d74ff',
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

function toNumber(value: unknown): number | null {
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

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === 'true' || normalized === '1' || normalized === 'yes'
  }

  if (typeof value === 'number') {
    return value === 1
  }

  return false
}

function toStringArray(value: unknown): string[] {
  const parsed = parseMaybeJson(value)

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) =>
        typeof item === 'string'
          ? item.trim()
          : isRecord(item) && typeof item.message === 'string'
            ? item.message.trim()
            : '',
      )
      .filter((item) => item.length > 0)
  }

  if (typeof parsed === 'string' && parsed.trim().length > 0) {
    return [parsed.trim()]
  }

  return []
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
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function findFirstValue(
  root: unknown,
  candidateKeys: string[],
  predicate: (value: unknown) => boolean,
  maxDepth = 5,
) {
  const queue: Array<{ value: unknown; depth: number }> = [
    { value: parseMaybeJson(root), depth: 0 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current) {
      break
    }

    const value = parseMaybeJson(current.value)

    if (predicate(value)) {
      return value
    }

    if (current.depth >= maxDepth) {
      continue
    }

    if (Array.isArray(value)) {
      value.forEach((item) =>
        queue.push({
          value: item,
          depth: current.depth + 1,
        }),
      )
      continue
    }

    if (isRecord(value)) {
      for (const key of candidateKeys) {
        if (key in value) {
          const candidate = parseMaybeJson(value[key])
          if (predicate(candidate)) {
            return candidate
          }
        }
      }

      Object.values(value).forEach((child) =>
        queue.push({
          value: child,
          depth: current.depth + 1,
        }),
      )
    }
  }

  return null
}

function toPoint(value: unknown): Point2D | null {
  const normalized = parseMaybeJson(value)

  if (Array.isArray(normalized) && normalized.length >= 2) {
    const x = toNumber(normalized[0])
    const y = toNumber(normalized[1])

    return x !== null && y !== null ? { x, y } : null
  }

  if (!isRecord(normalized)) {
    return null
  }

  const x = toNumber(
    pickValue(normalized, ['x', 'px', 'lng', 'lon', 'left', 'cx']),
  )
  const y = toNumber(
    pickValue(normalized, ['y', 'py', 'lat', 'top', 'cy']),
  )

  return x !== null && y !== null ? { x, y } : null
}

function toPose2D(value: unknown): Pose2D | null {
  const parsed = parseMaybeJson(value)

  if (!isRecord(parsed)) {
    return null
  }

  const x = toNumber(pickValue(parsed, ['x']))
  const y = toNumber(pickValue(parsed, ['y']))

  if (x === null || y === null) {
    return null
  }

  return {
    x,
    y,
    theta: toNumber(pickValue(parsed, ['theta', 'yaw', 'angle'])),
  }
}

function toPointArray(value: unknown): Point2D[] {
  const normalized = parseMaybeJson(value)

  if (!Array.isArray(normalized)) {
    if (isRecord(normalized)) {
      return toPointArray(
        pickValue(normalized, [
          'points',
          'vertices',
          'coords',
          'coordinates',
          'path',
          'region',
        ]),
      )
    }

    return []
  }

  const directPoints = normalized.map((item) => toPoint(item)).filter(Boolean)

  if (directPoints.length === normalized.length) {
    return directPoints as Point2D[]
  }

  for (const entry of normalized) {
    const nested = toPointArray(entry)
    if (nested.length > 0) {
      return nested
    }
  }

  return []
}

function toGeometrySet(value: unknown, closed: boolean): Point2D[][] {
  const normalized = parseMaybeJson(value)

  if (normalized === null || normalized === undefined) {
    return []
  }

  if (Array.isArray(normalized)) {
    const direct = toPointArray(normalized)
    if (direct.length > 0) {
      return [closed ? closePolygon(direct) : direct]
    }

    return normalized
      .map((entry) => toGeometrySet(entry, closed))
      .flat()
      .filter((points) => points.length > (closed ? 2 : 1))
  }

  if (isRecord(normalized)) {
    for (const key of [
      'display_region',
      'display_path',
      'map_region',
      'map_path',
      'outer',
      'ring',
      'path',
      'region',
      'polygon',
      'polyline',
      'points',
      'vertices',
      'segments',
      'areas',
      'rings',
      'contours',
    ]) {
      if (key in normalized) {
        const nested: Point2D[][] = toGeometrySet(normalized[key], closed)
        if (nested.length > 0) {
          return nested
        }
      }
    }
  }

  return []
}

function toRegionSet(value: unknown) {
  return toGeometrySet(value, true)
}

function toPathSet(value: unknown) {
  return toGeometrySet(value, false)
}

function toRotationDeg(value: unknown) {
  const numericValue = toNumber(value)

  if (numericValue === null) {
    return null
  }

  return Math.abs(numericValue) <= Math.PI * 2.2
    ? (numericValue * 180) / Math.PI
    : numericValue
}

function toDisplayFrame(value: unknown): DisplayFrame | null {
  const parsed = parseMaybeJson(value)

  if (typeof parsed === 'string' && parsed.trim().length > 0) {
    return {
      frameId: parsed.trim(),
      rotationDeg: null,
      scale: null,
      origin: null,
      raw: { frame_id: parsed.trim() },
    }
  }

  const record = isRecord(parsed) ? parsed : null

  if (!record) {
    return null
  }

  return {
    frameId: pickString(record, ['frame_id', 'frameId', 'name', 'id']) ?? undefined,
    rotationDeg: toRotationDeg(
      pickValue(record, [
        'rotation_deg',
        'rotationDeg',
        'yaw_deg',
        'yawDeg',
        'theta_deg',
        'rotation',
        'yaw',
        'theta',
        'angle',
      ]),
    ),
    scale: toNumber(pickValue(record, ['scale', 'display_scale'])),
    origin: toPoint(pickValue(record, ['origin', 'translation', 'position', 'center'])),
    raw: record,
  }
}

function summarizeMetadata(record: JsonRecord, hiddenKeys: string[]) {
  const metadata: JsonRecord = {}

  Object.entries(record).forEach(([key, value]) => {
    if (hiddenKeys.includes(key)) {
      return
    }

    if (Array.isArray(value) && value.length > 12) {
      metadata[key] = `[${value.length} items]`
      return
    }

    if (isRecord(value) && Object.keys(value).length > 12) {
      metadata[key] = `{${Object.keys(value).length} keys}`
      return
    }

    metadata[key] = value
  })

  return metadata
}

function getResponseSuccess(payload: unknown) {
  if (!isRecord(payload)) {
    return null
  }

  return typeof payload.success === 'boolean' ? payload.success : null
}

function getResponseMessage(payload: unknown) {
  if (!isRecord(payload)) {
    return null
  }

  return typeof payload.message === 'string' ? payload.message : null
}

function getResponseErrorCode(payload: unknown) {
  if (!isRecord(payload)) {
    return null
  }

  return typeof payload.error_code === 'string' && payload.error_code.trim().length > 0
    ? payload.error_code.trim()
    : null
}

function createServiceError(payload: unknown, fallbackMessage: string) {
  const message = getResponseMessage(payload) ?? fallbackMessage
  const errorCode = getResponseErrorCode(payload)

  const error = new Error(
    errorCode === 'ZONE_VERSION_CONFLICT'
      ? '该区域已被其他修改，请刷新后重试'
      : message,
  ) as Error & { code?: string | null }

  error.code = errorCode
  return error
}

function isNotFoundMessage(message: string | null) {
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return normalized.includes('not found') || normalized.includes('no active alignment')
}

function toOccupancyGrid(value: unknown): OccupancyGrid | null {
  const parsed = parseMaybeJson(value)
  const record = isRecord(parsed) ? parsed : null

  if (!record) {
    return null
  }

  const info = isRecord(record.info) ? record.info : record
  const width = toNumber(pickValue(info, ['width']))
  const height = toNumber(pickValue(info, ['height']))
  const resolution = toNumber(pickValue(info, ['resolution']))
  const data = Array.isArray(record.data)
    ? record.data.map((cell) => toNumber(cell) ?? -1)
    : []

  if (width === null || height === null || resolution === null || data.length === 0) {
    return null
  }

  const originRecord = isRecord(pickValue(info, ['origin']))
    ? (pickValue(info, ['origin']) as JsonRecord)
    : null

  const originPosition = originRecord
    ? pickValue(originRecord, ['position']) ?? originRecord
    : originRecord

  return {
    width,
    height,
    resolution,
    origin: toPoint(originPosition) ?? { x: 0, y: 0 },
    data,
  }
}

function normalizeMapCandidate(payload: unknown): JsonRecord | null {
  if (isRecord(payload) && ('display_region' in payload || 'occupancy_grid' in payload)) {
    return payload
  }

  const collection = findFirstValue(
    payload,
    ['current_map', 'active_map', 'map_list', 'maps', 'items', 'data'],
    (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
  )

  if (Array.isArray(collection)) {
    const matching = collection.find(
      (item) =>
        isRecord(item) &&
        ['active', 'is_active', 'current', 'is_current'].some((key) =>
          toBoolean(item[key]),
        ),
    )

    return isRecord(matching)
      ? matching
      : (collection.find((item) => isRecord(item)) as JsonRecord | undefined) ?? null
  }

  const directMatch = findFirstValue(
    payload,
    ['current_map', 'active_map', 'map'],
    (value) => isRecord(value),
  )

  return isRecord(directMatch)
    ? (directMatch as JsonRecord)
    : isRecord(payload)
      ? payload
      : null
}

function normalizeAlignmentCandidate(payload: unknown): JsonRecord | null {
  if (isRecord(payload)) {
    for (const key of ['active_alignment', 'alignment', 'config']) {
      const candidate = parseMaybeJson(payload[key])
      if (
        isRecord(candidate) &&
        [
          'alignment_version',
          'alignment_id',
          'aligned_frame',
          'raw_frame',
          'display_frame',
          'yaw_offset_deg',
          'yaw_deg',
          'active',
          'is_active',
        ].some((field) => field in candidate)
      ) {
        return candidate
      }
    }
  }

  const collection = findFirstValue(
    payload,
    ['active_alignment', 'alignment_list', 'alignments', 'configs', 'items', 'data'],
    (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
  )

  if (Array.isArray(collection)) {
    const matching = collection.find(
      (item) =>
        isRecord(item) &&
        ['active', 'is_active', 'current', 'is_current'].some((key) =>
          toBoolean(item[key]),
        ),
    )

    return isRecord(matching)
      ? matching
      : (collection.find((item) => isRecord(item)) as JsonRecord | undefined) ?? null
  }

  const directMatch = findFirstValue(
    payload,
    ['active_alignment', 'alignment', 'config'],
    (value) =>
      isRecord(value) &&
      [
        'alignment_version',
        'alignment_id',
        'aligned_frame',
        'raw_frame',
        'display_frame',
        'yaw_offset_deg',
        'yaw_deg',
        'active',
        'is_active',
      ].some((field) => field in value),
  )

  if (isRecord(directMatch)) {
    return directMatch as JsonRecord
  }

  if (
    isRecord(payload) &&
    [
      'alignment_version',
      'alignment_id',
      'aligned_frame',
      'raw_frame',
      'display_frame',
      'yaw_offset_deg',
      'yaw_deg',
      'active',
      'is_active',
    ].some((key) => key in payload)
  ) {
    return payload
  }

  return null
}

function normalizeRectZonePreviewCandidate(payload: unknown): JsonRecord | null {
  const directMatch = findFirstValue(
    payload,
    ['preview', 'selection', 'rect_preview', 'result', 'data'],
    (value) =>
      isRecord(value) &&
      ['display_region', 'width_m', 'height_m', 'area_m2'].some((key) => key in value),
  )

  if (isRecord(directMatch)) {
    return directMatch as JsonRecord
  }

  if (
    isRecord(payload) &&
    ['display_region', 'width_m', 'height_m', 'area_m2'].some((key) => key in payload)
  ) {
    return payload
  }

  return null
}

function normalizeCoveragePreviewCandidate(payload: unknown): JsonRecord | null {
  const directMatch = findFirstValue(
    payload,
    ['preview', 'result', 'data'],
    (value) =>
      isRecord(value) &&
      [
        'display_preview_path',
        'display_entry_pose',
        'estimated_length_m',
        'estimated_duration_s',
        'valid',
      ].some((key) => key in value),
  )

  if (isRecord(directMatch)) {
    return directMatch as JsonRecord
  }

  if (
    isRecord(payload) &&
    [
      'display_preview_path',
      'display_entry_pose',
      'estimated_length_m',
      'estimated_duration_s',
      'valid',
    ].some((key) => key in payload)
  ) {
    return payload
  }

  return null
}

function normalizeZonePlanPathCandidate(payload: unknown): JsonRecord | null {
  const directMatch = findFirstValue(
    payload,
    ['path', 'plan_path', 'result', 'data'],
    (value) =>
      isRecord(value) &&
      [
        'zone_id',
        'active_plan_id',
        'display_path',
        'display_entry_pose',
      ].some((key) => key in value),
  )

  if (isRecord(directMatch)) {
    return directMatch as JsonRecord
  }

  if (
    isRecord(payload) &&
    ['zone_id', 'active_plan_id', 'display_path', 'display_entry_pose'].some(
      (key) => key in payload,
    )
  ) {
    return payload
  }

  return null
}

function normalizeCoverageCommitCandidate(payload: unknown): JsonRecord | null {
  const directMatch = findFirstValue(
    payload,
    ['result', 'data'],
    (value) =>
      isRecord(value) &&
      ['zone_id', 'zone_version', 'plan_id'].some((key) => key in value),
  )

  if (isRecord(directMatch)) {
    return directMatch as JsonRecord
  }

  if (
    isRecord(payload) &&
    ['zone_id', 'zone_version', 'plan_id'].some((key) => key in payload)
  ) {
    return payload
  }

  return null
}

function normalizeEntityList(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => isRecord(item)) as JsonRecord[]
  }

  const collection = findFirstValue(
    payload,
    keys,
    (value) => Array.isArray(value) && value.some((item) => isRecord(item)),
  )

  if (Array.isArray(collection)) {
    return collection.filter((item) => isRecord(item)) as JsonRecord[]
  }

  const directMatch = findFirstValue(payload, keys, (value) => isRecord(value))
  return isRecord(directMatch) ? [directMatch as JsonRecord] : []
}

function normalizeMap(payload: unknown): MapEntity | null {
  const record = normalizeMapCandidate(payload)

  if (!record) {
    return null
  }

  const occupancyGrid =
    toOccupancyGrid(
      pickValue(record, [
        'occupancy_grid',
        'occupancyGrid',
        'map',
        'map_data',
        'grid',
      ]),
    ) ?? toOccupancyGrid(record)

  const displayRegion = toRegionSet(
    pickValue(record, [
      'display_region',
      'displayRegion',
      'map_region',
      'region',
      'boundary',
    ]),
  )

  const fallbackRegion =
    occupancyGrid === null
      ? []
      : [
          closePolygon([
            { x: occupancyGrid.origin.x, y: occupancyGrid.origin.y },
            {
              x: occupancyGrid.origin.x + occupancyGrid.width * occupancyGrid.resolution,
              y: occupancyGrid.origin.y,
            },
            {
              x: occupancyGrid.origin.x + occupancyGrid.width * occupancyGrid.resolution,
              y: occupancyGrid.origin.y + occupancyGrid.height * occupancyGrid.resolution,
            },
            {
              x: occupancyGrid.origin.x,
              y: occupancyGrid.origin.y + occupancyGrid.height * occupancyGrid.resolution,
            },
          ]),
        ]

  return {
    id:
      pickString(record, ['map_id', 'mapId', 'map_uuid', 'uuid', 'id']) ??
      'current-map',
    name:
      pickString(record, ['map_name', 'mapName', 'name', 'display_name']) ??
      'Current Map',
    kind: 'map',
    displayRegion: displayRegion.length > 0 ? displayRegion : fallbackRegion,
    displayPath: toPathSet(
      pickValue(record, ['display_path', 'displayPath', 'map_path', 'path']),
    ),
    displayFrame: toDisplayFrame(
      pickValue(record, ['display_frame', 'displayFrame', 'frame']),
    ),
    resolution:
      toNumber(pickValue(record, ['resolution', 'map_resolution'])) ??
      occupancyGrid?.resolution ??
      null,
    rasterImageUrl:
      pickString(record, [
        'image_url',
        'imageUrl',
        'map_image_url',
        'mapImageUrl',
        'raster_url',
        'png_url',
      ]) ?? null,
    occupancyGrid,
    size: {
      width:
        toNumber(pickValue(record, ['width', 'map_width'])) ??
        occupancyGrid?.width ??
        null,
      height:
        toNumber(pickValue(record, ['height', 'map_height'])) ??
        occupancyGrid?.height ??
        null,
    },
    metadata: summarizeMetadata(record, [
      'display_region',
      'displayRegion',
      'map_region',
      'display_path',
      'displayPath',
      'map_path',
      'occupancy_grid',
      'occupancyGrid',
      'map_data',
      'grid',
    ]),
    raw: record,
  }
}

function normalizeAlignment(payload: unknown): MapAlignment | null {
  const record = normalizeAlignmentCandidate(payload)

  if (!record) {
    return null
  }

  const displayFrame =
    toDisplayFrame(pickValue(record, ['display_frame', 'displayFrame', 'frame'])) ??
    toDisplayFrame({
      frame_id:
        pickString(record, ['aligned_frame', 'display_frame', 'raw_frame']) ?? 'map',
      rotation_deg: pickValue(record, [
        'yaw_offset_deg',
        'rotation_deg',
        'rotationDeg',
        'yaw_deg',
      ]),
      origin: {
        x: pickValue(record, ['pivot_x']),
        y: pickValue(record, ['pivot_y']),
      },
    })

  return {
    id:
      pickString(
        record,
        ['alignment_version', 'alignment_id', 'alignmentId', 'id', 'uuid'],
      ) ??
      'active-alignment',
    name:
      pickString(record, [
        'name',
        'alignment_name',
        'alignmentName',
        'alignment_version',
        'aligned_frame',
      ]) ??
      'Active Alignment',
    status:
      pickString(record, ['status', 'state', 'result']) ??
      (toBoolean(pickValue(record, ['active', 'is_active'])) ? 'active' : 'ready'),
    alignmentVersion:
      pickString(record, ['alignment_version', 'alignment_id', 'alignmentId']) ??
      null,
    rawFrame: pickString(record, ['raw_frame', 'rawFrame']) ?? null,
    alignedFrame:
      pickString(record, ['aligned_frame', 'alignedFrame']) ??
      displayFrame?.frameId ??
      null,
    active: toBoolean(pickValue(record, ['active', 'is_active'])),
    displayFrame,
    rotationDeg: toRotationDeg(
      pickValue(record, [
        'yaw_offset_deg',
        'rotation_deg',
        'rotationDeg',
        'yaw_deg',
        'yaw',
        'theta',
      ]),
    ),
    pivot: {
      x: toNumber(pickValue(record, ['pivot_x'])) ?? 0,
      y: toNumber(pickValue(record, ['pivot_y'])) ?? 0,
    },
    metadata: summarizeMetadata(record, ['display_frame', 'displayFrame']),
    raw: record,
  }
}

function normalizeRectZonePreview(payload: unknown): ZoneRectDraft | null {
  const record = normalizeRectZonePreviewCandidate(payload)

  if (!record) {
    return null
  }

  const displayRegion = toRegionSet(
    pickValue(record, ['display_region', 'displayRegion', 'region']),
  )

  if (displayRegion.length === 0) {
    return null
  }

  return {
    displayRegion,
    displayFrame: toDisplayFrame(
      pickValue(record, ['display_frame', 'displayFrame', 'frame']),
    ),
    mapRegion: (() => {
      const region = toRegionSet(pickValue(record, ['map_region', 'mapRegion']))
      return region.length > 0 ? region : null
    })(),
    widthM: toNumber(pickValue(record, ['width_m', 'widthM'])),
    heightM: toNumber(pickValue(record, ['height_m', 'heightM'])),
    areaM2: toNumber(pickValue(record, ['area_m2', 'areaM2'])),
    warnings: toStringArray(
      pickValue(record, ['warnings', 'warning_msgs', 'warningMessages']),
    ),
    raw: record,
  }
}

function normalizeCoveragePreview(payload: unknown): ZoneDraftPreview | null {
  const record = normalizeCoveragePreviewCandidate(payload)

  if (!record) {
    return null
  }

  return {
    displayPreviewPath: toPathSet(
      pickValue(record, ['display_preview_path', 'displayPreviewPath', 'preview_path']),
    ),
    displayEntryPose: toPose2D(
      pickValue(record, ['display_entry_pose', 'displayEntryPose', 'entry_pose']),
    ),
    estimatedLengthM: toNumber(
      pickValue(record, ['estimated_length_m', 'estimatedLengthM']),
    ),
    estimatedDurationS: toNumber(
      pickValue(record, ['estimated_duration_s', 'estimatedDurationS']),
    ),
    warnings: toStringArray(
      pickValue(record, ['warnings', 'warning_msgs', 'warningMessages']),
    ),
    valid:
      typeof pickValue(record, ['valid']) === 'boolean'
        ? (pickValue(record, ['valid']) as boolean)
        : null,
  }
}

function normalizeZonePlanPath(payload: unknown): ZonePlanPathResult | null {
  const record = normalizeZonePlanPathCandidate(payload)

  if (!record) {
    return null
  }

  const zoneId = pickString(record, ['zone_id', 'zoneId'])

  if (!zoneId) {
    return null
  }

  return {
    zoneId,
    activePlanId: pickString(record, ['active_plan_id', 'activePlanId']),
    planProfileName:
      pickString(record, ['plan_profile_name', 'planProfileName']) ?? '',
    alignmentVersion:
      pickString(record, ['alignment_version', 'alignmentVersion']) ?? null,
    displayFrame: toDisplayFrame(
      pickValue(record, ['display_frame', 'displayFrame', 'frame']),
    ),
    storageFrame:
      pickString(record, ['storage_frame', 'storageFrame']) ?? null,
    displayPath: toPathSet(
      pickValue(record, ['display_path', 'displayPath', 'path']),
    ),
    mapPath: toPathSet(pickValue(record, ['map_path', 'mapPath'])),
    displayEntryPose: toPose2D(
      pickValue(record, ['display_entry_pose', 'displayEntryPose']),
    ),
    entryPose: toPose2D(pickValue(record, ['entry_pose', 'entryPose'])),
    estimatedLengthM: toNumber(
      pickValue(record, ['estimated_length_m', 'estimatedLengthM']),
    ),
    estimatedDurationS: toNumber(
      pickValue(record, ['estimated_duration_s', 'estimatedDurationS']),
    ),
    warnings: toStringArray(
      pickValue(record, ['warnings', 'warning_msgs', 'warningMessages']),
    ),
    raw: record,
  }
}

function normalizeCoverageCommit(payload: unknown): ZoneCommitResult | null {
  const record = normalizeCoverageCommitCandidate(payload)

  if (!record) {
    return null
  }

  const zoneId = pickString(record, ['zone_id', 'zoneId'])

  if (!zoneId) {
    return null
  }

  return {
    zoneId,
    zoneVersion: toNumber(pickValue(record, ['zone_version', 'zoneVersion'])),
    planId: pickString(record, ['plan_id', 'planId']),
    warnings: toStringArray(
      pickValue(record, ['warnings', 'warning_msgs', 'warningMessages']),
    ),
    raw: record,
  }
}

function normalizeConstraintEntity(
  payload: unknown,
  kind: Extract<AreaKind, 'noGoArea' | 'virtualWall'>,
) {
  if (isRecord(payload) && isRecord(payload.area)) {
    return normalizeAreaEntity(payload.area, kind, 0)
  }

  if (isRecord(payload) && isRecord(payload.wall)) {
    return normalizeAreaEntity(payload.wall, kind, 0)
  }

  if (
    isRecord(payload) &&
    [
      'area_id',
      'wall_id',
      'display_region',
      'display_path',
      'display_name',
    ].some((key) => key in payload)
  ) {
    return normalizeAreaEntity(payload, kind, 0)
  }

  const fallbackRecord = normalizeEntityList(payload, [
    'area',
    'areas',
    'wall',
    'walls',
    'items',
    'data',
  ])[0]

  return fallbackRecord ? normalizeAreaEntity(fallbackRecord, kind, 0) : null
}

function getConstraintVersion(payload: unknown) {
  return isRecord(payload) ? pickString(payload, ['constraint_version']) : null
}

function buildNoGoAreaRequest(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  areaId?: string | null
  displayName: string
  enabled: boolean
  displayRegion: RosServiceRequest
  displayFrame: string
  baseArea?: AreaEntity | null
}) {
  const baseArea = isRecord(options.baseArea?.raw) ? options.baseArea.raw : {}

  return {
    ...baseArea,
    map_name: resolveRequestedMapName(options.map, options.mapName),
    area_id: options.areaId?.trim() ?? '',
    display_name: options.displayName.trim(),
    enabled: options.enabled,
    alignment_version: options.alignment?.alignmentVersion ?? '',
    display_frame: options.displayFrame,
    display_region: options.displayRegion,
  } satisfies RosServiceRequest
}

function buildVirtualWallRequest(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  wallId?: string | null
  displayName: string
  enabled: boolean
  displayPath: RosServiceRequest
  displayFrame: string
  bufferM: number
  baseWall?: AreaEntity | null
}) {
  const baseWall = isRecord(options.baseWall?.raw) ? options.baseWall.raw : {}

  return {
    ...baseWall,
    map_name: resolveRequestedMapName(options.map, options.mapName),
    wall_id: options.wallId?.trim() ?? '',
    display_name: options.displayName.trim(),
    enabled: options.enabled,
    alignment_version: options.alignment?.alignmentVersion ?? '',
    display_frame: options.displayFrame,
    display_path: options.displayPath,
    buffer_m: options.bufferM,
  } satisfies RosServiceRequest
}

function normalizeAreaEntity(record: JsonRecord, kind: AreaKind, index: number): AreaEntity {
  return {
    id:
      pickString(record, [
        `${kind}_id`,
        `${kind}Id`,
        'zone_id',
        'area_id',
        'wall_id',
        'no_go_area_id',
        'virtual_wall_id',
        'id',
        'uuid',
      ]) ?? `${kind}-${index + 1}`,
    name:
      pickString(record, ['name', 'display_name', 'label', 'title']) ??
      `${kind}-${index + 1}`,
    kind,
    color: ENTITY_COLORS[kind],
    displayRegion: toRegionSet(
      pickValue(record, [
        'display_region',
        'displayRegion',
        'map_region',
        'region',
        'polygon',
        'area',
      ]),
    ),
    displayPath: toPathSet(
      pickValue(record, [
        'display_path',
        'displayPath',
        'map_path',
        'path',
        'segments',
        'polyline',
        'line',
      ]),
    ),
    displayFrame: toDisplayFrame(
      pickValue(record, ['display_frame', 'displayFrame', 'frame']),
    ),
    metadata: summarizeMetadata(record, [
      'display_region',
      'displayRegion',
      'map_region',
      'display_path',
      'displayPath',
      'map_path',
    ]),
    raw: record,
  }
}

function getMapName(map: MapEntity | null) {
  return (map?.raw.map_name as string | undefined) ?? map?.name ?? ''
}

function resolveRequestedMapName(map: MapEntity | null, mapName?: string | null) {
  return mapName?.trim() || getMapName(map)
}

async function callRosService(request: {
  serviceName: string
  serviceType: string
  payload: RosServiceRequest
}) {
  const client = getRosConnectionManager()
  setRosDebugEvent(`service:start:${request.serviceName}`)

  const response = await client.callService<RosServiceRequest, JsonRecord>({
    serviceName: request.serviceName,
    serviceType: request.serviceType,
    request: request.payload,
    timeoutSeconds: 8,
  })

  setRosDebugEvent(`service:done:${request.serviceName}`)
  return response
}

const mockMap: MapEntity = {
  id: 'mock-map-001',
  name: 'Demo Lobby',
  kind: 'map',
  displayRegion: [
    closePolygon([
      { x: 0, y: 0 },
      { x: 26, y: 0 },
      { x: 26, y: 18 },
      { x: 0, y: 18 },
    ]),
  ],
  displayPath: [],
  displayFrame: {
    frameId: 'map',
    rotationDeg: 0,
    scale: 1,
    origin: { x: 0, y: 0 },
    raw: { frame_id: 'map' },
  },
  resolution: 0.05,
  rasterImageUrl: null,
  occupancyGrid: null,
  size: {
    width: 520,
    height: 360,
  },
  metadata: {
    source: 'mock',
    note: 'Enable only for local UI smoke testing.',
  },
  raw: {
    id: 'mock-map-001',
    name: 'Demo Lobby',
  },
}

const mockAlignment: MapAlignment = {
  id: 'mock-alignment-001',
  name: 'Forward Cleaning Flow',
  status: 'active',
  alignmentVersion: 'mock-alignment-001',
  rawFrame: 'map',
  alignedFrame: 'display_map',
  active: true,
  displayFrame: {
    frameId: 'display_map',
    rotationDeg: 0,
    scale: 1,
    origin: { x: 0, y: 0 },
    raw: { frame_id: 'display_map' },
  },
  rotationDeg: 0,
  pivot: { x: 0, y: 0 },
  metadata: {
    source: 'mock',
  },
  raw: {
    id: 'mock-alignment-001',
    status: 'active',
  },
}

const mockZones: AreaEntity[] = [
  {
    id: 'zone-a',
    name: 'Coverage Alpha',
    kind: 'zone',
    color: ENTITY_COLORS.zone,
    displayRegion: [
      closePolygon([
        { x: 3, y: 3 },
        { x: 12, y: 3 },
        { x: 12, y: 9 },
        { x: 3, y: 9 },
      ]),
    ],
    displayPath: [],
    displayFrame: null,
    metadata: { priority: 'high' },
    raw: { id: 'zone-a' },
  },
  {
    id: 'zone-b',
    name: 'Coverage Beta',
    kind: 'zone',
    color: ENTITY_COLORS.zone,
    displayRegion: [
      closePolygon([
        { x: 14, y: 5 },
        { x: 22, y: 5 },
        { x: 22, y: 13 },
        { x: 14, y: 13 },
      ]),
    ],
    displayPath: [],
    displayFrame: null,
    metadata: { priority: 'normal' },
    raw: { id: 'zone-b' },
  },
]

const mockNoGoAreas: AreaEntity[] = [
  {
    id: 'nogo-a',
    name: 'Wet Floor Block',
    kind: 'noGoArea',
    color: ENTITY_COLORS.noGoArea,
    displayRegion: [
      closePolygon([
        { x: 8, y: 11 },
        { x: 12.5, y: 11 },
        { x: 12.5, y: 15 },
        { x: 8, y: 15 },
      ]),
    ],
    displayPath: [],
    displayFrame: null,
    metadata: { reason: 'maintenance' },
    raw: { id: 'nogo-a' },
  },
]

const mockVirtualWalls: AreaEntity[] = [
  {
    id: 'wall-a',
    name: 'Reception Divider',
    kind: 'virtualWall',
    color: ENTITY_COLORS.virtualWall,
    displayRegion: [],
    displayPath: [[{ x: 5, y: 14 }, { x: 19, y: 14 }]],
    displayFrame: null,
    metadata: { mode: 'one_way' },
    raw: { id: 'wall-a' },
  },
]

function createMockZonePlanPath(zoneId: string): ZonePlanPathResult | null {
  const zone = mockZones.find((entry) => entry.id === zoneId)

  if (!zone || zone.displayRegion.length === 0 || zone.displayRegion[0].length < 4) {
    return null
  }

  const polygon = zone.displayRegion[0]
  const path =
    zone.displayPath.length > 0
      ? zone.displayPath
      : [[polygon[0], polygon[1], polygon[2], polygon[3]]]

  return {
    zoneId: zone.id,
    activePlanId: `mock-plan-${zone.id}`,
    planProfileName:
      typeof zone.raw.plan_profile_name === 'string'
        ? zone.raw.plan_profile_name
        : 'cover_standard',
    alignmentVersion: mockAlignment.alignmentVersion,
    displayFrame: zone.displayFrame,
    storageFrame: zone.displayFrame?.frameId ?? 'map',
    displayPath: path,
    mapPath: path,
    displayEntryPose: {
      x: polygon[0].x,
      y: polygon[0].y,
      theta: 0,
    },
    entryPose: {
      x: polygon[0].x,
      y: polygon[0].y,
      theta: 0,
    },
    estimatedLengthM: 24,
    estimatedDurationS: 68,
    warnings: ['mock zone path'],
    raw: {
      zone_id: zone.id,
      active_plan_id: `mock-plan-${zone.id}`,
      plan_profile_name:
        typeof zone.raw.plan_profile_name === 'string'
          ? zone.raw.plan_profile_name
          : 'cover_standard',
    },
  }
}

function createMockRectZonePreview(
  points: [Point2D, Point2D],
  minSideM: number,
): ZoneRectDraft {
  const minX = Math.min(points[0].x, points[1].x)
  const minY = Math.min(points[0].y, points[1].y)
  const maxX = Math.max(points[0].x, points[1].x)
  const maxY = Math.max(points[0].y, points[1].y)
  const widthM = maxX - minX
  const heightM = maxY - minY
  const warnings: string[] = []

  if (widthM < minSideM || heightM < minSideM) {
    warnings.push(`The selected rectangle is smaller than ${minSideM.toFixed(2)} m.`)
  }

  const displayRegion = [
    closePolygon([
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]),
  ]

  return {
    displayRegion,
    displayFrame: {
      frameId: 'site_map',
      rotationDeg: 0,
      scale: 1,
      origin: null,
      raw: { frame_id: 'site_map' },
    },
    mapRegion: null,
    widthM,
    heightM,
    areaM2: widthM * heightM,
    warnings,
    raw: {
      display_region: displayRegion,
      width_m: widthM,
      height_m: heightM,
      area_m2: widthM * heightM,
      warnings,
    },
  }
}

async function fetchCurrentMapDirectly() {
  setRosDebugEvent('map:getAll:request')

  const getAllPayload = await callRosService({
    serviceName: SERVICE_NAMES.map,
    serviceType: SERVICE_TYPES.map,
    payload: {
      operation: MAP_OPERATIONS.getAll,
      map_name: '',
      map: {},
      set_active: false,
      enabled_state: 0,
    },
  })

  if (getResponseSuccess(getAllPayload) === false) {
    setRosDebugEvent('map:getAll:error')
    throw new Error(
      getResponseMessage(getAllPayload) ?? 'Map service returned an error.',
    )
  }

  const maps = Array.isArray(getAllPayload.maps)
    ? getAllPayload.maps.filter((item) => isRecord(item))
    : []
  const activeMap =
    maps.find((item) => toBoolean(item.is_active)) ??
    (isRecord(getAllPayload.map) ? getAllPayload.map : null)

  if (!activeMap) {
    setRosDebugEvent('map:getAll:no-active-map')
    throw new Error('Map service returned no active map payload.')
  }

  const mapName =
    pickString(activeMap, ['map_name', 'name', 'display_name']) ?? 'yeyeyeye'

  setRosDebugEvent(`map:get:request:${mapName}`)

  const getPayload = await callRosService({
    serviceName: SERVICE_NAMES.map,
    serviceType: SERVICE_TYPES.map,
    payload: {
      operation: MAP_OPERATIONS.get,
      map_name: mapName,
      map: {},
      set_active: false,
      enabled_state: 0,
    },
  })

  if (getResponseSuccess(getPayload) === false) {
    setRosDebugEvent(`map:get:error:${mapName}`)
    throw new Error(
      getResponseMessage(getPayload) ?? `Map detail fetch failed for ${mapName}.`,
    )
  }

  const fullMap =
    (isRecord(getPayload.map) ? getPayload.map : null) ??
    (isRecord(getPayload) ? getPayload : null)

  const mapRecord = fullMap ? { ...activeMap, ...fullMap } : activeMap
  const normalized = normalizeMap(mapRecord)

  if (!normalized) {
    setRosDebugEvent(`map:normalize:error:${mapName}`)
    throw new Error(`Map service returned no usable payload for ${mapName}.`)
  }

  setRosDebugEvent(`map:ready:${mapName}`)
  return normalized
}

export async function fetchCurrentMap() {
  if (USE_MOCK_DATA) {
    setRosDebugEvent('map:mock:return')
    return mockMap
  }

  const url = getRosConnectionManager().getSnapshot().url
  setRosDebugEvent(`map:worker:dispatch:${url}`)

  try {
    return await fetchCurrentMapFromWorker(url)
  } catch (error) {
    setRosDebugEvent(
      `map:worker:fallback:${error instanceof Error ? error.message : 'unknown'}`,
    )
    return fetchCurrentMapDirectly()
  }
}

export async function fetchActiveAlignment(
  map: MapEntity | null,
  mapName?: string | null,
) {
  if (USE_MOCK_DATA) {
    return mockAlignment
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.alignment,
    serviceType: SERVICE_TYPES.alignment,
    payload: {
      operation: ALIGNMENT_OPERATIONS.get,
      map_name: resolveRequestedMapName(map, mapName),
      alignment_version: '',
      config: {},
    },
  })

  if (getResponseSuccess(payload) === false) {
    const message = getResponseMessage(payload)
    if (isNotFoundMessage(message)) {
      return null
    }

    throw new Error(message ?? 'Alignment service returned an error.')
  }

  const normalized = normalizeAlignment(payload)

  if (!normalized) {
    return null
  }

  return normalized
}

export async function confirmMapAlignmentByPoints(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  points: [Point2D, Point2D]
}) {
  if (USE_MOCK_DATA) {
    return {
      ...mockAlignment,
      alignmentVersion: 'mock-alignment-001',
      rawFrame: 'map',
      alignedFrame: 'site_map',
      active: true,
      pivot: options.points[0],
      raw: {
        ...mockAlignment.raw,
        alignment_version: 'mock-alignment-001',
        raw_frame: 'map',
        aligned_frame: 'site_map',
        pivot_x: options.points[0].x,
        pivot_y: options.points[0].y,
        active: true,
      },
    } satisfies MapAlignment
  }

  const mapName = resolveRequestedMapName(options.map, options.mapName)

  if (!mapName) {
    throw new Error('The current map is not ready for alignment.')
  }

  setRosDebugEvent(`alignment:confirm:request:${mapName}`)

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.alignmentByPoints,
    serviceType: SERVICE_TYPES.alignmentByPoints,
    payload: {
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
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw new Error(
      getResponseMessage(payload) ?? 'Alignment confirm service returned an error.',
    )
  }

  const normalized = normalizeAlignment(payload)

  if (!normalized) {
    throw new Error('Alignment confirm service returned no usable config.')
  }

  setRosDebugEvent(`alignment:confirm:done:${mapName}`)
  return normalized
}

export async function previewRectZoneByPoints(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  points: [Point2D, Point2D]
  minSideM?: number
}) {
  const minSideM = options.minSideM ?? 0.2

  if (USE_MOCK_DATA) {
    return createMockRectZonePreview(options.points, minSideM)
  }

  const mapName = resolveRequestedMapName(options.map, options.mapName)

  if (!mapName) {
    throw new Error('The current map is not ready for zone creation.')
  }

  setRosDebugEvent(`zone:rect-preview:request:${mapName}`)

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.rectZonePreview,
    serviceType: SERVICE_TYPES.rectZonePreview,
    payload: {
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
      min_side_m: minSideM,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw new Error(
      getResponseMessage(payload) ?? 'Rect zone preview service returned an error.',
    )
  }

  const normalized = normalizeRectZonePreview(payload)

  if (!normalized) {
    throw new Error('Rect zone preview service returned no usable display_region.')
  }

  setRosDebugEvent(`zone:rect-preview:done:${mapName}`)
  return normalized
}

export async function previewCoverageRegion(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  region: RosServiceRequest
  profileName: string
}) {
  const mapName = resolveRequestedMapName(options.map, options.mapName)

  if (!mapName) {
    throw new Error('The current map is not ready for coverage preview.')
  }

  if (!options.profileName.trim()) {
    throw new Error('A profile name is required before previewing a zone.')
  }

  setRosDebugEvent(`zone:coverage-preview:request:${mapName}`)

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.coveragePreview,
    serviceType: SERVICE_TYPES.coveragePreview,
    payload: {
      map_name: mapName,
      alignment_version: options.alignment?.alignmentVersion ?? '',
      region: options.region,
      profile_name: options.profileName.trim(),
      debug_publish_markers: false,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(
      payload,
      'Coverage preview service returned an error.',
    )
  }

  const normalized = normalizeCoveragePreview(payload)

  if (!normalized) {
    throw new Error('Coverage preview service returned no usable preview data.')
  }

  setRosDebugEvent(`zone:coverage-preview:done:${mapName}`)
  return normalized
}

export async function commitCoverageRegion(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  region: RosServiceRequest
  displayName: string
  profileName: string
  zoneId?: string | null
  baseZoneVersion?: number | null
}) {
  const mapName = resolveRequestedMapName(options.map, options.mapName)

  if (!mapName) {
    throw new Error('The current map is not ready for zone commit.')
  }

  if (!options.displayName.trim()) {
    throw new Error('A zone display name is required before commit.')
  }

  if (!options.profileName.trim()) {
    throw new Error('A profile name is required before commit.')
  }

  setRosDebugEvent(`zone:coverage-commit:request:${mapName}`)

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.coverageCommit,
    serviceType: SERVICE_TYPES.coverageCommit,
    payload: {
      map_name: mapName,
      alignment_version: options.alignment?.alignmentVersion ?? '',
      zone_id: options.zoneId ?? '',
      base_zone_version: options.baseZoneVersion ?? 0,
      display_name: options.displayName.trim(),
      region: options.region,
      profile_name: options.profileName.trim(),
      set_active_plan: true,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(
      payload,
      'Coverage commit service returned an error.',
    )
  }

  const normalized = normalizeCoverageCommit(payload)

  if (!normalized) {
    throw new Error('Coverage commit service returned no usable zone result.')
  }

  setRosDebugEvent(`zone:coverage-commit:done:${mapName}`)
  return normalized
}

export async function fetchCoverageZones(
  map: MapEntity | null,
  mapName?: string | null,
) {
  if (USE_MOCK_DATA) {
    return mockZones
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.zone,
    serviceType: SERVICE_TYPES.zone,
    payload: {
      operation: ZONE_OPERATIONS.getAll,
      map_name: resolveRequestedMapName(map, mapName),
      zone_id: '',
      alignment_version: '',
      plan_profile_name: '',
      include_disabled: false,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw new Error(getResponseMessage(payload) ?? 'Zone service returned an error.')
  }

  const zones = Array.isArray(payload.zones)
    ? payload.zones.filter((item) => isRecord(item))
    : normalizeEntityList(payload, [
        'zones',
        'zone_list',
        'coverage_zones',
        'coverage_zone_list',
        'items',
        'list',
        'data',
      ])

  return zones.map((record, index) => normalizeAreaEntity(record, 'zone', index))
}

export async function fetchCoverageZoneDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
  profileName?: string
}) {
  if (USE_MOCK_DATA) {
    return mockZones.find((zone) => zone.id === options.zoneId) ?? null
  }

  if (!options.zoneId.trim()) {
    throw new Error('A zone_id is required before loading zone detail.')
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.zone,
    serviceType: SERVICE_TYPES.zone,
    payload: {
      operation: ZONE_OPERATIONS.get,
      map_name: resolveRequestedMapName(options.map, options.mapName),
      zone_id: options.zoneId.trim(),
      alignment_version: '',
      plan_profile_name: options.profileName?.trim() ?? '',
      include_disabled: true,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Zone detail query returned an error.')
  }

  const record = isRecord(payload.zone)
    ? payload.zone
    : normalizeEntityList(payload, ['zone', 'zones', 'items', 'data'])[0] ?? null

  return record ? normalizeAreaEntity(record, 'zone', 0) : null
}

export async function fetchZonePlanPath(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
  alignmentVersion?: string | null
  planProfileName?: string | null
}) {
  if (USE_MOCK_DATA) {
    return createMockZonePlanPath(options.zoneId)
  }

  if (!options.zoneId.trim()) {
    throw new Error('A zone_id is required before loading a zone plan path.')
  }

  const mapName = resolveRequestedMapName(options.map, options.mapName)
  setRosDebugEvent(`zone:plan-path:request:${mapName}:${options.zoneId.trim()}`)

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.zonePlanPath,
    serviceType: SERVICE_TYPES.zonePlanPath,
    payload: {
      map_name: mapName,
      zone_id: options.zoneId.trim(),
      alignment_version: options.alignmentVersion?.trim() ?? '',
      plan_profile_name: options.planProfileName?.trim() ?? '',
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Zone plan path service returned an error.')
  }

  const normalized = normalizeZonePlanPath(payload)

  if (!normalized) {
    throw new Error('Zone plan path service returned no usable path result.')
  }

  setRosDebugEvent(`zone:plan-path:done:${mapName}:${options.zoneId.trim()}`)
  return normalized
}

export async function deleteCoverageZone(options: {
  map: MapEntity | null
  mapName?: string | null
  zoneId: string
}) {
  if (USE_MOCK_DATA) {
    return {
      message: 'disabled',
      raw: {},
    }
  }

  if (!options.zoneId.trim()) {
    throw new Error('A zone_id is required before deleting a zone.')
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.zone,
    serviceType: SERVICE_TYPES.zone,
    payload: {
      operation: ZONE_OPERATIONS.delete,
      map_name: resolveRequestedMapName(options.map, options.mapName),
      zone_id: options.zoneId.trim(),
      alignment_version: '',
      plan_profile_name: '',
      include_disabled: false,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Zone delete returned an error.')
  }

  return {
    message: getResponseMessage(payload) ?? 'disabled',
    raw: isRecord(payload) ? payload : {},
  }
}

export async function fetchNoGoAreas(map: MapEntity | null) {
  if (USE_MOCK_DATA) {
    return mockNoGoAreas
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.noGoArea,
    serviceType: SERVICE_TYPES.noGoArea,
    payload: {
      operation: CONSTRAINT_OPERATIONS.getAll,
      map_name: getMapName(map),
      area_id: '',
      alignment_version: '',
      area: {},
      include_disabled: false,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw new Error(getResponseMessage(payload) ?? 'No-go service returned an error.')
  }

  const areas = Array.isArray(payload.areas)
    ? payload.areas.filter((item) => isRecord(item))
    : normalizeEntityList(payload, [
        'areas',
        'no_go_areas',
        'noGoAreas',
        'items',
        'list',
        'data',
      ])

  return areas.map((record, index) => normalizeAreaEntity(record, 'noGoArea', index))
}

export async function fetchNoGoAreaDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  areaId: string
}) {
  if (USE_MOCK_DATA) {
    return mockNoGoAreas.find((area) => area.id === options.areaId) ?? null
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.noGoArea,
    serviceType: SERVICE_TYPES.noGoArea,
    payload: {
      operation: CONSTRAINT_OPERATIONS.get,
      map_name: resolveRequestedMapName(options.map, options.mapName),
      area_id: options.areaId.trim(),
      alignment_version: '',
      area: {},
      include_disabled: true,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'No-go detail query returned an error.')
  }

  return normalizeConstraintEntity(payload, 'noGoArea')
}

export async function addNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  areaId?: string | null
  displayName: string
  enabled?: boolean
  displayRegion: RosServiceRequest
  displayFrame: string
}) {
  if (USE_MOCK_DATA) {
    const area = normalizeAreaEntity(
      {
        area_id: options.areaId?.trim() || `nogo-${Date.now()}`,
        display_name: options.displayName.trim(),
        enabled: options.enabled ?? true,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        display_frame: options.displayFrame,
        display_region: options.displayRegion,
        map_name: resolveRequestedMapName(options.map, options.mapName),
      },
      'noGoArea',
      0,
    )

    return {
      area,
      constraintVersion: String(Date.now()),
      warnings: [],
      raw: area.raw,
    }
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.noGoArea,
    serviceType: SERVICE_TYPES.noGoArea,
    payload: {
      operation: CONSTRAINT_OPERATIONS.add,
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
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'No-go add returned an error.')
  }

  return {
    area: normalizeConstraintEntity(payload, 'noGoArea'),
    constraintVersion: getConstraintVersion(payload),
    warnings: toStringArray(pickValue(payload, ['warnings'])),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function modifyNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  area: AreaEntity
  displayName: string
  enabled?: boolean
  displayRegion: RosServiceRequest
  displayFrame: string
}) {
  if (USE_MOCK_DATA) {
    const area = normalizeAreaEntity(
      {
        ...options.area.raw,
        area_id: options.area.id,
        display_name: options.displayName.trim(),
        enabled: options.enabled ?? true,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        display_frame: options.displayFrame,
        display_region: options.displayRegion,
      },
      'noGoArea',
      0,
    )

    return {
      area,
      constraintVersion: String(Date.now()),
      warnings: [],
      raw: area.raw,
    }
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.noGoArea,
    serviceType: SERVICE_TYPES.noGoArea,
    payload: {
      operation: CONSTRAINT_OPERATIONS.modify,
      map_name: resolveRequestedMapName(options.map, options.mapName),
      area_id: options.area.id,
      alignment_version: options.alignment?.alignmentVersion ?? '',
      area: buildNoGoAreaRequest({
        map: options.map,
        mapName: options.mapName,
        alignment: options.alignment,
        areaId: options.area.id,
        displayName: options.displayName,
        enabled: options.enabled ?? toBoolean(options.area.raw.enabled) ?? true,
        displayRegion: options.displayRegion,
        displayFrame: options.displayFrame,
        baseArea: options.area,
      }),
      include_disabled: true,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'No-go modify returned an error.')
  }

  const area = normalizeConstraintEntity(payload, 'noGoArea')

  if (area && area.id !== options.area.id) {
    throw new Error('No-go modify returned a different area_id than the selected item.')
  }

  return {
    area,
    constraintVersion: getConstraintVersion(payload),
    warnings: toStringArray(pickValue(payload, ['warnings'])),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function deleteNoGoArea(options: {
  map: MapEntity | null
  mapName?: string | null
  areaId: string
}) {
  if (USE_MOCK_DATA) {
    return {
      constraintVersion: String(Date.now()),
      warnings: [],
      raw: {},
    }
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.noGoArea,
    serviceType: SERVICE_TYPES.noGoArea,
    payload: {
      operation: CONSTRAINT_OPERATIONS.delete,
      map_name: resolveRequestedMapName(options.map, options.mapName),
      area_id: options.areaId.trim(),
      alignment_version: '',
      area: {},
      include_disabled: true,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'No-go delete returned an error.')
  }

  return {
    constraintVersion: getConstraintVersion(payload),
    warnings: toStringArray(pickValue(payload, ['warnings'])),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function fetchVirtualWalls(map: MapEntity | null) {
  if (USE_MOCK_DATA) {
    return mockVirtualWalls
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.virtualWall,
    serviceType: SERVICE_TYPES.virtualWall,
    payload: {
      operation: CONSTRAINT_OPERATIONS.getAll,
      map_name: getMapName(map),
      wall_id: '',
      alignment_version: '',
      wall: {},
      include_disabled: false,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw new Error(
      getResponseMessage(payload) ?? 'Virtual wall service returned an error.',
    )
  }

  const walls = Array.isArray(payload.walls)
    ? payload.walls.filter((item) => isRecord(item))
    : normalizeEntityList(payload, [
        'walls',
        'virtual_walls',
        'virtualWalls',
        'items',
        'list',
        'data',
      ])

  return walls.map((record, index) => normalizeAreaEntity(record, 'virtualWall', index))
}

export async function fetchVirtualWallDetail(options: {
  map: MapEntity | null
  mapName?: string | null
  wallId: string
}) {
  if (USE_MOCK_DATA) {
    return mockVirtualWalls.find((wall) => wall.id === options.wallId) ?? null
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.virtualWall,
    serviceType: SERVICE_TYPES.virtualWall,
    payload: {
      operation: CONSTRAINT_OPERATIONS.get,
      map_name: resolveRequestedMapName(options.map, options.mapName),
      wall_id: options.wallId.trim(),
      alignment_version: '',
      wall: {},
      include_disabled: true,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Virtual wall detail query returned an error.')
  }

  return normalizeConstraintEntity(payload, 'virtualWall')
}

export async function addVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  wallId?: string | null
  displayName: string
  enabled?: boolean
  displayPath: RosServiceRequest
  displayFrame: string
  bufferM: number
}) {
  if (USE_MOCK_DATA) {
    const wall = normalizeAreaEntity(
      {
        wall_id: options.wallId?.trim() || `wall-${Date.now()}`,
        display_name: options.displayName.trim(),
        enabled: options.enabled ?? true,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        display_frame: options.displayFrame,
        display_path: options.displayPath,
        buffer_m: options.bufferM,
        map_name: resolveRequestedMapName(options.map, options.mapName),
      },
      'virtualWall',
      0,
    )

    return {
      wall,
      constraintVersion: String(Date.now()),
      warnings: [],
      raw: wall.raw,
    }
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.virtualWall,
    serviceType: SERVICE_TYPES.virtualWall,
    payload: {
      operation: CONSTRAINT_OPERATIONS.add,
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
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Virtual wall add returned an error.')
  }

  return {
    wall: normalizeConstraintEntity(payload, 'virtualWall'),
    constraintVersion: getConstraintVersion(payload),
    warnings: toStringArray(pickValue(payload, ['warnings'])),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function modifyVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  wall: AreaEntity
  displayName: string
  enabled?: boolean
  displayPath: RosServiceRequest
  displayFrame: string
  bufferM: number
}) {
  if (USE_MOCK_DATA) {
    const wall = normalizeAreaEntity(
      {
        ...options.wall.raw,
        wall_id: options.wall.id,
        display_name: options.displayName.trim(),
        enabled: options.enabled ?? true,
        alignment_version: options.alignment?.alignmentVersion ?? '',
        display_frame: options.displayFrame,
        display_path: options.displayPath,
        buffer_m: options.bufferM,
      },
      'virtualWall',
      0,
    )

    return {
      wall,
      constraintVersion: String(Date.now()),
      warnings: [],
      raw: wall.raw,
    }
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.virtualWall,
    serviceType: SERVICE_TYPES.virtualWall,
    payload: {
      operation: CONSTRAINT_OPERATIONS.modify,
      map_name: resolveRequestedMapName(options.map, options.mapName),
      wall_id: options.wall.id,
      alignment_version: options.alignment?.alignmentVersion ?? '',
      wall: buildVirtualWallRequest({
        map: options.map,
        mapName: options.mapName,
        alignment: options.alignment,
        wallId: options.wall.id,
        displayName: options.displayName,
        enabled: options.enabled ?? toBoolean(options.wall.raw.enabled) ?? true,
        displayPath: options.displayPath,
        displayFrame: options.displayFrame,
        bufferM: options.bufferM,
        baseWall: options.wall,
      }),
      include_disabled: true,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Virtual wall modify returned an error.')
  }

  const wall = normalizeConstraintEntity(payload, 'virtualWall')

  if (wall && wall.id !== options.wall.id) {
    throw new Error('Virtual wall modify returned a different wall_id than the selected item.')
  }

  return {
    wall,
    constraintVersion: getConstraintVersion(payload),
    warnings: toStringArray(pickValue(payload, ['warnings'])),
    raw: isRecord(payload) ? payload : {},
  }
}

export async function deleteVirtualWall(options: {
  map: MapEntity | null
  mapName?: string | null
  wallId: string
}) {
  if (USE_MOCK_DATA) {
    return {
      constraintVersion: String(Date.now()),
      warnings: [],
      raw: {},
    }
  }

  const payload = await callRosService({
    serviceName: SERVICE_NAMES.virtualWall,
    serviceType: SERVICE_TYPES.virtualWall,
    payload: {
      operation: CONSTRAINT_OPERATIONS.delete,
      map_name: resolveRequestedMapName(options.map, options.mapName),
      wall_id: options.wallId.trim(),
      alignment_version: '',
      wall: {},
      include_disabled: true,
    },
  })

  if (getResponseSuccess(payload) === false) {
    throw createServiceError(payload, 'Virtual wall delete returned an error.')
  }

  return {
    constraintVersion: getConstraintVersion(payload),
    warnings: toStringArray(pickValue(payload, ['warnings'])),
    raw: isRecord(payload) ? payload : {},
  }
}
