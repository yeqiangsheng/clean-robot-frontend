import {
  ApartmentOutlined,
  ClusterOutlined,
} from '@ant-design/icons'
import {
  Card,
  Descriptions,
  Space,
  Switch,
  Typography,
} from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppLoadingState } from '../feedback/AppLoadingState'
import type {
  LayerKey,
  LayerVisibility,
  MapAlignment,
  MapWorkbenchData,
} from '../../types/map-editor'
import { formatNumber } from '../../utils/geometry'

export function CurrentMapCard({
  data,
  hasWorkspaceContext,
  workspaceMapName,
  effectiveAlignment,
  isInitialLoading,
  mapError,
}: {
  data: MapWorkbenchData
  hasWorkspaceContext: boolean
  workspaceMapName: string
  effectiveAlignment: MapAlignment | null
  isInitialLoading: boolean
  mapError: Error | null
}) {
  return (
    <Card title="当前地图" className="workbench-card" extra={<ApartmentOutlined />}>
      {data.map ? (
        <Descriptions column={1} size="small" colon={false}>
          <Descriptions.Item label="名称">{data.map.name}</Descriptions.Item>
          <Descriptions.Item label="ID">{data.map.id}</Descriptions.Item>
          <Descriptions.Item label="分辨率">
            {formatNumber(data.map.resolution, 4)}
          </Descriptions.Item>
          <Descriptions.Item label="栅格尺寸">
            {data.map.occupancyGrid?.width ?? '--'} x{' '}
            {data.map.occupancyGrid?.height ?? '--'}
          </Descriptions.Item>
          <Descriptions.Item label="显示坐标系">
            {data.map.displayFrame?.frameId ?? '--'}
          </Descriptions.Item>
        </Descriptions>
      ) : hasWorkspaceContext ? (
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="名称">
              {workspaceMapName || '当前地图'}
            </Descriptions.Item>
            <Descriptions.Item label="显示坐标系">
              {effectiveAlignment?.alignedFrame ??
                data.zones[0]?.displayFrame?.frameId ??
                data.noGoAreas[0]?.displayFrame?.frameId ??
                data.virtualWalls[0]?.displayFrame?.frameId ??
                '--'}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      ) : isInitialLoading ? (
        <AppLoadingState message="正在加载当前地图..." />
      ) : (
        <AppEmptyState description={mapError?.message ?? '当前还没有可用的活动地图。'} />
      )}
    </Card>
  )
}

export function LayerVisibilityCard({
  layerVisibility,
  onLayerVisibilityChange,
}: {
  layerVisibility: LayerVisibility
  onLayerVisibilityChange: (key: LayerKey, checked: boolean) => void
}) {
  return (
    <Card title="图层显示" className="workbench-card" extra={<ClusterOutlined />}>
      <div className="layer-toggle-list">
        {(
          [
            ['map', '栅格底图'],
            ['zone', '显示全部覆盖区'],
            ['noGoArea', '禁入区'],
            ['virtualWall', '虚拟墙'],
          ] satisfies Array<[LayerKey, string]>
        ).map(([key, label]) => (
          <div key={key} className="layer-toggle-row">
            <Typography.Text>{label}</Typography.Text>
            <Switch
              checked={layerVisibility[key]}
              onChange={(checked) => onLayerVisibilityChange(key, checked)}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}

export function ZoneFocusCard({
  showSelectedZoneOnly,
  showSelectedZonePath,
  onShowSelectedZoneOnlyChange,
  onShowSelectedZonePathChange,
}: {
  showSelectedZoneOnly: boolean
  showSelectedZonePath: boolean
  onShowSelectedZoneOnlyChange: (checked: boolean) => void
  onShowSelectedZonePathChange: (checked: boolean) => void
}) {
  return (
    <Card title="覆盖区聚焦" className="workbench-card">
      <div className="layer-toggle-list">
        <div className="layer-toggle-row">
          <Typography.Text>仅显示当前覆盖区</Typography.Text>
          <Switch
            checked={showSelectedZoneOnly}
            onChange={onShowSelectedZoneOnlyChange}
          />
        </div>
        <div className="layer-toggle-row">
          <Typography.Text>显示当前覆盖区路径</Typography.Text>
          <Switch
            checked={showSelectedZonePath}
            onChange={onShowSelectedZonePathChange}
          />
        </div>
      </div>
    </Card>
  )
}
