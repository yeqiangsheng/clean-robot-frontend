import { Progress, Space, Tag, Typography } from 'antd'

import type { ActuatorStatus } from '../../types/actuator'
import {
  formatPercent,
  getCommandStateTag,
  normalizePercent,
} from '../../utils/actuatorControlPage'

export function MetricProgress({
  label,
  value,
  color,
}: {
  label: string
  value: number | null
  color: string
}) {
  const percent = normalizePercent(value)

  return (
    <div className="actuator-progress-row">
      <div className="actuator-progress-head">
        <Typography.Text strong>{label}</Typography.Text>
        <Typography.Text type="secondary">{formatPercent(value)}</Typography.Text>
      </div>
      {percent === null ? (
        <Typography.Text type="secondary">状态未知</Typography.Text>
      ) : (
        <Progress
          percent={Math.max(0, Math.min(100, percent))}
          strokeColor={color}
          showInfo={false}
        />
      )}
    </div>
  )
}

export function CommandStateLine({ status }: { status: ActuatorStatus | null }) {
  const lastCommand = status?.lastCommand ?? null
  const isInternalNoop = lastCommand?.kind === '__noop'
  const commandState = getCommandStateTag(isInternalNoop ? 'idle' : lastCommand?.state)
  const commandKind = isInternalNoop ? '' : lastCommand?.kind
  const commandMessage =
    isInternalNoop && lastCommand?.message.includes('Unsupported actuator command: __noop')
      ? ''
      : lastCommand?.message

  return (
    <Space size="small" wrap>
      <Tag color={commandState.color}>{commandState.label}</Tag>
      {commandKind ? (
        <Typography.Text type="secondary">
          {commandKind}
        </Typography.Text>
      ) : null}
      {commandMessage ? (
        <Typography.Text type="danger">{commandMessage}</Typography.Text>
      ) : null}
    </Space>
  )
}
