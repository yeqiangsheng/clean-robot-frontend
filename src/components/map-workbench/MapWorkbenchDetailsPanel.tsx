import { Button, Card, Descriptions, Popconfirm, Space } from 'antd'

import { NoGoDetailsPanel } from '../constraint-editor/NoGoDetailsPanel'
import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import { AppLoadingState } from '../feedback/AppLoadingState'
import { VirtualWallDetailsPanel } from '../wall-editor/VirtualWallDetailsPanel'
import type {
  AreaEntity,
  ConstraintEditorMode,
  ZonePlanPathResult,
} from '../../types/map-editor'
import { formatNumber } from '../../utils/geometry'
import {
  kindLabelMap,
  type WorkbenchEntity,
} from '../../utils/mapWorkbenchPage'

type ZoneActionFeedback = {
  type: 'success' | 'error'
  message: string
}

type AsyncAction = () => void | Promise<void>

export function MapWorkbenchDetailsPanel({
  selectedEntity,
  selectedZoneEntity,
  selectedNoGoAreaEntity,
  selectedVirtualWallEntity,
  selectedZonePathResult,
  selectedZonePathLoading,
  selectedZonePathError,
  showSelectedZonePath,
  hasMap,
  zoneActionFeedback,
  isLoadingZoneDetail,
  isLoadingNoGoDetail,
  isLoadingWallDetail,
  isAnyEditorActive,
  constraintMode,
  constraintDeleteLoading,
  isDeletingZone,
  onClearZoneActionFeedback,
  onStartEditingZone,
  onStartEditingNoGo,
  onStartEditingWall,
  onDeleteZone,
  onDeleteNoGo,
  onDeleteWall,
}: {
  selectedEntity: WorkbenchEntity | null
  selectedZoneEntity: AreaEntity | null
  selectedNoGoAreaEntity: AreaEntity | null
  selectedVirtualWallEntity: AreaEntity | null
  selectedZonePathResult: ZonePlanPathResult | null
  selectedZonePathLoading: boolean
  selectedZonePathError: Error | null
  showSelectedZonePath: boolean
  hasMap: boolean
  zoneActionFeedback: ZoneActionFeedback | null
  isLoadingZoneDetail: boolean
  isLoadingNoGoDetail: boolean
  isLoadingWallDetail: boolean
  isAnyEditorActive: boolean
  constraintMode: ConstraintEditorMode
  constraintDeleteLoading: boolean
  isDeletingZone: boolean
  onClearZoneActionFeedback: () => void
  onStartEditingZone: AsyncAction
  onStartEditingNoGo: AsyncAction
  onStartEditingWall: AsyncAction
  onDeleteZone: AsyncAction
  onDeleteNoGo: AsyncAction
  onDeleteWall: AsyncAction
}) {
  if (selectedNoGoAreaEntity) {
    return (
      <NoGoDetailsPanel
        area={selectedNoGoAreaEntity}
        extra={
          <Space size="small" wrap>
            <Button
              size="small"
              onClick={() => void onStartEditingNoGo()}
              loading={isLoadingNoGoDetail}
              disabled={isAnyEditorActive && constraintMode !== 'editing-no-go'}
            >
              编辑禁入区
            </Button>
            <Popconfirm
              title="删除禁入区"
              description="该操作会把当前所选禁入区从后端删除。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void onDeleteNoGo()}
              okButtonProps={{ danger: true, loading: constraintDeleteLoading }}
              disabled={isAnyEditorActive}
            >
              <Button
                size="small"
                danger
                loading={constraintDeleteLoading}
                disabled={isAnyEditorActive}
              >
                删除禁入区
              </Button>
            </Popconfirm>
          </Space>
        }
      />
    )
  }

  if (selectedVirtualWallEntity) {
    return (
      <VirtualWallDetailsPanel
        wall={selectedVirtualWallEntity}
        extra={
          <Space size="small" wrap>
            <Button
              size="small"
              onClick={() => void onStartEditingWall()}
              loading={isLoadingWallDetail}
              disabled={isAnyEditorActive && constraintMode !== 'editing-wall'}
            >
              编辑虚拟墙
            </Button>
            <Popconfirm
              title="删除虚拟墙"
              description="该操作会把当前所选虚拟墙从后端删除。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void onDeleteWall()}
              okButtonProps={{ danger: true, loading: constraintDeleteLoading }}
              disabled={isAnyEditorActive}
            >
              <Button
                size="small"
                danger
                loading={constraintDeleteLoading}
                disabled={isAnyEditorActive}
              >
                删除虚拟墙
              </Button>
            </Popconfirm>
          </Space>
        }
      />
    )
  }

  return (
    <Card
      title="当前对象"
      className="workbench-card"
      extra={
        selectedZoneEntity ? (
          <Space size="small" wrap>
            <Button
              size="small"
              onClick={() => void onStartEditingZone()}
              loading={isLoadingZoneDetail}
              disabled={isAnyEditorActive}
            >
              编辑覆盖区
            </Button>
            <Popconfirm
              title="删除覆盖区"
              description="删除后，当前覆盖区会在默认工作台列表中隐藏。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => void onDeleteZone()}
              okButtonProps={{ danger: true, loading: isDeletingZone }}
              disabled={isAnyEditorActive}
            >
              <Button
                size="small"
                danger
                loading={isDeletingZone}
                disabled={isAnyEditorActive}
              >
                删除覆盖区
              </Button>
            </Popconfirm>
          </Space>
        ) : null
      }
    >
      {zoneActionFeedback ? (
        <AppFeedbackBanner
          closable
          tone={zoneActionFeedback.type}
          title={zoneActionFeedback.type === 'success' ? '覆盖区删除完成' : '覆盖区删除失败'}
          description={zoneActionFeedback.message}
          className="workbench-inline-alert"
          onClose={onClearZoneActionFeedback}
        />
      ) : null}

      {selectedZoneEntity && showSelectedZonePath && selectedZonePathLoading ? (
        <AppLoadingState
          compact
          className="workbench-loading workbench-loading-compact"
          message="正在加载当前覆盖区的活动路径..."
        />
      ) : null}

      {selectedZoneEntity && showSelectedZonePath && selectedZonePathError ? (
        <AppFeedbackBanner
          tone="warning"
          title="当前覆盖区路径暂不可用"
          description={selectedZonePathError.message}
          className="workbench-inline-alert"
        />
      ) : null}

      {selectedEntity ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="类型">
              {kindLabelMap[selectedEntity.kind]}
            </Descriptions.Item>
            <Descriptions.Item label="名称">{selectedEntity.name}</Descriptions.Item>
            <Descriptions.Item label="ID">{selectedEntity.id}</Descriptions.Item>
            <Descriptions.Item label="显示坐标系">
              {selectedEntity.displayFrame?.frameId ?? '--'}
            </Descriptions.Item>
            <Descriptions.Item label="区域数量">
              {selectedEntity.displayRegion.length}
            </Descriptions.Item>
            <Descriptions.Item label="路径数量">
              {selectedEntity.displayPath.length}
            </Descriptions.Item>
            {selectedEntity.kind === 'map' ? (
              <Descriptions.Item label="栅格数据长度">
                {selectedEntity.occupancyGrid?.data.length ?? '--'}
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {selectedZoneEntity && selectedZonePathResult ? (
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="活动路径 ID">
                {selectedZonePathResult.activePlanId ?? '--'}
              </Descriptions.Item>
              <Descriptions.Item label="路径规划档位">
                {selectedZonePathResult.planProfileName || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="路径显示坐标系">
                {selectedZonePathResult.displayFrame?.frameId ?? '--'}
              </Descriptions.Item>
              <Descriptions.Item label="路径长度">
                {selectedZonePathResult.estimatedLengthM !== null
                  ? `${formatNumber(selectedZonePathResult.estimatedLengthM, 1)} m`
                  : '--'}
              </Descriptions.Item>
              <Descriptions.Item label="路径时长">
                {selectedZonePathResult.estimatedDurationS !== null
                  ? `${formatNumber(selectedZonePathResult.estimatedDurationS, 0)} s`
                  : '--'}
              </Descriptions.Item>
            </Descriptions>
          ) : null}
        </Space>
      ) : (
        <AppEmptyState
          description={
            hasMap
              ? '请选择一个地图对象查看详情。'
              : '地图加载完成后，这里会显示对象详情。'
          }
        />
      )}
    </Card>
  )
}
