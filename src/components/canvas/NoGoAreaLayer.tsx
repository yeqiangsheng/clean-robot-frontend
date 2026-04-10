import { Group, Line } from 'react-konva'

import type { AreaEntity, WorkbenchSelection } from '../../types/map-editor'
import { toKonvaPoints } from '../../utils/geometry'

interface NoGoAreaLayerProps {
  entities: AreaEntity[]
  selected: WorkbenchSelection
  interactive?: boolean
  onSelect: (selection: WorkbenchSelection) => void
}

export function NoGoAreaLayer({
  entities,
  selected,
  interactive = true,
  onSelect,
}: NoGoAreaLayerProps) {
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
                fill={isSelected ? 'rgba(239, 125, 50, 0.35)' : 'rgba(239, 125, 50, 0.18)'}
                stroke={entity.color}
                strokeWidth={isSelected ? 3 : 2}
                strokeScaleEnabled={false}
                hitStrokeWidth={18}
                dash={[10, 6]}
                lineJoin="round"
              />
            ))}
            {entity.displayPath.map((path, index) => (
              <Line
                key={`${entity.id}-path-${index}`}
                points={toKonvaPoints(path)}
                stroke={entity.color}
                strokeWidth={isSelected ? 3 : 2}
                strokeScaleEnabled={false}
                hitStrokeWidth={18}
                dash={[10, 6]}
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
