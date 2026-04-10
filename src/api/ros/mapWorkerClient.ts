import type { MapEntity } from '../../types/map-editor'
import { setRosDebugEvent } from './debug'

interface WorkerFetchRequest {
  id: number
  type: 'fetch-current-map'
  url: string
}

interface WorkerSuccessResponse {
  id: number
  type: 'fetch-current-map:success'
  map: MapEntity
}

interface WorkerErrorResponse {
  id: number
  type: 'fetch-current-map:error'
  error: string
}

interface WorkerProgressResponse {
  id: number
  type: 'fetch-current-map:progress'
  event: string
}

type WorkerResponse =
  | WorkerSuccessResponse
  | WorkerErrorResponse
  | WorkerProgressResponse

class RosMapWorkerClient {
  private nextId = 1
  private pending = new Map<
    number,
    {
      resolve: (map: MapEntity) => void
      reject: (error: Error) => void
    }
  >()

  private worker: Worker | null = null

  private ensureWorker() {
    if (this.worker) {
      return this.worker
    }

    this.worker = new Worker(
      new URL('../../workers/rosMapWorker.ts', import.meta.url),
      { type: 'module' },
    )

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data

      if (message.type === 'fetch-current-map:progress') {
        setRosDebugEvent(message.event)
        return
      }

      const pending = this.pending.get(message.id)

      if (!pending) {
        return
      }

      this.pending.delete(message.id)

      if (message.type === 'fetch-current-map:error') {
        pending.reject(new Error(message.error))
        return
      }

      pending.resolve(message.map)
    }

    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Map worker crashed.')

      this.pending.forEach((pending) => {
        pending.reject(error)
      })

      this.pending.clear()
      this.worker?.terminate()
      this.worker = null
    }

    return this.worker
  }

  fetchCurrentMap(url: string) {
    const worker = this.ensureWorker()
    const id = this.nextId
    this.nextId += 1

    return new Promise<MapEntity>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      const request: WorkerFetchRequest = {
        id,
        type: 'fetch-current-map',
        url,
      }

      worker.postMessage(request)
    })
  }
}

const rosMapWorkerClient = new RosMapWorkerClient()

export function fetchCurrentMapFromWorker(url: string) {
  return rosMapWorkerClient.fetchCurrentMap(url)
}
