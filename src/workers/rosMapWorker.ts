/// <reference lib="webworker" />

import type {
  DisplayFrame,
  MapEntity,
  OccupancyGrid,
  Point2D,
} from '../types/map-editor'

type JsonRecord = Record<string, unknown>

interface WorkerFetchRequest {
  id: number
  type: 'fetch-current-map'
  url: string
}

interface WorkerFetchSuccessResponse {
  id: number
  type: 'fetch-current-map:success'
  map: MapEntity
}

interface WorkerFetchErrorResponse {
  id: number
  type: 'fetch-current-map:error'
  error: string
}

interface WorkerFetchProgressResponse {
  id: number
  type: 'fetch-current-map:progress'
  event: string
}

const MAP_SERVICE_NAME = '/clean_robot_server/map_server'
const MAP_OPERATIONS = {
  get: 0,
  getAll: 4,
} as const

function postProgress(id: number, event: string) {
  const message: WorkerFetchProgressResponse = {
    id,
    type: 'fetch-current-map:progress',
    event,
  }

  self.postMessage(message)
}

function postSuccess(id: number, map: MapEntity) {
  const transferables: Transferable[] = []

  if (map.occupancyGrid?.data instanceof Int16Array) {
    transferables.push(map.occupancyGrid.data.buffer)
  }

  const message: WorkerFetchSuccessResponse = {
    id,
    type: 'fetch-current-map:success',
    map,
  }

  self.postMessage(message, transferables)
}

function postError(id: number, error: string) {
  const message: WorkerFetchErrorResponse = {
    id,
    type: 'fetch-current-map:error',
    error,
  }

  self.postMessage(message)
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

function arePointsEqual(a: Point2D, b: Point2D, epsilon = 0.0001) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon
}

function closePolygon(points: Point2D[]) {
  if (points.length < 3) {
    return points
  }

  return arePointsEqual(points[0], points[points.length - 1])
    ? points
    : [...points, points[0]]
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
        const nested = toGeometrySet(normalized[key], closed)
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
    origin: toPoint(
      pickValue(record, ['origin', 'translation', 'position', 'center']),
    ),
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
  const rawData = Array.isArray(record.data) ? record.data : []

  if (width === null || height === null || resolution === null || rawData.length === 0) {
    return null
  }

  const data = new Int16Array(rawData.length)
  for (let index = 0; index < rawData.length; index += 1) {
    data[index] = Math.round(toNumber(rawData[index]) ?? -1)
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

function normalizeMap(record: JsonRecord): MapEntity | null {
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
    rasterImageUrl: null,
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
    raw: {
      map_name:
        pickString(record, ['map_name', 'mapName', 'name', 'display_name']) ??
        'Current Map',
      map_id:
        pickString(record, ['map_id', 'mapId', 'map_uuid', 'uuid', 'id']) ??
        'current-map',
      is_active: pickValue(record, ['is_active', 'active', 'is_current', 'current']),
      frame_id:
        pickString(record, ['frame_id']) ??
        pickString(
          isRecord(pickValue(record, ['display_frame']))
            ? (pickValue(record, ['display_frame']) as JsonRecord)
            : {},
          ['frame_id'],
        ) ??
        null,
    },
  }
}

class WorkerRosClient {
  private socket: WebSocket | null = null
  private nextCallId = 1
  private pending = new Map<
    string,
    {
      resolve: (value: JsonRecord) => void
      reject: (error: Error) => void
      timeoutHandle: ReturnType<typeof setTimeout> | null
    }
  >()

  async connect(url: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return
    }

    this.socket = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url)

      socket.onopen = () => {
        socket.onmessage = (event) => {
          void this.handleMessage(event.data)
        }
        socket.onerror = () => {}
        resolve(socket)
      }

      socket.onerror = () => {
        reject(new Error('Worker rosbridge websocket error.'))
      }

      socket.onclose = (event) => {
        this.rejectPending(
          new Error(`Worker rosbridge connection closed (${event.code}).`),
        )
      }
    })
  }

  close() {
    this.rejectPending(new Error('Worker rosbridge connection closed.'))

    if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
      this.socket.close()
    }

    this.socket = null
  }

  private rejectPending(error: Error) {
    this.pending.forEach((pending) => {
      if (pending.timeoutHandle) {
        clearTimeout(pending.timeoutHandle)
      }

      pending.reject(error)
    })

    this.pending.clear()
  }

  private async handleMessage(data: Blob | string) {
    const text = typeof data === 'string' ? data : await data.text()
    let payload: unknown

    try {
      payload = JSON.parse(text)
    } catch {
      return
    }

    if (!isRecord(payload) || payload.op !== 'service_response' || typeof payload.id !== 'string') {
      return
    }

    const pending = this.pending.get(payload.id)

    if (!pending) {
      return
    }

    this.pending.delete(payload.id)

    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle)
    }

    if (payload.result === false) {
      const errorMessage =
        typeof payload.values === 'string'
          ? payload.values
          : JSON.stringify(payload.values ?? '')
      pending.reject(new Error(errorMessage || 'ROS service returned an error.'))
      return
    }

    pending.resolve(isRecord(payload.values) ? payload.values : {})
  }

  async callService(serviceName: string, args: JsonRecord, timeoutSeconds = 20) {
    const socket = this.socket

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Worker rosbridge is not connected.')
    }

    const id = `worker-call:${serviceName}:${this.nextCallId}`
    this.nextCallId += 1

    return new Promise<JsonRecord>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new Error(`Worker ROS service ${serviceName} timed out after ${timeoutSeconds} seconds.`),
        )
      }, timeoutSeconds * 1000)

      this.pending.set(id, {
        resolve,
        reject,
        timeoutHandle,
      })

      socket.send(
        JSON.stringify({
          op: 'call_service',
          id,
          service: serviceName,
          args,
          timeout: timeoutSeconds,
        }),
      )
    })
  }
}

async function fetchCurrentMapInWorker(id: number, url: string) {
  const client = new WorkerRosClient()

  try {
    postProgress(id, `worker:connecting:${url}`)
    await client.connect(url)

    postProgress(id, 'worker:map:getAll:request')
    const getAllPayload = await client.callService(MAP_SERVICE_NAME, {
      operation: MAP_OPERATIONS.getAll,
      map_name: '',
      map: {},
      set_active: false,
      enabled_state: 0,
    })

    if (getResponseSuccess(getAllPayload) === false) {
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
      throw new Error('Map service returned no active map payload.')
    }

    const mapName =
      pickString(activeMap, ['map_name', 'name', 'display_name']) ?? 'yeyeyeye'

    postProgress(id, `worker:map:get:request:${mapName}`)
    const getPayload = await client.callService(MAP_SERVICE_NAME, {
      operation: MAP_OPERATIONS.get,
      map_name: mapName,
      map: {},
      set_active: false,
      enabled_state: 0,
    }, 30)

    if (getResponseSuccess(getPayload) === false) {
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
      throw new Error(`Map service returned no usable payload for ${mapName}.`)
    }

    postProgress(id, `worker:map:ready:${mapName}`)
    postSuccess(id, normalized)
  } catch (error) {
    postError(
      id,
      error instanceof Error ? error.message : 'Worker failed to fetch current map.',
    )
  } finally {
    client.close()
  }
}

self.onmessage = (event: MessageEvent<WorkerFetchRequest>) => {
  const message = event.data

  if (message.type !== 'fetch-current-map') {
    return
  }

  void fetchCurrentMapInWorker(message.id, message.url)
}
