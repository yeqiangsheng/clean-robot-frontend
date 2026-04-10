import { getDefaultRolePolicy } from '../../config/appConfig'
import { useAppShellStore } from '../../stores/appShellStore'
import type { CapabilityFlag, GatewayErrorShape, UserRole } from '../../types/appShell'

function createGatewayError(
  message: string,
  options: {
    code: string
    source: string
    recoverable?: boolean
    requiresEngineer?: boolean
    missingDependency?: string | null
  },
) {
  const error = new Error(message) as GatewayErrorShape
  error.code = options.code
  error.source = options.source
  error.recoverable = options.recoverable ?? true
  error.requiresEngineer = options.requiresEngineer ?? false
  error.missingDependency = options.missingDependency ?? null
  return error
}

export function getEffectiveRole() {
  const { currentRole, engineerUnlocked } = useAppShellStore.getState()

  if (currentRole === 'engineer' && !engineerUnlocked) {
    return 'service' as UserRole
  }

  return currentRole
}

export function isCapabilityAllowedForRole(capability: CapabilityFlag, role: UserRole) {
  const rolePolicy = getDefaultRolePolicy()
  const allowedCapabilities = rolePolicy[role] ?? []
  return allowedCapabilities.includes(capability)
}

export function isCapabilityAllowed(capability: CapabilityFlag) {
  return isCapabilityAllowedForRole(capability, getEffectiveRole())
}

export function assertCapabilityAllowed(
  capability: CapabilityFlag,
  actionLabel: string,
) {
  if (isCapabilityAllowed(capability)) {
    return
  }

  throw createGatewayError(`${actionLabel} 仅对工程师模式开放。`, {
    code: 'ENGINEER_CAPABILITY_REQUIRED',
    source: 'access-control',
    recoverable: true,
    requiresEngineer: true,
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
