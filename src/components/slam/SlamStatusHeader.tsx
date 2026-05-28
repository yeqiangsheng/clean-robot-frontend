import { Card, Progress, Typography } from 'antd'

import type { SlamPageMode } from '../../utils/slam'
import type { SlamWorkflowState } from '../../types/slam-workflow'
import {
  formatPercent,
  getLocalizationTag,
  getSlamPageModeTag,
  getWorkflowStateTag,
} from '../../utils/slam'

type SlamStatusHeaderProps = {
  state: SlamWorkflowState | null
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
  state,
  pageMode,
}: SlamStatusHeaderProps) {
  const workflowTag = getWorkflowStateTag(state)
  const localizationTag = getLocalizationTag(state)
  const pageModeTag = getSlamPageModeTag(pageMode)
  const rawProgress = state?.activeJobProgress01 ?? null
  const progressPercent =
    rawProgress === null || !Number.isFinite(rawProgress)
      ? null
      : rawProgress >= 0 && rawProgress <= 1
        ? rawProgress * 100
        : rawProgress

  return (
    <Card className="slam-card slam-status-hero">
      <div className="slam-status-summary">
        <div>
          <Typography.Text className="slam-status-metric-label">当前状态</Typography.Text>
          <Typography.Title level={3}>{pageModeTag.label}</Typography.Title>
          <Typography.Text className="slam-status-subtitle">
            {workflowTag.label} / {localizationTag.label}
          </Typography.Text>
        </div>
        {progressPercent !== null ? (
          <div className="slam-status-progress">
            <Progress percent={progressPercent} showInfo />
          </div>
        ) : null}
      </div>

      <div className="slam-status-metrics">
        <StatusMetric label="活动地图" value={state?.activeMapName || '--'} />
        <StatusMetric label="运行地图" value={state?.runtimeMapName || '--'} />
        <StatusMetric label="定位状态" value={state?.localizationState || '--'} />
        <StatusMetric label="当前模式" value={state?.currentMode || '--'} />
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
