import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Popconfirm,
  Progress,
  Space,
  Tag,
  Typography,
} from 'antd'

import type { SlamWorkflowJob } from '../../types/slam-workflow'
import {
  formatBoolText,
  formatDateTime,
  getSlamJobStateTag,
} from '../../utils/slam'

type SlamJobCardProps = {
  job: SlamWorkflowJob | null
  loading: boolean
  error: string | null
  isPolling: boolean
  cancelLoading: boolean
  canCancel: boolean
  onCancel: () => void
  onViewJson: () => void
}

export function SlamJobCard({
  job,
  loading,
  error,
  isPolling,
  cancelLoading,
  canCancel,
  onCancel,
  onViewJson,
}: SlamJobCardProps) {
  const jobTag = getSlamJobStateTag(job)
  const progressPercent =
    job?.progressPercent === null || job?.progressPercent === undefined
      ? 0
      : job.progressPercent >= 0 && job.progressPercent <= 1
        ? job.progressPercent * 100
        : job.progressPercent

  return (
    <Card
      title="Current Job"
      className="slam-card"
      extra={
        <Space wrap>
          {job ? <Tag color={jobTag.color}>{jobTag.label}</Tag> : null}
          {isPolling ? <Tag color="processing">Polling</Tag> : null}
          <Button size="small" onClick={onViewJson} disabled={!job}>
            View JSON
          </Button>
        </Space>
      }
    >
      {error ? (
        <Alert
          showIcon
          type="warning"
          title="Job query failed"
          description={error}
          className="slam-inline-alert"
        />
      ) : null}

      {job ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" colon={false}>
            <Descriptions.Item label="job_id">{job.jobId}</Descriptions.Item>
            <Descriptions.Item label="job_type">{job.jobType || '--'}</Descriptions.Item>
            <Descriptions.Item label="workflow_phase">
              {job.workflowPhase || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="progress_text">
              {job.progressText || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="result_code">
              {job.resultCode || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="result_message">
              {job.resultMessage || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="runtime_map">
              {job.runtimeMapName || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="map_match">
              {formatBoolText(job.runtimeMapMatch)}
            </Descriptions.Item>
            <Descriptions.Item label="localization_state">
              {job.localizationState || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="localization_valid">
              {formatBoolText(job.localizationValid)}
            </Descriptions.Item>
            <Descriptions.Item label="manual_assist_required">
              {formatBoolText(job.manualAssistRequired)}
            </Descriptions.Item>
            <Descriptions.Item label="created_at">
              {formatDateTime(job.createdTs)}
            </Descriptions.Item>
            <Descriptions.Item label="updated_at">
              {formatDateTime(job.updatedTs)}
            </Descriptions.Item>
            <Descriptions.Item label="finished_at">
              {formatDateTime(job.finishedTs)}
            </Descriptions.Item>
          </Descriptions>

          <div>
            <Typography.Text strong>Progress</Typography.Text>
            <Progress
              percent={progressPercent}
              status={job.jobState === 'FAILED' ? 'exception' : undefined}
              showInfo
            />
          </div>

          <Popconfirm
            title="Cancel current job"
            description="This sends the cancel_job request to the backend. Use it only when the active SLAM workflow must stop."
            okText="Cancel Job"
            cancelText="Keep Running"
            onConfirm={onCancel}
            disabled={!canCancel}
          >
            <Button danger disabled={!canCancel} loading={cancelLoading}>
              Cancel Job
            </Button>
          </Popconfirm>
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            loading
              ? 'Loading current job...'
              : 'No active SLAM job has been tracked in this frontend session yet.'
          }
        />
      )}
    </Card>
  )
}
