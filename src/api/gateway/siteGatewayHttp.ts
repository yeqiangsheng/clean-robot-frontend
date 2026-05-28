import { getApiBaseUrl } from '../../config/appConfig'
import { useAppShellStore } from '../../stores/appShellStore'
import type {
  AuditEventRecord,
  GatewayErrorShape,
} from '../../types/appShell'
import type { RuntimeTopicKey } from '../../types/runtime'
import type { RosConnectionSnapshot } from '../../types/ros'

export interface GatewayLiveMapSnapshot {
  changed: boolean
  available: boolean
  receivedAtMs: number | null
  messageCount: number
  payload: Record<string, unknown> | null
  error: string | null
}

export interface GatewayRosTopicSnapshot<TPayload> {
  topicName: string
  messageType: string
  publishers: string[]
  subscribers: string[]
  metaError: string | null
  subscribeError: string | null
  messageCount: number
  lastMessageAt: number | null
  payload: TPayload | null
}

export type GatewayRuntimeTopicSnapshotMap = Partial<
  Record<RuntimeTopicKey, GatewayRosTopicSnapshot<Record<string, unknown>>>
>

export type GatewayPublicRosConnectionSnapshot = Pick<
  RosConnectionSnapshot,
  'status' | 'isConnected' | 'lastError' | 'connectedAt' | 'sessionId'
>

export interface GatewayHealthResponse {
  status: string
  version: string
  siteName: string
  robotId: string
  ros: GatewayPublicRosConnectionSnapshot
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function joinApiUrl(pathname: string) {
  const baseUrl = getApiBaseUrl()

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return new URL(pathname.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString()
  }

  return `${baseUrl.replace(/\/+$/, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

export function buildQueryString(
  values: Record<string, string | number | boolean | null | undefined>,
) {
  const query = new URLSearchParams()

  Object.entries(values).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) {
        return
      }
      query.set(key, trimmed)
      return
    }

    query.set(key, String(value))
  })

  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

function createGatewayError(
  message: string,
  options: {
    code: string
    source: string
    recoverable?: boolean
    requiresEngineer?: boolean
    missingDependency?: string | null
    requestId?: string | null
  },
) {
  const error = new Error(message) as GatewayErrorShape
  error.code = options.code
  error.source = options.source
  error.recoverable = options.recoverable ?? true
  error.requiresEngineer = options.requiresEngineer ?? false
  error.missingDependency = options.missingDependency ?? null
  error.requestId = options.requestId ?? null
  return error
}

async function parseError(response: Response) {
  let payload: unknown = null

  try {
    payload = await response.json()
  } catch {
    // Ignore JSON parse failures for gateway errors.
  }

  if (isRecord(payload) && typeof payload.message === 'string') {
    return createGatewayError(payload.message, {
      code: typeof payload.code === 'string' ? payload.code : 'GATEWAY_ERROR',
      source: 'site-gateway',
      recoverable: payload.recoverable !== false,
      requiresEngineer: payload.requiresEngineer === true,
      missingDependency:
        typeof payload.missingDependency === 'string' ? payload.missingDependency : null,
      requestId: typeof payload.requestId === 'string' ? payload.requestId : null,
    })
  }

  return createGatewayError(`Gateway request failed with HTTP ${response.status}.`, {
    code: 'GATEWAY_HTTP_ERROR',
    source: 'site-gateway',
  })
}

export async function requestJson<T>(
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(joinApiUrl(pathname), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    const error = await parseError(response)

    if (response.status === 401) {
      useAppShellStore.getState().clearClientSession()
    }

    throw error
  }

  return (await response.json()) as T
}

export function appendAuditEventFromResponse(value: unknown) {
  if (!isRecord(value) || !isRecord(value.auditEvent)) {
    return
  }

  useAppShellStore.getState().appendAuditEvent(value.auditEvent as unknown as AuditEventRecord)
}
