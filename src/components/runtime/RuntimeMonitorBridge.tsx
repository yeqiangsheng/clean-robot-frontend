import { useEffect } from 'react'

import { useRosConnection } from '../../hooks/useRosConnection'
import { useRuntimeMonitor } from '../../hooks/useRuntimeMonitor'
import { useRuntimeMonitorStore } from '../../stores/runtimeMonitorStore'

export function RuntimeMonitorBridge() {
  const { snapshot } = useRosConnection()
  const runtimeMonitor = useRuntimeMonitor(snapshot)
  const setMonitorData = useRuntimeMonitorStore((state) => state.setMonitorData)

  useEffect(() => {
    setMonitorData(runtimeMonitor)
  }, [runtimeMonitor, setMonitorData])

  return null
}
