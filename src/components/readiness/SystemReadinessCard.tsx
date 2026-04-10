import { Alert, Button, Card, Descriptions, Empty, Space, Tag, Typography } from 'antd'
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'

import { useSystemReadiness } from '../../hooks/useSystemReadiness'
import type { RosConnectionSnapshot } from '../../types/ros'
import type { TaskEntity } from '../../types/task'
import type { SystemReadinessCheck } from '../../types/systemReadiness'
import './SystemReadinessCard.css'

function getTopicHealthPresentation(health: string) {
  switch (health) {
    case 'live':
      return { color: 'green', label: 'Live' }
    case 'stale':
      return { color: 'orange', label: 'Stale' }
    case 'waiting':
      return { color: 'blue', label: 'Waiting' }
    case 'unavailable':
      return { color: 'default', label: 'Unavailable' }
    default:
      return { color: 'red', label: 'Disconnected' }
  }
}

function getBooleanTag(value: boolean, trueLabel: string, falseLabel: string) {
  return <Tag color={value ? 'green' : 'red'}>{value ? trueLabel : falseLabel}</Tag>
}

function getLevelTag(level: string) {
  const normalized = level.trim().toLowerCase()

  if (['ok', 'pass', 'ready', 'healthy'].includes(normalized)) {
    return <Tag color="green">{level || 'ok'}</Tag>
  }

  if (['warn', 'warning', 'degraded'].includes(normalized)) {
    return <Tag color="orange">{level || 'warning'}</Tag>
  }

  if (['error', 'fatal', 'blocking', 'blocker'].includes(normalized)) {
    return <Tag color="red">{level || 'error'}</Tag>
  }

  if (['info', 'notice'].includes(normalized)) {
    return <Tag color="blue">{level || 'info'}</Tag>
  }

  return <Tag>{level || '--'}</Tag>
}

