import { create } from 'zustand'

import type {
  AuditEventRecord,
  CapabilityFlag,
  SessionPayload,
  SessionUser,
  UserRole,
} from '../types/appShell'

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

type SessionStatus = 'checking' | 'authenticated' | 'anonymous'

interface AppShellState {
  sessionStatus: SessionStatus
  sessionId: number
  currentUser: SessionUser | null
  currentRole: UserRole
  grantedCapabilities: CapabilityFlag[]
  auditEvents: AuditEventRecord[]
  authError: string | null
  setSession: (payload: SessionPayload | null) => void
  setSessionStatus: (status: SessionStatus) => void
  setAuthError: (message: string | null) => void
  setAuditEvents: (events: AuditEventRecord[]) => void
  appendAuditEvent: (event: AuditEventRecord) => void
  clearClientSession: () => void
}

function createMockSession(): SessionPayload {
  return {
    user: {
      username: 'local-engineer',
      displayName: '本地工程师',
      role: 'engineer',
    },
    capabilities: [
      'overview',
      'mapWorkbench',
      'taskManagement',
      'scheduleManagement',
      'executionControl',
      'slamWorkbench',
      'runtimeMonitoring',
      'actuatorControl',
      'chargingControl',
      'profileCatalog',
      'systemReadiness',
    ],
  }
}

function getAnonymousRole(): UserRole {
  return 'operator'
}

const initialSession = USE_MOCK_DATA ? createMockSession() : null

export const useAppShellStore = create<AppShellState>((set) => ({
  sessionStatus: USE_MOCK_DATA ? 'authenticated' : 'checking',
  sessionId: USE_MOCK_DATA ? 1 : 0,
  currentUser: initialSession?.user ?? null,
  currentRole: initialSession?.user.role ?? getAnonymousRole(),
  grantedCapabilities: initialSession?.capabilities ?? [],
  auditEvents: [],
  authError: null,
  setSession: (payload) =>
    set((state) => ({
      sessionStatus: payload ? 'authenticated' : 'anonymous',
      sessionId: state.sessionId + 1,
      currentUser: payload?.user ?? null,
      currentRole: payload?.user.role ?? getAnonymousRole(),
      grantedCapabilities: payload?.capabilities ?? [],
      authError: null,
      auditEvents: payload ? state.auditEvents : [],
    })),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),
  setAuthError: (authError) => set({ authError }),
  setAuditEvents: (auditEvents) =>
    set({
      auditEvents: [...auditEvents].sort((left, right) => right.timestamp - left.timestamp),
    }),
  appendAuditEvent: (event) =>
    set((state) => ({
      auditEvents: [event, ...state.auditEvents.filter((item) => item.id !== event.id)].slice(
        0,
        120,
      ),
    })),
  clearClientSession: () =>
    set((state) => ({
      sessionStatus: 'anonymous',
      sessionId: state.sessionId + 1,
      currentUser: null,
      currentRole: getAnonymousRole(),
      grantedCapabilities: [],
      auditEvents: [],
      authError: null,
    })),
}))
