import { create } from 'zustand'

import type {
  SlamCommandPreview,
  SlamWorkflowJob,
} from '../types/slam-workflow'

const STORAGE_KEY = 'clean-robot-frontend:slam-workbench'
const MAX_JOB_HISTORY = 10

type PersistedState = {
  activeJobId: string
  jobHistory: SlamWorkflowJob[]
  relocalizeExpanded: boolean
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readPersistedState(): PersistedState {
  if (!canUseStorage()) {
    return {
      activeJobId: '',
      jobHistory: [],
      relocalizeExpanded: false,
    }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {
        activeJobId: '',
        jobHistory: [],
        relocalizeExpanded: false,
      }
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>

    return {
      activeJobId:
        typeof parsed.activeJobId === 'string' ? parsed.activeJobId : '',
      jobHistory: Array.isArray(parsed.jobHistory)
        ? parsed.jobHistory.filter(
            (job): job is SlamWorkflowJob =>
              typeof job === 'object' &&
              job !== null &&
              typeof (job as SlamWorkflowJob).jobId === 'string',
          )
        : [],
      relocalizeExpanded: parsed.relocalizeExpanded === true,
    }
  } catch {
    return {
      activeJobId: '',
      jobHistory: [],
      relocalizeExpanded: false,
    }
  }
}

function persistState(payload: PersistedState) {
  if (!canUseStorage()) {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Best effort only.
  }
}

function upsertJobHistory(
  history: SlamWorkflowJob[],
  job: SlamWorkflowJob,
): SlamWorkflowJob[] {
  const next = [job, ...history.filter((item) => item.jobId !== job.jobId)]
  return next.slice(0, MAX_JOB_HISTORY)
}

const persisted = readPersistedState()

interface SlamWorkbenchState {
  activeJobId: string
  jobHistory: SlamWorkflowJob[]
  relocalizeExpanded: boolean
  jsonPreview: SlamCommandPreview | null
  setActiveJobId: (jobId: string) => void
  upsertJobHistory: (job: SlamWorkflowJob) => void
  clearHistory: () => void
  setRelocalizeExpanded: (expanded: boolean) => void
  openJsonPreview: (payload: SlamCommandPreview) => void
  closeJsonPreview: () => void
  reset: () => void
}

function persistFromState(state: Pick<SlamWorkbenchState, 'activeJobId' | 'jobHistory' | 'relocalizeExpanded'>) {
  persistState({
    activeJobId: state.activeJobId,
    jobHistory: state.jobHistory,
    relocalizeExpanded: state.relocalizeExpanded,
  })
}

export const useSlamWorkbenchStore = create<SlamWorkbenchState>((set) => ({
  activeJobId: persisted.activeJobId,
  jobHistory: persisted.jobHistory,
  relocalizeExpanded: persisted.relocalizeExpanded,
  jsonPreview: null,
  setActiveJobId: (jobId) =>
    set((state) => {
      const nextState = {
        ...state,
        activeJobId: jobId.trim(),
      }
      persistFromState(nextState)
      return nextState
    }),
  upsertJobHistory: (job) =>
    set((state) => {
      const nextState = {
        ...state,
        jobHistory: upsertJobHistory(state.jobHistory, job),
      }
      persistFromState(nextState)
      return nextState
    }),
  clearHistory: () =>
    set((state) => {
      const nextState = {
        ...state,
        jobHistory: [],
      }
      persistFromState(nextState)
      return nextState
    }),
  setRelocalizeExpanded: (expanded) =>
    set((state) => {
      const nextState = {
        ...state,
        relocalizeExpanded: expanded,
      }
      persistFromState(nextState)
      return nextState
    }),
  openJsonPreview: (payload) => set({ jsonPreview: payload }),
  closeJsonPreview: () => set({ jsonPreview: null }),
  reset: () =>
    set(() => {
      const nextState = {
        activeJobId: '',
        jobHistory: [],
        relocalizeExpanded: false,
        jsonPreview: null,
      }
      persistFromState(nextState)
      return nextState
    }),
}))
