import { startTransition, useEffect, useMemo, useRef, useState } from 'react'

import { requestLiveMapSnapshot } from '../api/gateway/siteGatewayClient'
import type { MapEntity, OccupancyGrid } from '../types/map-editor'
import type { RosConnectionSnapshot } from '../types/ros'

type JsonRecord = Record<string, unknown>
const LIVE_MAP_POLL_INTERVAL_MS = 500

type GridShape = {
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
  stampMs: number | null
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toStampMs(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const secs = toNumber(value.secs)
  const nsecs = toNumber(value.nsecs) ?? 0

  if (secs === null) {
    return null
  }

  return secs * 1000 + Math.floor(nsecs / 1_000_000)
}

function toOccupancyData(values: unknown[]) {
  const data = new Int16Array(values.length)

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    data[index] =
      typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : -1
  }

  return data
}

function extractGridShape(message: JsonRecord): GridShape | null {
  const info = isRecord(message.info) ? message.info : null
  const origin = info && isRecord(info.origin) ? info.origin : null
  const position = origin && isRecord(origin.position) ? origin.position : null

  if (!info || !origin || !position) {
    return null
  }

  const width = toNumber(info.width)
  const height = toNumber(info.height)
  const resolution = toNumber(info.resolution)
  const originX = toNumber(position.x)
  const originY = toNumber(position.y)

  if (
    width === null ||
    height === null ||
    resolution === null ||
    originX === null ||
    originY === null
  ) {
    return null
  }

  const header = isRecord(message.header) ? message.header : null

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    resolution,
    originX,
    originY,
    stampMs: header ? toStampMs(header.stamp) : null,
  }
}

function normalizeGrid(message: JsonRecord, shape: GridShape): OccupancyGrid | null {
  const data = Array.isArray(message.data) ? message.data : null
  if (!data) {
    return null
  }

  return {
    width: shape.width,
    height: shape.height,
    resolution: shape.resolution,
    origin: {
      x: shape.originX,
      y: shape.originY,
    },
    data: toOccupancyData(data),
  }
}

function buildMapEntity(grid: OccupancyGrid, message: JsonRecord, mapName: string): MapEntity {
  const frameId =
    isRecord(message.header) && typeof message.header.frame_id === 'string'
      ? message.header.frame_id
      : ''
  const stampMs =
    isRecord(message.header) && isRecord(message.header.stamp)
      ? toStampMs(message.header.stamp)
      : null

  return {
    id: `live-map:${mapName}`,
    name: mapName,
    kind: 'map',
    displayRegion: [],
    displayPath: [],
    displayFrame: null,
    metadata: {
      sourceTopic: '/map',
      frameId,
      stampMs,
    },
    raw: {
      source_topic: '/map',
      frame_id: frameId,
      stamp_ms: stampMs,
      width: grid.width,
      height: grid.height,
      resolution: grid.resolution,
      map_name: mapName,
    },
    resolution: grid.resolution,
    rasterImageUrl: null,
    occupancyGrid: grid,
    size: {
      width: grid.width * grid.resolution,
      height: grid.height * grid.resolution,
    },
  }
}

export function useLiveOccupancyMap(
  snapshot: RosConnectionSnapshot,
  options: {
    enabled: boolean
    mapName: string
  },
) {
  const [map, setMap] = useState<MapEntity | null>(null)
  const [messageCount, setMessageCount] = useState(0)
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const lastProcessedStampRef = useRef('')

  useEffect(() => {
    if (!options.enabled) {
      const resetHandle = globalThis.setTimeout(() => {
        setMap(null)
        setMessageCount(0)
        setLastMessageAt(null)
        setSubscribeError(null)
        lastProcessedStampRef.current = ''
      }, 0)

      return () => {
        globalThis.clearTimeout(resetHandle)
      }
    }

    if (snapshot.status === 'mock') {
      return
    }

    let disposed = false
    let afterMs = 0
    let pollTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleNextPoll = (delayMs = LIVE_MAP_POLL_INTERVAL_MS) => {
      if (disposed) {
        return
      }

      pollTimer = globalThis.setTimeout(() => {
        void pollLiveMap()
      }, delayMs)
    }

    const pollLiveMap = async () => {
      try {
        const response = await requestLiveMapSnapshot(afterMs)
        if (disposed) {
          return
        }

        if (
          typeof response.receivedAtMs === 'number' &&
          response.receivedAtMs > afterMs
        ) {
          afterMs = response.receivedAtMs
        }

        if (!response.changed || !isRecord(response.payload)) {
          startTransition(() => {
            setMessageCount(response.messageCount)
            if (typeof response.receivedAtMs === 'number') {
              setLastMessageAt(response.receivedAtMs)
            }
            setSubscribeError(response.error)
          })
          return
        }

        const shape = extractGridShape(response.payload)
        if (!shape) {
          startTransition(() => {
            setSubscribeError('Gateway live map payload is missing OccupancyGrid metadata.')
          })
          return
        }

        const stampSignature = `${response.receivedAtMs ?? shape.stampMs ?? 'none'}:${shape.width}:${shape.height}:${shape.resolution}`

        if (lastProcessedStampRef.current === stampSignature) {
          startTransition(() => {
            setMessageCount(response.messageCount)
            setLastMessageAt(response.receivedAtMs ?? shape.stampMs)
            setSubscribeError(response.error)
          })
          return
        }

        const grid = normalizeGrid(response.payload, shape)
        if (!grid) {
          startTransition(() => {
            setSubscribeError('Gateway live map payload contains no occupancy data.')
          })
          return
        }

        lastProcessedStampRef.current = stampSignature

        startTransition(() => {
          setMap(buildMapEntity(grid, response.payload!, options.mapName || 'runtime_map'))
          setMessageCount(response.messageCount)
          setLastMessageAt(response.receivedAtMs ?? shape.stampMs)
          setSubscribeError(response.error)
        })
      } catch (error) {
        if (disposed) {
          return
        }

        startTransition(() => {
          setSubscribeError(
            error instanceof Error ? error.message : 'Failed to refresh live map snapshot.',
          )
        })
      } finally {
        scheduleNextPoll()
      }
    }

    void pollLiveMap()

    return () => {
      disposed = true
      if (pollTimer) {
        globalThis.clearTimeout(pollTimer)
      }
    }
  }, [options.enabled, options.mapName, snapshot.sessionId, snapshot.status])

  return useMemo(
    () => ({
      map,
      messageCount,
      lastMessageAt,
      subscribeError,
    }),
    [lastMessageAt, map, messageCount, subscribeError],
  )
}
