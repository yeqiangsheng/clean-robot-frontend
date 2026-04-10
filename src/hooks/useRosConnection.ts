import { useEffect, useState } from 'react'

import {
  getDefaultRosbridgeUrl,
  getInitialRosbridgeUrl,
  getRosConnectionManager,
  getRosbridgeQuickUrls,
} from '../api/ros/client'
import type { RosConnectionSnapshot } from '../types/ros'

const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

function createMockSnapshot(initialUrl: string): RosConnectionSnapshot {
  return {
    status: 'mock',
    url: initialUrl,
    isConnected: true,
    lastError: null,
    connectedAt: Date.now(),
    sessionId: 1,
  }
}

export function useRosConnection() {
  const manager = getRosConnectionManager()
  const defaultUrl = getDefaultRosbridgeUrl()
  const initialUrl = getInitialRosbridgeUrl()
  const [snapshot, setSnapshot] = useState<RosConnectionSnapshot>(
    USE_MOCK_DATA ? createMockSnapshot(initialUrl) : manager.getSnapshot(),
  )

  useEffect(() => {
    if (USE_MOCK_DATA) {
      return
    }

    const unsubscribe = manager.subscribe(setSnapshot)
    void manager.connect(manager.getSnapshot().url || initialUrl)

    return unsubscribe
  }, [initialUrl, manager])

  return {
    snapshot,
    defaultUrl,
    quickUrls: getRosbridgeQuickUrls(),
    connect: (url: string) => (USE_MOCK_DATA ? Promise.resolve() : manager.connect(url)),
    reconnect: () =>
      (USE_MOCK_DATA
        ? Promise.resolve()
        : manager.connect(manager.getSnapshot().url || defaultUrl)),
  }
}
