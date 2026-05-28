import { Button, Space, Typography } from 'antd'

import type { RosConnectionSnapshot } from '../../types/ros'

interface GatewayRosSessionControlProps {
  snapshot: RosConnectionSnapshot
  onReconnect: () => Promise<void>
}

function getConnectionLabel(snapshot: RosConnectionSnapshot) {
  if (snapshot.status === 'mock') {
    return 'Mock 模式'
  }

  if (snapshot.status === 'connecting') {
    return 'Site Gateway 正在重连 ROS'
  }

  if (snapshot.isConnected) {
    return 'Site Gateway ROS 会话'
  }

  return '等待 Site Gateway 恢复 ROS'
}

export function GatewayRosSessionControl({
  snapshot,
  onReconnect,
}: GatewayRosSessionControlProps) {
  const disabled = snapshot.status === 'mock'

  return (
    <Space size="small" wrap>
      <Typography.Text code>{getConnectionLabel(snapshot)}</Typography.Text>
      <Typography.Text type="secondary">由 Site Gateway 管理</Typography.Text>
      <Button
        size="small"
        type="primary"
        disabled={disabled}
        loading={snapshot.status === 'connecting'}
        onClick={() => void onReconnect()}
      >
        重连 Gateway ROS
      </Button>
    </Space>
  )
}
