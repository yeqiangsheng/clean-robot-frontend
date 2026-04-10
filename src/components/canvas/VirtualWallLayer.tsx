import { Circle, Group, Line } from 'react-konva'

import type { AreaEntity, WorkbenchSelection } from '../../types/map-editor'
import { toKonvaPoints } from '../../utils/geometry'

interface VirtualWallLayerProps {
  entities: AreaEntity[]
  selected: WorkbenchSelection
  scale: number
  interactive?: boolean
  onSelect: (selection: WorkbenchSelection) => void
}

export function VirtualWallLayer({
  entities,
  selected,
  scale,
  interactive = true,
  onSelect,
}: VirtualWallLayerProps) {
  const anchorRadius = 5 / Math.max(scale, 1)
  const touchHitStrokeWidth = Math.max(20 / Math.max(scale, 1), 12)

  return (
    <Group>
      {entities.map((entity) => {
        const isSelected =
          selected?.kind === entity.kind && selected.id === entity.id

        return (
          <Group
            key={entity.id}
            onClick={() =>
              interactive ? onSelect({ kind: entity.kind, id: entity.id }) : undefined
            }
            onTap={() =>
              interactive ? onSelect({ kind: entity.kind, id: entity.id }) : undefined
            }
          >
            {entity.displayPath.map((path, index) => (
              <Group key={`${entity.id}-path-${index}`}>
                <Line
                  points={toKonvaPoints(path)}
                  stroke={entity.color}
                  strokeWidth={isSelected ? 4 : 3}
                  strokeScaleEnabled={false}
                  hitStrokeWidth={touchHitStrokeWidth}
                  lineCap="round"
                  lineJoin="round"
                  shadowBlur={isSelected ? 12 : 0}
                  shadowColor={entity.color}
                />
                {path[0] ? (
                  <Circle
                    x={path[0].x}
                    y={path[0].y}
                    radius={anchorRadius}
                    fill={entity.color}
                    opacity={0.9}
                    hitStrokeWidth={touchHitStrokeWidth}
                  />
                ) : null}
                {path[path.length - 1] ? (
                  <Circle
                    x={path[path.length - 1].x}
                    y={path[path.length - 1].y}
                    radius={anchorRadius}
                    fill={entity.color}
                    opacity={0.9}
                    hitStrokeWidth={touchHitStrokeWidth}
                  />
                ) : null}
              </Group>
            ))}
            {entity.displayRegion.map((polygon, index) => (
              <Line
                key={`${entity.id}-region-${index}`}
                points={toKonvaPoints(polygon)}
                closed
                stroke={entity.color}
                strokeWidth={isSelected ? 3 : 2}
                strokeScaleEnabled={false}
                hitStrokeWidth={touchHitStrokeWidth}
                dash={[6, 6]}
                lineJoin="round"
              />
            ))}
          </Group>
        )
      })}
    </Group>
  )
}
