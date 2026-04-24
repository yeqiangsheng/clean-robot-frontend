import { useEffect } from 'react'

import { useRosConnection } from '../../hooks/useRosConnection'
import { useRuntimeMonitor } from '../../hooks/useRuntimeMonitor'
import { useRuntimeMonitorStore } from '../../stores/runtimeMonitorStore'
import type { RuntimeMonitorOptions } from '../../types/runtime'

export function RuntimeMonitorBridge(options: RuntimeMonitorOptions) {
  const { snapshot } = useRosConnection()
  const runtimeMonitor = useRuntimeMonitor(snapshot, options)
  const setMonitorData = useRuntimeMonitorStore((state) => state.setMonitorData)

  useEffect(() => {
    setMonitorData(runtimeMonitor)
  }, [runtimeMonitor, setMonitorData])

  return null
}
