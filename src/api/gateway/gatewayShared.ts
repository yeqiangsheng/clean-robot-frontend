import { useAppShellStore } from '../../stores/appShellStore'
import type { CapabilityFlag, GatewayErrorShape } from '../../types/appShell'
export { USE_MOCK_DATA } from '../../config/runtimeMode'
import { assertCapabilityAllowed, normalizeGatewayError } from './accessControl'

export function assertAnyCapabilityAllowed(
  capabilities: CapabilityFlag[],
  actionLabel: string,
) {
  const capabilitySet = new Set(useAppShellStore.getState().grantedCapabilities)

  if (capabilities.some((capability) => capabilitySet.has(capability))) {
    return
  }

  assertCapabilityAllowed(capabilities[0], actionLabel)
}

export function normalizeGatewayOperationError(error: unknown): GatewayErrorShape {
  return normalizeGatewayError(error, {
    code: 'GATEWAY_OPERATION_FAILED',
    source: 'site-gateway',
    message: 'Gateway 操作失败。',
    recoverable: true,
  })
}
