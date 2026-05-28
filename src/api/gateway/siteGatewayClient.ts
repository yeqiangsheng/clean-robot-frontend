import { useAppShellStore } from '../../stores/appShellStore'
import type {
  AuditEventRecord,
  CapabilityStatusItem,
  SessionPayload,
} from '../../types/appShell'
import {
  requestJson,
  type GatewayPublicRosConnectionSnapshot,
  type GatewayHealthResponse,
} from './siteGatewayHttp'

export async function fetchCurrentSession() {
  return requestJson<SessionPayload>('/session/me')
}

export async function fetchGatewayHealth() {
  return requestJson<GatewayHealthResponse>('/health')
}

export async function loginToSiteGateway(username: string, password: string) {
  return requestJson<SessionPayload>('/session/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logoutFromSiteGateway() {
  await requestJson<{ success: boolean }>('/session/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function requestGatewayRosReconnect() {
  return requestJson<{ success: boolean; ros: GatewayPublicRosConnectionSnapshot }>(
    '/gateway/ros/reconnect',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  )
}

export async function fetchCapabilityMap() {
  return requestJson<Record<string, CapabilityStatusItem>>('/capabilities')
}

export async function fetchAuditLog(limit = 50) {
  return requestJson<AuditEventRecord[]>(`/audit?limit=${Math.max(1, Math.round(limit))}`)
}

export async function bridgeAuditEvent(event: Omit<AuditEventRecord, 'id' | 'timestamp' | 'role'>) {
  const record = await requestJson<AuditEventRecord>('/audit/records', {
    method: 'POST',
    body: JSON.stringify(event),
  })
  useAppShellStore.getState().appendAuditEvent(record)
  return record
}

export async function exportGatewayDiagnostics() {
  const result = await requestJson<{ filename: string; bundle: unknown; auditEvent?: AuditEventRecord }>(
    '/diagnostics/export',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  )

  if (result.auditEvent) {
    useAppShellStore.getState().appendAuditEvent(result.auditEvent)
  }

  return {
    filename: result.filename,
    bundle: result.bundle,
  }
}
