import { Circle, Group, Line } from 'react-konva'

import type { Point2D, RegionSet } from '../../types/map-editor'
import { toKonvaPoints } from '../../utils/geometry'

interface ZoneRectEditorLayerProps {
  rectPoints: Point2D[]
  draftDisplayRegion: RegionSet | null
  scale: number
  editableCorners?: Point2D[]
  onEditableCornerChange?: (cornerIndex: number, point: Point2D) => void
}

export function ZoneRectEditorLayer({
  rectPoints,
  draftDisplayRegion,
  scale,
  editableCorners = [],
  onEditableCornerChange,
}: ZoneRectEditorLayerProps) {
  const markerRadius = 6 / Math.max(scale, 1)
  const strokeWidth = 3 / Math.max(scale, 1)
  const isEditable = editableCorners.length === 4 && Boolean(onEditableCornerChange)

  if (rectPoints.length === 0 && !draftDisplayRegion && editableCorners.length === 0) {
    return null
  }

  return (
    <Group listening={isEditable}>
      {!isEditable
        ? draftDisplayRegion?.map((polygon, index) => (
        <Line
          key={`draft-rect-${index}`}
          points={toKonvaPoints(polygon)}
          closed
          fill="rgba(76, 211, 177, 0.20)"
          stroke="#59ddbc"
          strokeWidth={strokeWidth}
          strokeScaleEnabled={false}
          dash={[8, 6]}
          lineJoin="round"
          shadowBlur={12 / Math.max(scale, 1)}
          shadowColor="#59ddbc"
        />
          ))
        : null}

      {editableCorners.length === 4 ? (
        <Line
          points={toKonvaPoints([...editableCorners, editableCorners[0]])}
          closed
          fill="rgba(125, 168, 255, 0.14)"
          stroke="#7da8ff"
          strokeWidth={strokeWidth}
          strokeScaleEnabled={false}
          dash={[8, 6]}
          lineJoin="round"
        />
      ) : null}

      {rectPoints.length === 2 && !draftDisplayRegion ? (
        <Line
          points={toKonvaPoints(rectPoints)}
          stroke="#59ddbc"
          strokeWidth={strokeWidth}
          strokeScaleEnabled={false}
          dash={[8, 6]}
          lineCap="round"
          lineJoin="round"
        />
      ) : null}

      {rectPoints.map((point, index) => (
        <Circle
          key={`draft-rect-point-${index}`}
          x={point.x}
          y={point.y}
          radius={markerRadius}
          fill={index === 0 ? '#ffd166' : '#59ddbc'}
          stroke="rgba(8, 16, 23, 0.9)"
          strokeWidth={1 / Math.max(scale, 1)}
        />
      ))}

      {editableCorners.map((point, index) => (
        <Circle
          key={`editable-rect-corner-${index}`}
          x={point.x}
          y={point.y}
          radius={markerRadius + 1.5 / Math.max(scale, 1)}
          fill="#7da8ff"
          stroke="rgba(8, 16, 23, 0.92)"
          strokeWidth={1 / Math.max(scale, 1)}
          hitStrokeWidth={20 / Math.max(scale, 1)}
          draggable={isEditable}
          onDragMove={(event) =>
            onEditableCornerChange?.(index, {
              x: event.target.x(),
              y: event.target.y(),
            })
          }
        />
      ))}
    </Group>
  )
}
