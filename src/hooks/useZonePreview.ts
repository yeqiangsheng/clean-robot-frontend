import { useMutation } from '@tanstack/react-query'

import { previewCoverageRegion } from '../api/gateway/robotGateway'
import { useZoneEditorStore } from '../stores/zoneEditorStore'
import type { MapAlignment, MapEntity } from '../types/map-editor'
import type { RosServiceRequest } from '../types/ros'

export function useZonePreview(
  map: MapEntity | null,
  alignment: MapAlignment | null,
  mapName?: string | null,
) {
  const setDraftPreview = useZoneEditorStore((state) => state.setDraftPreview)
  const setLastError = useZoneEditorStore((state) => state.setLastError)
  const setPreviewLoading = useZoneEditorStore((state) => state.setPreviewLoading)

  const mutation = useMutation({
    mutationFn: (options: { region: RosServiceRequest; profileName: string }) =>
      previewCoverageRegion({
        map,
        mapName,
        alignment,
        region: options.region,
        profileName: options.profileName,
      }),
    onMutate: () => {
      setLastError(null)
      setPreviewLoading(true)
    },
    onError: (error) => {
      setDraftPreview(null)
      setLastError(
        error instanceof Error ? error.message : 'Coverage preview failed.',
      )
      setPreviewLoading(false)
    },
    onSuccess: (draftPreview) => {
      setDraftPreview(draftPreview)
      setLastError(null)
      setPreviewLoading(false)
    },
    onSettled: () => {
      setPreviewLoading(false)
    },
  })

  return {
    previewZone: mutation.mutateAsync,
    isPreviewingZone: mutation.isPending,
  }
}
