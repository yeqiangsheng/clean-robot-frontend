import { useAppShellStore } from '../../stores/appShellStore'
import type { CapabilityFlag, GatewayErrorShape, UserRole } from '../../types/appShell'

const DEFAULT_ROLE_CAPABILITIES: Record<UserRole, CapabilityFlag[]> = {
  operator: ['overview'],
  service: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'dockCalibration',
    'runtimeMonitoring',
    'slamWorkbench',
    'profileCatalog',
    'systemReadiness',
  ],
  engineer: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'dockCalibration',
    'slamWorkbench',
    'runtimeMonitoring',
    'actuatorControl',
    'chargingControl',
    'profileCatalog',
    'systemReadiness',
  ],
  admin: [
    'overview',
    'mapWorkbench',
    'taskManagement',
    'scheduleManagement',
    'executionControl',
    'dockCalibration',
    'slamWorkbench',
    'runtimeMonitoring',
    'actuatorControl',
    'chargingControl',
    'profileCatalog',
    'systemReadiness',
  ],
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

export function getEffectiveRole() {
  return useAppShellStore.getState().currentRole
}

export function isCapabilityAllowedForRole(capability: CapabilityFlag, role: UserRole) {
  return DEFAULT_ROLE_CAPABILITIES[role]?.includes(capability) ?? false
}

export function isCapabilityAllowed(capability: CapabilityFlag) {
  return useAppShellStore.getState().grantedCapabilities.includes(capability)
}

export function assertCapabilityAllowed(capability: CapabilityFlag, actionLabel: string) {
  if (isCapabilityAllowed(capability)) {
    return
  }

  throw createGatewayError(`${actionLabel} 当前不可用，请使用具备相应权限的账号登录。`, {
    code: 'CAPABILITY_DENIED',
    source: 'access-control',
    recoverable: true,
    requiresEngineer:
      capability === 'slamWorkbench' ||
      capability === 'actuatorControl' ||
      capability === 'chargingControl' ||
      capability === 'dockCalibration',
  })
}

export function normalizeGatewayError(
  error: unknown,
  fallback: {
    message: string
    source: string
    code: string
    recoverable?: boolean
    requiresEngineer?: boolean
    missingDependency?: string | null
    requestId?: string | null
  },
) {
  if (
    error instanceof Error &&
    'code' in error &&
    'source' in error &&
    'recoverable' in error &&
    'requiresEngineer' in error &&
    'missingDependency' in error
  ) {
    return error as GatewayErrorShape
  }

  return createGatewayError(
    error instanceof Error ? error.message : fallback.message,
    fallback,
  )
}
