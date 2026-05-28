export interface MapWorkerDebugSnapshot {
  lastEvent: string
  lastUpdatedAt: number | null
}

let snapshot: MapWorkerDebugSnapshot = {
  lastEvent: 'idle',
  lastUpdatedAt: null,
}

export function setMapWorkerDebugEvent(event: string) {
  snapshot = {
    lastEvent: event,
    lastUpdatedAt: Date.now(),
  }
}

export function getMapWorkerDebugSnapshot() {
  return snapshot
}
