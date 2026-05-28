import { Button, Card, Space, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type { ConstraintEditorMode, Point2D } from '../../types/map-editor'

interface NoGoEditorToolbarProps {
  hasMap: boolean
  mode: ConstraintEditorMode
  rectPoints: Point2D[]
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

export function NoGoEditorToolbar({
  hasMap,
  mode,
  rectPoints,
  isBusy,
  lastError,
  disableStart = false,
  onStart,
  onCancel,
}: NoGoEditorToolbarProps) {
  const isCreating = mode === 'creating-no-go'
  const isEditing = mode === 'editing-no-go'

  return (
    <Card title="禁入区编辑" className="workbench-card">
      {!hasMap ? (
        <AppEmptyState description="请先加载地图或工作区图层，再开始创建禁入区。" />
      ) : null}

      {hasMap && !isCreating && !isEditing ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Button type="primary" onClick={onStart} disabled={disableStart}>
            新建禁入区
          </Button>
        </Space>
      ) : null}

      {hasMap && (isCreating || isEditing) ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {lastError ? (
            <AppFeedbackBanner
              tone="error"
              title={isEditing ? '禁入区保存失败' : '禁入区创建失败'}
              description={lastError}
              className="zone-editor-alert"
            />
          ) : null}

          <div className="zone-editor-status">
            <Typography.Text strong>{isEditing ? '正在编辑禁入区' : '正在新建禁入区'}</Typography.Text>
            {!isEditing ? (
              <Typography.Text code>
                点 1 {formatPoint(rectPoints[0])}
                {'  '}
                点 2 {formatPoint(rectPoints[1])}
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
