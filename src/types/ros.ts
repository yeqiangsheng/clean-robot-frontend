export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error'
  | 'mock'

export type GatewayConnectionStatus =
  | 'checking'
  | 'online'
  | 'offline'
  | 'mock'

export interface RosConnectionSnapshot {
  status: ConnectionStatus
  isConnected: boolean
  lastError: string | null
  connectedAt: number | null
  sessionId: number
  gatewayStatus: GatewayConnectionStatus
  gatewayLastError: string | null
}
