import { getRosConnectionManager } from '../ros/client'
import { fetchRuntimeTopicMeta } from '../ros/runtimeServices'

import type { CapabilityFlag, CapabilityStatusItem } from '../../types/appShell'
import type { RosConnectionSnapshot, RosServiceRequest } from '../../types/ros'

type JsonRecord = Record<string, unknown>

const ROSAPI_SERVICE_TYPE_NAME = '/rosapi/service_type'
const ROSAPI_SERVICE_TYPE = 'rosapi/ServiceType'

const CAPABILITY_TITLES: Record<CapabilityFlag, string> = {
  overview: '系统总览',
  mapWorkbench: '地图工作台',
  taskManagement: '任务管理',
  scheduleManagement: '调度管理',
  executionControl: '任务执行控制',
  slamWorkbench: 'SLAM 工程台',
  runtimeMonitoring: '运行监控',
  actuatorControl: '执行机构调试',
  chargingControl: '充电控制',
  profileCatalog: 'Profile Catalog',
  systemReadiness: '系统就绪检查',
}

const SERVICE_DEPENDENCIES: Partial<Record<CapabilityFlag, string[]>> = {
  mapWorkbench: [
    '/clean_robot_server/map_server',
    '/database_server/coverage_zone_service',
  ],
  taskManagement: ['/database_server/clean_task_service'],
  scheduleManagement: ['/database_server/clean_schedule_service'],
  executionControl: [
    '/exe_task_server',
    '/coverage_task_manager/get_system_readiness',
  ],
  slamWorkbench: [
    '/slam_workflow/get_state',
    '/slam_workflow/submit_start_mapping',
  ],
  profileCatalog: ['/database_server/profile_catalog_service'],
  systemReadiness: ['/coverage_task_manager/get_system_readiness'],
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

async function probeServiceDependencies(serviceNames: string[]) {
  const results = await Promise.all(
    serviceNames.map(async (serviceName) => {
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

  return results
}

async function probeTopicDependencies(topicNames: string[]) {
  const results = await Promise.all(
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

  return results
}

function createDisconnectedStatuses() {
  return (
    Object.keys(CAPABILITY_TITLES) as CapabilityFlag[]
  ).reduce<Record<CapabilityFlag, CapabilityStatusItem>>((result, key) => {
    result[key] = createStatusItem(
      key,
      key === 'overview' ? 'available' : 'checking',
      key === 'overview' ? '页面壳层已就绪。' : '等待 rosbridge 连接后探测依赖。',
      'gateway',
      [...(SERVICE_DEPENDENCIES[key] ?? []), ...(TOPIC_DEPENDENCIES[key] ?? [])],
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
        [...(SERVICE_DEPENDENCIES[key] ?? []), ...(TOPIC_DEPENDENCIES[key] ?? [])],
      )
    } else if (snapshot.status === 'mock' && key !== 'overview') {
      baseStatus[key] = createStatusItem(
        key,
        'degraded',
        '当前使用 mock 数据，无法确认真实 ROS 依赖是否齐全。',
        'gateway',
        [...(SERVICE_DEPENDENCIES[key] ?? []), ...(TOPIC_DEPENDENCIES[key] ?? [])],
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

      if (missingService && key === 'executionControl') {
        capabilityMap[key] = createStatusItem(
          key,
          'degraded',
          `核心执行服务可用性异常：${missingService.serviceName} - ${missingService.detail}`,
          'rosapi',
          [...serviceDependencies, ...topicDependencies],
          missingService.serviceName,
        )
        return
      }

      if (missingService) {
        capabilityMap[key] = createStatusItem(
          key,
          'missing',
          `缺少服务：${missingService.serviceName}`,
          'rosapi',
          [...serviceDependencies, ...topicDependencies],
          missingService.serviceName,
        )
        return
      }

      if (missingTopic) {
        capabilityMap[key] = createStatusItem(
          key,
          'degraded',
          `实时反馈缺失：${missingTopic.topicName}`,
          'rosapi',
          [...serviceDependencies, ...topicDependencies],
          missingTopic.topicName,
        )
        return
      }

      capabilityMap[key] = createStatusItem(
        key,
        'available',
        '依赖已通过 rosapi 探测。',
        'rosapi',
        [...serviceDependencies, ...topicDependencies],
      )
    }),
  )

  return capabilityMap
}
