import { useEffect, useState } from 'react'

import {
  fetchGatewayHealth,
  requestGatewayRosReconnect,
} from '../api/gateway/siteGatewayClient'
import { USE_MOCK_DATA } from '../config/runtimeMode'
import type { RosConnectionSnapshot } from '../types/ros'

const HEALTH_POLL_INTERVAL_MS = 2000

function createMockSnapshot(): RosConnectionSnapshot {
  return {
    status: 'mock',
    isConnected: true,
    lastError: null,
    connectedAt: Date.now(),
    sessionId: 1,
    gatewayStatus: 'mock',
    gatewayLastError: null,
  }
}

function createInitialSnapshot(): RosConnectionSnapshot {
  return {
    status: 'idle',
    isConnected: false,
    lastError: null,
    connectedAt: null,
    sessionId: 0,
    gatewayStatus: 'checking',
    gatewayLastError: null,
  }
}

type SnapshotListener = (snapshot: RosConnectionSnapshot) => void

class GatewayConnectionMonitor {
  private listeners = new Set<SnapshotListener>()
  private pollHandle: ReturnType<typeof setTimeout> | null = null
  private refreshPromise: Promise<void> | null = null
  private snapshot = USE_MOCK_DATA
    ? createMockSnapshot()
    : createInitialSnapshot()

  private emit() {
    this.listeners.forEach((listener) => listener(this.snapshot))
  }

  private patchSnapshot(patch: Partial<RosConnectionSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    }
    this.emit()
  }

  private scheduleNextPoll() {
    if (USE_MOCK_DATA || this.listeners.size === 0) {
      return
    }

    if (this.pollHandle) {
      globalThis.clearTimeout(this.pollHandle)
    }

    this.pollHandle = globalThis.setTimeout(() => {
      void this.refreshHealth()
    }, HEALTH_POLL_INTERVAL_MS)
  }

  getSnapshot() {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener)
    listener(this.snapshot)

    if (!USE_MOCK_DATA && this.listeners.size === 1) {
      void this.refreshHealth()
    }

    return () => {
      this.listeners.delete(listener)

      if (this.listeners.size === 0 && this.pollHandle) {
        globalThis.clearTimeout(this.pollHandle)
        this.pollHandle = null
      }
    }
  }

  async refreshHealth() {
    if (USE_MOCK_DATA) {
      return
    }

    if (this.refreshPromise) {
      return this.refreshPromise
    }

    this.refreshPromise = fetchGatewayHealth()
      .then((health) => {
        this.patchSnapshot({
          status: health.ros.status,
          isConnected: health.ros.isConnected,
          lastError: health.ros.lastError,
          connectedAt: health.ros.connectedAt,
          sessionId: health.ros.sessionId,
          gatewayStatus: 'online',
          gatewayLastError: null,
        })
      })
      .catch((error) => {
        this.patchSnapshot({
          status: 'error',
          isConnected: false,
          lastError:
            error instanceof Error ? error.message : 'Failed to load site gateway health.',
          gatewayStatus: 'offline',
          gatewayLastError:
            error instanceof Error ? error.message : 'Failed to load site gateway health.',
        })
      })
      .finally(() => {
        this.refreshPromise = null
        this.scheduleNextPoll()
      })

    return this.refreshPromise
  }

  async reconnect() {
    if (USE_MOCK_DATA) {
      return
    }

    this.patchSnapshot({
      status: 'connecting',
      lastError: null,
      gatewayStatus: 'online',
      gatewayLastError: null,
    })

    const response = await requestGatewayRosReconnect()
    this.patchSnapshot({
      ...response.ros,
      gatewayStatus: 'online',
      gatewayLastError: null,
    })
    void this.refreshHealth()
  }
}

const gatewayConnectionMonitor = new GatewayConnectionMonitor()

export function useRosConnection() {
  const [snapshot, setSnapshot] = useState<RosConnectionSnapshot>(
    gatewayConnectionMonitor.getSnapshot(),
  )

  useEffect(() => {
    return gatewayConnectionMonitor.subscribe(setSnapshot)
  }, [])

  return {
    snapshot,
    reconnect: () => gatewayConnectionMonitor.reconnect(),
  }
}
