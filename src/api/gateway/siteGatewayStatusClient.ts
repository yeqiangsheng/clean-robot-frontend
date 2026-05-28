import type { OdometryState } from '../../types/odometry'
import type { OdometryServiceResult } from '../../types/odometry'
import type { ProfileCatalogEntry, ProfileKind } from '../../types/profileCatalog'
import type { RuntimeTopicKey } from '../../types/runtime'
import type { SlamWorkflowJob, SlamWorkflowState } from '../../types/slam-workflow'
import type { SystemReadiness } from '../../types/systemReadiness'
import type { SystemReadinessServiceResult } from '../../types/systemReadiness'
import {
  requestJson,
  type GatewayRosTopicSnapshot,
  type GatewayRuntimeTopicSnapshotMap,
} from './siteGatewayHttp'

export async function fetchGatewaySystemReadiness(taskId: number) {
  return requestJson<SystemReadinessServiceResult>(
    `/system/readiness?taskId=${Math.max(0, Math.round(taskId))}`,
  )
}

export async function fetchGatewaySystemReadinessTopicSnapshot() {
  return requestJson<GatewayRosTopicSnapshot<SystemReadiness>>('/system/readiness/topic')
}

export async function fetchGatewayOdometryState() {
  return requestJson<OdometryServiceResult>('/odometry/state')
}

export async function fetchGatewayOdometryTopicSnapshot() {
  return requestJson<GatewayRosTopicSnapshot<OdometryState>>('/odometry/topic')
}

export async function fetchGatewaySlamState() {
  return requestJson<SlamWorkflowState | null>('/slam/state')
}

export async function fetchGatewaySlamStateTopicSnapshot() {
  return requestJson<GatewayRosTopicSnapshot<SlamWorkflowState>>('/slam/state/topic')
}

export async function fetchGatewaySlamJob(jobId: string) {
  return requestJson<SlamWorkflowJob | null>(`/slam/jobs/${encodeURIComponent(jobId.trim())}`)
}

export async function fetchGatewaySlamJobTopicSnapshot() {
  return requestJson<GatewayRosTopicSnapshot<SlamWorkflowJob>>('/slam/jobs/topic')
}

export async function fetchGatewayRuntimeTopicSnapshots(options: {
  topicKeys?: RuntimeTopicKey[]
  includeEndpointInfo?: boolean
}) {
  const query = new URLSearchParams()

  if (options.topicKeys && options.topicKeys.length > 0) {
    query.set('keys', options.topicKeys.join(','))
  }

  query.set('includeEndpointInfo', String(options.includeEndpointInfo !== false))

  return requestJson<GatewayRuntimeTopicSnapshotMap>(`/runtime/topics?${query.toString()}`)
}

export async function fetchGatewayProfileCatalog(options: {
  profileKind: ProfileKind
  includeDisabled?: boolean
  mapName?: string | null
}) {
  const query = new URLSearchParams({
    profileKind: options.profileKind,
    includeDisabled: String(options.includeDisabled === true),
  })

  if (options.mapName?.trim()) {
    query.set('mapName', options.mapName.trim())
  }

  return requestJson<ProfileCatalogEntry[]>(`/profile-catalog?${query.toString()}`)
}
