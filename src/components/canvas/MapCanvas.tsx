import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import {
  Circle,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
} from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Group as KonvaGroup } from 'konva/lib/Group'
import type { Stage as KonvaStage } from 'konva/lib/Stage'

import type {
  AreaEntity,
  LayerVisibility,
  MapEntity,
  OccupancyGrid,
  PathSet,
  Point2D,
  Pose2D,
  RegionSet,
  ViewportTransform,
  WorkbenchEditorMode,
  WorkbenchSelection,
  ZoneDraftPreview,
  ZonePlanPathResult,
} from '../../types/map-editor'
import {
  computeBounds,
  createViewport,
  flattenPointSets,
  getOccupancyGridBounds,
  mergeBounds,
  toKonvaPoints,
} from '../../utils/geometry'
import { useInputCapabilities } from '../../hooks/useInputCapabilities'
import { NoGoAreaLayer } from './NoGoAreaLayer'
import { VirtualWallLayer } from './VirtualWallLayer'
import { ZoneLayer } from './ZoneLayer'
import { ZoneRectEditorLayer } from '../zone-editor/ZoneRectEditorLayer'
import { VirtualWallEditorLayer } from '../wall-editor/VirtualWallEditorLayer'
import './MapCanvas.css'

interface MapCanvasProps {
  map: MapEntity | null
  zones: AreaEntity[]
  noGoAreas: AreaEntity[]
  virtualWalls: AreaEntity[]
  layerVisibility: LayerVisibility
  mode?: WorkbenchEditorMode
  alignmentPoints?: Point2D[]
  draftRectPoints?: Point2D[]
  draftDisplayRegion?: RegionSet | null
  draftWallPoints?: Point2D[]
  draftWallPath?: PathSet | null
  draftPreview?: ZoneDraftPreview | null
  selectedZonePath?: ZonePlanPathResult | null
  editableCorners?: Point2D[]
  editableWallEndpoints?: Point2D[]
  robotPose?: Pose2D | null
  selected: WorkbenchSelection
  onCanvasPointPick?: (point: Point2D) => void
  onEditableCornerChange?: (cornerIndex: number, point: Point2D) => void
  onEditableWallEndpointChange?: (endpointIndex: number, point: Point2D) => void
  onSelect: (selection: WorkbenchSelection) => void
}

interface CanvasSize {
  width: number
  height: number
}

const VIEWPORT_PADDING = 24
const ZOOM_STEP = 1.18
const MAX_ZOOM_MULTIPLIER = 10
const TOUCH_TAP_DISTANCE = 12

type StagePoint = {
  x: number
  y: number
}

type PickGesture = {
  startPoint: StagePoint
  moved: boolean
}

type PinchGesture = {
  initialDistance: number
  initialScale: number
  worldAnchor: Point2D
}

type PanGesture = {
  startPoint: StagePoint
  startViewport: ViewportTransform
  moved: boolean
}

function getEntityBounds(entity: AreaEntity | MapEntity) {
  return computeBounds(flattenPointSets(entity.displayRegion, entity.displayPath))
}

function createGridLines(size: CanvasSize) {
  const step = 56
  const vertical = Array.from({ length: Math.ceil(size.width / step) }, (_, index) => {
    const x = index * step
    return [x, 0, x, size.height]
  })
  const horizontal = Array.from(
    { length: Math.ceil(size.height / step) },
    (_, index) => {
      const y = index * step
      return [0, y, size.width, y]
    },
  )

  return {
    vertical,
    horizontal,
  }
}

function isPointInsideBounds(point: Point2D, bounds: ReturnType<typeof computeBounds>) {
  if (!bounds) {
    return true
  }

  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  )
}

function getStagePointFromClient(
  stage: KonvaStage,
  clientX: number,
  clientY: number,
): StagePoint {
  const rect = stage.container().getBoundingClientRect()

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  }
}

function getDistanceBetweenPoints(first: StagePoint, second: StagePoint) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function getCenterPoint(first: StagePoint, second: StagePoint): StagePoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function createOccupancyGridCanvas(grid: OccupancyGrid | null) {
  if (!grid || typeof document === 'undefined') {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = grid.width
  canvas.height = grid.height

  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  const imageData = context.createImageData(grid.width, grid.height)

  for (let index = 0; index < grid.data.length; index += 1) {
    const value = grid.data[index]
    const alpha = value < 0 ? 90 : 255
    const shade =
      value < 0 ? 180 : Math.max(30, Math.min(255, 245 - Math.round((value / 100) * 220)))
    const pixelIndex = index * 4

    imageData.data[pixelIndex] = shade
    imageData.data[pixelIndex + 1] = shade
    imageData.data[pixelIndex + 2] = shade
    imageData.data[pixelIndex + 3] = alpha
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

function useImageSource(source: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!source) {
      return
    }

    let active = true
    const nextImage = new window.Image()
    nextImage.crossOrigin = 'anonymous'
    nextImage.onload = () => {
      if (active) {
        setImage(nextImage)
      }
    }
    nextImage.onerror = () => {
      if (active) {
        setImage(null)
      }
    }
    nextImage.src = source

    return () => {
      active = false
      nextImage.onload = null
      nextImage.onerror = null
    }
  }, [source])

  return source ? image : null
}

