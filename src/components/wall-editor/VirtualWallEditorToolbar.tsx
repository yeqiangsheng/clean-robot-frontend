import { Button, Card, Space, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type { ConstraintEditorMode, Point2D } from '../../types/map-editor'

interface VirtualWallEditorToolbarProps {
  hasMap: boolean
  mode: ConstraintEditorMode
  points: Point2D[]
  isBusy: boolean
  lastError: string | null
  disableStart?: boolean
  onStart: () => void
  onCancel: () => void
}

function formatPoint(point: Point2D | undefined) {
  if (!point) {
    return '待选择'
  }

  return `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`
}

export function VirtualWallEditorToolbar({
  hasMap,
  mode,
  points,
  isBusy,
  lastError,
  disableStart = false,
  onStart,
  onCancel,
}: VirtualWallEditorToolbarProps) {
  const isCreating = mode === 'creating-wall'
  const isEditing = mode === 'editing-wall'

  return (
    <Card title="虚拟墙编辑" className="workbench-card">
      {!hasMap ? (
        <AppEmptyState description="请先加载地图或工作区图层，再开始创建虚拟墙。" />
      ) : null}

      {hasMap && !isCreating && !isEditing ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Button type="primary" onClick={onStart} disabled={disableStart}>
            新建虚拟墙
          </Button>
        </Space>
      ) : null}

      {hasMap && (isCreating || isEditing) ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {lastError ? (
            <AppFeedbackBanner
              tone="error"
              title={isEditing ? '虚拟墙保存失败' : '虚拟墙创建失败'}
              description={lastError}
              className="zone-editor-alert"
            />
          ) : null}

          <div className="zone-editor-status">
            <Typography.Text strong>{isEditing ? '正在编辑虚拟墙' : '正在新建虚拟墙'}</Typography.Text>
            {!isEditing ? (
              <Typography.Text code>
                点 1 {formatPoint(points[0])}
                {'  '}
                点 2 {formatPoint(points[1])}
              </Typography.Text>
            ) : null}
          </div>

          <Space wrap>
            <Button onClick={onCancel} disabled={isBusy}>
              取消
            </Button>
          </Space>
        </Space>
      ) : null}
    </Card>
  )
}
