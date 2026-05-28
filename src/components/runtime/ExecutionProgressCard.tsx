import { Card, Descriptions, Progress, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { useRuntimeMonitorStore } from '../../stores/runtimeMonitorStore'
import type { RuntimeTopicSnapshot } from '../../types/runtime'
import './ExecutionProgressCard.css'

type JsonRecord = Record<string, unknown>

const UI_TEXT = {
  progressTitle: '执行进度',
  detailsTitle: '执行详情',
  waitingProgressTitle: '等待执行进度',
  waitingDetailsTitle: '等待执行详情',
  waitingDescription: '任务运行后会显示实时数据。',
  runState: '运行状态',
  cleanMode: '清洁模式',
  runId: '运行 ID',
  zoneId: '区域 ID',
  planProfile: '规划档位',
  systemProfile: '系统档位',
  completedDistance: '已完成距离',
  speed: '速度',
  interlock: '门禁',
  interlockReason: '门禁原因',
  errorCode: '错误码',
  errorMessage: '错误信息',
  messageCount: '消息数',
  updatedAt: '更新时间',
} as const

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePercent(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  const percent = value >= 0 && value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, percent))
}

function getProgressPercent(runProgress: JsonRecord | null) {
  if (!runProgress) {
    return null
  }

  const progressPct = normalizePercent(runProgress.progress_pct)

  if (progressPct !== null) {
    return progressPct
  }

  return normalizePercent(runProgress.progress_0_1)
}

function isRunProgressCompleted(runProgress: JsonRecord | null) {
  if (!runProgress) {
    return false
  }

  const progressPercent = getProgressPercent(runProgress)
  const state =
    typeof runProgress.state === 'string' ? runProgress.state.trim().toUpperCase() : ''

  return (
    (progressPercent !== null && progressPercent >= 99.5) ||
    ['DONE', 'FINISHED', 'COMPLETE', 'COMPLETED', 'SUCCEEDED', 'SUCCESS'].some((token) =>
      state.includes(token),
    )
  )
}

function getVisibleProgressPercent(runProgress: JsonRecord | null) {
  if (isRunProgressCompleted(runProgress)) {
    return 0
  }

  return getProgressPercent(runProgress)
}

function getProgressStatus(runProgress: JsonRecord | null) {
  if (isRunProgressCompleted(runProgress)) {
    return 'normal' as const
  }

  const errorCode =
    runProgress && typeof runProgress.error_code === 'string'
      ? runProgress.error_code.trim()
      : ''
  const errorMessage =
    runProgress && typeof runProgress.error_msg === 'string'
      ? runProgress.error_msg.trim()
      : ''
  const interlockActive = runProgress?.interlock_active === true

  if (errorCode || errorMessage || interlockActive) {
    return 'exception' as const
  }

  return 'active' as const
}

function formatRosStamp(value: unknown) {
  if (!isRecord(value)) {
    return '--'
  }

  const secs = typeof value.secs === 'number' ? value.secs : null
  const nsecs = typeof value.nsecs === 'number' ? value.nsecs : 0

  if (secs === null) {
    return '--'
  }

  return new Date(secs * 1000 + Math.floor(nsecs / 1_000_000)).toLocaleString(
    'zh-CN',
    {
      hour12: false,
    },
  )
}

function formatNumber(value: unknown, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '--'
}

function formatBool(value: unknown) {
  if (typeof value !== 'boolean') {
    return '--'
  }

  return value ? '是' : '否'
}

function getTextField(value: JsonRecord, key: string) {
  const fieldValue = value[key]
  return typeof fieldValue === 'string' && fieldValue.trim() ? fieldValue : '--'
}

