import { Card, Descriptions, Progress, Space, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import { AppLoadingState } from '../feedback/AppLoadingState'
import type { SlamSubmittedJobSnapshot } from '../../hooks/useSlamJobRunner'
import type { SlamWorkflowJob } from '../../types/slam-workflow'
import {
  getSlamActionLabel,
  getSlamJobHeadline,
  getSlamJobProgressLabel,
  getSlamJobProgressPercent,
  getSlamJobResultDetail,
  getSlamJobSummary,
  getSlamPhaseLabel,
} from '../../utils/slam'

type SlamJobCardProps = {
  job: SlamWorkflowJob | null
  loading: boolean
  error: string | null
  lastSubmittedJob: SlamSubmittedJobSnapshot | null
}

function getResultTone(job: SlamWorkflowJob) {
  if (job.done && job.success === true) {
    return 'success' as const
  }

  if (job.done && job.success === false) {
    return 'error' as const
  }

  return 'info' as const
}

export function SlamJobCard({
  job,
  loading,
  error,
  lastSubmittedJob,
}: SlamJobCardProps) {
  const progressPercent = getSlamJobProgressPercent(job)
  const progressLabel = getSlamJobProgressLabel(job)
  const requestedOrResolvedMap = job?.resolvedMapName || job?.requestedMapName || '--'
  const resultDetail = getSlamJobResultDetail(job)

  return (
    <Card title="当前作业" className="slam-card">
      {error ? (
        <AppFeedbackBanner
          tone="warning"
          title="作业查询失败"
          description={error}
          className="slam-inline-alert"
        />
      ) : null}

      {!job && lastSubmittedJob ? (
        <AppFeedbackBanner
          tone="info"
          title={`${lastSubmittedJob.actionLabel}已提交`}
          description={[
            lastSubmittedJob.message || '等待作业状态回传。',
          ].join(' | ')}
          className="slam-inline-alert"
        />
      ) : null}

      {job ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <AppFeedbackBanner
            tone={getResultTone(job)}
            title={getSlamJobHeadline(job)}
            description={resultDetail}
            className="slam-inline-alert"
          />

          <div className="slam-job-summary-grid">
            <div className="slam-job-summary-item">
              <Typography.Text className="slam-status-metric-label">当前动作</Typography.Text>
              <Typography.Text strong>{getSlamActionLabel(job.operationName)}</Typography.Text>
            </div>
            <div className="slam-job-summary-item">
              <Typography.Text className="slam-status-metric-label">当前阶段</Typography.Text>
              <Typography.Text strong>{getSlamPhaseLabel(job.phase)}</Typography.Text>
            </div>
            <div className="slam-job-summary-item">
              <Typography.Text className="slam-status-metric-label">当前进度</Typography.Text>
              <Typography.Text strong>{progressLabel}</Typography.Text>
            </div>
          </div>

          <Typography.Paragraph className="slam-card-copy">
            {getSlamJobSummary(job)}
          </Typography.Paragraph>

          <Progress
            percent={progressPercent ?? 0}
            status={job.done && job.success === false ? 'exception' : undefined}
            success={{ percent: job.done && job.success === true ? 100 : 0 }}
            showInfo
          />

          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="运行模式">{job.currentMode || '--'}</Descriptions.Item>
            <Descriptions.Item label="定位状态">{job.localizationState || '--'}</Descriptions.Item>
            <Descriptions.Item label="目标地图">{requestedOrResolvedMap}</Descriptions.Item>
            <Descriptions.Item label="设为活动地图">
              {job.setActive === null ? '--' : job.setActive ? '是' : '否'}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      ) : loading ? (
        <AppLoadingState message="正在加载作业状态…" className="slam-loading" />
      ) : (
        <AppEmptyState
          title="暂无活跃作业"
          description=""
        />
      )}
    </Card>
  )
}
