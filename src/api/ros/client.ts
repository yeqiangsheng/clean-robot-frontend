import { Ros, Service } from 'roslib'

import {
  getConfiguredQuickRosbridgeUrls,
  getConfiguredRosbridgeUrl,
} from '../../config/appConfig'
import { setRosDebugEvent } from './debug'
import type {
  RosClientLike,
  RosConnectionSnapshot,
  RosServiceCallOptions,
  RosServiceRequest,
  RosServiceResponse,
} from '../../types/ros'

const ENV_DEFAULT_URL = import.meta.env.VITE_ROSBRIDGE_URL ?? 'ws://127.0.0.1:9090'
const ROSBRIDGE_URL_STORAGE_KEY = 'clean-robot-frontend:rosbridge-url'
const DEFAULT_SERVICE_TYPE = 'std_srvs/Trigger'
const DEFAULT_TIMEOUT_SECONDS = 8

type SnapshotListener = (snapshot: RosConnectionSnapshot) => void

function normalizeUrl(value: string | null | undefined) {
  return value?.trim() ?? ''
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function getStoredRosbridgeUrl() {
  if (!canUseStorage()) {
    return ''
  }

  try {
    return normalizeUrl(window.localStorage.getItem(ROSBRIDGE_URL_STORAGE_KEY))
  } catch {
    return ''
  }
}

export function getDefaultRosbridgeUrl() {
  return getConfiguredRosbridgeUrl() || ENV_DEFAULT_URL
}

export function getInitialRosbridgeUrl() {
  return getStoredRosbridgeUrl() || getDefaultRosbridgeUrl()
}

export function getRosbridgeQuickUrls() {
  return Array.from(
    new Set(
      [
        getDefaultRosbridgeUrl(),
        ...getConfiguredQuickRosbridgeUrls(),
        'ws://10.0.0.174:9090',
        'ws://10.0.0.157:9090',
      ]
        .map((value) => normalizeUrl(value))
        .filter(Boolean),
    ),
  )
}

function persistRosbridgeUrl(url: string) {
  if (!canUseStorage()) {
    return
  }

  try {
    const normalizedUrl = normalizeUrl(url)

    if (normalizedUrl.length > 0) {
      window.localStorage.setItem(ROSBRIDGE_URL_STORAGE_KEY, normalizedUrl)
      return
    }

    window.localStorage.removeItem(ROSBRIDGE_URL_STORAGE_KEY)
  } catch {
    // Best effort only: connection switching still works without storage.
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown rosbridge error'
}

class RosConnectionManager implements RosClientLike {
  private ros: Ros | null = null
  private listeners = new Set<SnapshotListener>()
  private connectPromise: Promise<void> | null = null

  private snapshot: RosConnectionSnapshot = {
    status: 'idle',
    url: getInitialRosbridgeUrl(),
    isConnected: false,
    lastError: null,
    connectedAt: null,
    sessionId: 0,
  }

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

  private attachRos(ros: Ros) {
    ros.on('connection', () => {
      setRosDebugEvent('connection:connected')
      this.patchSnapshot({
        status: 'connected',
        isConnected: true,
        lastError: null,
        connectedAt: Date.now(),
        sessionId: this.snapshot.sessionId + 1,
      })
    })

    ros.on('close', () => {
      setRosDebugEvent('connection:closed')
      this.patchSnapshot({
        status: 'closed',
        isConnected: false,
      })
    })

    ros.on('error', (error) => {
      setRosDebugEvent(`connection:error:${getErrorMessage(error)}`)
      this.patchSnapshot({
        status: 'error',
        isConnected: false,
        lastError: getErrorMessage(error),
      })
    })
  }

  private ensureRos() {
    if (!this.ros) {
      this.ros = new Ros()
      this.attachRos(this.ros)
    }

    return this.ros
  }

  async connect(url: string) {
    const nextUrl = normalizeUrl(url) || getDefaultRosbridgeUrl()
    persistRosbridgeUrl(nextUrl)

    if (
      this.snapshot.status === 'connected' &&
      this.snapshot.url === nextUrl &&
      this.ros?.isConnected
    ) {
      return
    }

    if (this.connectPromise && this.snapshot.url === nextUrl) {
      return this.connectPromise
    }

    if (this.ros && this.snapshot.url !== nextUrl) {
      this.disconnect()
    }

    const ros = this.ensureRos()
    setRosDebugEvent(`connection:connecting:${nextUrl}`)
    this.patchSnapshot({
      status: 'connecting',
      url: nextUrl,
      isConnected: false,
      lastError: null,
    })

    this.connectPromise = ros.connect(nextUrl).finally(() => {
      this.connectPromise = null
    })

    return this.connectPromise
  }

  disconnect() {
    setRosDebugEvent('connection:disconnect')
    this.connectPromise = null
    this.ros?.close()
    this.ros = null
  }

  getSnapshot() {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener)
    listener(this.snapshot)

    return () => {
      this.listeners.delete(listener)
    }
  }

  getRos() {
    return this.ros
  }

  async callService<
    TRequest extends RosServiceRequest,
    TResponse extends RosServiceResponse,
  >({
    serviceName,
    serviceType = DEFAULT_SERVICE_TYPE,
    request = {} as TRequest,
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  }: RosServiceCallOptions & { request?: TRequest }) {
    const ros = this.ros

    if (!ros?.isConnected) {
      throw new Error('rosbridge is not connected.')
    }

    return new Promise<TResponse>((resolve, reject) => {
      const service = new Service<TRequest, TResponse>({
        ros,
        name: serviceName,
        serviceType,
      })

      let settled = false
      let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null

      const complete = (handler: () => void) => {
        if (settled) {
          return
        }

        settled = true

        if (timeoutHandle) {
          globalThis.clearTimeout(timeoutHandle)
        }

        handler()
      }

      if (timeoutSeconds > 0) {
        timeoutHandle = globalThis.setTimeout(() => {
          complete(() => {
            reject(
              new Error(
                `ROS service ${serviceName} timed out after ${timeoutSeconds} seconds.`,
              ),
            )
          })
        }, timeoutSeconds * 1000 + 500)
      }

      try {
        service.callService(
          request,
          (response) => complete(() => resolve(response)),
          (error) =>
            complete(() => reject(new Error(getErrorMessage(error)))),
          timeoutSeconds,
        )
      } catch (error) {
        complete(() => reject(new Error(getErrorMessage(error))))
      }
    })
  }
}

const rosConnectionManager = new RosConnectionManager()

export function getRosConnectionManager() {
  return rosConnectionManager
}
