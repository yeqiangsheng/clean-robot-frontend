import { Button, Card, Popconfirm, Space, Typography } from 'antd'
import { WarningOutlined } from '@ant-design/icons'

type StopMappingActionProps = {
  disabled: boolean
  loading: boolean
  onConfirm: () => void
}

export function StopMappingAction({
  disabled,
  loading,
  onConfirm,
}: StopMappingActionProps) {
  return (
    <Card
      title="停止建图"
      className="slam-card slam-danger-card"
      extra={<WarningOutlined />}
    >
      <Typography.Paragraph className="slam-card-copy">
        这是高风险操作。请先确认地图已经保存，再停止当前建图会话。
      </Typography.Paragraph>

      <Space wrap>
        <Popconfirm
          title="停止建图会话"
          description="只有在当前建图结果已经保存后，才建议继续。"
          okText="停止建图"
          cancelText="继续建图"
          onConfirm={onConfirm}
          disabled={disabled}
        >
          <Button danger disabled={disabled} loading={loading}>
            停止建图
          </Button>
        </Popconfirm>
      </Space>
    </Card>
  )
}
