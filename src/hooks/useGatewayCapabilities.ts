import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { isModuleEnabled } from '../config/appConfig'
import {
  createCapabilitySnapshot,
} from '../api/gateway/capabilityProbe'
import { fetchCapabilityMap } from '../api/gateway/siteGatewayClient'
import { useAppShellStore } from '../stores/appShellStore'
import { useRosConnection } from './useRosConnection'
import type { AppModuleKey, CapabilityFlag } from '../types/appShell'

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

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

function getEnabledCapabilities(grantedCapabilities: CapabilityFlag[]) {
  const capabilitySet = new Set(grantedCapabilities)

  ;(Object.keys(MODULE_CAPABILITY_MAP) as AppModuleKey[]).forEach((moduleKey) => {
    const capabilities = MODULE_CAPABILITY_MAP[moduleKey]

    if (!capabilities || isModuleEnabled(moduleKey)) {
      return
    }

    capabilities.forEach((capability) => capabilitySet.delete(capability))
  })

  capabilitySet.add('overview')
  return Array.from(capabilitySet)
}

export function useGatewayCapabilities() {
  const { snapshot } = useRosConnection()
  const grantedCapabilities = useAppShellStore((state) => state.grantedCapabilities)
  const enabledCapabilities = useMemo(
    () => getEnabledCapabilities(grantedCapabilities),
    [grantedCapabilities],
  )
  const placeholderData = useMemo(
    () => createCapabilitySnapshot(snapshot, enabledCapabilities),
    [enabledCapabilities, snapshot],
  )

  const query = useQuery({
    queryKey: ['gateway-capabilities', snapshot.sessionId, grantedCapabilities],
    queryFn: () => (USE_MOCK_DATA ? Promise.resolve(placeholderData) : fetchCapabilityMap()),
    enabled: enabledCapabilities.length > 0,
    placeholderData,
    retry: false,
    staleTime: 20000,
  })

  return {
    capabilityMap: query.data ?? placeholderData,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error : null,
  }
}
