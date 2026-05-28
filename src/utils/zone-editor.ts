import type {
  Point2D,
  RegionSet,
  ZoneRectDraft,
} from '../types/map-editor'
import type { GatewayPayload } from '../types/gateway'
import { closePolygon } from './geometry'

function getDistinctPolygonPoints(region: RegionSet | null) {
  const polygon = region?.[0] ?? []

  if (polygon.length === 0) {
    return []
  }

  return polygon.filter((point, index) => {
    if (index === polygon.length - 1) {
      const first = polygon[0]
      return point.x !== first.x || point.y !== first.y
    }

    return true
  })
}

export function getRectBounds(region: RegionSet | null) {
  const points = getDistinctPolygonPoints(region)

  if (points.length < 4) {
    return null
  }

  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return {
    minX,
    maxX,
    minY,
    maxY,
    widthM: maxX - minX,
    heightM: maxY - minY,
  }
}

export function buildRectRegionFromDiagonal(a: Point2D, b: Point2D): RegionSet {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)

  return [
    closePolygon([
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]),
  ]
}

export function getRectCorners(region: RegionSet | null) {
  const bounds = getRectBounds(region)

  if (!bounds) {
    return []
  }

  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ] satisfies Point2D[]
}

export function updateRectRegionFromDraggedCorner(
  region: RegionSet | null,
  cornerIndex: number,
  point: Point2D,
) {
  const corners = getRectCorners(region)

  if (corners.length !== 4) {
    return region
  }

  const oppositeCorner = corners[(cornerIndex + 2) % 4]
  return buildRectRegionFromDiagonal(oppositeCorner, point)
}

export function buildPolygonRegionRequest(
  frameId: string,
  region: RegionSet | null,
): GatewayPayload | null {
  const polygon = getDistinctPolygonPoints(region)

  if (polygon.length < 4) {
    return null
  }

  return {
    frame_id: frameId,
    outer: {
      points: polygon.map((point) => ({
        x: point.x,
        y: point.y,
        z: 0,
      })),
    },
    holes: [],
  }
}

export function createRectDraftFromRegion(options: {
  region: RegionSet | null
  frameId: string
  mapRegion?: RegionSet | null
  warnings?: string[]
}) {
  const region = options.region
  const bounds = getRectBounds(region)
  const raw = buildPolygonRegionRequest(options.frameId, region)

  if (!bounds || !raw || !region) {
    return null
  }

  return {
    displayRegion: region,
    displayFrame: {
      frameId: options.frameId,
      rotationDeg: null,
      scale: null,
      origin: null,
      raw: { frame_id: options.frameId },
    },
    mapRegion: options.mapRegion ?? null,
    widthM: bounds.widthM,
    heightM: bounds.heightM,
    areaM2: bounds.widthM * bounds.heightM,
    warnings: options.warnings ?? [],
    raw: {
      display_region: raw,
      map_region:
        options.mapRegion && options.mapRegion.length > 0
          ? buildPolygonRegionRequest(options.frameId, options.mapRegion)
          : null,
      width_m: bounds.widthM,
      height_m: bounds.heightM,
      area_m2: bounds.widthM * bounds.heightM,
      display_frame: options.frameId,
      warnings: options.warnings ?? [],
    },
  } satisfies ZoneRectDraft
}
