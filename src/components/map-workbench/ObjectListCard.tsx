import { Card, Typography } from 'antd'

import { AppLoadingState } from '../feedback/AppLoadingState'
import type {
  WorkbenchEntity,
  WorkbenchEntityGroup,
} from '../../utils/mapWorkbenchPage'

export function ObjectListCard({
  entityGroups,
  selectedEntity,
  isZoneListLoading,
  onSelect,
}: {
  entityGroups: WorkbenchEntityGroup[]
  selectedEntity: WorkbenchEntity | null
  isZoneListLoading: boolean
  onSelect: (entity: WorkbenchEntity) => void
}) {
  return (
    <Card title="对象列表" className="workbench-card">
      <div className="object-group-list">
        {entityGroups.map((group) => (
          <section key={group.key} className="object-group">
            <div className="object-group-header">
              <Typography.Text strong>{group.title}</Typography.Text>
            </div>

            {group.entities.length > 0 ? (
              <div className="object-group-items">
                {group.entities.map((entity) => (
                  <button
                    key={`${entity.kind}:${entity.id}`}
                    type="button"
                    className={`object-list-item ${
                      selectedEntity?.id === entity.id &&
                      selectedEntity.kind === entity.kind
                        ? 'is-selected'
                        : ''
                    }`}
                    onClick={() => onSelect(entity)}
                  >
                    <span className="object-list-main">
                      <span>{entity.name}</span>
                    </span>
                    <span className="object-list-subtle">{entity.id}</span>
                  </button>
                ))}
              </div>
            ) : group.key === 'zone' && isZoneListLoading ? (
              <AppLoadingState
                compact
                className="workbench-loading workbench-loading-compact"
                message="正在加载覆盖区列表..."
              />
            ) : null}
          </section>
        ))}
      </div>
    </Card>
  )
}
