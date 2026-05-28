import { Button, Card, Descriptions, Popconfirm, Space, Tag } from 'antd'
import { EditOutlined } from '@ant-design/icons'

import { AppEmptyState } from '../../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../../components/feedback/AppFeedbackBanner'
import { AppLoadingState } from '../../components/feedback/AppLoadingState'
import type { ScheduleEntity } from '../../types/schedule'
import {
  formatDow,
  formatRepeatAfterFullCharge,
  formatReturnToDock,
  formatScheduleTimestamp,
  formatScheduleType,
} from './scheduleManagementDefaults'

interface ScheduleManagementDetailProps {
  detail: ScheduleEntity | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  notFound: boolean
  isSubmitting: boolean
  planProfileLabel: string
  sysProfileLabel: string
  onEdit: () => void
  onDelete: () => void
}

export function ScheduleManagementDetail({
  detail,
  isLoading,
  isRefreshing,
  error,
  notFound,
  isSubmitting,
  planProfileLabel,
  sysProfileLabel,
  onEdit,
  onDelete,
}: ScheduleManagementDetailProps) {
  return (
    <Card
      title="调度详情"
      className="schedule-card"
      extra={
        <Space size="small" wrap>
          <Button size="small" icon={<EditOutlined />} onClick={onEdit} disabled={!detail}>
            编辑
          </Button>
          <Popconfirm
            title="删除调度"
            description="确认从后端永久删除当前调度吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => void onDelete()}
            okButtonProps={{ danger: true, loading: isSubmitting }}
            disabled={!detail}
          >
            <Button size="small" danger disabled={!detail}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      {isRefreshing && detail ? (
        <AppLoadingState message="正在刷新调度详情…" compact className="schedule-loading" />
      ) : null}

      {isLoading ? (
        <AppLoadingState message="正在加载调度详情…" className="schedule-loading" />
      ) : error ? (
        <AppFeedbackBanner tone="error" title="调度详情加载失败" description={error} />
      ) : notFound ? (
        <AppEmptyState
          title="这条调度已不存在"
          description="它可能已经被删除。请选择列表中的其他调度，或直接新建一条调度。"
        />
      ) : detail ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="调度 ID">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="任务 ID">{detail.taskId}</Descriptions.Item>
            <Descriptions.Item label="任务名称">{detail.taskName || '--'}</Descriptions.Item>
            <Descriptions.Item label="是否启用">
              <Tag color={detail.enabled ? 'green' : 'default'}>
                {detail.enabled ? '是' : '否'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="调度类型">{formatScheduleType(detail.type)}</Descriptions.Item>
            <Descriptions.Item label="星期">{formatDow(detail.dow)}</Descriptions.Item>
            <Descriptions.Item label="时间">{detail.time || '--'}</Descriptions.Item>
            <Descriptions.Item label="执行时间">{detail.at || '--'}</Descriptions.Item>
            <Descriptions.Item label="时区">{detail.timezone || '--'}</Descriptions.Item>
            <Descriptions.Item label="开始日期">{detail.startDate || '--'}</Descriptions.Item>
            <Descriptions.Item label="结束日期">{detail.endDate || '--'}</Descriptions.Item>
            <Descriptions.Item label="最近触发时间">
              {formatScheduleTimestamp(detail.lastFireTs)}
            </Descriptions.Item>
            <Descriptions.Item label="最近完成时间">
              {formatScheduleTimestamp(detail.lastDoneTs)}
            </Descriptions.Item>
            <Descriptions.Item label="最近执行状态">
              {detail.lastStatus || '--'}
            </Descriptions.Item>
            <Descriptions.Item label="地图">{detail.mapName || '--'}</Descriptions.Item>
            <Descriptions.Item label="区域">{detail.zoneId || '--'}</Descriptions.Item>
            <Descriptions.Item label="圈数">{detail.loops ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="清洁模式">{detail.cleanMode || '--'}</Descriptions.Item>
            <Descriptions.Item label="结束后行为">
              {formatReturnToDock(detail.returnToDockOnFinish)}
            </Descriptions.Item>
            <Descriptions.Item label="满电续扫">
              {formatRepeatAfterFullCharge(detail.repeatAfterFullCharge)}
            </Descriptions.Item>
            <Descriptions.Item label="规划档位">{planProfileLabel}</Descriptions.Item>
            <Descriptions.Item label="系统档位">{sysProfileLabel}</Descriptions.Item>
          </Descriptions>
        </Space>
      ) : (
        <AppEmptyState
          title="请选择一个调度"
          description="从左侧调度列表选择一条记录后，这里会显示详情。"
        />
      )}
    </Card>
  )
}
