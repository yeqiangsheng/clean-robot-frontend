import type { CapabilityFlag, CapabilityStatusItem } from '../../types/appShell'
import type { RosConnectionSnapshot, RosServiceRequest } from '../../types/ros'
import {
  ODOMETRY_STATUS_SERVICE_DEPENDENCY,
  PROFILE_CATALOG_SERVICE_DEPENDENCY,
  SLAM_JOB_SERVICE_DEPENDENCY,
  SLAM_STATUS_SERVICE_DEPENDENCY,
  SYSTEM_READINESS_SERVICE_DEPENDENCY,
  type ServiceDependencyAlternativeGroup,
} from '../ros/queryContracts'
import {
  EXECUTION_SERVICE,
  MAP_CATALOG_SERVICE,
  SCHEDULE_SERVICE,
  SITE_SERVICE_DEPRECATED_FALLBACKS,
  SITE_SERVICE_NAMES,
  SLAM_SUBMIT_SERVICE,
  SLAM_SWITCH_MAP_FALLBACK_SERVICE,
  TASK_SERVICE,
} from '../ros/serviceNames'

type JsonRecord = Record<string, unknown>

const ROSAPI_SERVICE_TYPE_NAME = '/rosapi/service_type'
const ROSAPI_SERVICE_TYPE = 'rosapi/ServiceType'

const CAPABILITY_TITLES: Record<CapabilityFlag, string> = {
  overview: '系统总览',
  mapWorkbench: '地图工作台',
  taskManagement: '任务管理',
  scheduleManagement: '调度管理',
  executionControl: '任务执行控制',
  slamWorkbench: 'SLAM 工作台',
  runtimeMonitoring: '运行监控',
  actuatorControl: '执行机构调试',
  chargingControl: '充电控制',
  profileCatalog: 'Profile Catalog',
  systemReadiness: '系统就绪检查',
}

function createServiceDependencyGroup(
  canonicalServiceName: string,
  deprecatedFallbackProbeNames: string[] = [],
): ServiceDependencyAlternativeGroup {
  return {
    label: canonicalServiceName,
    probeNames: [canonicalServiceName, ...deprecatedFallbackProbeNames],
    preferredServiceName: canonicalServiceName,
  }
}

function flattenServiceDependencyLabels(
  groups: ServiceDependencyAlternativeGroup[],
) {
  return groups.map((group) => group.label)
}

const SERVICE_DEPENDENCIES: Partial<
  Record<CapabilityFlag, ServiceDependencyAlternativeGroup[]>
> = {
  mapWorkbench: [
    createServiceDependencyGroup(MAP_CATALOG_SERVICE.canonicalName, [
      MAP_CATALOG_SERVICE.deprecatedFallbackName,
    ]),
    createServiceDependencyGroup(SITE_SERVICE_NAMES.zone, [
      SITE_SERVICE_DEPRECATED_FALLBACKS[SITE_SERVICE_NAMES.zone],
    ]),
  ],
  taskManagement: [
    createServiceDependencyGroup(TASK_SERVICE.canonicalName, [
      TASK_SERVICE.deprecatedFallbackName,
    ]),
  ],
  scheduleManagement: [
    createServiceDependencyGroup(SCHEDULE_SERVICE.canonicalName, [
      SCHEDULE_SERVICE.deprecatedFallbackName,
    ]),
  ],
  executionControl: [
    createServiceDependencyGroup(EXECUTION_SERVICE.canonicalName, [
      EXECUTION_SERVICE.deprecatedFallbackName,
    ]),
    SYSTEM_READINESS_SERVICE_DEPENDENCY,
  ],
  slamWorkbench: [
    SLAM_STATUS_SERVICE_DEPENDENCY,
    createServiceDependencyGroup(SLAM_SUBMIT_SERVICE.canonicalName, [
      SLAM_SUBMIT_SERVICE.deprecatedFallbackName,
      SLAM_SWITCH_MAP_FALLBACK_SERVICE.serviceName,
    ]),
    SLAM_JOB_SERVICE_DEPENDENCY,
    ODOMETRY_STATUS_SERVICE_DEPENDENCY,
  ],
  profileCatalog: [PROFILE_CATALOG_SERVICE_DEPENDENCY],
  systemReadiness: [SYSTEM_READINESS_SERVICE_DEPENDENCY],
}

const TOPIC_DEPENDENCIES: Partial<Record<CapabilityFlag, string[]>> = {
  runtimeMonitoring: ['/battery_state', '/combined_status', '/station_status'],
  actuatorControl: ['/combined_status', '/battery_state', '/station_status'],
  chargingControl: ['/battery_state', '/station_status'],
}

