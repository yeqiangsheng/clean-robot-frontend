import type {
  PathSet,
  Point2D,
  VirtualWallDraft,
} from '../types/map-editor'
import type { GatewayPayload } from '../types/gateway'

function getPrimaryPath(pathSet: PathSet | null) {
  const path = pathSet?.[0] ?? []

  if (path.length < 2) {
    return []
  }

  return path.slice(0, 2)
}

export function buildWallPathRequest(pathSet: PathSet | null): GatewayPayload | null {
  const path = getPrimaryPath(pathSet)

  if (path.length < 2) {
    return null
  }

  return {
    points: path.map((point) => ({
      x: point.x,
      y: point.y,
      z: 0,
    })),
  }
}

export function createWallDraftFromPath(options: {
  path: PathSet | null
  frameId: string
  bufferM: number | null
  mapPath?: PathSet | null
  warnings?: string[]
}) {
  const path = getPrimaryPath(options.path)
  const raw = buildWallPathRequest(path.length > 0 ? [path] : null)

  if (path.length < 2 || !raw) {
    return null
  }

  return {
    displayPath: [path],
    displayFrame: {
      frameId: options.frameId,
      rotationDeg: null,
      scale: null,
      origin: null,
      raw: { frame_id: options.frameId },
    },
    mapPath: options.mapPath ?? null,
    bufferM: options.bufferM,
    warnings: options.warnings ?? [],
    raw: {
      display_path: raw,
      map_path:
        options.mapPath && options.mapPath.length > 0
          ? buildWallPathRequest(options.mapPath)
          : null,
      display_frame: options.frameId,
      buffer_m: options.bufferM,
      warnings: options.warnings ?? [],
    },
  } satisfies VirtualWallDraft
}

export function getWallEndpoints(pathSet: PathSet | null) {
  const path = getPrimaryPath(pathSet)

  if (path.length < 2) {
    return []
  }

  return [path[0], path[1]] satisfies Point2D[]
}

export function updateWallPathEndpoint(
  pathSet: PathSet | null,
  endpointIndex: number,
  point: Point2D,
) {
  const path = getPrimaryPath(pathSet)

  if (path.length < 2 || (endpointIndex !== 0 && endpointIndex !== 1)) {
    return pathSet
  }

  const nextPath = [...path]
  nextPath[endpointIndex] = point
  return [nextPath]
}
