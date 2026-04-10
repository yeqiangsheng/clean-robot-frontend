import { create } from 'zustand'

import type {
  MapAlignment,
  Point2D,
  RegionSet,
  ZoneEditSession,
  ZoneRectDraft,
  ZoneDraftPreview,
  ZoneEditorMode,
} from '../types/map-editor'

interface ZoneEditorState {
  mode: ZoneEditorMode
  selectedZoneId: string | null
  activeAlignment: MapAlignment | null
  editingZone: ZoneEditSession | null
  alignmentPoints: Point2D[]
  draftRectPoints: Point2D[]
  draftDisplayRegion: RegionSet | null
  draftRect: ZoneRectDraft | null
  draftPreview: ZoneDraftPreview | null
  previewLoading: boolean
  commitLoading: boolean
  lastError: string | null
  setMode: (mode: ZoneEditorMode) => void
  startAligning: () => void
  startCreatingZone: () => void
  startEditingZone: (session: ZoneEditSession, draft: ZoneRectDraft) => void
  cancelMode: () => void
  setSelectedZoneId: (zoneId: string | null) => void
  setActiveAlignment: (alignment: MapAlignment | null) => void
  setEditingZone: (session: ZoneEditSession | null) => void
  setAlignmentPoints: (points: Point2D[]) => void
  clearAlignmentPoints: () => void
  setDraftRectPoints: (points: Point2D[]) => void
  clearDraftRectPoints: () => void
  setDraftDisplayRegion: (region: RegionSet | null) => void
  setDraftRect: (draft: ZoneRectDraft | null) => void
  setDraftPreview: (preview: ZoneDraftPreview | null) => void
  setPreviewLoading: (loading: boolean) => void
  setCommitLoading: (loading: boolean) => void
  setLastError: (message: string | null) => void
  reset: () => void
}

const initialState = {
  mode: 'idle' as ZoneEditorMode,
  selectedZoneId: null,
  activeAlignment: null,
  editingZone: null,
  alignmentPoints: [],
  draftRectPoints: [],
  draftDisplayRegion: null,
  draftRect: null,
  draftPreview: null,
  previewLoading: false,
  commitLoading: false,
  lastError: null,
}

export const useZoneEditorStore = create<ZoneEditorState>((set) => ({
  ...initialState,
  setMode: (mode) => set({ mode }),
  startAligning: () =>
    set({
      mode: 'aligning',
      editingZone: null,
      alignmentPoints: [],
      draftRectPoints: [],
      draftDisplayRegion: null,
      draftRect: null,
      draftPreview: null,
      previewLoading: false,
      commitLoading: false,
      lastError: null,
    }),
  startCreatingZone: () =>
    set({
      mode: 'creating-zone',
      editingZone: null,
      alignmentPoints: [],
      draftRectPoints: [],
      draftDisplayRegion: null,
      draftRect: null,
      draftPreview: null,
      previewLoading: false,
      commitLoading: false,
      lastError: null,
    }),
  startEditingZone: (editingZone, draft) =>
    set({
      mode: 'editing-zone',
      editingZone,
      alignmentPoints: [],
      draftRectPoints: [],
      draftDisplayRegion: draft.displayRegion,
      draftRect: draft,
      draftPreview: null,
      previewLoading: false,
      commitLoading: false,
      lastError: null,
    }),
  cancelMode: () =>
    set({
      mode: 'idle',
      editingZone: null,
      alignmentPoints: [],
      draftRectPoints: [],
      draftDisplayRegion: null,
      draftRect: null,
      draftPreview: null,
      previewLoading: false,
      commitLoading: false,
      lastError: null,
    }),
  setSelectedZoneId: (selectedZoneId) => set({ selectedZoneId }),
  setActiveAlignment: (activeAlignment) => set({ activeAlignment }),
  setEditingZone: (editingZone) => set({ editingZone }),
  setAlignmentPoints: (alignmentPoints) => set({ alignmentPoints }),
  clearAlignmentPoints: () => set({ alignmentPoints: [] }),
  setDraftRectPoints: (draftRectPoints) => set({ draftRectPoints }),
  clearDraftRectPoints: () => set({ draftRectPoints: [] }),
  setDraftDisplayRegion: (draftDisplayRegion) => set({ draftDisplayRegion }),
  setDraftRect: (draftRect) => set({ draftRect }),
  setDraftPreview: (draftPreview) => set({ draftPreview }),
  setPreviewLoading: (previewLoading) => set({ previewLoading }),
  setCommitLoading: (commitLoading) => set({ commitLoading }),
  setLastError: (lastError) => set({ lastError }),
  reset: () => set(initialState),
}))
