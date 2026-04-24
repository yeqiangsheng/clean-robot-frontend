import { Button, Card, Descriptions, Popconfirm, Space, Tag, Typography } from 'antd'
import { DatabaseOutlined, EditOutlined } from '@ant-design/icons'

import { AppEmptyState } from '../../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../../components/feedback/AppFeedbackBanner'
import { AppLoadingState } from '../../components/feedback/AppLoadingState'
import type { TaskEntity } from '../../types/task'
import {
  getRepeatAfterFullChargeTag,
  getReturnToDockTag,
  getTaskStatusTagColor,
} from './taskManagementDefaults'

interface TaskManagementDetailProps {
  detail: TaskEntity | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isSubmitting: boolean
  metadataEntries: Array<[string, unknown]>
  zoneLabel: string
  planProfileLabel: string
  sysProfileLabel: string
  onEdit: () => void
  onDelete: () => void
}

export function TaskManagementDetail({
  detail,
  isLoading,
  isRefreshing,
  error,
  isSubmitting,
  metadataEntries,
  zoneLabel,
  planProfileLabel,
  sysProfileLabel,
  onEdit,
  onDelete,
}: TaskManagementDetailProps) {
  return (
    <Card
      title="任务详情"
      className="task-card"
      extra={
        <Space size="small" wrap>
          <Button size="small" icon={<EditOutlined />} onClick={onEdit} disabled={!detail}>
            编辑
          </Button>
          <Popconfirm
            title="删除任务"
            description="确认从后端任务目录中删除当前任务吗？"
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
        <AppLoadingState message="正在刷新任务详情…" compact className="task-loading" />
      ) : null}

      {isLoading ? (
        <AppLoadingState message="正在加载任务详情…" className="task-loading" />
      ) : error ? (
        <AppFeedbackBanner tone="error" title="任务详情加载失败" description={error} />
      ) : detail ? (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={2} size="small" colon={false}>
            <Descriptions.Item label="任务 ID">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="任务名称">{detail.name}</Descriptions.Item>
            <Descriptions.Item label="是否启用">
              <Tag color={detail.enabled ? 'green' : 'default'}>
                {detail.enabled ? '是' : '否'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="任务状态">
              <Tag color={getTaskStatusTagColor(detail.status)}>{detail.status ?? '--'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="地图">{detail.mapName || '--'}</Descriptions.Item>
            <Descriptions.Item label="区域">{zoneLabel}</Descriptions.Item>
            <Descriptions.Item label="规划档位">{planProfileLabel}</Descriptions.Item>
            <Descriptions.Item label="系统档位">{sysProfileLabel}</Descriptions.Item>
            <Descriptions.Item label="清洁模式">{detail.cleanMode || '--'}</Descriptions.Item>
            <Descriptions.Item label="圈数">{detail.loops ?? '--'}</Descriptions.Item>
            <Descriptions.Item label="结束后行为">
              <Tag color={getReturnToDockTag(detail.returnToDockOnFinish).color}>
                {getReturnToDockTag(detail.returnToDockOnFinish).label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="满电续扫">
              <Tag color={getRepeatAfterFullChargeTag(detail.repeatAfterFullCharge).color}>
                {getRepeatAfterFullChargeTag(detail.repeatAfterFullCharge).label}
              </Tag>
            </Descriptions.Item>
          </Descriptions>

          <Card
            size="small"
            className="task-inner-card"
            title={
              <Space>
                <DatabaseOutlined />
                <span>元数据</span>
              </Space>
            }
          >
            {metadataEntries.length > 0 ? (
              <Descriptions column={1} size="small" colon={false}>
                {metadataEntries.map(([key, value]) => (
                  <Descriptions.Item key={key} label={key}>
                    <Typography.Text ellipsis>
                      {typeof value === 'string' ? value : JSON.stringify(value)}
                    </Typography.Text>
                  </Descriptions.Item>
                ))}
              </Descriptions>
            ) : (
              <AppEmptyState title="暂无任务元数据" description="后端这次没有返回额外元数据。" />
            )}
          </Card>
        </Space>
      ) : (
        <AppEmptyState
          title="请选择一个任务"
          description="从左侧任务列表选择一条任务后，这里会显示详情。"
        />
      )}
    </Card>
  )
}
