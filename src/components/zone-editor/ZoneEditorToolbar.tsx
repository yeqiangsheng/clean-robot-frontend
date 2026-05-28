import { Button, Card, Space, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import type { Point2D, ZoneEditorMode } from '../../types/map-editor'

interface ZoneEditorToolbarProps {
  hasMap: boolean
  hasAlignment: boolean
  mode: ZoneEditorMode
  rectPoints: Point2D[]
  isPreviewing: boolean
  lastError: string | null
  disableStart?: boolean
  onStart: () => void
  onCancel: () => void
}

function formatPoint(point: Point2D) {
  return `${point.x.toFixed(2)}, ${point.y.toFixed(2)}`
}

export function ZoneEditorToolbar({
  hasMap,
  mode,
  rectPoints,
  lastError,
  disableStart = false,
  onStart,
  onCancel,
}: ZoneEditorToolbarProps) {
  const isCreatingZone = mode === 'creating-zone'
  const isBusy = mode !== 'idle'

  return (
    <Card
      title="覆盖区编辑"
      className="workbench-card"
    >
      {!hasMap ? (
        <AppEmptyState description="请先加载地图或工作区图层，再开始创建覆盖区。" />
      ) : (
        <>
          {isCreatingZone ? (
            <div className="zone-editor-status">
              <Typography.Text strong>两点矩形选区</Typography.Text>
              <Typography.Text code>
                点 1 {rectPoints[0] ? formatPoint(rectPoints[0]) : '待选择'}
                {'  '}
                点 2 {rectPoints[1] ? formatPoint(rectPoints[1]) : '待选择'}
              </Typography.Text>
            </div>
          ) : null}

          {isCreatingZone && lastError ? (
            <AppFeedbackBanner
              tone="error"
              title="矩形草稿生成失败"
              description={lastError}
              className="zone-editor-alert"
            />
          ) : null}

          <Space wrap>
            <Button type="primary" onClick={onStart} disabled={!hasMap || isBusy || disableStart}>
              新建覆盖区
            </Button>
            {isCreatingZone ? <Button onClick={onCancel}>取消</Button> : null}
          </Space>
        </>
      )}
    </Card>
  )
}
