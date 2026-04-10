export interface RosDebugSnapshot {
  lastEvent: string
  lastUpdatedAt: number | null
}

type RosDebugListener = (snapshot: RosDebugSnapshot) => void

const listeners = new Set<RosDebugListener>()

let snapshot: RosDebugSnapshot = {
  lastEvent: 'idle',
  lastUpdatedAt: null,
}

export function setRosDebugEvent(event: string) {
  snapshot = {
    lastEvent: event,
    lastUpdatedAt: Date.now(),
  }

  listeners.forEach((listener) => listener(snapshot))
}

export function getRosDebugSnapshot() {
  return snapshot
}

export function subscribeRosDebug(listener: RosDebugListener) {
  listeners.add(listener)
  listener(snapshot)

  return () => {
    listeners.delete(listener)
  }
}
