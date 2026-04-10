export type UserRole = 'operator' | 'service' | 'engineer'

export type EngineerUnlockMode = 'direct'

export type AppModuleKey =
  | 'overview'
  | 'workbench'
  | 'tasks'
  | 'schedules'
  | 'execution'
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
  rosbridgeUrl: string
  quickRosbridgeUrls: string[]
  enabledModules: Partial<Record<AppModuleKey, boolean>>
  rolePolicy: Partial<Record<UserRole, CapabilityFlag[]>>
  engineerUnlockMode: EngineerUnlockMode
  logRetentionDays: number
}

export interface AppConfigValidationIssue {
  field: string
  message: string
}

export interface CapabilityStatusItem {
  key: CapabilityFlag
  title: string
  summary: string
  status: CapabilityStatusLevel
  dependencies: string[]
  source: 'config' | 'rosapi' | 'gateway'
  missingDependency: string | null
}

export interface AuditEventRecord {
  id: string
  timestamp: number
  role: UserRole
  category: 'task' | 'actuator' | 'charging' | 'slam' | 'system'
  action: string
  target: string
  status: 'success' | 'blocked' | 'failed'
  message: string
  detail: Record<string, unknown>
}

export interface GatewayErrorShape extends Error {
  code: string
  source: string
  recoverable: boolean
  requiresEngineer: boolean
  missingDependency: string | null
}
