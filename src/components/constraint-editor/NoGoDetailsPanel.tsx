import type { ReactNode } from 'react'

import { Card, Descriptions } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import type { AreaEntity } from '../../types/map-editor'

interface NoGoDetailsPanelProps {
  area: AreaEntity | null
  extra?: ReactNode
}

function toBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    if (value === 'true') {
      return true
    }

    if (value === 'false') {
      return false
    }
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  return null
}

function getFrameId(area: AreaEntity) {
  if (area.displayFrame?.frameId) {
    return area.displayFrame.frameId
  }

  const displayFrame = area.raw.display_frame

  if (typeof displayFrame === 'string' && displayFrame.trim().length > 0) {
    return displayFrame
  }

  if (
    displayFrame &&
    typeof displayFrame === 'object' &&
    'frame_id' in displayFrame &&
    typeof displayFrame.frame_id === 'string'
  ) {
    return displayFrame.frame_id
  }

  return '--'
}

function formatTimestamp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000
    return new Date(milliseconds).toLocaleString('zh-CN', { hour12: false })
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value)

    if (Number.isFinite(numeric)) {
      const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000
      return new Date(milliseconds).toLocaleString('zh-CN', { hour12: false })
    }

    const parsed = new Date(value)

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('zh-CN', { hour12: false })
    }

    return value
  }

  return '--'
}

export function NoGoDetailsPanel({ area, extra = null }: NoGoDetailsPanelProps) {
  if (!area) {
    return (
      <Card title="禁入区详情" className="workbench-card">
        <AppEmptyState description="请选择一个禁入区查看只读详情。" />
      </Card>
    )
  }

  const enabled = toBoolean(area.raw.enabled)

  return (
    <Card
      title="禁入区详情"
      className="workbench-card"
      extra={extra}
    >
      <Descriptions column={1} size="small" colon={false}>
        <Descriptions.Item label="禁入区 ID">{area.id}</Descriptions.Item>
        <Descriptions.Item label="显示名称">{area.name}</Descriptions.Item>
        <Descriptions.Item label="是否启用">
          {enabled === null ? '--' : enabled ? '是' : '否'}
        </Descriptions.Item>
        <Descriptions.Item label="显示坐标系">{getFrameId(area)}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{formatTimestamp(area.raw.updated_ts)}</Descriptions.Item>
      </Descriptions>

    </Card>
  )
}
