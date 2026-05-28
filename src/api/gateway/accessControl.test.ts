import { describe, expect, it } from 'vitest'

import { isCapabilityAllowedForRole, normalizeGatewayError } from './accessControl'
import type { GatewayErrorShape } from '../../types/appShell'

describe('accessControl gateway helpers', () => {
  it('exposes the default site-gateway role policy used by the shell', () => {
    expect(isCapabilityAllowedForRole('overview', 'operator')).toBe(true)
    expect(isCapabilityAllowedForRole('executionControl', 'operator')).toBe(false)
    expect(isCapabilityAllowedForRole('taskManagement', 'operator')).toBe(false)
    expect(isCapabilityAllowedForRole('actuatorControl', 'operator')).toBe(false)
    expect(isCapabilityAllowedForRole('runtimeMonitoring', 'service')).toBe(true)
    expect(isCapabilityAllowedForRole('slamWorkbench', 'service')).toBe(true)
    expect(isCapabilityAllowedForRole('dockCalibration', 'service')).toBe(true)
    expect(isCapabilityAllowedForRole('actuatorControl', 'service')).toBe(false)
    expect(isCapabilityAllowedForRole('actuatorControl', 'engineer')).toBe(true)
    expect(isCapabilityAllowedForRole('chargingControl', 'admin')).toBe(true)
  })

  it('wraps unexpected errors with gateway metadata', () => {
    const normalized = normalizeGatewayError(new Error('network failed'), {
      code: 'TEST_GATEWAY_ERROR',
      source: 'unit-test',
      message: 'fallback message',
      recoverable: false,
      requiresEngineer: true,
      missingDependency: '/rosapi/topics',
    })

    expect(normalized.message).toBe('network failed')
    expect(normalized.code).toBe('TEST_GATEWAY_ERROR')
    expect(normalized.source).toBe('unit-test')
    expect(normalized.recoverable).toBe(false)
    expect(normalized.requiresEngineer).toBe(true)
    expect(normalized.missingDependency).toBe('/rosapi/topics')
  })

  it('preserves an existing gateway-shaped error', () => {
    const existing = Object.assign(new Error('blocked'), {
      code: 'CAPABILITY_DENIED',
      source: 'access-control',
      recoverable: true,
      requiresEngineer: true,
      missingDependency: null,
    }) satisfies GatewayErrorShape

    const normalized = normalizeGatewayError(existing, {
      code: 'SHOULD_NOT_REPLACE',
      source: 'unit-test',
      message: 'fallback message',
    })

    expect(normalized).toBe(existing)
  })
})
