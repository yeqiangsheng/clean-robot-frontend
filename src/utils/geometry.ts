import type {
  Bounds,
  OccupancyGrid,
  Point2D,
  ViewportTransform,
} from '../types/map-editor'

export function arePointsEqual(a: Point2D, b: Point2D, epsilon = 0.0001) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon
}

export function closePolygon(points: Point2D[]) {
  if (points.length < 3) {
    return points
  }

  return arePointsEqual(points[0], points[points.length - 1])
    ? points
    : [...points, points[0]]
}

export function toKonvaPoints(points: Point2D[]) {
  return points.flatMap((point) => [point.x, point.y])
}

export function computeBounds(points: Point2D[]): Bounds | null {
  if (points.length === 0) {
    return null
  }

  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  }
}

export function flattenPointSets(...collections: Point2D[][][]) {
  return collections.flatMap((collection) => collection.flatMap((points) => points))
}

export function mergeBounds(boundsList: Array<Bounds | null | undefined>) {
  const validBounds = boundsList.filter(Boolean) as Bounds[]

  if (validBounds.length === 0) {
    return null
  }

  return computeBounds(
    validBounds.flatMap((bounds) => [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
    ]),
  )
}

export function expandBounds(bounds: Bounds, margin: number) {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
    centerX: bounds.centerX,
    centerY: bounds.centerY,
  }
}

export function getOccupancyGridBounds(grid: OccupancyGrid): Bounds {
  const width = grid.width * grid.resolution
  const height = grid.height * grid.resolution

  return {
    minX: grid.origin.x,
    minY: grid.origin.y,
    maxX: grid.origin.x + width,
    maxY: grid.origin.y + height,
    width: Math.max(width, 1),
    height: Math.max(height, 1),
    centerX: grid.origin.x + width / 2,
    centerY: grid.origin.y + height / 2,
  }
}

export function createViewport(
  bounds: Bounds | null,
  width: number,
  height: number,
  padding = 24,
): ViewportTransform {
  if (!bounds) {
    return {
      scale: 1,
      offsetX: width / 2,
      offsetY: height / 2,
      padding,
    }
  }

  const safeBounds = expandBounds(bounds, Math.max(bounds.width, bounds.height) * 0.04)
  const availableWidth = Math.max(width - padding * 2, 1)
  const availableHeight = Math.max(height - padding * 2, 1)
  const scale = Math.min(
    availableWidth / safeBounds.width,
    availableHeight / safeBounds.height,
  )

  return {
    scale,
    offsetX: padding - safeBounds.minX * scale,
    offsetY: height - padding + safeBounds.minY * scale,
    padding,
  }
}

export function getLabelPosition(
  region: Point2D[][],
  path: Point2D[][],
): Point2D | null {
  const regionPoints = flattenPointSets(region)
  if (regionPoints.length > 0) {
    const bounds = computeBounds(regionPoints)
    return bounds ? { x: bounds.centerX, y: bounds.centerY } : null
  }

  const pathPoints = flattenPointSets(path)
  if (pathPoints.length > 0) {
    const midIndex = Math.floor(pathPoints.length / 2)
    return pathPoints[midIndex]
  }

  return null
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--'
  }

  return value.toFixed(digits)
}
