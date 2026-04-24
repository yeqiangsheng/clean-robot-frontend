import { Button, Card, Descriptions, Space, Tag, Typography } from 'antd'

import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import { AlignmentPointPicker } from './AlignmentPointPicker'
import type { MapAlignment, Point2D, ZoneEditorMode } from '../../types/map-editor'
import { formatNumber } from '../../utils/geometry'

interface AlignmentCardProps {
  alignment: MapAlignment | null
  hasMap: boolean
  mode: ZoneEditorMode
  points: Point2D[]
  isConfirming: boolean
  lastError: string | null
  onStart: () => void
  onCancel: () => void
}

export function AlignmentCard({
  alignment,
  hasMap,
  mode,
  points,
  isConfirming,
  lastError,
  onStart,
  onCancel,
}: AlignmentCardProps) {
  const isAligning = mode === 'aligning'
  const hasActiveAlignment = Boolean(alignment?.alignmentVersion)
  const isBusy = mode !== 'idle'

  return (
    <Card
      title="地图对齐"
      className="workbench-card"
      extra={
        <Space size="small" wrap>
          <Tag color={hasActiveAlignment ? 'success' : 'default'}>
            {hasActiveAlignment ? '已启用' : '原始地图坐标'}
          </Tag>
          {isAligning ? <Tag color="processing">对齐中</Tag> : null}
        </Space>
      }
    >
      <Descriptions column={1} size="small" colon={false}>
        <Descriptions.Item label="对齐后坐标系">
          {alignment?.alignedFrame ?? 'map'}
        </Descriptions.Item>
        <Descriptions.Item label="对齐版本">
          {alignment?.alignmentVersion ?? '--'}
        </Descriptions.Item>
        <Descriptions.Item label="偏航角偏移">
          {formatNumber(alignment?.rotationDeg, 4)}
        </Descriptions.Item>
      </Descriptions>

      {!hasActiveAlignment && !isAligning ? (
        <Typography.Paragraph className="alignment-card-note">
          当前仍在使用原始地图坐标。业务方向对齐属于高级工具，当前地图尚未启用。
        </Typography.Paragraph>
      ) : null}

      {hasActiveAlignment && !isAligning ? (
        <Typography.Paragraph className="alignment-card-note">
          当前地图已经启用方向对齐。如业务方向发生变化，可以随时重新执行一次对齐。
        </Typography.Paragraph>
      ) : null}

      {isAligning && lastError ? (
        <AppFeedbackBanner
          tone="error"
          title="地图对齐失败"
          description={lastError}
          className="alignment-card-alert"
        />
      ) : null}

      {isAligning ? <AlignmentPointPicker points={points} isSubmitting={isConfirming} /> : null}

      <Space wrap>
        <Button type="primary" onClick={onStart} disabled={!hasMap || isBusy} loading={isConfirming}>
          开始对齐
        </Button>
        {isAligning ? (
          <Button onClick={onCancel} disabled={isConfirming}>
            取消
          </Button>
        ) : null}
      </Space>
    </Card>
  )
}
