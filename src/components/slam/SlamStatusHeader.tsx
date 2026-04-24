import { Card, Space, Tag, Typography } from 'antd'

import type { RosConnectionSnapshot } from '../../types/ros'
import type { SlamPageMode } from '../../utils/slam'
import type { SlamWorkflowState } from '../../types/slam-workflow'
import {
  formatPercent,
  getLocalizationTag,
  getMapFreshnessTag,
  getSlamConnectionTag,
  getSlamPageModeTag,
  getTaskReadyTag,
  getWorkflowStateTag,
} from '../../utils/slam'

type SlamStatusHeaderProps = {
  snapshot: RosConnectionSnapshot
  state: SlamWorkflowState | null
  canStartTask: boolean | null
  odomValid: boolean | null
  pageMode: SlamPageMode
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
  canStartTask,
  odomValid,
  pageMode,
}: SlamStatusHeaderProps) {
  const connectionTag = getSlamConnectionTag(snapshot.status)
  const workflowTag = getWorkflowStateTag(state)
  const localizationTag = getLocalizationTag(state)
  const readinessTag = getTaskReadyTag(canStartTask)
  const mapTag = getMapFreshnessTag(state)
  const pageModeTag = getSlamPageModeTag(pageMode)
  const odomTag =
    odomValid === null
      ? { color: 'default', label: '里程计未检查' }
      : odomValid
        ? { color: 'success', label: '里程计正常' }
        : { color: 'error', label: '里程计异常' }

  return (
    <Card className="slam-card slam-status-hero">
      <div className="slam-status-hero-top">
        <div>
          <Typography.Title level={4}>SLAM 工作台</Typography.Title>
          <Typography.Paragraph className="slam-card-copy">
            状态来自 `/clean_robot_server/slam_state`，作业来自
            `/clean_robot_server/slam_job_state` 与 `/clean_robot_server/app/get_slam_job`，
            长动作统一提交到 `/clean_robot_server/app/submit_slam_command`，实时地图继续订阅
            `/map`。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
          <Tag color={workflowTag.color}>{workflowTag.label}</Tag>
          <Tag color={localizationTag.color}>{localizationTag.label}</Tag>
          <Tag color={readinessTag.color}>{readinessTag.label}</Tag>
          <Tag color={odomTag.color}>{odomTag.label}</Tag>
          <Tag color={mapTag.color}>{mapTag.label}</Tag>
          <Tag color={pageModeTag.color}>{pageModeTag.label}</Tag>
        </Space>
      </div>

      <div className="slam-status-metrics">
        <StatusMetric label="活动地图" value={state?.activeMapName || '--'} />
        <StatusMetric label="运行时地图" value={state?.runtimeMapName || '--'} />
        <StatusMetric label="当前模式" value={state?.currentMode || '--'} />
        <StatusMetric label="定位状态" value={state?.localizationState || '--'} />
        <StatusMetric label="活动作业 ID" value={state?.activeJobId || '--'} />
        <StatusMetric label="作业阶段" value={state?.activeJobPhase || '--'} />
        <StatusMetric
          label="作业进度"
          value={formatPercent(state?.activeJobProgress01 ?? null)}
        />
        <StatusMetric
          label="地图时效"
          value={
            state?.mapAgeS === null || state?.mapAgeS === undefined
              ? '--'
              : `${state.mapAgeS.toFixed(state.mapAgeS >= 10 ? 0 : 1)} s`
          }
        />
        <StatusMetric label="执行器状态" value={state?.executorState || '--'} />
      </div>
    </Card>
  )
}
