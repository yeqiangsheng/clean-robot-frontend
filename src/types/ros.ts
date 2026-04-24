import type { Ros } from 'roslib'

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
  url: string
  isConnected: boolean
  lastError: string | null
  connectedAt: number | null
  sessionId: number
  gatewayStatus: GatewayConnectionStatus
  gatewayLastError: string | null
}

export type RosServiceRequest = Record<string, unknown>
export type RosServiceResponse = Record<string, unknown>

export interface RosServiceCallOptions {
  serviceName: string
  serviceType?: string
  timeoutSeconds?: number
}

export interface RosClientLike {
  connect(url: string): Promise<void>
  disconnect(): void
  getSnapshot(): RosConnectionSnapshot
  subscribe(listener: (snapshot: RosConnectionSnapshot) => void): () => void
  callService<
    TRequest extends RosServiceRequest,
    TResponse extends RosServiceResponse,
  >(
    options: RosServiceCallOptions & { request?: TRequest },
  ): Promise<TResponse>
  getRos(): Ros | null
}
