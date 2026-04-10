import { Circle, Group, Line } from 'react-konva'

import type { PathSet, Point2D } from '../../types/map-editor'
import { toKonvaPoints } from '../../utils/geometry'

interface VirtualWallEditorLayerProps {
  draftPoints: Point2D[]
  draftPath: PathSet | null
  scale: number
  editableEndpoints?: Point2D[]
  onEditableEndpointChange?: (endpointIndex: number, point: Point2D) => void
}

export function VirtualWallEditorLayer({
  draftPoints,
  draftPath,
  scale,
  editableEndpoints = [],
  onEditableEndpointChange,
}: VirtualWallEditorLayerProps) {
  const markerRadius = 6 / Math.max(scale, 1)
  const strokeWidth = 3 / Math.max(scale, 1)
  const isEditable = editableEndpoints.length === 2 && Boolean(onEditableEndpointChange)

  if (draftPoints.length === 0 && !draftPath && editableEndpoints.length === 0) {
    return null
  }

  return (
    <Group listening={isEditable}>
      {!isEditable
        ? draftPath?.map((path, index) => (
            <Line
              key={`draft-wall-${index}`}
              points={toKonvaPoints(path)}
              stroke="#6a92ff"
              strokeWidth={strokeWidth}
              strokeScaleEnabled={false}
              lineCap="round"
              lineJoin="round"
              dash={[8, 6]}
              shadowBlur={12 / Math.max(scale, 1)}
              shadowColor="#6a92ff"
            />
          ))
        : null}

      {editableEndpoints.length === 2 ? (
        <Line
          points={toKonvaPoints(editableEndpoints)}
          stroke="#7da8ff"
          strokeWidth={strokeWidth}
          strokeScaleEnabled={false}
          lineCap="round"
          lineJoin="round"
          dash={[8, 6]}
        />
      ) : null}

      {draftPoints.length === 2 && !draftPath ? (
        <Line
          points={toKonvaPoints(draftPoints)}
          stroke="#6a92ff"
          strokeWidth={strokeWidth}
          strokeScaleEnabled={false}
          lineCap="round"
          lineJoin="round"
          dash={[8, 6]}
        />
      ) : null}

      {draftPoints.map((point, index) => (
        <Circle
          key={`draft-wall-point-${index}`}
          x={point.x}
          y={point.y}
          radius={markerRadius}
          fill={index === 0 ? '#ffd166' : '#6a92ff'}
          stroke="rgba(8, 16, 23, 0.9)"
          strokeWidth={1 / Math.max(scale, 1)}
        />
      ))}

      {editableEndpoints.map((point, index) => (
        <Circle
          key={`editable-wall-endpoint-${index}`}
          x={point.x}
          y={point.y}
          radius={markerRadius + 1.5 / Math.max(scale, 1)}
          fill="#7da8ff"
          stroke="rgba(8, 16, 23, 0.92)"
          strokeWidth={1 / Math.max(scale, 1)}
          hitStrokeWidth={20 / Math.max(scale, 1)}
          draggable={isEditable}
          onDragMove={(event) =>
            onEditableEndpointChange?.(index, {
              x: event.target.x(),
              y: event.target.y(),
            })
          }
        />
      ))}
    </Group>
  )
}