function useOccupancyCanvas(grid: OccupancyGrid | null) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let active = true
    const renderCanvas = () => {
      const nextCanvas = grid ? createOccupancyGridCanvas(grid) : null
      if (active) {
        setCanvas(nextCanvas)
      }
    }

    const requestIdle =
      'requestIdleCallback' in globalThis &&
      typeof globalThis.requestIdleCallback === 'function'
        ? globalThis.requestIdleCallback.bind(globalThis)
        : null
    const cancelIdle =
      'cancelIdleCallback' in globalThis &&
      typeof globalThis.cancelIdleCallback === 'function'
        ? globalThis.cancelIdleCallback.bind(globalThis)
        : null

    let idleHandle: number | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null

    if (requestIdle) {
      idleHandle = requestIdle(renderCanvas, { timeout: 120 })
    } else {
      timeoutHandle = globalThis.setTimeout(renderCanvas, 0)
    }

    return () => {
      active = false
      if (idleHandle !== null && cancelIdle) {
        cancelIdle(idleHandle)
      }

      if (timeoutHandle !== null) {
        globalThis.clearTimeout(timeoutHandle)
      }
    }
  }, [grid])

  return canvas
}

function useCanvasSize() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<CanvasSize>({
    width: 880,
    height: 680,
  })

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const updateSize = () => {
      setSize({
        width: Math.max(element.clientWidth, 320),
        height: Math.max(element.clientHeight, 360),
      })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return { ref, size }
}

