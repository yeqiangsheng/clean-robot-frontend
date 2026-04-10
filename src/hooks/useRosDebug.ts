import { useEffect, useState } from 'react'

import {
  getRosDebugSnapshot,
  subscribeRosDebug,
} from '../api/ros/debug'

export function useRosDebug() {
  const [snapshot, setSnapshot] = useState(getRosDebugSnapshot)

  useEffect(() => subscribeRosDebug(setSnapshot), [])

  return snapshot
}
