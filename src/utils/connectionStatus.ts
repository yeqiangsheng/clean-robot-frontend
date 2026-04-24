import type {
  ConnectionStatus,
  GatewayConnectionStatus,
  RosConnectionSnapshot,
} from '../types/ros'

export function getGatewayConnectionPresentation(status: GatewayConnectionStatus) {
  switch (status) {
    case 'online':
      return { color: 'success', label: 'Gateway 在线' }
    case 'checking':
      return { color: 'processing', label: 'Gateway 检查中' }
    case 'mock':
      return { color: 'purple', label: 'Gateway Mock' }
    default:
      return { color: 'error', label: 'Gateway 离线' }
  }
}

export function getRosConnectionPresentation(status: ConnectionStatus) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: 'ROS 已连接' }
    case 'connecting':
      return { color: 'processing', label: 'ROS 连接中' }
    case 'error':
      return { color: 'error', label: 'ROS 异常' }
    case 'mock':
      return { color: 'purple', label: 'ROS Mock' }
    case 'closed':
      return { color: 'warning', label: 'ROS 已断开' }
    default:
      return { color: 'default', label: 'ROS 未连接' }
  }
}

export function getConnectionRecoveryHint(snapshot: RosConnectionSnapshot) {
  if (snapshot.gatewayStatus === 'offline') {
    return {
      type: 'error' as const,
      title: '站点 Gateway 离线',
      description:
        snapshot.gatewayLastError ||
        '浏览器暂时无法访问本地站点 Gateway，请确认前端 Gateway 进程或 Windows 服务正在运行。',
    }
  }

  if (snapshot.status === 'closed') {
    return {
      type: 'warning' as const,
      title: 'ROS 会话已断开',
      description:
        '站点 Gateway 在线，但 rosbridge 当前未连接。页面仍可打开，实时状态和写动作会等待 ROS 会话恢复。',
    }
  }

  if (snapshot.status === 'connecting') {
    return {
      type: 'info' as const,
      title: 'ROS 正在连接',
      description:
        '站点 Gateway 正在连接 rosbridge，实时 topic 和业务动作会在连接完成后恢复。',
    }
  }

  if (snapshot.status === 'error') {
    return {
      type: 'error' as const,
      title: 'ROS 连接异常',
      description:
        snapshot.lastError ||
        '站点 Gateway 访问 rosbridge 时出现异常，请检查后端 rosbridge 地址和网络。',
    }
  }

  return null
}
