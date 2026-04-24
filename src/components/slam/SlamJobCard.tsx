import { Button, Card, Descriptions, Progress, Space, Tag, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import { AppFeedbackBanner } from '../feedback/AppFeedbackBanner'
import { AppLoadingState } from '../feedback/AppLoadingState'
import type { SlamSubmittedJobSnapshot } from '../../hooks/useSlamJobRunner'
import type { SlamJobTopicSnapshot, SlamWorkflowJob } from '../../types/slam-workflow'
import {
  formatAge,
  formatDateTime,
  getSlamActionLabel,
  getSlamJobHeadline,
  getSlamJobProgressLabel,
  getSlamJobProgressPercent,
  getSlamJobResultDetail,
  getSlamJobStateTag,
  getSlamJobSummary,
  getSlamPhaseLabel,
  getTopicHealthPresentation,
} from '../../utils/slam'

type SlamJobCardProps = {
  job: SlamWorkflowJob | null
  activeJobId: string
  topicSnapshot: SlamJobTopicSnapshot
  loading: boolean
  error: string | null
  isPolling: boolean
  lastSubmittedJob: SlamSubmittedJobSnapshot | null
  onViewJson: () => void
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
  activeJobId,
  topicSnapshot,
  loading,
  error,
  isPolling,
  lastSubmittedJob,
  onViewJson,
}: SlamJobCardProps) {
  const jobTag = getSlamJobStateTag(job)
  const topicTag = getTopicHealthPresentation(topicSnapshot.health)
  const progressPercent = getSlamJobProgressPercent(job)
  const progressLabel = getSlamJobProgressLabel(job)
  const activeTracking = Boolean(job?.jobId && activeJobId === job.jobId)
  const requestedOrResolvedMap = job?.resolvedMapName || job?.requestedMapName || '--'
  const resultDetail = getSlamJobResultDetail(job)

  return (
    <Card
      title="当前 SLAM 作业"
      className="slam-card"
      extra={
        <Space wrap>
          {job ? <Tag color={jobTag.color}>{jobTag.label}</Tag> : null}
          {activeTracking ? <Tag color="blue">当前跟踪</Tag> : null}
          {!job && lastSubmittedJob?.jobId ? <Tag color="processing">等待作业首包</Tag> : null}
          <Tag color={topicTag.color}>作业 topic {topicTag.label}</Tag>
          {isPolling ? <Tag color="processing">轮询中</Tag> : null}
          <Button size="small" onClick={onViewJson} disabled={!job}>
            查看 JSON
          </Button>
        </Space>
      }
    >
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
            lastSubmittedJob.jobId ? `job_id=${lastSubmittedJob.jobId}` : '后端暂未回填 job_id',
            lastSubmittedJob.message || '等待 /clean_robot_server/slam_job_state 或 get_slam_job 返回首包。',
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
            <Descriptions.Item label="作业 ID">{job.jobId}</Descriptions.Item>
            <Descriptions.Item label="机器人 ID">{job.robotId || '--'}</Descriptions.Item>
            <Descriptions.Item label="运行模式">{job.currentMode || '--'}</Descriptions.Item>
            <Descriptions.Item label="定位状态">{job.localizationState || '--'}</Descriptions.Item>
            <Descriptions.Item label="请求地图">{job.requestedMapName || '--'}</Descriptions.Item>
            <Descriptions.Item label="落地地图">{requestedOrResolvedMap}</Descriptions.Item>
            <Descriptions.Item label="设为活动地图">
              {job.setActive === null ? '--' : job.setActive ? '是' : '否'}
            </Descriptions.Item>
            <Descriptions.Item label="描述">{job.description || '--'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDateTime(job.createdAtMs)}</Descriptions.Item>
            <Descriptions.Item label="最近更新时间">{formatDateTime(job.updatedAtMs)}</Descriptions.Item>
            <Descriptions.Item label="开始时间">{formatDateTime(job.startedAtMs)}</Descriptions.Item>
            <Descriptions.Item label="结束时间">{formatDateTime(job.finishedAtMs)}</Descriptions.Item>
          </Descriptions>

          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="topic 消息数">{topicSnapshot.messageCount}</Descriptions.Item>
            <Descriptions.Item label="topic 最近更新时间">
              {formatDateTime(topicSnapshot.lastMessageAt)}
            </Descriptions.Item>
            <Descriptions.Item label="topic 延迟">{formatAge(topicSnapshot.ageMs)}</Descriptions.Item>
            <Descriptions.Item label="正在加载">{loading ? '是' : '否'}</Descriptions.Item>
          </Descriptions>
        </Space>
      ) : loading ? (
        <AppLoadingState message="正在加载作业状态…" className="slam-loading" />
      ) : (
        <AppEmptyState
          title="当前没有活跃的 SLAM 作业"
          description="提交新的 SLAM 长动作后，这里会展示统一 job 生命周期。"
        />
      )}
    </Card>
  )
}
