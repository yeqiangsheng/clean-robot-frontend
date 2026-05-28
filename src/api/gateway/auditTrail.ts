import { useAppShellStore } from '../../stores/appShellStore'
import { USE_MOCK_DATA } from '../../config/runtimeMode'
import type { AuditEventRecord } from '../../types/appShell'
import { getEffectiveRole } from './accessControl'
import { bridgeAuditEvent } from './siteGatewayClient'

function createAuditId() {
  return `audit-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function recordAuditEvent(
  event: Omit<AuditEventRecord, 'id' | 'timestamp' | 'role'>,
) {
  if (USE_MOCK_DATA) {
    useAppShellStore.getState().appendAuditEvent({
      id: createAuditId(),
      timestamp: Date.now(),
      role: getEffectiveRole(),
      ...event,
    })
    return
  }

  void bridgeAuditEvent(event).catch(() => {
    // The primary command has already finished. Audit relay is best-effort only.
  })
}
