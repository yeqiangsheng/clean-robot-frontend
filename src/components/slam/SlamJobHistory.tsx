import { Button, Card, Empty, Space, Tag, Typography } from 'antd'

import type { SlamWorkflowJob } from '../../types/slam-workflow'
import { formatDateTime, getSlamJobStateTag } from '../../utils/slam'

type SlamJobHistoryProps = {
  jobs: SlamWorkflowJob[]
  activeJobId: string
  onSelectJob: (jobId: string) => void
  onViewJson: (job: SlamWorkflowJob) => void
  onClear: () => void
}

export function SlamJobHistory({
  jobs,
  activeJobId,
  onSelectJob,
  onViewJson,
  onClear,
}: SlamJobHistoryProps) {
  return (
    <Card
      title="Recent Jobs"
      className="slam-card"
      extra={
        <Button size="small" type="text" disabled={jobs.length === 0} onClick={onClear}>
          Clear
        </Button>
      }
    >
      {jobs.length > 0 ? (
        <div className="slam-job-history-list">
          {jobs.map((job) => {
            const stateTag = getSlamJobStateTag(job)

            return (
              <div key={job.jobId} className="slam-job-history-item">
                <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                  <Space wrap>
                    <Typography.Text strong>{job.jobType || job.jobId}</Typography.Text>
                    <Tag color={stateTag.color}>{stateTag.label}</Tag>
                    {activeJobId === job.jobId ? <Tag color="blue">Focused</Tag> : null}
                  </Space>
                  <Typography.Text className="slam-list-subtle">
                    {job.jobId}
                  </Typography.Text>
                  <Typography.Text>
                    {job.resultMessage || job.progressText || '--'}
                  </Typography.Text>
                  <Typography.Text className="slam-list-subtle">
                    Updated {formatDateTime(job.updatedTs)}
                  </Typography.Text>
                </Space>

                <Space className="slam-job-history-actions" size={8} wrap>
                  <Button
                    size="small"
                    type={activeJobId === job.jobId ? 'primary' : 'default'}
                    onClick={() => onSelectJob(job.jobId)}
                  >
                    {activeJobId === job.jobId ? 'Focused' : 'Focus'}
                  </Button>
                  <Button size="small" onClick={() => onViewJson(job)}>
                    JSON
                  </Button>
                </Space>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Submitted SLAM jobs will accumulate here during the current frontend session."
        />
      )}
    </Card>
  )
}
