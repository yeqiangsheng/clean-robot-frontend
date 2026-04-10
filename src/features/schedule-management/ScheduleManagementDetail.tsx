import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { DatabaseOutlined, EditOutlined } from '@ant-design/icons'

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
  isSubmitting: boolean
  metadataEntries: Array<[string, unknown]>
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
  isSubmitting,
  metadataEntries,
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
            description="确认从后端删除当前调度吗？"
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
        <div className="schedule-loading schedule-loading-compact">
          <Spin />
          <Typography.Text>正在刷新调度详情...</Typography.Text>
        </div>
      ) : null}

      {isLoading ? (
        <div className="schedule-loading">
          <Spin />
          <Typography.Text>正在加载调度详情...</Typography.Text>
        </div>
      ) : error ? (
        <Alert showIcon type="error" title="调度详情加载失败" description={error} />
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
          </Descriptions>

          <Card
            size="small"
            className="schedule-inner-card"
            title={
              <Space>
                <DatabaseOutlined />
                <span>继承任务快照</span>
              </Space>
            }
          >
            <Descriptions column={2} size="small" colon={false}>
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
          </Card>

          <Card
            size="small"
            className="schedule-inner-card"
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
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未返回调度元数据。" />
            )}
          </Card>
        </Space>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一个调度查看详情。" />
      )}
    </Card>
  )
}
