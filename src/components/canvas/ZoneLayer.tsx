import { Group, Line } from 'react-konva'

import type { AreaEntity, WorkbenchSelection } from '../../types/map-editor'
import { toKonvaPoints } from '../../utils/geometry'

interface ZoneLayerProps {
  entities: AreaEntity[]
  selected: WorkbenchSelection
  interactive?: boolean
  onSelect: (selection: WorkbenchSelection) => void
}

export function ZoneLayer({
  entities,
  selected,
  interactive = true,
  onSelect,
}: ZoneLayerProps) {
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
            {entity.displayRegion.map((polygon, index) => (
              <Line
                key={`${entity.id}-region-${index}`}
                points={toKonvaPoints(polygon)}
                closed
                fill={
                  isSelected ? 'rgba(24, 179, 138, 0.48)' : 'rgba(24, 179, 138, 0.18)'
                }
                stroke={isSelected ? '#7ff0cb' : entity.color}
                strokeWidth={isSelected ? 4 : 2}
                strokeScaleEnabled={false}
                hitStrokeWidth={18}
                lineJoin="round"
                shadowBlur={isSelected ? 18 : 0}
                shadowColor={isSelected ? '#7ff0cb' : entity.color}
              />
            ))}
            {entity.displayPath.map((path, index) => (
              <Line
                key={`${entity.id}-path-${index}`}
                points={toKonvaPoints(path)}
                stroke={isSelected ? '#7ff0cb' : entity.color}
                strokeWidth={isSelected ? 4 : 2}
                strokeScaleEnabled={false}
                hitStrokeWidth={18}
                lineCap="round"
                lineJoin="round"
              />
            ))}
          </Group>
        )
      })}
    </Group>
  )
}
