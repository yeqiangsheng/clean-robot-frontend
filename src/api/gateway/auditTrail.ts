import { useAppShellStore } from '../../stores/appShellStore'
import type { AuditEventRecord } from '../../types/appShell'
import { getEffectiveRole } from './accessControl'

function createAuditId() {
  return `audit-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function recordAuditEvent(
  event: Omit<AuditEventRecord, 'id' | 'timestamp' | 'role'>,
) {
  useAppShellStore.getState().appendAuditEvent({
    id: createAuditId(),
    timestamp: Date.now(),
    role: getEffectiveRole(),
    ...event,
  })
}