function getRunProgress(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

interface ExecutionProgressCardProps {
  className?: string
  topic?: RuntimeTopicSnapshot
  variant?: 'line' | 'circle'
}

export function ExecutionProgressCard({
  className,
  topic,
  variant = 'line',
}: ExecutionProgressCardProps) {
  const storedTopic = useRuntimeMonitorStore((state) => state.topicMap.runProgress)
  const runProgressTopic = topic ?? storedTopic
  const runProgress = getRunProgress(runProgressTopic)
  const progressPercent = getVisibleProgressPercent(runProgress)
  const cardClassName = [
    'execution-progress-card',
    variant === 'circle' ? 'execution-progress-card-circle' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (variant === 'circle') {
    const roundedPercent = progressPercent === null ? 0 : Number(progressPercent.toFixed(1))

    return (
      <Card title={UI_TEXT.progressTitle} className={cardClassName}>
        <div className="execution-progress-circle-panel">
          <Progress
            type="circle"
            percent={roundedPercent}
            status={runProgress ? getProgressStatus(runProgress) : 'normal'}
            size={132}
            format={() => (runProgress ? `${Math.round(roundedPercent)}%` : '--')}
          />
          <Typography.Text className="execution-progress-circle-caption">
            {runProgress ? getTextField(runProgress, 'state') : UI_TEXT.waitingProgressTitle}
          </Typography.Text>
        </div>
      </Card>
    )
  }

  return (
    <Card title={UI_TEXT.progressTitle} className={cardClassName}>
      {runProgress ? (
        <div className="execution-progress-panel">
          <Progress
            percent={progressPercent === null ? 0 : Number(progressPercent.toFixed(1))}
            status={getProgressStatus(runProgress)}
          />
        </div>
      ) : (
        <AppEmptyState
          title={UI_TEXT.waitingProgressTitle}
          description={UI_TEXT.waitingDescription}
        />
      )}
    </Card>
  )
}

export function ExecutionProgressInline({ className, topic }: ExecutionProgressCardProps) {
  const storedTopic = useRuntimeMonitorStore((state) => state.topicMap.runProgress)
  const runProgressTopic = topic ?? storedTopic
  const runProgress = getRunProgress(runProgressTopic)
  const progressPercent = getVisibleProgressPercent(runProgress)
  const roundedPercent = progressPercent === null ? 0 : Number(progressPercent.toFixed(1))
  const rootClassName = ['execution-progress-inline', className].filter(Boolean).join(' ')

  return (
    <div className={rootClassName}>
      <Progress
        percent={roundedPercent}
        status={runProgress ? getProgressStatus(runProgress) : 'normal'}
      />
    </div>
  )
}

export function ExecutionProgressDetailsCard({
  className,
  topic,
}: ExecutionProgressCardProps) {
  const storedTopic = useRuntimeMonitorStore((state) => state.topicMap.runProgress)
  const runProgressTopic = topic ?? storedTopic
  const runProgress = getRunProgress(runProgressTopic)
  const cardClassName = ['execution-progress-card', 'execution-progress-details-card', className]
    .filter(Boolean)
    .join(' ')

  return (
    <Card title={UI_TEXT.detailsTitle} className={cardClassName}>
      {runProgress ? (
        <Descriptions column={2} size="small" colon={false}>
          <Descriptions.Item label={UI_TEXT.runState}>
            <Typography.Text data-testid="shared-run-progress-state">
              {getTextField(runProgress, 'state')}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.cleanMode}>
            {getTextField(runProgress, 'mode')}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.runId}>
            {getTextField(runProgress, 'run_id')}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.zoneId}>
            {getTextField(runProgress, 'zone_id')}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.planProfile}>
            {getTextField(runProgress, 'plan_profile')}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.systemProfile}>
            {getTextField(runProgress, 'sys_profile')}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.completedDistance}>
            {formatNumber(runProgress.path_s, 1)} / {formatNumber(runProgress.total_length_m, 1)} m
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.speed}>
            {formatNumber(runProgress.v_mps, 2)} m/s
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.interlock}>
            {formatBool(runProgress.interlock_active)}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.interlockReason}>
            {getTextField(runProgress, 'interlock_reason')}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.errorCode}>
            {getTextField(runProgress, 'error_code')}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.errorMessage}>
            {getTextField(runProgress, 'error_msg')}
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.messageCount}>
            <Typography.Text data-testid="runtime-run-progress-message-count">
              {runProgressTopic.messageCount}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={UI_TEXT.updatedAt}>
            <Typography.Text data-testid="runtime-run-progress-stamp">
              {formatRosStamp(runProgress.stamp)}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      ) : (
        <AppEmptyState
          title={UI_TEXT.waitingDetailsTitle}
          description={UI_TEXT.waitingDescription}
        />
      )}
    </Card>
  )
}