function formatAgeS(value: number | null) {
  if (value === null) {
    return '--'
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}s`
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return '--'
  }

  const normalized = value >= 0 && value <= 1 ? value * 100 : value
  return `${normalized.toFixed(0)}%`
}

function formatTimestamp(value: number | null) {
  if (value === null) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function CheckBadges({ check }: { check: SystemReadinessCheck }) {
  return (
    <Space size={6} wrap>
      {getLevelTag(check.level)}
      <Tag color={check.ok ? 'green' : 'red'}>{check.ok ? 'Pass' : 'Fail'}</Tag>
      {check.fresh ? <Tag color="green">Fresh</Tag> : null}
      {check.stale ? <Tag color="orange">Stale</Tag> : null}
      {check.missing ? <Tag color="red">Missing</Tag> : null}
      {check.ageS !== null ? <Tag>{formatAgeS(check.ageS)}</Tag> : null}
    </Space>
  )
}

interface SystemReadinessCardProps {
  snapshot: RosConnectionSnapshot
  taskId: number
  selectedTask?: TaskEntity | null
  title?: string
  compact?: boolean
}

export function SystemReadinessCard({
  snapshot,
  taskId,
  selectedTask = null,
  title = 'Task Readiness',
  compact = false,
}: SystemReadinessCardProps) {
  const { serviceQuery, topicSnapshot, effectiveReadiness, topicMatchesTask } =
    useSystemReadiness(taskId, snapshot)

  const topicPresentation = getTopicHealthPresentation(topicSnapshot.health)
  const selectedTaskLabel = selectedTask
    ? `${selectedTask.id} / ${selectedTask.name}`
    : taskId > 0
      ? String(taskId)
      : 'system-only'

  return (
    <Card
      title={title}
      className="readiness-card"
      extra={
        <Space size="small" wrap>
          <Tag color={topicPresentation.color}>{topicPresentation.label}</Tag>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={serviceQuery.isFetching}
            onClick={() => void serviceQuery.refetch()}
          >
            Refresh
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions column={compact ? 1 : 2} size="small" colon={false}>
          <Descriptions.Item label="selected_task">{selectedTaskLabel}</Descriptions.Item>
          <Descriptions.Item label="topic_messages">{topicSnapshot.messageCount}</Descriptions.Item>
          <Descriptions.Item label="service_status">
            {serviceQuery.isLoading
              ? 'loading'
              : serviceQuery.data
                ? serviceQuery.data.success
                  ? 'success'
                  : 'failed'
                : serviceQuery.error
                  ? 'error'
                  : '--'}
          </Descriptions.Item>
          <Descriptions.Item label="topic_status">{topicPresentation.label}</Descriptions.Item>
          <Descriptions.Item label="topic_scope">
            {topicSnapshot.readiness
              ? `task_id=${topicSnapshot.readiness.taskId}`
              : '--'}
          </Descriptions.Item>
          <Descriptions.Item label="last_updated">
            {formatTimestamp(
              topicMatchesTask && topicSnapshot.readiness
                ? topicSnapshot.readiness.stampMs
                : effectiveReadiness?.stampMs ?? topicSnapshot.lastMessageAt,
            )}
          </Descriptions.Item>
        </Descriptions>

        {serviceQuery.error instanceof Error ? (
          <Alert
            showIcon
            type="warning"
            title="Readiness service call failed"
            description={serviceQuery.error.message}
          />
        ) : null}

        {serviceQuery.data && !serviceQuery.data.success ? (
          <Alert
            showIcon
            type="warning"
            title="Readiness service returned a failure result"
            description={serviceQuery.data.message || 'The backend did not return an extra message.'}
          />
        ) : null}

        {topicSnapshot.health === 'disconnected' ? (
          <Alert
            showIcon
            type="error"
            title="ROS is disconnected"
            description="Reconnect rosbridge before checking live readiness and triggering service-based checks."
          />
        ) : null}

        {topicSnapshot.health === 'waiting' ? (
          <Alert
            showIcon
            type="info"
            title="Waiting for live readiness feedback"
            description="The frontend is subscribed to /coverage_task_manager/system_readiness and is waiting for the first runtime message."
          />
        ) : null}

        {topicSnapshot.health === 'unavailable' ? (
          <Alert
            showIcon
            type="info"
            title="Runtime readiness topic is unavailable"
            description={
              topicSnapshot.metaError ||
              'rosapi did not report an active readiness publisher, so the page is showing the service result as a fallback.'
            }
          />
        ) : null}

        {topicSnapshot.health === 'stale' ? (
          <Alert
            showIcon
            type="warning"
            title="Runtime readiness feedback is stale"
            description="The latest readiness topic update is older than expected, so the card is showing the most recent snapshot."
          />
        ) : null}

        {topicSnapshot.readiness && !topicMatchesTask && taskId > 0 ? (
          <Alert
            showIcon
            type="info"
            title="Runtime readiness feedback is for a different task"
            description={`The live topic is currently publishing task_id=${topicSnapshot.readiness.taskId}, so this card keeps the service result for task_id=${taskId}.`}
          />
        ) : null}

        {effectiveReadiness ? (
          <>
            <Descriptions column={compact ? 1 : 2} size="small" colon={false}>
              <Descriptions.Item label="overall_ready">
                {getBooleanTag(effectiveReadiness.overallReady, 'Ready', 'Not Ready')}
              </Descriptions.Item>
              <Descriptions.Item label="can_start_task">
                {getBooleanTag(effectiveReadiness.canStartTask, 'Allowed', 'Blocked')}
              </Descriptions.Item>
              <Descriptions.Item label="task_name">
                {effectiveReadiness.taskName || selectedTask?.name || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="task_map">
                {effectiveReadiness.taskMapName || selectedTask?.mapName || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="task_zone">
                {effectiveReadiness.taskZoneId || selectedTask?.zoneId || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="task_plan_profile">
                {effectiveReadiness.taskPlanProfile ||
                  selectedTask?.planProfileName ||
                  '--'}
              </Descriptions.Item>
              <Descriptions.Item label="active_map">
                {effectiveReadiness.activeMapName || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="runtime_map">
                {effectiveReadiness.runtimeMapName || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="mission_state">
                {effectiveReadiness.missionState || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="executor_state">
                {effectiveReadiness.executorState || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="phase">
                {effectiveReadiness.phase || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="public_state">
                {effectiveReadiness.publicState || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="dock_supply_state">
                {effectiveReadiness.dockSupplyState || '--'}
              </Descriptions.Item>
              <Descriptions.Item label="battery_soc">
                {formatPercent(effectiveReadiness.batterySoc)}
              </Descriptions.Item>
              <Descriptions.Item label="battery_valid">
                {effectiveReadiness.batteryValid === null
                  ? '--'
                  : effectiveReadiness.batteryValid
                    ? 'true'
                    : 'false'}
              </Descriptions.Item>
              <Descriptions.Item label="readiness_stamp">
                {formatTimestamp(effectiveReadiness.stampMs)}
              </Descriptions.Item>
            </Descriptions>

            {!effectiveReadiness.canStartTask ? (
              <Alert
                showIcon
                type="error"
                title="Safety start conditions are not satisfied"
                description={
                  effectiveReadiness.blockingReasons.length > 0
                    ? effectiveReadiness.blockingReasons.join(' | ')
                    : 'The backend returned can_start_task=false without extra blocking details.'
                }
              />
            ) : (
              <Alert
                showIcon
                type="success"
                title="Pre-start check passed"
                description="The backend currently returns can_start_task=true. The page will still show the raw execution result when a start command is actually submitted."
              />
            )}

            {effectiveReadiness.warnings.length > 0 ? (
              <Alert
                showIcon
                type="warning"
                title="Warnings"
                description={effectiveReadiness.warnings.join(' | ')}
              />
            ) : null}

            <Card
              size="small"
              className="readiness-inner-card"
              title={
                <Space>
                  <SafetyCertificateOutlined />
                  <span>Checks</span>
                </Space>
              }
            >
              {effectiveReadiness.checks.length > 0 ? (
                <div className="readiness-check-list">
                  {effectiveReadiness.checks.map((check, index) => (
                    <div
                      key={`${check.key || 'check'}-${index}`}
                      className="readiness-check-row"
                    >
                      <div className="readiness-check-main">
                        <Typography.Text strong>{check.key || '--'}</Typography.Text>
                        <Typography.Text type="secondary">
                          {check.summary || '--'}
                        </Typography.Text>
                      </div>
                      <div className="readiness-check-side">
                        <CheckBadges check={check} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="The backend did not return any checks[] details."
                />
              )}
            </Card>
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No readiness snapshot is available yet."
          />
        )}

        {!compact && serviceQuery.data?.message ? (
          <Typography.Paragraph className="readiness-footnote">
            Raw service message: {serviceQuery.data.message}
          </Typography.Paragraph>
        ) : null}
      </Space>
    </Card>
  )
}
