import { create } from 'zustand'

import type { ExecutionCommandResult } from '../types/execution'

interface ExecutionSessionState {
  focusedTaskId: number | null
  focusedTaskName: string | null
  manualTaskId: number
  lastResult: ExecutionCommandResult | null
  transportError: string | null
  setFocusedTaskId: (taskId: number | null) => void
  setFocusedTaskName: (taskName: string | null) => void
  setManualTaskId: (taskId: number) => void
  setLastResult: (result: ExecutionCommandResult | null) => void
  setTransportError: (message: string | null) => void
  reset: () => void
}

const initialState = {
  focusedTaskId: null,
  focusedTaskName: null,
  manualTaskId: 0,
  lastResult: null,
  transportError: null,
}

export const useExecutionSessionStore = create<ExecutionSessionState>((set) => ({
  ...initialState,
  setFocusedTaskId: (focusedTaskId) => set({ focusedTaskId }),
  setFocusedTaskName: (focusedTaskName) => set({ focusedTaskName }),
  setManualTaskId: (manualTaskId) => set({ manualTaskId }),
  setLastResult: (lastResult) => set({ lastResult }),
  setTransportError: (transportError) => set({ transportError }),
  reset: () => set(initialState),
}))