export function MapCanvas({
  map,
  zones,
  noGoAreas,
  virtualWalls,
  layerVisibility,
  mode = 'idle',
  alignmentPoints = [],
  draftRectPoints = [],
  draftDisplayRegion = null,
  draftWallPoints = [],
  draftWallPath = null,
  draftPreview = null,
  selectedZonePath = null,
  editableCorners = [],
  editableWallEndpoints = [],
  robotPose = null,
  selected,
  onCanvasPointPick,
  onEditableCornerChange,
  onEditableWallEndpointChange,
  onSelect,
}: MapCanvasProps) {
  const { ref, size } = useCanvasSize()
  const stageRef = useRef<KonvaStage | null>(null)
  const sceneGroupRef = useRef<KonvaGroup | null>(null)
  const pickGestureRef = useRef<PickGesture | null>(null)
  const pinchGestureRef = useRef<PinchGesture | null>(null)
  const panGestureRef = useRef<PanGesture | null>(null)
  const { isTouchCapable, isCoarsePointer } = useInputCapabilities()
  const [isTouchPinching, setIsTouchPinching] = useState(false)
  const isAligning = mode === 'aligning'
  const isCreatingZone = mode === 'creating-zone'
  const isEditingZone = mode === 'editing-zone'
  const isCreatingNoGo = mode === 'creating-no-go'
  const isEditingNoGo = mode === 'editing-no-go'
  const isCreatingWall = mode === 'creating-wall'
  const isEditingWall = mode === 'editing-wall'
  const isPickingMode = isAligning || isCreatingZone || isCreatingNoGo || isCreatingWall
  const isInteractiveSelection = mode === 'idle'

  const deferredOccupancyGrid = useDeferredValue(map?.occupancyGrid ?? null)
  const occupancyImage = useOccupancyCanvas(deferredOccupancyGrid)
  const rasterImage = useImageSource(map?.rasterImageUrl ?? null)

  const mapGeometryBounds = map ? getEntityBounds(map) : null
  const occupancyBounds = map?.occupancyGrid
    ? getOccupancyGridBounds(map.occupancyGrid)
    : null
  const hasBaseMapScene =
    Boolean(map) &&
    Boolean(
      occupancyBounds ||
        rasterImage ||
        mapGeometryBounds ||
        map?.displayRegion.length ||
        map?.displayPath.length,
    )
  const shouldRenderPassiveLayers = hasBaseMapScene
  const hiddenPassiveLayerCount = shouldRenderPassiveLayers
    ? 0
    : zones.length + noGoAreas.length + virtualWalls.length
  const showNoMapHint = hiddenPassiveLayerCount > 0 && mode === 'idle'
  const sceneBounds = useMemo(
    () =>
      mergeBounds([
        mapGeometryBounds,
        occupancyBounds,
        computeBounds(flattenPointSets(draftDisplayRegion ?? [])),
        computeBounds(flattenPointSets([], draftWallPath ?? [])),
        computeBounds(flattenPointSets([], selectedZonePath?.displayPath ?? [])),
        ...(shouldRenderPassiveLayers ? zones.map(getEntityBounds) : []),
        ...(shouldRenderPassiveLayers ? noGoAreas.map(getEntityBounds) : []),
        ...(shouldRenderPassiveLayers ? virtualWalls.map(getEntityBounds) : []),
      ]),
    [
      draftDisplayRegion,
      draftWallPath,
      mapGeometryBounds,
      noGoAreas,
      occupancyBounds,
      selectedZonePath,
      shouldRenderPassiveLayers,
      virtualWalls,
      zones,
    ],
  )

  const fitViewport = useMemo(
    () => createViewport(sceneBounds, size.width, size.height, VIEWPORT_PADDING),
    [sceneBounds, size.height, size.width],
  )
  const sceneSignature = useMemo(
    () =>
      sceneBounds
        ? [
            size.width,
            size.height,
            sceneBounds.minX,
            sceneBounds.minY,
            sceneBounds.maxX,
            sceneBounds.maxY,
          ].join(':')
        : `empty:${size.width}:${size.height}`,
    [sceneBounds, size.height, size.width],
  )
  const [viewportOverride, setViewportOverride] = useState<{
    signature: string
    viewport: ViewportTransform
  } | null>(null)
  const viewport =
    viewportOverride?.signature === sceneSignature
      ? viewportOverride.viewport
      : fitViewport

  const gridLines = useMemo(() => createGridLines(size), [size])

  const rasterBounds = useMemo(() => {
    if (!map) {
      return null
    }

    const bounds = mapGeometryBounds ?? occupancyBounds
    if (!bounds) {
      return null
    }

    return bounds
  }, [map, mapGeometryBounds, occupancyBounds])

  const mapClickBounds = occupancyBounds ?? rasterBounds
  const alignmentMarkerRadius = 6 / Math.max(viewport.scale, 1)
  const inverseScale = 1 / Math.max(viewport.scale, 0.001)
  const robotMarkerRadius = 12 * inverseScale
  const robotStrokeWidth = 2 * inverseScale
  const robotFaceRadius = 8.1 * inverseScale
  const robotFaceOffsetY = -1.8 * inverseScale
  const robotEyeRadius = 1.35 * inverseScale
  const robotEyeOffsetX = 3.4 * inverseScale
  const robotEyeOffsetY = 2.8 * inverseScale
  const robotNoseRadius = 1.85 * inverseScale
  const robotNoseOffsetY = -0.8 * inverseScale
  const robotWhiskerStrokeWidth = 0.9 * inverseScale
  const robotHeadingLength = 16 * inverseScale
  const robotHeadingHalfWidth = 7 * inverseScale

  const zoomRange = useMemo(
    () => ({
      min: fitViewport.scale,
      max: Math.max(fitViewport.scale * MAX_ZOOM_MULTIPLIER, fitViewport.scale + 1),
    }),
    [fitViewport.scale],
  )

  const setViewportPosition = (nextViewport: ViewportTransform) => {
    setViewportOverride({
      signature: sceneSignature,
      viewport: nextViewport,
    })
  }

  const toWorldPoint = (point: StagePoint, sourceViewport = viewport) => ({
    x: (point.x - sourceViewport.offsetX) / sourceViewport.scale,
    y: (sourceViewport.offsetY - point.y) / sourceViewport.scale,
  })

  const toStagePoint = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current
    if (!stage) {
      return null
    }

    if ('touches' in event.evt && event.evt.touches.length > 0) {
      const firstTouch = event.evt.touches[0]
      return getStagePointFromClient(stage, firstTouch.clientX, firstTouch.clientY)
    }

    if ('changedTouches' in event.evt && event.evt.changedTouches.length > 0) {
      const firstTouch = event.evt.changedTouches[0]
      return getStagePointFromClient(stage, firstTouch.clientX, firstTouch.clientY)
    }

    if ('clientX' in event.evt && 'clientY' in event.evt) {
      return getStagePointFromClient(stage, event.evt.clientX, event.evt.clientY)
    }

    return event.target.getStage()?.getPointerPosition() ?? null
  }

  const getTwoTouchMetrics = (touches: TouchList) => {
    const stage = stageRef.current
    if (!stage || touches.length < 2) {
      return null
    }

    const firstTouch = getStagePointFromClient(
      stage,
      touches[0].clientX,
      touches[0].clientY,
    )
    const secondTouch = getStagePointFromClient(
      stage,
      touches[1].clientX,
      touches[1].clientY,
    )

    return {
      firstTouch,
      secondTouch,
      center: getCenterPoint(firstTouch, secondTouch),
      distance: getDistanceBetweenPoints(firstTouch, secondTouch),
    }
  }

  const updateViewportScale = (targetScale: number, anchorX: number, anchorY: number) => {
    setViewportOverride((currentOverride) => {
      const currentViewport =
        currentOverride?.signature === sceneSignature
          ? currentOverride.viewport
          : fitViewport
      const nextScale = Math.min(zoomRange.max, Math.max(zoomRange.min, targetScale))
      if (!Number.isFinite(nextScale) || nextScale === currentViewport.scale) {
        return currentOverride
      }

      const worldX = (anchorX - currentViewport.offsetX) / currentViewport.scale
      const worldY = (currentViewport.offsetY - anchorY) / currentViewport.scale

      return {
        signature: sceneSignature,
        viewport: {
          ...currentViewport,
          scale: nextScale,
          offsetX: anchorX - worldX * nextScale,
          offsetY: anchorY + worldY * nextScale,
        },
      }
    })
  }

  const resetViewport = () => {
    setViewportOverride(null)
  }

  const startPickGesture = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isPickingMode || !onCanvasPointPick) {
      return
    }

    const pointer = toStagePoint(event)
    if (!pointer) {
      return
    }

    pickGestureRef.current = {
      startPoint: pointer,
      moved: false,
    }
  }

  const updatePickGesture = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!pickGestureRef.current) {
      return
    }

    const pointer = toStagePoint(event)
    if (!pointer) {
      return
    }

    if (
      getDistanceBetweenPoints(pointer, pickGestureRef.current.startPoint) >
      TOUCH_TAP_DISTANCE
    ) {
      pickGestureRef.current.moved = true
    }
  }

  const completePickGesture = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!pickGestureRef.current || !onCanvasPointPick) {
      return
    }

    const currentGesture = pickGestureRef.current
    pickGestureRef.current = null

    if (currentGesture.moved) {
      return
    }

    const pointer = toStagePoint(event) ?? currentGesture.startPoint
    const worldPoint = toWorldPoint(pointer)

    if (!isPointInsideBounds(worldPoint, mapClickBounds)) {
      return
    }

    onCanvasPointPick(worldPoint)
  }

  const cancelPickGesture = () => {
    pickGestureRef.current = null
  }

  const startPinchGesture = (touches: TouchList) => {
    if (isPickingMode || !sceneBounds) {
      return
    }

    const metrics = getTwoTouchMetrics(touches)
    if (!metrics || metrics.distance <= 0) {
      return
    }

    sceneGroupRef.current?.stopDrag()
    setIsTouchPinching(true)
    pinchGestureRef.current = {
      initialDistance: metrics.distance,
      initialScale: viewport.scale,
      worldAnchor: toWorldPoint(metrics.center),
    }
  }

  const updatePinchGesture = (touches: TouchList) => {
    if (!pinchGestureRef.current || !sceneBounds) {
      return false
    }

    const metrics = getTwoTouchMetrics(touches)
    if (!metrics || metrics.distance <= 0) {
      return false
    }

    const nextScale = Math.min(
      zoomRange.max,
      Math.max(
        zoomRange.min,
        pinchGestureRef.current.initialScale *
          (metrics.distance / pinchGestureRef.current.initialDistance),
      ),
    )

    setViewportPosition({
      ...viewport,
      scale: nextScale,
      offsetX: metrics.center.x - pinchGestureRef.current.worldAnchor.x * nextScale,
      offsetY: metrics.center.y + pinchGestureRef.current.worldAnchor.y * nextScale,
    })

    return true
  }

  const finishPinchGesture = () => {
    pinchGestureRef.current = null
    setIsTouchPinching(false)
  }

  const startPanGesture = (event: KonvaEventObject<TouchEvent>) => {
    if (isPickingMode || !sceneBounds) {
      return
    }

    const pointer = toStagePoint(event)
    if (!pointer) {
      return
    }

    panGestureRef.current = {
      startPoint: pointer,
      startViewport: viewport,
      moved: false,
    }
  }

  const updatePanGesture = (event: KonvaEventObject<TouchEvent>) => {
    if (!panGestureRef.current) {
      return false
    }

    const pointer = toStagePoint(event)
    if (!pointer) {
      return false
    }

    const deltaX = pointer.x - panGestureRef.current.startPoint.x
    const deltaY = pointer.y - panGestureRef.current.startPoint.y
    const movementDistance = Math.hypot(deltaX, deltaY)

    if (movementDistance > TOUCH_TAP_DISTANCE) {
      panGestureRef.current.moved = true
    }

    if (!panGestureRef.current.moved) {
      return false
    }

    setViewportPosition({
      ...panGestureRef.current.startViewport,
      offsetX: panGestureRef.current.startViewport.offsetX + deltaX,
      offsetY: panGestureRef.current.startViewport.offsetY + deltaY,
    })

    return true
  }

  const finishPanGesture = () => {
    panGestureRef.current = null
  }

  const handleStageWheel = (event: KonvaEventObject<WheelEvent>) => {
    if (!sceneBounds) {
      return
    }

    event.evt.preventDefault()

    const pointer = event.target.getStage()?.getPointerPosition()
    if (!pointer) {
      return
    }

    const nextScale =
      event.evt.deltaY < 0 ? viewport.scale * ZOOM_STEP : viewport.scale / ZOOM_STEP

    updateViewportScale(nextScale, pointer.x, pointer.y)
  }

  const zoomOut = () => {
    updateViewportScale(viewport.scale / ZOOM_STEP, size.width / 2, size.height / 2)
  }

  const zoomIn = () => {
    updateViewportScale(viewport.scale * ZOOM_STEP, size.width / 2, size.height / 2)
  }

  const handleStageMouseDown = (event: KonvaEventObject<MouseEvent>) => {
    if (isPickingMode) {
      startPickGesture(event)
    }
  }

  const handleStageMouseMove = (event: KonvaEventObject<MouseEvent>) => {
    if (isPickingMode) {
      updatePickGesture(event)
    }
  }

  const handleStageMouseUp = (event: KonvaEventObject<MouseEvent>) => {
    if (isPickingMode) {
      completePickGesture(event)
    }
  }

  const handleStageTouchStart = (event: KonvaEventObject<TouchEvent>) => {
    if (event.evt.touches.length >= 2) {
      event.evt.preventDefault()
      cancelPickGesture()
      finishPanGesture()
      startPinchGesture(event.evt.touches)
      return
    }

    if (isPickingMode) {
      startPickGesture(event)
      return
    }

    startPanGesture(event)
  }

  const handleStageTouchMove = (event: KonvaEventObject<TouchEvent>) => {
    if (event.evt.touches.length >= 2) {
      event.evt.preventDefault()
      updatePinchGesture(event.evt.touches)
      return
    }

    if (isPickingMode) {
      updatePickGesture(event)
      return
    }

    if (updatePanGesture(event)) {
      event.evt.preventDefault()
    }
  }

  const handleStageTouchEnd = (event: KonvaEventObject<TouchEvent>) => {
    if (pinchGestureRef.current && event.evt.touches.length < 2) {
      finishPinchGesture()
    }

    if (isPickingMode) {
      completePickGesture(event)
    }

    finishPanGesture()
  }

  const handleViewportDragMove = (event: KonvaEventObject<DragEvent>) => {
    if (isTouchPinching) {
      return
    }

    setViewportPosition({
      ...viewport,
      offsetX: event.target.x(),
      offsetY: event.target.y(),
    })
  }

  const interactionHint = isTouchCapable ? 'Pinch To Zoom' : 'Wheel To Zoom'
  const fitHint = isTouchCapable ? 'Double Tap To Fit' : 'Double Click To Fit'

  return (
    <div className="map-canvas-shell" ref={ref}>
      <div className="map-canvas-overlay">
        <span>Canvas</span>
        <span>Y-Up Display Frame</span>
        <span>{interactionHint}</span>
        {isTouchCapable ? <span>Drag To Pan</span> : null}
        {isTouchCapable && isInteractiveSelection ? <span>Tap To Select</span> : null}
        <span>{fitHint}</span>
        {isAligning ? <span>Pick 2 Points</span> : null}
        {isCreatingZone || isCreatingNoGo ? <span>Pick 2 Corners</span> : null}
        {isEditingZone || isEditingNoGo ? <span>Drag 4 Corners</span> : null}
        {isCreatingWall ? <span>Pick 2 Points</span> : null}
        {isEditingWall ? <span>Drag 2 Endpoints</span> : null}
      </div>
      <div className="map-canvas-controls">
        <button
          type="button"
          className="map-canvas-control-button"
          onClick={zoomOut}
          disabled={!sceneBounds || viewport.scale <= zoomRange.min}
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          className="map-canvas-control-button is-reset"
          onClick={resetViewport}
          disabled={!sceneBounds}
        >
          Fit
        </button>
        <button
          type="button"
          className="map-canvas-control-button"
          onClick={zoomIn}
          disabled={!sceneBounds || viewport.scale >= zoomRange.max}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
      {showNoMapHint ? (
        <div className="map-canvas-empty-state">
          <div className="map-canvas-empty-state-card">
            Base map is not available yet. Zone and constraint layers will appear
            after the map loads.
          </div>
        </div>
      ) : null}
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={cancelPickGesture}
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageTouchEnd}
        onTouchCancel={handleStageTouchEnd}
        onWheel={handleStageWheel}
        onDblClick={isPickingMode ? undefined : resetViewport}
        onDblTap={isPickingMode ? undefined : resetViewport}
      >
        <Layer listening={false}>
          <Rect
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fill="rgba(8, 16, 23, 0.92)"
          />
          {gridLines.vertical.map((points, index) => (
            <Line
              key={`grid-v-${index}`}
              points={points}
              stroke="rgba(126, 150, 162, 0.15)"
              strokeWidth={1}
            />
          ))}
          {gridLines.horizontal.map((points, index) => (
            <Line
              key={`grid-h-${index}`}
              points={points}
              stroke="rgba(126, 150, 162, 0.12)"
              strokeWidth={1}
            />
          ))}
        </Layer>

        <Layer>
          <Group
            ref={sceneGroupRef}
            x={viewport.offsetX}
            y={viewport.offsetY}
            scaleX={viewport.scale}
            scaleY={-viewport.scale}
            draggable={
              !isTouchCapable && !isPickingMode && !isTouchPinching && Boolean(sceneBounds)
            }
            dragDistance={isCoarsePointer ? TOUCH_TAP_DISTANCE : 3}
            onDragMove={handleViewportDragMove}
          >
            {layerVisibility.map && map ? (
              <Group>
                {occupancyImage && occupancyBounds ? (
                  <KonvaImage
                    x={occupancyBounds.minX}
                    y={occupancyBounds.minY}
                    width={occupancyBounds.width}
                    height={occupancyBounds.height}
                    image={occupancyImage}
                    opacity={0.94}
                  />
                ) : null}

                {rasterImage && rasterBounds ? (
                  <KonvaImage
                    x={rasterBounds.minX}
                    y={rasterBounds.minY}
                    width={rasterBounds.width}
                    height={rasterBounds.height}
                    image={rasterImage}
                    opacity={0.88}
                  />
                ) : null}

                {map.displayRegion.map((polygon, index) => (
                  <Line
                    key={`map-region-${index}`}
                    points={toKonvaPoints(polygon)}
                    closed
                    fill="rgba(239, 232, 219, 0.18)"
                    stroke={
                      isInteractiveSelection &&
                      selected?.kind === 'map' &&
                      selected.id === map.id
                        ? '#f4dcc0'
                        : 'rgba(239, 232, 219, 0.52)'
                    }
                    strokeWidth={
                      isInteractiveSelection &&
                      selected?.kind === 'map' &&
                      selected.id === map.id
                        ? 3
                        : 2
                    }
                    strokeScaleEnabled={false}
                    lineJoin="round"
                    onClick={() =>
                      isInteractiveSelection
                        ? onSelect({ kind: 'map', id: map.id })
                        : undefined
                    }
                    onTap={() =>
                      isInteractiveSelection
                        ? onSelect({ kind: 'map', id: map.id })
                        : undefined
                    }
                  />
                ))}

                {map.displayRegion.length === 0 && mapClickBounds ? (
                  <Rect
                    x={mapClickBounds.minX}
                    y={mapClickBounds.minY}
                    width={mapClickBounds.width}
                    height={mapClickBounds.height}
                    fill="rgba(255,255,255,0.001)"
                    onClick={() =>
                      isInteractiveSelection
                        ? onSelect({ kind: 'map', id: map.id })
                        : undefined
                    }
                    onTap={() =>
                      isInteractiveSelection
                        ? onSelect({ kind: 'map', id: map.id })
                        : undefined
                    }
                  />
                ) : null}

                {map.displayPath.map((path, index) => (
                  <Line
                    key={`map-path-${index}`}
                    points={toKonvaPoints(path)}
                    stroke="rgba(239, 232, 219, 0.62)"
                    strokeWidth={2}
                    strokeScaleEnabled={false}
                    lineCap="round"
                    lineJoin="round"
                    onClick={() =>
                      isInteractiveSelection
                        ? onSelect({ kind: 'map', id: map.id })
                        : undefined
                    }
                    onTap={() =>
                      isInteractiveSelection
                        ? onSelect({ kind: 'map', id: map.id })
                        : undefined
                    }
                  />
                ))}
              </Group>
            ) : null}

            {shouldRenderPassiveLayers && (layerVisibility.zone || zones.length > 0) ? (
              <ZoneLayer
                entities={zones}
                selected={selected}
                interactive={isInteractiveSelection}
                onSelect={onSelect}
              />
            ) : null}

            {shouldRenderPassiveLayers && layerVisibility.noGoArea ? (
              <NoGoAreaLayer
                entities={noGoAreas}
                selected={selected}
                interactive={isInteractiveSelection}
                onSelect={onSelect}
              />
            ) : null}

            {shouldRenderPassiveLayers && layerVisibility.virtualWall ? (
              <VirtualWallLayer
                entities={virtualWalls}
                selected={selected}
                scale={viewport.scale}
                interactive={isInteractiveSelection}
                onSelect={onSelect}
              />
            ) : null}

            {selectedZonePath ? (
              <Group listening={false}>
                {selectedZonePath.displayPath.map((path, index) => (
                  <Group key={`selected-zone-path-${selectedZonePath.zoneId}-${index}`}>
                    <Line
                      points={toKonvaPoints(path)}
                      stroke="rgba(8, 16, 23, 0.86)"
                      strokeWidth={6 / Math.max(viewport.scale, 1)}
                      strokeScaleEnabled={false}
                      lineCap="round"
                      lineJoin="round"
                      opacity={0.88}
                    />
                    <Line
                      points={toKonvaPoints(path)}
                      stroke="#f1c75b"
                      strokeWidth={3 / Math.max(viewport.scale, 1)}
                      strokeScaleEnabled={false}
                      lineCap="round"
                      lineJoin="round"
                      shadowBlur={12 / Math.max(viewport.scale, 1)}
                      shadowColor="#f1c75b"
                    />
                  </Group>
                ))}

                {selectedZonePath.displayEntryPose ? (
                  <>
                    <Circle
                      x={selectedZonePath.displayEntryPose.x}
                      y={selectedZonePath.displayEntryPose.y}
                      radius={7 / Math.max(viewport.scale, 1)}
                      fill="#f1c75b"
                      stroke="rgba(8, 16, 23, 0.95)"
                      strokeWidth={1 / Math.max(viewport.scale, 1)}
                    />
                    {selectedZonePath.displayEntryPose.theta !== null ? (
                      <Line
                        points={[
                          selectedZonePath.displayEntryPose.x,
                          selectedZonePath.displayEntryPose.y,
                          selectedZonePath.displayEntryPose.x +
                            Math.cos(selectedZonePath.displayEntryPose.theta) *
                              (2.4 / Math.max(viewport.scale, 1)),
                          selectedZonePath.displayEntryPose.y +
                            Math.sin(selectedZonePath.displayEntryPose.theta) *
                              (2.4 / Math.max(viewport.scale, 1)),
                        ]}
                        stroke="#fff0be"
                        strokeWidth={2 / Math.max(viewport.scale, 1)}
                        strokeScaleEnabled={false}
                        lineCap="round"
                        lineJoin="round"
                      />
                    ) : null}
                  </>
                ) : null}
              </Group>
            ) : null}

            <ZoneRectEditorLayer
              rectPoints={draftRectPoints}
              draftDisplayRegion={draftDisplayRegion}
              scale={viewport.scale}
              editableCorners={isEditingZone ? editableCorners : []}
              onEditableCornerChange={onEditableCornerChange}
            />

            <VirtualWallEditorLayer
              draftPoints={draftWallPoints}
              draftPath={draftWallPath}
              scale={viewport.scale}
              editableEndpoints={isEditingWall ? editableWallEndpoints : []}
              onEditableEndpointChange={onEditableWallEndpointChange}
            />

            {draftPreview ? (
              <Group listening={false}>
                {draftPreview.displayPreviewPath.map((path, index) => (
                  <Line
                    key={`draft-preview-path-${index}`}
                    points={toKonvaPoints(path)}
                    stroke="#7da8ff"
                    strokeWidth={3 / Math.max(viewport.scale, 1)}
                    strokeScaleEnabled={false}
                    lineCap="round"
                    lineJoin="round"
                    shadowBlur={10 / Math.max(viewport.scale, 1)}
                    shadowColor="#7da8ff"
                  />
                ))}

                {draftPreview.displayEntryPose ? (
                  <>
                    <Circle
                      x={draftPreview.displayEntryPose.x}
                      y={draftPreview.displayEntryPose.y}
                      radius={7 / Math.max(viewport.scale, 1)}
                      fill="#7da8ff"
                      stroke="rgba(8, 16, 23, 0.95)"
                      strokeWidth={1 / Math.max(viewport.scale, 1)}
                    />
                    {draftPreview.displayEntryPose.theta !== null ? (
                      <Line
                        points={[
                          draftPreview.displayEntryPose.x,
                          draftPreview.displayEntryPose.y,
                          draftPreview.displayEntryPose.x +
                            Math.cos(draftPreview.displayEntryPose.theta) *
                              (2.4 / Math.max(viewport.scale, 1)),
                          draftPreview.displayEntryPose.y +
                            Math.sin(draftPreview.displayEntryPose.theta) *
                              (2.4 / Math.max(viewport.scale, 1)),
                        ]}
                        stroke="#d9e6ff"
                        strokeWidth={2 / Math.max(viewport.scale, 1)}
                        strokeScaleEnabled={false}
                        lineCap="round"
                        lineJoin="round"
                      />
                    ) : null}
                  </>
                ) : null}
              </Group>
            ) : null}

            {alignmentPoints.length > 0 ? (
              <Group listening={false}>
                {alignmentPoints.length === 2 ? (
                  <Line
                    points={toKonvaPoints(alignmentPoints)}
                    stroke="#4cd3b1"
                    strokeWidth={3 / Math.max(viewport.scale, 1)}
                    strokeScaleEnabled={false}
                    dash={[8, 6]}
                    lineCap="round"
                    lineJoin="round"
                  />
                ) : null}
                {alignmentPoints.map((point, index) => (
                  <Circle
                    key={`alignment-point-${index}`}
                    x={point.x}
                    y={point.y}
                    radius={alignmentMarkerRadius}
                    fill={index === 0 ? '#ffd166' : '#4cd3b1'}
                    stroke="rgba(8, 16, 23, 0.9)"
                    strokeWidth={1 / Math.max(viewport.scale, 1)}
                  />
                ))}
              </Group>
            ) : null}

            {robotPose ? (
              <Group listening={false}>
                <Circle
                  x={robotPose.x}
                  y={robotPose.y}
                  radius={robotMarkerRadius}
                  fill="#1e9bed"
                  stroke="rgba(8, 16, 23, 0.95)"
                  strokeWidth={robotStrokeWidth * 0.9}
                />
                <Circle
                  x={robotPose.x}
                  y={robotPose.y + robotFaceOffsetY}
                  radius={robotFaceRadius}
                  fill="#f8fbff"
                  stroke="rgba(8, 16, 23, 0.76)"
                  strokeWidth={0.8 * inverseScale}
                />
                <Circle
                  x={robotPose.x - robotEyeOffsetX}
                  y={robotPose.y + robotEyeOffsetY}
                  radius={robotEyeRadius}
                  fill="#111820"
                />
                <Circle
                  x={robotPose.x + robotEyeOffsetX}
                  y={robotPose.y + robotEyeOffsetY}
                  radius={robotEyeRadius}
                  fill="#111820"
                />
                <Circle
                  x={robotPose.x}
                  y={robotPose.y + robotNoseOffsetY}
                  radius={robotNoseRadius}
                  fill="#ff3b30"
                  stroke="#f8fbff"
                  strokeWidth={0.45 * inverseScale}
                />
                {[
                  [-7.4, 1.0, -2.6, -0.1],
                  [-7.6, -1.5, -2.8, -1.2],
                  [7.4, 1.0, 2.6, -0.1],
                  [7.6, -1.5, 2.8, -1.2],
                ].map(([x1, y1, x2, y2], index) => (
                  <Line
                    key={`robot-face-whisker-${index}`}
                    points={[
                      robotPose.x + x1 * inverseScale,
                      robotPose.y + y1 * inverseScale,
                      robotPose.x + x2 * inverseScale,
                      robotPose.y + y2 * inverseScale,
                    ]}
                    stroke="#111820"
                    strokeWidth={robotWhiskerStrokeWidth}
                    strokeScaleEnabled={false}
                    lineCap="round"
                  />
                ))}
                {robotPose.theta !== null ? (
                  <Line
                    points={(() => {
                      const directionX = Math.cos(robotPose.theta)
                      const directionY = Math.sin(robotPose.theta)
                      const normalX = -directionY
                      const normalY = directionX
                      const baseOffset = robotMarkerRadius * 0.94
                      const tipOffset = robotMarkerRadius + robotHeadingLength
                      const baseX = robotPose.x + directionX * baseOffset
                      const baseY = robotPose.y + directionY * baseOffset
                      const tipX = robotPose.x + directionX * tipOffset
                      const tipY = robotPose.y + directionY * tipOffset

                      return [
                        tipX,
                        tipY,
                        baseX + normalX * robotHeadingHalfWidth,
                        baseY + normalY * robotHeadingHalfWidth,
                        baseX - normalX * robotHeadingHalfWidth,
                        baseY - normalY * robotHeadingHalfWidth,
                      ]
                    })()}
                    closed
                    fill="#ff3b30"
                    stroke="#ff3b30"
                    strokeWidth={1 * inverseScale}
                    strokeScaleEnabled={false}
                    lineJoin="round"
                  />
                ) : null}
              </Group>
            ) : null}
          </Group>
        </Layer>

        {!sceneBounds ? (
          <Layer listening={false}>
            <Text
              x={size.width / 2 - 132}
              y={size.height / 2 - 12}
              width={264}
              align="center"
              text="Waiting for map geometry or layer data"
              fill="rgba(244, 236, 220, 0.82)"
              fontSize={16}
            />
          </Layer>
        ) : null}
      </Stage>
    </div>
  )
}
