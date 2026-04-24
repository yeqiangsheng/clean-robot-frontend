import { Button, Card, Space, Tag, Typography } from 'antd'

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
  hasAlignment,
  mode,
  rectPoints,
  isPreviewing,
  lastError,
  disableStart = false,
  onStart,
  onCancel,
}: ZoneEditorToolbarProps) {
  const isCreatingZone = mode === 'creating-zone'
  const isEditingZone = mode === 'editing-zone'
  const isBusy = mode !== 'idle'

  return (
    <Card
      title="覆盖区编辑"
      className="workbench-card"
      extra={
        <Space size="small" wrap>
          <Tag color={isCreatingZone || isEditingZone ? 'processing' : 'default'}>
            {isCreatingZone ? '新建中' : isEditingZone ? '编辑中' : '空闲'}
          </Tag>
        </Space>
      }
    >
      {!hasMap ? (
        <AppEmptyState description="请先加载地图或工作区图层，再开始创建覆盖区。" />
      ) : (
        <>
          <Typography.Paragraph className="zone-editor-note">
            {isEditingZone
              ? '当前正在编辑已有覆盖区。请在画布上拖拽角点微调几何，再到右侧草稿面板里做预览和保存。'
              : hasAlignment
                ? '当前会基于对齐后的显示坐标创建覆盖区。选完两个角点后，右侧会接着显示预览和提交入口。'
                : '当前直接使用地图坐标创建覆盖区，不会阻塞后续预览和提交。'}
          </Typography.Paragraph>

          {!hasAlignment ? (
            <AppFeedbackBanner
              tone="info"
              title="当前直接使用地图坐标"
              description="新地图也可以直接按地图坐标创建和编辑覆盖区。"
              className="zone-editor-alert"
            />
          ) : null}

          {isCreatingZone ? (
            <div className="zone-editor-status">
              <Typography.Text strong>两点矩形选区</Typography.Text>
              <Typography.Paragraph className="zone-editor-note">
                {isPreviewing
                  ? '正在把两个角点提交给后端生成矩形草稿...'
                  : rectPoints.length === 0
                    ? '请先在画布上点击第一个角点。'
                    : rectPoints.length === 1
                      ? '请再点击一个对角点，完成本次矩形草稿。'
                      : '矩形草稿已经返回；如果要重来，可以重新开始新的选区。'}
              </Typography.Paragraph>
              <Space wrap size={[8, 8]}>
                <Tag color={rectPoints[0] ? 'success' : 'default'}>
                  点 1 {rectPoints[0] ? formatPoint(rectPoints[0]) : '待选择'}
                </Tag>
                <Tag color={rectPoints[1] ? 'success' : 'default'}>
                  点 2 {rectPoints[1] ? formatPoint(rectPoints[1]) : '待选择'}
                </Tag>
              </Space>
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
