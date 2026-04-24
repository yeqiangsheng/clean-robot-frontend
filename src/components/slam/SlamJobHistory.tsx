import { Button, Card, Space, Tag, Typography } from 'antd'

import { AppEmptyState } from '../feedback/AppEmptyState'
import type { SlamWorkflowJob } from '../../types/slam-workflow'
import {
  formatDateTime,
  getSlamActionLabel,
  getSlamJobResultDetail,
  getSlamJobStateTag,
  getSlamJobSummary,
} from '../../utils/slam'

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
      title="最近作业记录"
      className="slam-card"
      extra={
        <Button size="small" type="text" disabled={jobs.length === 0} onClick={onClear}>
          清空
        </Button>
      }
    >
      {jobs.length > 0 ? (
        <div className="slam-job-history-list">
          {jobs.map((job, index) => {
            const stateTag = getSlamJobStateTag(job)
            const isActive = activeJobId === job.jobId
            const isLatest = index === 0

            return (
              <div key={job.jobId} className="slam-job-history-item">
                <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                  <Space wrap>
                    <Typography.Text strong>
                      {getSlamActionLabel(job.operationName)}
                    </Typography.Text>
                    <Tag color={stateTag.color}>{stateTag.label}</Tag>
                    {isActive ? <Tag color="blue">当前跟踪</Tag> : null}
                    {!isActive && isLatest ? <Tag>最近结果</Tag> : null}
                    {!isActive && !isLatest ? <Tag>历史</Tag> : null}
                  </Space>

                  <Typography.Text className="slam-list-subtle">{job.jobId}</Typography.Text>
                  <Typography.Text>{getSlamJobSummary(job)}</Typography.Text>
                  <Typography.Text>{getSlamJobResultDetail(job)}</Typography.Text>
                  <Typography.Text className="slam-list-subtle">
                    最近更新时间：{formatDateTime(job.updatedAtMs)}
                  </Typography.Text>
                </Space>

                <Space className="slam-job-history-actions" size={8} wrap>
                  <Button
                    size="small"
                    type={isActive ? 'primary' : 'default'}
                    onClick={() => onSelectJob(job.jobId)}
                  >
                    {isActive ? '当前跟踪中' : '查看'}
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
        <AppEmptyState description="最近提交过的 SLAM 长动作会保留在这里，方便现场回看。" />
      )}
    </Card>
  )
}
