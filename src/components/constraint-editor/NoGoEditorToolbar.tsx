import { Alert, Button, Card, Empty, Space, Tag, Typography } from 'antd'

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
    return 'Pending'
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
      title="No-go Editor"
      className="workbench-card"
      extra={
        isEditing ? (
          <Tag color="processing">Editing</Tag>
        ) : isCreating ? (
          <Tag color="warning">Creating</Tag>
        ) : (
          <Tag>Idle</Tag>
        )
      }
    >
      {!hasMap ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Load a map or map workspace before creating a no-go area."
        />
      ) : null}

      {hasMap && !isCreating && !isEditing ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Paragraph className="workbench-footnote zone-editor-note">
            This tool currently supports rectangular no-go areas only. The canvas draft is a
            display-side preview, and the saved backend geometry remains the source of truth.
          </Typography.Paragraph>
          <Button type="primary" onClick={onStart} disabled={disableStart}>
            Create no-go area
          </Button>
        </Space>
      ) : null}

      {hasMap && (isCreating || isEditing) ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {lastError ? (
            <Alert
              showIcon
              type="error"
              title={isEditing ? 'Failed to save no-go area' : 'Failed to create no-go area'}
              description={lastError}
              className="zone-editor-alert"
            />
          ) : null}

          <div className="zone-editor-status">
            <Typography.Text strong>
              {isEditing ? 'Editing no-go area' : 'Creating no-go area'}
            </Typography.Text>
            <Typography.Text type="secondary">
              {isEditing
                ? 'Drag the rectangle corners on the canvas, then save when the updated boundary looks right.'
                : rectPoints.length === 0
                  ? 'Pick the first corner on the canvas.'
                  : 'Pick the opposite corner to finish the local rectangle draft.'}
            </Typography.Text>
            {!isEditing ? (
              <Typography.Text code>
                Point 1 {formatPoint(rectPoints[0])}
                {'  '}
                Point 2 {formatPoint(rectPoints[1])}
              </Typography.Text>
            ) : null}
          </div>

          <Space wrap>
            <Button onClick={onCancel} disabled={isBusy}>
              Cancel
            </Button>
          </Space>
        </Space>
      ) : null}
    </Card>
  )
}
