import {
  APP_MODULE_KEYS,
  CAPABILITY_FLAGS,
  getAppConfig,
  isModuleEnabled,
  sanitizeAppConfig,
} from '../../config/appConfig'
import { useAppShellStore } from '../../stores/appShellStore'
import { useRuntimeMonitorStore } from '../../stores/runtimeMonitorStore'
import type { CapabilityFlag, CapabilityStatusItem } from '../../types/appShell'
import type { RobotDiagnosticsBundle } from '../../types/diagnostics'
import type { RosConnectionSnapshot } from '../../types/ros'
import {
  exportGatewayDiagnostics,
  fetchCapabilityMap,
} from './siteGatewayClient'
import { USE_MOCK_DATA } from './gatewayShared'
import { getMapWorkerDebugSnapshot } from './mapWorkerDebug'

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
  dockCalibration: '充电桩标定',
  profileCatalog: 'Profile Catalog',
  systemReadiness: '系统就绪检查',
}

export function getConnectionStatus(): RosConnectionSnapshot {
  return {
    status: 'mock',
    isConnected: true,
    lastError: null,
    connectedAt: Date.now(),
    sessionId: 1,
    gatewayStatus: 'mock',
    gatewayLastError: null,
  }
}

export function getRuntimeSnapshot() {
  return useRuntimeMonitorStore.getState().topicMap
}

export function subscribeRuntime(
  listener: (topicMap: ReturnType<typeof getRuntimeSnapshot>) => void,
) {
  return useRuntimeMonitorStore.subscribe((state) => listener(state.topicMap))
}

export function getAuditEvents() {
  return useAppShellStore.getState().auditEvents
}

export function getEnabledCapabilities() {
  const capabilitySet = new Set<CapabilityFlag>(
    useAppShellStore.getState().grantedCapabilities,
  )

  for (const moduleKey of APP_MODULE_KEYS) {
    if (isModuleEnabled(moduleKey)) {
      continue
    }

    switch (moduleKey) {
      case 'overview':
        capabilitySet.delete('overview')
        break
      case 'workbench':
        capabilitySet.delete('mapWorkbench')
        break
      case 'tasks':
        capabilitySet.delete('taskManagement')
        break
      case 'schedules':
        capabilitySet.delete('scheduleManagement')
        break
      case 'execution':
        capabilitySet.delete('executionControl')
        break
      case 'dock-calibration':
        capabilitySet.delete('dockCalibration')
        break
      case 'slam':
        capabilitySet.delete('slamWorkbench')
        break
      case 'runtime':
        capabilitySet.delete('runtimeMonitoring')
        break
      case 'actuator-control':
        capabilitySet.delete('actuatorControl')
        capabilitySet.delete('chargingControl')
        break
      default:
        break
    }
  }

  capabilitySet.add('overview')
  return Array.from(capabilitySet)
}

export async function getCapabilities(enabledCapabilities: CapabilityFlag[]) {
  if (!USE_MOCK_DATA) {
    return fetchCapabilityMap()
  }

  const enabledSet = new Set(enabledCapabilities)

  return CAPABILITY_FLAGS.reduce<Record<CapabilityFlag, CapabilityStatusItem>>(
    (result, key) => {
      const enabled = enabledSet.has(key)

      result[key] = {
        key,
        title: CAPABILITY_TITLES[key],
        status: enabled ? (key === 'overview' ? 'available' : 'degraded') : 'disabled',
        summary: enabled
          ? '当前使用 mock 数据，真实接口能力由 Site Gateway 在非 mock 模式下确认。'
          : '该能力已在本地配置或当前角色中关闭。',
        source: enabled ? 'gateway' : 'config',
        dependencies: [],
        missingDependency: null,
      }

      return result
    },
    {} as Record<CapabilityFlag, CapabilityStatusItem>,
  )
}

export async function exportDiagnostics(): Promise<{
  filename: string
  bundle: RobotDiagnosticsBundle
}> {
  if (!USE_MOCK_DATA) {
    return exportGatewayDiagnostics() as Promise<{
      filename: string
      bundle: RobotDiagnosticsBundle
    }>
  }

  const connection = getConnectionStatus()
  const runtimeStore = useRuntimeMonitorStore.getState()
  const mapWorkerDebug = getMapWorkerDebugSnapshot()
  const capabilityMap = await getCapabilities(getEnabledCapabilities())

  const errors = [
    connection.lastError
      ? {
          source: 'ros-connection',
          message: connection.lastError,
        }
      : null,
    runtimeStore.metaError
      ? {
          source: 'runtime-monitor',
          message: runtimeStore.metaError,
        }
      : null,
    ...runtimeStore.topicList.flatMap((topic) =>
      [topic.metaError, topic.subscribeError]
        .filter((message): message is string => Boolean(message))
        .map((message) => ({
          source: topic.topicName,
          message,
        })),
    ),
  ].filter((entry): entry is RobotDiagnosticsBundle['errors'][number] => entry !== null)

  const bundle: RobotDiagnosticsBundle = {
    generatedAt: new Date().toISOString(),
    appVersion: __APP_VERSION__,
    buildTime: __APP_BUILD_TIME__,
    config: sanitizeAppConfig(getAppConfig()),
    connection,
    capabilities: Object.values(capabilityMap),
    runtimeTopics: runtimeStore.topicList.map((topic) => ({
      key: topic.key,
      topicName: topic.topicName,
      health: topic.health,
      messageType: topic.messageType,
      lastMessageAt: topic.lastMessageAt,
      ageMs: topic.ageMs,
      metaError: topic.metaError,
      subscribeError: topic.subscribeError,
    })),
    recentAuditEvents: getAuditEvents().slice(0, 50).map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      role: event.role,
      category: event.category,
      action: event.action,
      target: event.target,
      status: event.status,
      message: event.message,
    })),
    lastRosDebugEvent: {
      event: mapWorkerDebug.lastEvent,
      updatedAt: mapWorkerDebug.lastUpdatedAt,
    },
    errors,
  }

  const safeRobotId = getAppConfig().robotId.replace(/[^a-zA-Z0-9_-]+/g, '-')

  return {
    filename: `clean-robot-diagnostics-${safeRobotId || 'robot'}-${Date.now()}.json`,
    bundle,
  }
}
