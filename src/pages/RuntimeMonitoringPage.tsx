import { useMemo } from 'react'
import type { ReactNode } from 'react'

import {
  Alert,
  Card,
  Descriptions,
  Empty,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  ApiOutlined,
  DeploymentUnitOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { SystemReadinessCard } from '../components/readiness/SystemReadinessCard'
import { LiveCommandContextCard } from '../components/runtime/LiveCommandContextCard'
import { useRosConnection } from '../hooks/useRosConnection'
import { useExecutionSessionStore } from '../stores/executionSessionStore'
import { useRuntimeMonitorStore } from '../stores/runtimeMonitorStore'
import type { RuntimeTopicHealth, RuntimeTopicSnapshot } from '../types/runtime'
import './RuntimeMonitoringPage.css'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: 'Connected' }
    case 'connecting':
      return { color: 'processing', label: 'Connecting' }
    case 'error':
      return { color: 'error', label: 'Error' }
    case 'mock':
      return { color: 'purple', label: 'Mock Data' }
    case 'closed':
      return { color: 'warning', label: 'Closed' }
    default:
      return { color: 'default', label: 'Idle' }
  }
}

function getHealthPresentation(health: RuntimeTopicHealth) {
  switch (health) {
    case 'live':
      return { color: 'green', label: 'live' }
    case 'stale':
      return { color: 'orange', label: 'stale' }
    case 'waiting':
      return { color: 'blue', label: 'waiting' }
    case 'unavailable':
      return { color: 'default', label: 'unavailable' }
    default:
      return { color: 'red', label: 'disconnected' }
  }
}

function formatAge(ageMs: number | null) {
  if (ageMs === null) {
    return '--'
  }

  if (ageMs < 1000) {
    return `${ageMs} ms ago`
  }

  return `${(ageMs / 1000).toFixed(1)} s ago`
}

function formatLocalTimestamp(value: number | null) {
  if (value === null) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false })
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

function formatPercent(value: unknown, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }

  const normalized = value >= 0 && value <= 1 ? value * 100 : value
  return `${normalized.toFixed(digits)}%`
}

function formatInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(Math.round(value))
    : '--'
}

function formatBool(value: unknown) {
  return typeof value === 'boolean' ? (value ? 'true' : 'false') : '--'
}

function formatArray(value: unknown) {
  return Array.isArray(value) ? value.join(', ') : '--'
}

function getStringTopicValue(topic: RuntimeTopicSnapshot) {
  if (!isRecord(topic.rawMessage)) {
    return null
  }

  return typeof topic.rawMessage.data === 'string' ? topic.rawMessage.data : null
}

