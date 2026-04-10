import { create } from 'zustand'

import type {
  ConstraintEditorMode,
  NoGoEditSession,
  Point2D,
  RegionSet,
  VirtualWallDraft,
  VirtualWallEditSession,
  ZoneRectDraft,
} from '../types/map-editor'

interface ConstraintEditorState {
  mode: ConstraintEditorMode
  selectedNoGoAreaId: string | null
  selectedWallId: string | null
  editingNoGo: NoGoEditSession | null
  editingWall: VirtualWallEditSession | null
  draftRectPoints: Point2D[]
  draftDisplayRegion: RegionSet | null
  draftRect: ZoneRectDraft | null
  draftWallPoints: Point2D[]
  draftWallPath: Point2D[][] | null
  draftWall: VirtualWallDraft | null
  saveLoading: boolean
  deleteLoading: boolean
  lastError: string | null
  setMode: (mode: ConstraintEditorMode) => void
  startCreatingNoGo: () => void
  startEditingNoGo: (session: NoGoEditSession, draft: ZoneRectDraft) => void
  startCreatingWall: () => void
  startEditingWall: (session: VirtualWallEditSession, draft: VirtualWallDraft) => void
  cancelMode: () => void
  setSelectedNoGoAreaId: (areaId: string | null) => void
  setSelectedWallId: (wallId: string | null) => void
  setDraftRectPoints: (points: Point2D[]) => void
  setDraftDisplayRegion: (region: RegionSet | null) => void
  setDraftRect: (draft: ZoneRectDraft | null) => void
  setDraftWallPoints: (points: Point2D[]) => void
  setDraftWallPath: (path: Point2D[][] | null) => void
  setDraftWall: (draft: VirtualWallDraft | null) => void
  setSaveLoading: (loading: boolean) => void
  setDeleteLoading: (loading: boolean) => void
  setLastError: (message: string | null) => void
  reset: () => void
}

const initialState = {
  mode: 'idle' as ConstraintEditorMode,
  selectedNoGoAreaId: null,
  selectedWallId: null,
  editingNoGo: null,
  editingWall: null,
  draftRectPoints: [],
  draftDisplayRegion: null,
  draftRect: null,
  draftWallPoints: [],
  draftWallPath: null,
  draftWall: null,
  saveLoading: false,
  deleteLoading: false,
  lastError: null,
}

export const useConstraintEditorStore = create<ConstraintEditorState>((set) => ({
  ...initialState,
  setMode: (mode) => set({ mode }),
  startCreatingNoGo: () =>
    set({
      mode: 'creating-no-go',
      editingNoGo: null,
      editingWall: null,
      draftRectPoints: [],
      draftDisplayRegion: null,
      draftRect: null,
      draftWallPoints: [],
      draftWallPath: null,
      draftWall: null,
      saveLoading: false,
      deleteLoading: false,
      lastError: null,
    }),
  startEditingNoGo: (editingNoGo, draft) =>
    set({
      mode: 'editing-no-go',
      editingNoGo,
      editingWall: null,
      draftRectPoints: [],
      draftDisplayRegion: draft.displayRegion,
      draftRect: draft,
      draftWallPoints: [],
      draftWallPath: null,
      draftWall: null,
      saveLoading: false,
      deleteLoading: false,
      lastError: null,
    }),
  startCreatingWall: () =>
    set({
      mode: 'creating-wall',
      editingNoGo: null,
      editingWall: null,
      draftRectPoints: [],
      draftDisplayRegion: null,
      draftRect: null,
      draftWallPoints: [],
      draftWallPath: null,
      draftWall: null,
      saveLoading: false,
      deleteLoading: false,
      lastError: null,
    }),
  startEditingWall: (editingWall, draft) =>
    set({
      mode: 'editing-wall',
      editingNoGo: null,
      editingWall,
      draftRectPoints: [],
      draftDisplayRegion: null,
      draftRect: null,
      draftWallPoints: [],
      draftWallPath: draft.displayPath,
      draftWall: draft,
      saveLoading: false,
      deleteLoading: false,
      lastError: null,
    }),
  cancelMode: () =>
    set({
      mode: 'idle',
      editingNoGo: null,
      editingWall: null,
      draftRectPoints: [],
      draftDisplayRegion: null,
      draftRect: null,
      draftWallPoints: [],
      draftWallPath: null,
      draftWall: null,
      saveLoading: false,
      deleteLoading: false,
      lastError: null,
    }),
  setSelectedNoGoAreaId: (selectedNoGoAreaId) => set({ selectedNoGoAreaId }),
  setSelectedWallId: (selectedWallId) => set({ selectedWallId }),
  setDraftRectPoints: (draftRectPoints) => set({ draftRectPoints }),
  setDraftDisplayRegion: (draftDisplayRegion) => set({ draftDisplayRegion }),
  setDraftRect: (draftRect) => set({ draftRect }),
  setDraftWallPoints: (draftWallPoints) => set({ draftWallPoints }),
  setDraftWallPath: (draftWallPath) => set({ draftWallPath }),
  setDraftWall: (draftWall) => set({ draftWall }),
  setSaveLoading: (saveLoading) => set({ saveLoading }),
  setDeleteLoading: (deleteLoading) => set({ deleteLoading }),
  setLastError: (lastError) => set({ lastError }),
  reset: () => set(initialState),
}))
