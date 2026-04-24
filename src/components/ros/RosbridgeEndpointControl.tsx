import { Button, Space, Typography } from 'antd'

import type { RosConnectionSnapshot } from '../../types/ros'

interface RosbridgeEndpointControlProps {
  snapshot: RosConnectionSnapshot
  defaultUrl: string
  onConnect: (url: string) => Promise<void>
}

function getConnectionLabel(snapshot: RosConnectionSnapshot) {
  if (snapshot.status === 'mock') {
    return 'Mock 模式'
  }

  if (snapshot.isConnected) {
    return '站点网关 ROS 会话'
  }

  return '等待站点网关恢复 ROS 连接'
}

export function RosbridgeEndpointControl({
  snapshot,
  defaultUrl,
  onConnect,
}: RosbridgeEndpointControlProps) {
  const disabled = snapshot.status === 'mock'
  const displayUrl = snapshot.url || defaultUrl || 'ws://<site-gateway-managed>'

  return (
    <Space size="small" wrap>
      <Typography.Text code>{getConnectionLabel(snapshot)}</Typography.Text>
      <Typography.Text type="secondary">{displayUrl}</Typography.Text>
      <Button
        size="small"
        type="primary"
        disabled={disabled}
        loading={snapshot.status === 'connecting'}
        onClick={() => void onConnect(defaultUrl)}
      >
        重新连接
      </Button>
    </Space>
  )
}
