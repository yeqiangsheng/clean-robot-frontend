import { Button, Card, Space, Tag, Typography } from 'antd'

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
    <Card
      title="禁入区编辑"
      className="workbench-card"
      extra={
        isEditing ? (
          <Tag color="processing">编辑中</Tag>
        ) : isCreating ? (
          <Tag color="warning">新建中</Tag>
        ) : (
          <Tag>空闲</Tag>
        )
      }
    >
      {!hasMap ? (
        <AppEmptyState description="请先加载地图或工作区图层，再开始创建禁入区。" />
      ) : null}

      {hasMap && !isCreating && !isEditing ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Paragraph className="workbench-footnote zone-editor-note">
            当前工具只支持矩形禁入区。画布草稿用于本地编辑预览，最终以后端保存后的几何为准。
          </Typography.Paragraph>
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
            <Typography.Text type="secondary">
              {isEditing
                ? '请在画布上拖拽矩形角点，确认边界合适后再保存。'
                : rectPoints.length === 0
                  ? '请先在画布上选择第一个角点。'
                  : '请再选择一个对角点，完成本次矩形草稿。'}
            </Typography.Text>
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