function createStatusItem(
  key: CapabilityFlag,
  status: CapabilityStatusItem['status'],
  summary: string,
  source: CapabilityStatusItem['source'],
  dependencies: string[],
  missingDependency: string | null = null,
): CapabilityStatusItem {
  return {
    key,
    title: CAPABILITY_TITLES[key],
    status,
    summary,
    source,
    dependencies,
    missingDependency,
  }
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function getServiceType(serviceName: string) {
  const { getRosConnectionManager } = await import('../ros/client')
  const manager = getRosConnectionManager()
  const payload = await manager.callService<RosServiceRequest, JsonRecord>({
    serviceName: ROSAPI_SERVICE_TYPE_NAME,
    serviceType: ROSAPI_SERVICE_TYPE,
    request: {
      service: serviceName,
    },
  })

  return normalizeString(payload.type)
}

async function probeServiceDependencies(
  dependencyGroups: ServiceDependencyAlternativeGroup[],
) {
  return Promise.all(
    dependencyGroups.map(async (dependency) => {
      const probeResults = await Promise.all(
        dependency.probeNames.map(async (serviceName) => {
          try {
            const serviceType = await getServiceType(serviceName)

            return {
              serviceName,
              exists: serviceType.length > 0,
              detail: serviceType || 'service not found',
            }
          } catch (error) {
            return {
              serviceName,
              exists: false,
              detail: error instanceof Error ? error.message : 'service probe failed',
            }
          }
        }),
      )

      const matched = probeResults.find((result) => result.exists)

      return {
        serviceName: dependency.label,
        exists: Boolean(matched),
        detail: matched?.detail ?? probeResults[0]?.detail ?? 'service probe failed',
        preferredServiceName: dependency.preferredServiceName,
      }
    }),
  )
}

async function probeTopicDependencies(topicNames: string[]) {
  const { fetchRuntimeTopicMeta } = await import('../ros/runtimeServices')

  return Promise.all(
    topicNames.map(async (topicName) => {
      try {
        const meta = await fetchRuntimeTopicMeta(topicName)

        return {
          topicName,
          exists: meta.messageType.length > 0,
          detail: meta.messageType || meta.metaError || 'topic type unavailable',
        }
      } catch (error) {
        return {
          topicName,
          exists: false,
          detail: error instanceof Error ? error.message : 'topic probe failed',
        }
      }
    }),
  )
}

function collectDependencyLabels(key: CapabilityFlag) {
  return [
    ...flattenServiceDependencyLabels(SERVICE_DEPENDENCIES[key] ?? []),
    ...(TOPIC_DEPENDENCIES[key] ?? []),
  ]
}

function createDisconnectedStatuses() {
  return (Object.keys(CAPABILITY_TITLES) as CapabilityFlag[]).reduce<
    Record<CapabilityFlag, CapabilityStatusItem>
  >((result, key) => {
    result[key] = createStatusItem(
      key,
      key === 'overview' ? 'available' : 'checking',
      key === 'overview'
        ? '页面壳层已就绪。'
        : '等待站点网关恢复 ROS 会话后继续探测依赖。',
      'gateway',
      collectDependencyLabels(key),
    )
    return result
  }, {} as Record<CapabilityFlag, CapabilityStatusItem>)
}

export function createCapabilitySnapshot(
  snapshot: RosConnectionSnapshot,
  enabledCapabilities: CapabilityFlag[],
) {
  const baseStatus = createDisconnectedStatuses()

  for (const key of Object.keys(baseStatus) as CapabilityFlag[]) {
    if (!enabledCapabilities.includes(key)) {
      baseStatus[key] = createStatusItem(
        key,
        'disabled',
        '该能力已在本地配置中关闭。',
        'config',
        collectDependencyLabels(key),
      )
      continue
    }

    if (snapshot.status === 'mock' && key !== 'overview') {
      baseStatus[key] = createStatusItem(
        key,
        'degraded',
        '当前使用 mock 数据，无法确认真实 ROS 依赖是否齐全。',
        'gateway',
        collectDependencyLabels(key),
      )
    }
  }

  return baseStatus
}

export async function fetchCapabilityStatuses(
  snapshot: RosConnectionSnapshot,
  enabledCapabilities: CapabilityFlag[],
) {
  const capabilityMap = createCapabilitySnapshot(snapshot, enabledCapabilities)

  if (!snapshot.isConnected || snapshot.status === 'mock') {
    return capabilityMap
  }

  const probeKeys = (Object.keys(capabilityMap) as CapabilityFlag[]).filter(
    (key) => capabilityMap[key].status !== 'disabled' && key !== 'overview',
  )

  await Promise.all(
    probeKeys.map(async (key) => {
      const serviceDependencies = SERVICE_DEPENDENCIES[key] ?? []
      const topicDependencies = TOPIC_DEPENDENCIES[key] ?? []

      const [serviceResults, topicResults] = await Promise.all([
        serviceDependencies.length > 0
          ? probeServiceDependencies(serviceDependencies)
          : Promise.resolve([]),
        topicDependencies.length > 0
          ? probeTopicDependencies(topicDependencies)
          : Promise.resolve([]),
      ])

      const missingService = serviceResults.find((item) => !item.exists)
      const missingTopic = topicResults.find((item) => !item.exists)
      const dependencies = [
        ...flattenServiceDependencyLabels(serviceDependencies),
        ...topicDependencies,
      ]

      if (missingService && key === 'executionControl') {
        capabilityMap[key] = createStatusItem(
          key,
          'degraded',
          `核心执行服务可用性异常：${missingService.serviceName} - ${missingService.detail}`,
          'gateway',
          dependencies,
          missingService.preferredServiceName,
        )
        return
      }

      if (missingService) {
        capabilityMap[key] = createStatusItem(
          key,
          'missing',
          `缺少服务：${missingService.serviceName}`,
          'gateway',
          dependencies,
          missingService.preferredServiceName,
        )
        return
      }

      if (missingTopic) {
        capabilityMap[key] = createStatusItem(
          key,
          'degraded',
          `实时反馈缺失：${missingTopic.topicName}`,
          'gateway',
          dependencies,
          missingTopic.topicName,
        )
        return
      }

      capabilityMap[key] = createStatusItem(
        key,
        'available',
        '依赖已通过 rosapi 探测。',
        'gateway',
        dependencies,
      )
    }),
  )

  return capabilityMap
}
