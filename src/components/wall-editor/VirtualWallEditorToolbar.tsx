import { Alert, Button, Card, Empty, Space, Tag, Typography } from 'antd'

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
    return 'Pending'
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
    <Card
      title="Virtual Wall Editor"
      className="workbench-card"
      extra={
        isEditing ? (
          <Tag color="processing">Editing</Tag>
        ) : isCreating ? (
          <Tag color="blue">Creating</Tag>
        ) : (
          <Tag>Idle</Tag>
        )
      }
    >
      {!hasMap ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Load a map or map workspace before creating a virtual wall."
        />
      ) : null}

      {hasMap && !isCreating && !isEditing ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Paragraph className="workbench-footnote zone-editor-note">
            This tool currently supports two-point virtual walls. The canvas draft represents the
            display path and buffer preview used before saving.
          </Typography.Paragraph>
          <Button type="primary" onClick={onStart} disabled={disableStart}>
            Create virtual wall
          </Button>
        </Space>
      ) : null}

      {hasMap && (isCreating || isEditing) ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {lastError ? (
            <Alert
              showIcon
              type="error"
              title={isEditing ? 'Failed to save virtual wall' : 'Failed to create virtual wall'}
              description={lastError}
              className="zone-editor-alert"
            />
          ) : null}

          <div className="zone-editor-status">
            <Typography.Text strong>
              {isEditing ? 'Editing virtual wall' : 'Creating virtual wall'}
            </Typography.Text>
            <Typography.Text type="secondary">
              {isEditing
                ? 'Drag the two endpoints on the canvas, then save when the updated path is correct.'
                : points.length === 0
                  ? 'Pick the first endpoint on the canvas.'
                  : 'Pick the second endpoint to finish the local wall draft.'}
            </Typography.Text>
            {!isEditing ? (
              <Typography.Text code>
                Point 1 {formatPoint(points[0])}
                {'  '}
                Point 2 {formatPoint(points[1])}
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