function getRunProgress(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

function getBatteryState(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

function getCombinedStatus(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

function TopicStatusTag({ topic }: { topic: RuntimeTopicSnapshot }) {
  const presentation = getHealthPresentation(topic.health)

  return <Tag color={presentation.color}>{presentation.label}</Tag>
}

function TopicStateNote({
  topic,
  emptyMessage,
}: {
  topic: RuntimeTopicSnapshot
  emptyMessage: string
}) {
  if (topic.health === 'disconnected') {
    return (
      <Alert
        showIcon
        type="error"
        title="rosbridge is disconnected"
        description="Reconnect the frontend to resume live runtime subscriptions."
      />
    )
  }

  if (topic.health === 'unavailable') {
    return (
      <Alert
        showIcon
        type="warning"
        title="Topic unavailable"
        description={
          topic.messageType
            ? 'The topic has no active publisher on the live backend right now.'
            : 'rosapi did not return a live topic type for this topic.'
        }
      />
    )
  }

  if (topic.health === 'waiting') {
    return (
      <Alert
        showIcon
        type="info"
        title="Waiting for first message"
        description={emptyMessage}
      />
    )
  }

  if (topic.health === 'stale') {
    return (
      <Alert
        showIcon
        type="warning"
        title="Topic data is stale"
        description="The frontend is still subscribed, but the last message is older than the expected cadence."
      />
    )
  }

  return null
}

function TopicMetaSummary({
  topic,
  extraRows,
}: {
  topic: RuntimeTopicSnapshot
  extraRows?: ReactNode
}) {
  return (
    <Descriptions column={2} size="small" colon={false}>
      <Descriptions.Item label="topic">{topic.topicName}</Descriptions.Item>
      <Descriptions.Item label="type">{topic.messageType || '--'}</Descriptions.Item>
      <Descriptions.Item label="publishers">{topic.publishers.length}</Descriptions.Item>
      <Descriptions.Item label="subscribers">{topic.subscribers.length}</Descriptions.Item>
      <Descriptions.Item label="message_count">{topic.messageCount}</Descriptions.Item>
      <Descriptions.Item label="last_update">
        {formatLocalTimestamp(topic.lastMessageAt)}
      </Descriptions.Item>
      <Descriptions.Item label="age">{formatAge(topic.ageMs)}</Descriptions.Item>
      <Descriptions.Item label="subscription">
        {topic.subscribeError || topic.metaError || '--'}
      </Descriptions.Item>
      {extraRows}
    </Descriptions>
  )
}

export function RuntimeMonitoringPage() {
  const { snapshot, defaultUrl, quickUrls, connect } = useRosConnection()
  const focusedTaskId = useExecutionSessionStore((state) => state.focusedTaskId)
  const metaError = useRuntimeMonitorStore((state) => state.metaError)
  const topicList = useRuntimeMonitorStore((state) => state.topicList)
  const topicMap = useRuntimeMonitorStore((state) => state.topicMap)

  const connectionTag = getConnectionTag(snapshot.status)
  const liveCount = useMemo(
    () => topicList.filter((topic) => topic.health === 'live').length,
    [topicList],
  )
  const handleReconnect = async (url?: string) => {
    await connect((url ?? snapshot.url) || defaultUrl)
  }

  const taskStateTopic = topicMap.taskState
  const taskEventTopic = topicMap.taskEvent
  const executorStateTopic = topicMap.executorState
  const runProgressTopic = topicMap.runProgress
  const batteryStateTopic = topicMap.batteryState
  const combinedStatusTopic = topicMap.combinedStatus
  const dockSupplyTopic = topicMap.dockSupplyState
  const stationStatusTopic = topicMap.stationStatus

  const taskStateValue = getStringTopicValue(taskStateTopic)
  const taskEventValue = getStringTopicValue(taskEventTopic)
  const executorStateValue = getStringTopicValue(executorStateTopic)
  const dockSupplyValue = getStringTopicValue(dockSupplyTopic)
  const stationStatusValue = getStringTopicValue(stationStatusTopic)
  const runProgress = getRunProgress(runProgressTopic)
  const batteryState = getBatteryState(batteryStateTopic)
  const combinedStatus = getCombinedStatus(combinedStatusTopic)

  return (
    <div className="runtime-page" data-testid="runtime-page">
      <header className="runtime-page-header">
        <div>
          <Typography.Title level={2}>运行监控</Typography.Title>
          <Typography.Paragraph>
            面向现场值守的实时监控页，聚焦任务状态、执行器状态、进度、电池、底盘综合状态与补给/充电站反馈。页面优先展示 live topic 回报，不再使用里程碑阶段口径。
          </Typography.Paragraph>
        </div>
        <Space size="middle" wrap>
          <Tag color="gold">实时监控</Tag>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          <Tag color="geekblue">{liveCount} 个 live topic</Tag>
          <RosbridgeEndpointControl
            snapshot={snapshot}
            defaultUrl={defaultUrl}
            quickUrls={quickUrls}
            onConnect={handleReconnect}
          />
        </Space>
      </header>

      {snapshot.status === 'error' && snapshot.lastError ? (
        <Alert
          showIcon
          type="error"
          title="rosbridge 连接失败"
          description={snapshot.lastError}
          className="runtime-banner"
        />
      ) : null}

      {snapshot.status === 'mock' ? (
        <Alert
          showIcon
          type="info"
          title="The page is using local mock data"
          description="Set VITE_USE_MOCK_DATA=false in .env.development to connect to the live backend."
          className="runtime-banner"
        />
      ) : null}

      {metaError ? (
        <Alert
          showIcon
          type="warning"
          title="Some runtime topic metadata failed to load"
          description={metaError}
          className="runtime-banner"
        />
      ) : null}

      <div className="runtime-grid">
        <aside className="runtime-column">
          <LiveCommandContextCard title="Command Flow Context" />
          <SystemReadinessCard
            snapshot={snapshot}
            taskId={focusedTaskId ?? 0}
            compact
            title="System Readiness"
          />

          <Card
            title="Task State"
            className="runtime-card"
            extra={<TopicStatusTag topic={taskStateTopic} />}
          >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="manager_state">
                  <Typography.Text data-testid="runtime-task-state-value">
                    {taskStateValue || '--'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="latest_event">
                  {taskEventValue || '--'}
                </Descriptions.Item>
              </Descriptions>

              <TopicStateNote
                topic={taskStateTopic}
                emptyMessage="The frontend is subscribed and waiting for the task manager to publish its current state."
              />

              {!taskEventValue && taskEventTopic.health !== 'live' ? (
                <TopicStateNote
                  topic={taskEventTopic}
                  emptyMessage="No task-manager event has been published during this frontend session yet."
                />
              ) : null}

              <TopicMetaSummary
                topic={taskStateTopic}
                extraRows={
                  <>
                    <Descriptions.Item label="event_topic" span={2}>
                      {taskEventTopic.topicName}
                    </Descriptions.Item>
                    <Descriptions.Item label="event_status">
                      {getHealthPresentation(taskEventTopic.health).label}
                    </Descriptions.Item>
                    <Descriptions.Item label="event_messages">
                      {taskEventTopic.messageCount}
                    </Descriptions.Item>
                  </>
                }
              />
            </Space>
          </Card>

          <Card
            title="Executor State"
            className="runtime-card"
            extra={<TopicStatusTag topic={executorStateTopic} />}
          >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="executor_state">
                  <Typography.Text data-testid="runtime-executor-state-value">
                    {executorStateValue || '--'}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>

              <TopicStateNote
                topic={executorStateTopic}
                emptyMessage="The frontend is subscribed and waiting for the executor state topic."
              />

              <TopicMetaSummary topic={executorStateTopic} />
            </Space>
          </Card>
        </aside>

        <main className="runtime-column">
          <Card
            title="Run Progress"
            className="runtime-card"
            extra={<TopicStatusTag topic={runProgressTopic} />}
          >
            {runProgress ? (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Descriptions column={2} size="small" colon={false}>
                  <Descriptions.Item label="run_id">
                    {typeof runProgress.run_id === 'string' ? runProgress.run_id : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="zone_id">
                    {typeof runProgress.zone_id === 'string' ? runProgress.zone_id : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="plan_id">
                    {typeof runProgress.plan_id === 'string' ? runProgress.plan_id : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="state">
                    {typeof runProgress.state === 'string' ? runProgress.state : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="mode">
                    {typeof runProgress.mode === 'string' ? runProgress.mode : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="plan_profile">
                    {typeof runProgress.plan_profile === 'string'
                      ? runProgress.plan_profile
                      : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="sys_profile">
                    {typeof runProgress.sys_profile === 'string'
                      ? runProgress.sys_profile
                      : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="interlock_active">
                    {formatBool(runProgress.interlock_active)}
                  </Descriptions.Item>
                  <Descriptions.Item label="interlock_reason">
                    {typeof runProgress.interlock_reason === 'string'
                      ? runProgress.interlock_reason || '--'
                      : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="message_count">
                    <Typography.Text data-testid="runtime-run-progress-message-count">
                      {runProgressTopic.messageCount}
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="progress_pct">
                    {formatNumber(runProgress.progress_pct, 1)}
                  </Descriptions.Item>
                  <Descriptions.Item label="progress_0_1">
                    {formatNumber(runProgress.progress_0_1, 3)}
                  </Descriptions.Item>
                  <Descriptions.Item label="exec_index">
                    {formatInteger(runProgress.exec_index)}
                  </Descriptions.Item>
                  <Descriptions.Item label="path_index">
                    {formatInteger(runProgress.path_index)}
                  </Descriptions.Item>
                  <Descriptions.Item label="path_s">
                    {formatNumber(runProgress.path_s, 2)}
                  </Descriptions.Item>
                  <Descriptions.Item label="block_id">
                    {formatInteger(runProgress.block_id)}
                  </Descriptions.Item>
                  <Descriptions.Item label="block_length_m">
                    {formatNumber(runProgress.block_length_m, 2)}
                  </Descriptions.Item>
                  <Descriptions.Item label="total_length_m">
                    {formatNumber(runProgress.total_length_m, 2)}
                  </Descriptions.Item>
                  <Descriptions.Item label="v_mps">
                    {formatNumber(runProgress.v_mps, 3)}
                  </Descriptions.Item>
                  <Descriptions.Item label="w_rps">
                    {formatNumber(runProgress.w_rps, 3)}
                  </Descriptions.Item>
                  <Descriptions.Item label="error_code">
                    {typeof runProgress.error_code === 'string'
                      ? runProgress.error_code || '--'
                      : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="error_msg">
                    {typeof runProgress.error_msg === 'string'
                      ? runProgress.error_msg || '--'
                      : '--'}
                  </Descriptions.Item>
                  <Descriptions.Item label="stamp" span={2}>
                    <Typography.Text data-testid="runtime-run-progress-stamp">
                      {formatRosStamp(runProgress.stamp)}
                    </Typography.Text>
                  </Descriptions.Item>
                </Descriptions>

                <TopicMetaSummary topic={runProgressTopic} />
              </Space>
            ) : (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <TopicStateNote
                  topic={runProgressTopic}
                  emptyMessage="The frontend is subscribed and waiting for `/coverage_executor/run_progress`."
                />
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Run progress fields will appear here after the first live message."
                />
              </Space>
            )}
          </Card>

          <Card
            title="Topic Health"
            className="runtime-card"
            extra={<ApiOutlined />}
          >
            <div className="runtime-topic-list">
              {topicList.map((topic) => (
                <div key={topic.topicName} className="runtime-topic-row">
                  <div className="runtime-topic-main">
                    <Typography.Text strong>{topic.label}</Typography.Text>
                    <Typography.Text type="secondary">
                      {topic.topicName}
                    </Typography.Text>
                  </div>
                  <div className="runtime-topic-side">
                    <TopicStatusTag topic={topic} />
                    <Typography.Text type="secondary">
                      {topic.messageCount} msgs
                    </Typography.Text>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </main>

        <aside className="runtime-column">
          <Card
            title="Battery / Robot Status"
            className="runtime-card"
            extra={<ThunderboltOutlined />}
          >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Card
                size="small"
                className="runtime-inner-card"
                title={
                  <Space>
                    <span>Battery State</span>
                    <TopicStatusTag topic={batteryStateTopic} />
                  </Space>
                }
              >
                {batteryState ? (
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="percentage">
                      {formatPercent(batteryState.percentage)}
                    </Descriptions.Item>
                    <Descriptions.Item label="voltage">
                      {formatNumber(batteryState.voltage, 2)}
                    </Descriptions.Item>
                    <Descriptions.Item label="current">
                      {formatNumber(batteryState.current, 2)}
                    </Descriptions.Item>
                    <Descriptions.Item label="temperature">
                      {formatNumber(batteryState.temperature, 1)}
                    </Descriptions.Item>
                    <Descriptions.Item label="present">
                      {formatBool(batteryState.present)}
                    </Descriptions.Item>
                    <Descriptions.Item label="status_code">
                      {formatInteger(batteryState.power_supply_status)}
                    </Descriptions.Item>
                    <Descriptions.Item label="health_code">
                      {formatInteger(batteryState.power_supply_health)}
                    </Descriptions.Item>
                    <Descriptions.Item label="location">
                      {typeof batteryState.location === 'string'
                        ? batteryState.location || '--'
                        : '--'}
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <TopicStateNote
                    topic={batteryStateTopic}
                    emptyMessage="The frontend is subscribed and waiting for `/battery_state`."
                  />
                )}
              </Card>

              <Card
                size="small"
                className="runtime-inner-card"
                title={
                  <Space>
                    <span>Combined Status</span>
                    <TopicStatusTag topic={combinedStatusTopic} />
                  </Space>
                }
              >
                {combinedStatus ? (
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="battery_percentage">
                      {formatInteger(combinedStatus.battery_percentage)}
                    </Descriptions.Item>
                    <Descriptions.Item label="battery_voltage">
                      {formatInteger(combinedStatus.battery_voltage)}
                    </Descriptions.Item>
                    <Descriptions.Item label="sewage_level">
                      {formatInteger(combinedStatus.sewage_level)}
                    </Descriptions.Item>
                    <Descriptions.Item label="clean_level">
                      {formatInteger(combinedStatus.clean_level)}
                    </Descriptions.Item>
                    <Descriptions.Item label="brush_position">
                      {formatInteger(combinedStatus.brush_position)}
                    </Descriptions.Item>
                    <Descriptions.Item label="scraper_position">
                      {formatInteger(combinedStatus.scraper_position)}
                    </Descriptions.Item>
                    <Descriptions.Item label="obstacle_status">
                      {formatArray(combinedStatus.obstacle_status)}
                    </Descriptions.Item>
                    <Descriptions.Item label="region">
                      {formatArray(combinedStatus.region)}
                    </Descriptions.Item>
                    <Descriptions.Item label="status">
                      {formatArray(combinedStatus.status)}
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <TopicStateNote
                    topic={combinedStatusTopic}
                    emptyMessage="The frontend is subscribed and waiting for `/combined_status`."
                  />
                )}
              </Card>
            </Space>
          </Card>

          <Card
            title="Dock / Supply Status"
            className="runtime-card"
            extra={<DeploymentUnitOutlined />}
          >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Card
                size="small"
                className="runtime-inner-card"
                title={
                  <Space>
                    <span>dock_supply/state</span>
                    <TopicStatusTag topic={dockSupplyTopic} />
                  </Space>
                }
              >
                {dockSupplyValue ? (
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="state">
                      {dockSupplyValue}
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <TopicStateNote
                    topic={dockSupplyTopic}
                    emptyMessage="The frontend is subscribed and waiting for `/dock_supply/state`."
                  />
                )}
              </Card>

              <Card
                size="small"
                className="runtime-inner-card"
                title={
                  <Space>
                    <span>station_status</span>
                    <TopicStatusTag topic={stationStatusTopic} />
                  </Space>
                }
              >
                {stationStatusValue ? (
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="state">
                      {stationStatusValue}
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <TopicStateNote
                    topic={stationStatusTopic}
                    emptyMessage="The frontend is subscribed and waiting for `/station_status`."
                  />
                )}
              </Card>
            </Space>
          </Card>
        </aside>
      </div>
    </div>
  )
}

