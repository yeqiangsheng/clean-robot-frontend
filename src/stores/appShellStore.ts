import { create } from 'zustand'

import { getAppConfig } from '../config/appConfig'
import type { AuditEventRecord, UserRole } from '../types/appShell'

const STORAGE_KEY = 'clean-robot-frontend:app-shell'

interface PersistedAppShellState {
  currentRole: UserRole
  engineerUnlocked: boolean
  auditEvents: AuditEventRecord[]
}

interface AppShellState extends PersistedAppShellState {
  setCurrentRole: (role: UserRole) => void
  setEngineerUnlocked: (value: boolean) => void
  appendAuditEvent: (event: AuditEventRecord) => void
  clearAuditEvents: () => void
  reset: () => void
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function createDefaultState(): PersistedAppShellState {
  return {
    currentRole: 'operator',
    engineerUnlocked: false,
    auditEvents: [],
  }
}

function sanitizeAuditEvents(events: unknown) {
  if (!Array.isArray(events)) {
    return []
  }

  const retentionMs = getAppConfig().logRetentionDays * 24 * 60 * 60 * 1000
  const cutoff = Date.now() - retentionMs

  return events
    .filter((event): event is AuditEventRecord => {
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        return false
      }

      const record = event as Record<string, unknown>

      return (
        typeof record.id === 'string' &&
        typeof record.timestamp === 'number' &&
        record.timestamp >= cutoff &&
        typeof record.role === 'string' &&
        typeof record.category === 'string' &&
        typeof record.action === 'string' &&
        typeof record.target === 'string' &&
        typeof record.status === 'string' &&
        typeof record.message === 'string' &&
        typeof record.detail === 'object' &&
        record.detail !== null &&
        !Array.isArray(record.detail)
      )
    })
    .sort((left, right) => right.timestamp - left.timestamp)
}

function loadInitialState(): PersistedAppShellState {
  if (!canUseStorage()) {
    return createDefaultState()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return createDefaultState()
    }

    const parsed = JSON.parse(raw) as Partial<PersistedAppShellState>

    return {
      currentRole:
        parsed.currentRole === 'service' || parsed.currentRole === 'engineer'
          ? parsed.currentRole
          : 'operator',
      engineerUnlocked: parsed.engineerUnlocked === true,
      auditEvents: sanitizeAuditEvents(parsed.auditEvents),
    }
  } catch {
    return createDefaultState()
  }
}

function persistState(snapshot: PersistedAppShellState) {
  if (!canUseStorage()) {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Best effort persistence only.
  }
}

const initialState: PersistedAppShellState = loadInitialState()

function toPersistedState(
  snapshot: Pick<PersistedAppShellState, 'currentRole' | 'engineerUnlocked' | 'auditEvents'>,
): PersistedAppShellState {
  return {
    currentRole: snapshot.currentRole,
    engineerUnlocked: snapshot.engineerUnlocked,
    auditEvents: snapshot.auditEvents,
  }
}

export const useAppShellStore = create<AppShellState>((set, get) => ({
  ...initialState,
  setCurrentRole: (currentRole) => {
    const nextState = toPersistedState({
      ...get(),
      currentRole,
    })

    persistState(nextState)
    set({ currentRole })
  },
  setEngineerUnlocked: (engineerUnlocked) => {
    const nextState = toPersistedState({
      ...get(),
      engineerUnlocked,
    })

    persistState(nextState)
    set({ engineerUnlocked })
  },
  appendAuditEvent: (event) => {
    const retentionMs = getAppConfig().logRetentionDays * 24 * 60 * 60 * 1000
    const cutoff = Date.now() - retentionMs
    const auditEvents = [event, ...get().auditEvents]
      .filter((item) => item.timestamp >= cutoff)
      .slice(0, 120)
    const nextState = toPersistedState({
      ...get(),
      auditEvents,
    })

    persistState(nextState)
    set({ auditEvents })
  },
  clearAuditEvents: () => {
    const nextState = toPersistedState({
      ...get(),
      auditEvents: [],
    })

    persistState(nextState)
    set({ auditEvents: [] })
  },
  reset: () => {
    const nextState = createDefaultState()
    persistState(nextState)
    set(nextState)
  },
}))
