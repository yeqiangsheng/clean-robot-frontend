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
import type { GatewayPayload } from '../../types/gateway'
import { closePolygon } from '../../utils/geometry'

type JsonRecord = Record<string, unknown>
type AreaKind = AreaEntity['kind']

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
  const sourceData = Array.isArray(record.data) ? record.data : []

  if (
    width === null ||
    height === null ||
    resolution === null ||
    sourceData.length === 0
  ) {
    return null
  }

  const data = new Int16Array(sourceData.length)
  for (let index = 0; index < sourceData.length; index += 1) {
    data[index] = toNumber(sourceData[index]) ?? -1
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

export function normalizeMapPayload(payload: unknown): MapEntity | null {
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

export function normalizeAlignment(payload: unknown): MapAlignment | null {
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

export function normalizeRectZonePreview(payload: unknown): ZoneRectDraft | null {
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

export function normalizeCoveragePreview(payload: unknown): ZoneDraftPreview | null {
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

export function normalizeZonePlanPath(payload: unknown): ZonePlanPathResult | null {
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

export function normalizeCoverageCommit(payload: unknown): ZoneCommitResult | null {
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

export function normalizeConstraintEntity(
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

export function buildNoGoAreaRequest(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  areaId?: string | null
  displayName: string
  enabled: boolean
  displayRegion: GatewayPayload
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
  } satisfies GatewayPayload
}

export function buildVirtualWallRequest(options: {
  map: MapEntity | null
  mapName?: string | null
  alignment: MapAlignment | null
  wallId?: string | null
  displayName: string
  enabled: boolean
  displayPath: GatewayPayload
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
  } satisfies GatewayPayload
}

export function normalizeAreaEntity(record: JsonRecord, kind: AreaKind, index: number): AreaEntity {
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

export function resolveRequestedMapName(map: MapEntity | null, mapName?: string | null) {
  return mapName?.trim() || getMapName(map)
}
