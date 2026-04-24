import { Ros, Service } from 'roslib'

import { setRosDebugEvent } from './debug'
import { getDefaultRosbridgeUrl } from './connectionUrl'
import type {
  RosClientLike,
  RosConnectionSnapshot,
  RosServiceCallOptions,
  RosServiceRequest,
  RosServiceResponse,
} from '../../types/ros'

const DEFAULT_SERVICE_TYPE = 'std_srvs/Trigger'
const DEFAULT_TIMEOUT_SECONDS = 8

type SnapshotListener = (snapshot: RosConnectionSnapshot) => void

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown rosbridge error'
}

export function getInitialRosbridgeUrl() {
  return getDefaultRosbridgeUrl()
}

export function getRosbridgeQuickUrls() {
  return [getDefaultRosbridgeUrl()]
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
    gatewayStatus: 'online',
    gatewayLastError: null,
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

  async connect(url?: string) {
    const nextUrl = url?.trim() || getDefaultRosbridgeUrl()

    if (
      this.snapshot.status === 'connected' &&
      this.snapshot.url === nextUrl &&
      this.ros?.isConnected
    ) {
      return
    }

    if (this.connectPromise) {
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

    this.connectPromise = Promise.resolve(ros.connect(nextUrl)).finally(() => {
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
      throw new Error('rosbridge proxy is not connected.')
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
