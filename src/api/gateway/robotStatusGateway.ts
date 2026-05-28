import {
  fetchGatewayOdometryState,
  fetchGatewayProfileCatalog,
  fetchGatewaySlamJob,
  fetchGatewaySlamState,
  fetchGatewaySystemReadiness,
} from './siteGatewayStatusClient'
import { assertCapabilityAllowed, normalizeGatewayError } from './accessControl'
import { assertAnyCapabilityAllowed } from './gatewayShared'
import { USE_MOCK_DATA } from '../../config/runtimeMode'
import {
  ODOMETRY_STATUS_QUERY_CONTRACT,
  PROFILE_CATALOG_QUERY_CONTRACT,
  SLAM_JOB_QUERY_CONTRACT,
  SLAM_STATUS_QUERY_CONTRACT,
  SYSTEM_READINESS_QUERY_CONTRACT,
} from '../contracts/queryContracts'
import type { ProfileCatalogEntry, ProfileKind } from '../../types/profileCatalog'
import type {
  SystemReadiness,
  SystemReadinessServiceResult,
} from '../../types/systemReadiness'

function createMockProfile(
  profileKind: Exclude<ProfileKind, ''>,
  profileName: string,
  displayName: string,
  isDefault: boolean,
): ProfileCatalogEntry {
  return {
    profileName,
    displayName,
    profileKind,
    enabled: true,
    isDefault,
    description: displayName,
    version: 'mock-v1',
    tags: ['mock'],
    supportedCleanModes: profileKind === 'plan' ? ['scrub', 'sweep'] : [],
    supportedMaps: ['F2Q区精密装配车间'],
    warnings: [],
    raw: {
      source: 'mock',
      profile_name: profileName,
      profile_kind: profileKind,
    },
  }
}

function getMockProfileCatalog(
  profileKind: ProfileKind,
  includeDisabled?: boolean,
) {
  const entries: ProfileCatalogEntry[] =
    profileKind === 'sys'
      ? [
          createMockProfile('sys', 'standard', '标准系统档位', true),
          createMockProfile('sys', 'quiet', '低噪系统档位', false),
        ]
      : [
          createMockProfile('plan', 'cover_standard', '标准覆盖档位', true),
          createMockProfile('plan', 'cover_deep', '深度覆盖档位', false),
        ]

  return includeDisabled
    ? entries
    : entries.filter((entry) => entry.enabled)
}

function createMockSystemReadiness(taskId: number): SystemReadiness {
  const normalizedTaskId = Math.max(0, Math.round(taskId))

  return {
    overallReady: true,
    canStartTask: true,
    taskId: normalizedTaskId,
    taskName: normalizedTaskId > 0 ? `测试任务${normalizedTaskId}` : '',
    taskMapName: 'F2Q区精密装配车间',
    taskZoneId: normalizedTaskId > 0 ? 'zone_ae68ffc8' : '',
    taskPlanProfile: 'cover_standard',
    activeMapName: 'F2Q区精密装配车间',
    activeMapId: 'mock-map-f2q',
    activeMapMd5: 'mock-map-md5',
    runtimeMapName: 'F2Q区精密装配车间',
    runtimeMapId: 'mock-map-f2q',
    runtimeMapMd5: 'mock-map-md5',
    missionState: 'IDLE',
    phase: 'IDLE',
    publicState: 'IDLE',
    executorState: 'IDLE',
    dockSupplyState: 'IDLE',
    batterySoc: 0.8,
    batteryValid: true,
    blockingReasons: [],
    warnings: ['mock data'],
    checks: [
      {
        key: 'runtime_map',
        level: 'ok',
        ok: true,
        fresh: true,
        stale: false,
        missing: false,
        ageS: 0,
        summary: 'Mock runtime map is ready.',
        raw: {},
      },
      {
        key: 'localization',
        level: 'ok',
        ok: true,
        fresh: true,
        stale: false,
        missing: false,
        ageS: 0,
        summary: 'Mock localization is fresh.',
        raw: {},
      },
    ],
    stampMs: Date.now(),
    raw: {
      source: 'mock',
    },
  }
}

export async function queryProfileCatalog(options: {
  profileKind: ProfileKind
  includeDisabled?: boolean
  mapName?: string | null
}) {
  assertCapabilityAllowed('profileCatalog', 'profile catalog query')

  if (USE_MOCK_DATA) {
    return getMockProfileCatalog(options.profileKind, options.includeDisabled)
  }

  try {
    return await fetchGatewayProfileCatalog(options)
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'PROFILE_CATALOG_FAILED',
      source: 'site-gateway',
      message: 'Profile catalog query failed.',
      recoverable: true,
      missingDependency: PROFILE_CATALOG_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

export async function getSystemReadiness(
  taskId: number,
): Promise<SystemReadinessServiceResult> {
  assertAnyCapabilityAllowed(
    ['systemReadiness', 'executionControl', 'overview'],
    'system readiness',
  )

  if (USE_MOCK_DATA) {
    return {
      success: true,
      message: 'mock readiness ok',
      readiness: createMockSystemReadiness(taskId),
      raw: {
        source: 'mock',
      },
    }
  }

  try {
    return await fetchGatewaySystemReadiness(taskId)
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'SYSTEM_READINESS_FAILED',
      source: 'site-gateway',
      message: 'System readiness query failed.',
      recoverable: true,
      missingDependency: SYSTEM_READINESS_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

export async function getOdometryState() {
  assertCapabilityAllowed('slamWorkbench', 'odometry status')

  try {
    return await fetchGatewayOdometryState()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'ODOMETRY_STATUS_FAILED',
      source: 'site-gateway',
      message: 'Odometry status query failed.',
      recoverable: true,
      missingDependency: ODOMETRY_STATUS_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

export async function getSlamState() {
  assertCapabilityAllowed('slamWorkbench', 'SLAM status')

  try {
    return await fetchGatewaySlamState()
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'SLAM_STATE_FAILED',
      source: 'site-gateway',
      message: 'SLAM status query failed.',
      recoverable: true,
      missingDependency: SLAM_STATUS_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}

export async function getSlamJob(jobId: string) {
  assertCapabilityAllowed('slamWorkbench', 'SLAM job query')

  try {
    return await fetchGatewaySlamJob(jobId)
  } catch (error) {
    throw normalizeGatewayError(error, {
      code: 'SLAM_JOB_FAILED',
      source: 'site-gateway',
      message: 'SLAM job query failed.',
      recoverable: true,
      missingDependency: SLAM_JOB_QUERY_CONTRACT.canonical.serviceName,
    })
  }
}
