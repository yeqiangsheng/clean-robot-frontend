import { Button, Card, Space, Tag, Typography } from 'antd'
import {
  CheckCircleOutlined,
  CompassOutlined,
  RadarChartOutlined,
} from '@ant-design/icons'

import type { RosConnectionSnapshot } from '../../types/ros'
import type { SlamWorkflowState } from '../../types/slam-workflow'
import {
  getLocalizationTag,
  getManualAssistTag,
  getMappingSessionTag,
  getSlamConnectionTag,
  getTaskReadyTag,
  getTopicHealthPresentation,
  getWorkflowStateTag,
} from '../../utils/slam'

type SlamStatusHeaderProps = {
  snapshot: RosConnectionSnapshot
  state: SlamWorkflowState | null
  topicHealth: 'disconnected' | 'waiting' | 'live' | 'stale' | 'unavailable'
  onSync: () => void
  isSyncing: boolean
  onViewJson: () => void
}

function StatusMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="slam-status-metric">
      <Typography.Text className="slam-status-metric-label">{label}</Typography.Text>
      <Typography.Text strong className="slam-status-metric-value">
        {value || '--'}
      </Typography.Text>
    </div>
  )
}

export function SlamStatusHeader({
  snapshot,
  state,
  topicHealth,
  onSync,
  isSyncing,
  onViewJson,
}: SlamStatusHeaderProps) {
  const connectionTag = getSlamConnectionTag(snapshot.status)
  const workflowTag = getWorkflowStateTag(state)
  const localizationTag = getLocalizationTag(state)
  const taskReadyTag = getTaskReadyTag(state)
  const assistTag = getManualAssistTag(state)
  const mappingTag = getMappingSessionTag(state)
  const topicTag = getTopicHealthPresentation(topicHealth)
  const mapMatchLabel =
    state?.runtimeMapMatch === null
      ? '--'
      : state?.runtimeMapMatch
        ? '匹配'
        : '不匹配'
  const localizationValidLabel =
    state?.localizationValid === null
      ? '--'
      : state?.localizationValid
        ? '是'
        : '否'
  const taskReadyLabel = state === null ? '--' : state.taskReady ? '是' : '否'

  return (
    <Card
      className="slam-card slam-status-hero"
      extra={
        <Space wrap>
          <Button
            size="small"
            icon={<RadarChartOutlined />}
            onClick={onSync}
            loading={isSyncing}
          >
            同步运行态
          </Button>
          <Button size="small" onClick={onViewJson}>
            查看 JSON
          </Button>
        </Space>
      }
    >
      <div className="slam-status-hero-top">
        <div>
          <Typography.Title level={4}>SLAM 状态总览</Typography.Title>
          <Typography.Paragraph className="slam-card-copy">
            这里用来快速判断机器人是否已定位、是否具备任务执行条件，以及是否卡在人工辅助状态。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          <Tag color={workflowTag.color}>{workflowTag.label}</Tag>
          <Tag color={localizationTag.color}>{localizationTag.label}</Tag>
          <Tag color={taskReadyTag.color}>{taskReadyTag.label}</Tag>
          <Tag color={assistTag.color}>{assistTag.label}</Tag>
          <Tag color={mappingTag.color}>{mappingTag.label}</Tag>
          <Tag color={topicTag.color}>话题 {topicTag.label}</Tag>
        </Space>
      </div>

      <div className="slam-status-metrics">
        <StatusMetric label="运行地图" value={state?.runtimeMapName || '--'} />
        <StatusMetric label="运行模式" value={state?.runtimeMode || '--'} />
        <StatusMetric label="工作流阶段" value={state?.workflowPhase || '--'} />
        <StatusMetric label="当前任务 Job" value={state?.activeJobId || '--'} />
        <StatusMetric label="地图匹配" value={mapMatchLabel} />
        <StatusMetric label="阻塞原因" value={state?.blockingReason || '--'} />
      </div>

      <div className="slam-status-pill-row">
        <div className="slam-status-pill">
          <CheckCircleOutlined />
          <span>定位有效: {localizationValidLabel}</span>
        </div>
        <div className="slam-status-pill">
          <CompassOutlined />
          <span>任务就绪: {taskReadyLabel}</span>
        </div>
      </div>
    </Card>
  )
}
