import { Button, Card, Popconfirm } from 'antd'
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
      <div className="slam-form-actions">
        <Popconfirm
          title="确认停止建图？"
          description="停止后会结束当前 mapping 流程。如需保留结果，请先执行保存地图。"
          okText="停止建图"
          cancelText="取消"
          onConfirm={onConfirm}
          disabled={disabled}
        >
          <Button block size="large" danger disabled={disabled} loading={loading}>
            停止建图
          </Button>
        </Popconfirm>
      </div>
    </Card>
  )
}
