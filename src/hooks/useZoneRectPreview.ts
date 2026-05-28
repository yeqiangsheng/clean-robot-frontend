import { useMutation } from '@tanstack/react-query'

import { previewRectZoneByPoints } from '../api/gateway/mapWorkbenchGateway'
import { useZoneEditorStore } from '../stores/zoneEditorStore'
import type { MapAlignment, MapEntity, Point2D } from '../types/map-editor'

export function useZoneRectPreview(
  map: MapEntity | null,
  alignment: MapAlignment | null,
  mapName?: string | null,
) {
  const setDraftRect = useZoneEditorStore((state) => state.setDraftRect)
  const setDraftDisplayRegion = useZoneEditorStore(
    (state) => state.setDraftDisplayRegion,
  )
  const setLastError = useZoneEditorStore((state) => state.setLastError)
  const setPreviewLoading = useZoneEditorStore((state) => state.setPreviewLoading)

  const mutation = useMutation({
    mutationFn: (points: [Point2D, Point2D]) =>
      previewRectZoneByPoints({
        map,
        mapName,
        alignment,
        points,
      }),
    onMutate: () => {
      setLastError(null)
      setPreviewLoading(true)
    },
    onError: (error) => {
      setDraftRect(null)
      setDraftDisplayRegion(null)
      setLastError(
        error instanceof Error
          ? error.message
          : 'Rect zone preview failed.',
      )
      setPreviewLoading(false)
    },
    onSuccess: (draftRect) => {
      setDraftRect(draftRect)
      setDraftDisplayRegion(draftRect.displayRegion)
      setLastError(null)
      setPreviewLoading(false)
    },
    onSettled: () => {
      setPreviewLoading(false)
    },
  })

  return {
    previewRectZone: mutation.mutateAsync,
    isPreviewingRect: mutation.isPending,
  }
}
