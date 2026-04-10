import { useMutation, useQueryClient } from '@tanstack/react-query'

import { confirmMapAlignmentByPoints } from '../api/gateway/robotGateway'
import { useZoneEditorStore } from '../stores/zoneEditorStore'
import type { MapAlignment, MapEntity, Point2D } from '../types/map-editor'

export function useAlignment(
  map: MapEntity | null,
  alignment: MapAlignment | null,
  mapName?: string | null,
) {
  const queryClient = useQueryClient()
  const setActiveAlignment = useZoneEditorStore((state) => state.setActiveAlignment)
  const setLastError = useZoneEditorStore((state) => state.setLastError)
  const clearAlignmentPoints = useZoneEditorStore(
    (state) => state.clearAlignmentPoints,
  )
  const setMode = useZoneEditorStore((state) => state.setMode)

  const mutation = useMutation({
    mutationFn: (points: [Point2D, Point2D]) =>
      confirmMapAlignmentByPoints({
        map,
        mapName,
        alignment,
        points,
      }),
    onMutate: () => {
      setLastError(null)
    },
    onError: (error) => {
      clearAlignmentPoints()
      setLastError(
        error instanceof Error
          ? error.message
          : 'Alignment confirmation failed.',
      )
    },
    onSuccess: async (nextAlignment) => {
      setActiveAlignment(nextAlignment)

      try {
        await queryClient.refetchQueries({
          queryKey: ['workbench'],
          type: 'active',
        })
      } finally {
        clearAlignmentPoints()
        setLastError(null)
        setMode('idle')
      }
    },
  })

  return {
    confirmAlignment: mutation.mutateAsync,
    isConfirming: mutation.isPending,
  }
}
