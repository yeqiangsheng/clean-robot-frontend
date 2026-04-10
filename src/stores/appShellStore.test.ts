import { beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'clean-robot-frontend:app-shell'

function buildAuditEvent(timestamp: number) {
  return {
    id: `audit-${timestamp}`,
    timestamp,
    role: 'engineer' as const,
    category: 'actuator' as const,
    action: 'test-action',
    target: '/test',
    status: 'success' as const,
    message: 'test message',
    detail: {
      source: 'unit-test',
    },
  }
}

describe('appShellStore', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('hydrates persisted state and prunes expired audit entries', async () => {
    const now = Date.now()
    const freshEvent = buildAuditEvent(now)
    const expiredEvent = buildAuditEvent(now - 20 * 24 * 60 * 60 * 1000)

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentRole: 'engineer',
        engineerUnlocked: true,
        auditEvents: [freshEvent, expiredEvent],
      }),
    )

    const { useAppShellStore } = await import('./appShellStore')
    const state = useAppShellStore.getState()

    expect(state.currentRole).toBe('engineer')
    expect(state.engineerUnlocked).toBe(true)
    expect(state.auditEvents).toEqual([freshEvent])
  })

  it('persists runtime mutations back to localStorage', async () => {
    const { useAppShellStore } = await import('./appShellStore')
    const auditEvent = buildAuditEvent(Date.now())

    useAppShellStore.getState().setCurrentRole('service')
    useAppShellStore.getState().setEngineerUnlocked(true)
    useAppShellStore.getState().appendAuditEvent(auditEvent)

    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')

    expect(persisted.currentRole).toBe('service')
    expect(persisted.engineerUnlocked).toBe(true)
    expect(persisted.auditEvents).toHaveLength(1)
    expect(persisted.auditEvents[0]).toMatchObject({
      id: auditEvent.id,
      action: auditEvent.action,
      target: auditEvent.target,
    })
  })
})
