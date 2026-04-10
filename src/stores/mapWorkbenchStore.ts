import { create } from 'zustand'

import type {
  LayerKey,
  LayerVisibility,
  WorkbenchSelection,
} from '../types/map-editor'

const defaultLayerVisibility: LayerVisibility = {
  map: true,
  zone: true,
  noGoArea: true,
  virtualWall: true,
}

interface MapWorkbenchState {
  layerVisibility: LayerVisibility
  selected: WorkbenchSelection
  showSelectedZoneOnly: boolean
  showSelectedZonePath: boolean
  setLayerVisibility: (layer: LayerKey, visible: boolean) => void
  toggleLayer: (layer: LayerKey) => void
  select: (selection: WorkbenchSelection) => void
  setShowSelectedZoneOnly: (visible: boolean) => void
  setShowSelectedZonePath: (visible: boolean) => void
  reset: () => void
}

export const useMapWorkbenchStore = create<MapWorkbenchState>((set) => ({
  layerVisibility: defaultLayerVisibility,
  selected: null,
  showSelectedZoneOnly: false,
  showSelectedZonePath: false,
  setLayerVisibility: (layer, visible) =>
    set((state) => ({
      layerVisibility: {
        ...state.layerVisibility,
        [layer]: visible,
      },
    })),
  toggleLayer: (layer) =>
    set((state) => ({
      layerVisibility: {
        ...state.layerVisibility,
        [layer]: !state.layerVisibility[layer],
      },
    })),
  select: (selection) => set({ selected: selection }),
  setShowSelectedZoneOnly: (visible) => set({ showSelectedZoneOnly: visible }),
  setShowSelectedZonePath: (visible) => set({ showSelectedZonePath: visible }),
  reset: () =>
    set({
      layerVisibility: defaultLayerVisibility,
      selected: null,
      showSelectedZoneOnly: false,
      showSelectedZonePath: false,
    }),
}))
