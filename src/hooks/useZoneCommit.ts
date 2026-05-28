import { useMutation } from '@tanstack/react-query'

import { commitCoverageRegion } from '../api/gateway/mapWorkbenchGateway'
import { useZoneEditorStore } from '../stores/zoneEditorStore'
import type { MapAlignment, MapEntity } from '../types/map-editor'
import type { GatewayPayload } from '../types/gateway'

export function useZoneCommit(
  map: MapEntity | null,
  alignment: MapAlignment | null,
  mapName?: string | null,
) {
  const setCommitLoading = useZoneEditorStore((state) => state.setCommitLoading)
  const setLastError = useZoneEditorStore((state) => state.setLastError)

  const mutation = useMutation({
    mutationFn: (options: {
      region: GatewayPayload
      displayName: string
      profileName: string
      zoneId?: string | null
      baseZoneVersion?: number | null
    }) =>
      commitCoverageRegion({
        map,
        mapName,
        alignment,
        region: options.region,
        displayName: options.displayName,
        profileName: options.profileName,
        zoneId: options.zoneId,
        baseZoneVersion: options.baseZoneVersion,
      }),
    onMutate: () => {
      setLastError(null)
      setCommitLoading(true)
    },
    onError: (error) => {
      setLastError(error instanceof Error ? error.message : 'Zone commit failed.')
      setCommitLoading(false)
    },
    onSuccess: () => {
      setLastError(null)
      setCommitLoading(false)
    },
    onSettled: () => {
      setCommitLoading(false)
    },
  })

  return {
    commitZone: mutation.mutateAsync,
    isCommittingZone: mutation.isPending,
  }
}
