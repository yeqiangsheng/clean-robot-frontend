import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuditEventRecord, SessionPayload } from '../types/appShell'

function buildAuditEvent(timestamp: number, id = `audit-${timestamp}`): AuditEventRecord {
  return {
    id,
    timestamp,
    actor: 'unit-test',
    role: 'engineer',
    category: 'actuator',
    action: 'test-action',
    target: '/test',
    status: 'success',
    message: 'test message',
    detail: {
      source: 'unit-test',
    },
    requestId: 'req-unit-test',
  }
}

function buildSession(role: SessionPayload['user']['role'] = 'service'): SessionPayload {
  return {
    user: {
      username: `${role}-user`,
      displayName: `${role} 用户`,
      role,
    },
    capabilities: ['overview', 'taskManagement', 'scheduleManagement'],
  }
}

describe('appShellStore', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('applies a server session to the runtime store', async () => {
    const { useAppShellStore } = await import('./appShellStore')
    const session = buildSession('engineer')

    useAppShellStore.getState().setSession(session)

    const state = useAppShellStore.getState()
    expect(state.sessionStatus).toBe('authenticated')
    expect(state.currentUser).toEqual(session.user)
    expect(state.currentRole).toBe('engineer')
    expect(state.grantedCapabilities).toEqual(session.capabilities)
  })

  it('sorts audit events and deduplicates append by id', async () => {
    const { useAppShellStore } = await import('./appShellStore')
    const newer = buildAuditEvent(200, 'same-id')
    const older = buildAuditEvent(100, 'older-id')
    const replacement = buildAuditEvent(300, 'same-id')

    useAppShellStore.getState().setAuditEvents([older, newer])
    expect(useAppShellStore.getState().auditEvents.map((item) => item.timestamp)).toEqual([200, 100])

    useAppShellStore.getState().appendAuditEvent(replacement)
    expect(useAppShellStore.getState().auditEvents).toHaveLength(2)
    expect(useAppShellStore.getState().auditEvents[0]).toEqual(replacement)
    expect(useAppShellStore.getState().auditEvents[1]).toEqual(older)
  })

  it('clears the active session back to anonymous state', async () => {
    const { useAppShellStore } = await import('./appShellStore')

    useAppShellStore.getState().setSession(buildSession('admin'))
    useAppShellStore.getState().appendAuditEvent(buildAuditEvent(Date.now()))
    const previousSessionId = useAppShellStore.getState().sessionId

    useAppShellStore.getState().clearClientSession()

    const state = useAppShellStore.getState()
    expect(state.sessionStatus).toBe('anonymous')
    expect(state.currentUser).toBeNull()
    expect(state.currentRole).toBe('operator')
    expect(state.grantedCapabilities).toEqual([])
    expect(state.auditEvents).toEqual([])
    expect(state.sessionId).toBe(previousSessionId + 1)
  })
})
