import { Space, Tag, Typography } from 'antd'

import type { Point2D } from '../../types/map-editor'

interface AlignmentPointPickerProps {
  points: Point2D[]
  isSubmitting: boolean
}

function formatPoint(point: Point2D) {
  return `${point.x.toFixed(2)}, ${point.y.toFixed(2)}`
}

export function AlignmentPointPicker({
  points,
  isSubmitting,
}: AlignmentPointPickerProps) {
  const nextStepLabel = isSubmitting
    ? '正在把两点对齐请求提交给后端...'
    : points.length === 0
      ? '请先在画布上点击第一个参考点，用来定义方向对齐。'
      : '请再点击第二个参考点，完成本次方向对齐。'

  return (
    <div className="alignment-picker">
      <Typography.Text strong>两点对齐</Typography.Text>
      <Typography.Paragraph className="alignment-picker-copy">
        {nextStepLabel}
      </Typography.Paragraph>
      <Space wrap size={[8, 8]}>
        <Tag color={points[0] ? 'success' : 'default'}>
          点 1 {points[0] ? formatPoint(points[0]) : '待选择'}
        </Tag>
        <Tag color={points[1] ? 'success' : 'default'}>
          点 2 {points[1] ? formatPoint(points[1]) : '待选择'}
        </Tag>
      </Space>
    </div>
  )
}
