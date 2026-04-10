import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { getDefaultRolePolicy, isModuleEnabled } from '../config/appConfig'
import {
  createCapabilitySnapshot,
  fetchCapabilityStatuses,
} from '../api/gateway/capabilityProbe'
import { useRosConnection } from './useRosConnection'
import type { AppModuleKey, CapabilityFlag } from '../types/appShell'

const MODULE_CAPABILITY_MAP: Partial<Record<AppModuleKey, CapabilityFlag[]>> = {
  overview: ['overview'],
  workbench: ['mapWorkbench'],
  tasks: ['taskManagement'],
  schedules: ['scheduleManagement'],
  execution: ['executionControl'],
  slam: ['slamWorkbench'],
  runtime: ['runtimeMonitoring'],
  'actuator-control': ['actuatorControl', 'chargingControl'],
}

function getEnabledCapabilities() {
  const rolePolicy = getDefaultRolePolicy()
  const capabilitySet = new Set<CapabilityFlag>()

  ;(Object.keys(rolePolicy) as Array<keyof typeof rolePolicy>).forEach((role) => {
    ;(rolePolicy[role] ?? []).forEach((capability) => capabilitySet.add(capability))
  })

  ;(Object.keys(MODULE_CAPABILITY_MAP) as AppModuleKey[]).forEach((moduleKey) => {
    const capabilities = MODULE_CAPABILITY_MAP[moduleKey]

    if (!capabilities) {
      return
    }

    if (!isModuleEnabled(moduleKey)) {
      capabilities.forEach((capability) => capabilitySet.delete(capability))
    }
  })

  capabilitySet.add('overview')
  return Array.from(capabilitySet)
}

export function useGatewayCapabilities() {
  const { snapshot } = useRosConnection()
  const enabledCapabilities = useMemo(() => getEnabledCapabilities(), [])
  const placeholderData = useMemo(
    () => createCapabilitySnapshot(snapshot, enabledCapabilities),
    [enabledCapabilities, snapshot],
  )

  const query = useQuery({
    queryKey: ['gateway-capabilities', snapshot.url, snapshot.sessionId, enabledCapabilities],
    queryFn: () => fetchCapabilityStatuses(snapshot, enabledCapabilities),
    enabled: snapshot.isConnected || snapshot.status === 'mock',
    placeholderData,
    retry: false,
    staleTime: 20_000,
  })

  return {
    capabilityMap: query.data ?? placeholderData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error : null,
  }
}
