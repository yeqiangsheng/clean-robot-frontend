export type UserRole = 'operator' | 'service' | 'engineer' | 'admin'

export type AppModuleKey =
  | 'overview'
  | 'workbench'
  | 'tasks'
  | 'schedules'
  | 'execution'
  | 'dock-calibration'
  | 'slam'
  | 'runtime'
  | 'actuator-control'

export type CapabilityFlag =
  | 'overview'
  | 'mapWorkbench'
  | 'taskManagement'
  | 'scheduleManagement'
  | 'executionControl'
  | 'slamWorkbench'
  | 'runtimeMonitoring'
  | 'actuatorControl'
  | 'chargingControl'
  | 'dockCalibration'
  | 'profileCatalog'
  | 'systemReadiness'

export type CapabilityStatusLevel =
  | 'available'
  | 'missing'
  | 'degraded'
  | 'disabled'
  | 'checking'

export interface AppConfig {
  siteName: string
  robotId: string
  apiBaseUrl: string
  enabledModules: Partial<Record<AppModuleKey, boolean>>
  supportName?: string
  supportPhone?: string
  supportEmail?: string
}

export interface AppConfigValidationIssue {
  field: string
  message: string
}

export interface SessionUser {
  username: string
  displayName: string
  role: UserRole
}

export interface SessionPayload {
  user: SessionUser
  capabilities: CapabilityFlag[]
}

export interface CapabilityStatusItem {
  key: CapabilityFlag
  title: string
  summary: string
  status: CapabilityStatusLevel
  dependencies: string[]
  source: 'config' | 'gateway'
  missingDependency: string | null
}

export interface AuditEventRecord {
  id: string
  timestamp: number
  actor?: string
  role: UserRole
  category: 'auth' | 'task' | 'actuator' | 'charging' | 'slam' | 'system'
  action: string
  target: string
  status: 'success' | 'blocked' | 'failed'
  message: string
  detail: Record<string, unknown>
  requestId?: string | null
}

export interface GatewayErrorShape extends Error {
  code: string
  source: string
  recoverable: boolean
  requiresEngineer: boolean
  missingDependency: string | null
  requestId?: string | null
}
