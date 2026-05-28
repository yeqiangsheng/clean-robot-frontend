import {
  ACTUATOR_CONTROL_TOPICS,
  ACTUATOR_LEVEL_MAX,
  type ActuatorCommand,
} from '../api/gateway/actuatorControlGateway'
import type { ActuatorStatus } from '../types/actuator'

export const STATUS_REFETCH_INTERVAL_MS = 2000
export const WATER_DEFAULT_LEVEL = 30
export const VACUUM_DEFAULT_LEVEL = 70
export const LEVEL_MARKS = { 0: '0', 50: '50', 100: '100' }
export const COMMAND_LOG_LIMIT = 30

export interface PendingCommand {
  key: string
  label: string
}

export interface CommandLogStep {
  label: string
  topicName: string
  messageType: string
  payload: Record<string, unknown>
}

export interface CommandLogItem {
  id: string
  label: string
  sentAt: number
  command: ActuatorCommand
  steps: CommandLogStep[]
}

export function normalizeLevel(value: number) {
  return Math.max(0, Math.min(ACTUATOR_LEVEL_MAX, Math.round(value)))
}

export function formatLevel(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} / 100` : '--'
}

export function normalizePercent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return value >= 0 && value <= 1 ? value * 100 : value
}

export function formatPercent(value: number | null | undefined) {
  const percent = normalizePercent(value)
  return percent === null ? '--' : `${percent.toFixed(0)}%`
}

export function formatVoltageMv(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }

  return value > 1000 ? `${(value / 1000).toFixed(1)} V` : `${value.toFixed(1)} V`
}

export function formatCurrent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--'
  }

  return `${value.toFixed(1)} A`
}

export function formatAge(ageMs: number | null) {
  if (ageMs === null) {
    return '--'
  }

  if (ageMs < 1000) {
    return `${ageMs} ms`
  }

  return `${(ageMs / 1000).toFixed(1)} s`
}

export function formatTimestamp(value: number) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
}

export function formatJson(value: unknown) {
  return JSON.stringify(value)
}

export function createCommandId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown error'
}

export function getConnectionTag(status: string) {
  switch (status) {
    case 'connected':
      return { color: 'success', label: 'ROS 已连接' }
    case 'connecting':
      return { color: 'processing', label: 'ROS 连接中' }
    case 'error':
      return { color: 'error', label: 'ROS 异常' }
    case 'mock':
      return { color: 'purple', label: 'Mock 数据' }
    case 'closed':
      return { color: 'warning', label: 'ROS 已断开' }
    default:
      return { color: 'default', label: 'ROS 未连接' }
  }
}

export function getPositionTagColor(position: number | null) {
  switch (position) {
    case 1:
      return 'green'
    case 2:
      return 'processing'
    case 0:
      return 'default'
    default:
      return 'warning'
  }
}

export function getCommandStateTag(state: string | undefined) {
  switch (state) {
    case 'idle':
      return { color: 'default', label: '暂无命令' }
    case 'sending':
      return { color: 'processing', label: '执行中' }
    case 'sent':
      return { color: 'green', label: '命令已下发' }
    case 'failed':
      return { color: 'red', label: '失败' }
    default:
      return { color: 'default', label: '状态未知' }
  }
}

export function getDockSupplyStateColor(state: string | undefined) {
  switch (state) {
    case 'IDLE':
    case 'DONE':
    case 'READY_TO_EXIT':
      return 'green'
    case 'FAILED':
      return 'red'
    case 'CANCELED':
      return 'orange'
    case 'UNKNOWN':
    case undefined:
      return 'default'
    default:
      return 'processing'
  }
}

export function buildWaterSteps(enabled: boolean, level: number): CommandLogStep[] {
  return enabled
    ? [
        {
          label: '清水阀打开',
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 2, operation: 1 },
        },
        {
          label: `清水泵力度 ${level}`,
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 1, operation: level },
        },
      ]
    : [
        {
          label: '清水泵关闭',
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 1, operation: 0 },
        },
        {
          label: '清水阀关闭',
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 2, operation: 0 },
        },
      ]
}

export function buildVacuumSteps(enabled: boolean, level: number): CommandLogStep[] {
  return enabled
    ? [
        {
          label: `吸水机力度 ${level}`,
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 5, operation: level },
        },
        {
          label: `真空电机速度 ${level}`,
          topicName: ACTUATOR_CONTROL_TOPICS.motor.name,
          messageType: ACTUATOR_CONTROL_TOPICS.motor.type,
          payload: { vel: level },
        },
      ]
    : [
        {
          label: '吸水机关闭',
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 5, operation: 0 },
        },
        {
          label: '真空电机关闭',
          topicName: ACTUATOR_CONTROL_TOPICS.motor.name,
          messageType: ACTUATOR_CONTROL_TOPICS.motor.type,
          payload: { vel: 0 },
        },
      ]
}

export function buildBrushSteps(work: boolean): CommandLogStep[] {
  return work
    ? [
        {
          label: '刷盘下降',
          topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
          messageType: ACTUATOR_CONTROL_TOPICS.cleanTools.type,
          payload: { tool_id: 1, operation: 2 },
        },
        {
          label: '刷盘打开',
          topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
          messageType: ACTUATOR_CONTROL_TOPICS.cleanTools.type,
          payload: { tool_id: 1, operation: 3 },
        },
      ]
    : [
        {
          label: '刷盘关闭',
          topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
          messageType: ACTUATOR_CONTROL_TOPICS.cleanTools.type,
          payload: { tool_id: 1, operation: 4 },
        },
        {
          label: '刷盘上升',
          topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
          messageType: ACTUATOR_CONTROL_TOPICS.cleanTools.type,
          payload: { tool_id: 1, operation: 1 },
        },
      ]
}

export function buildScraperSteps(deploy: boolean): CommandLogStep[] {
  return [
    {
      label: deploy ? '刮扒放下' : '刮扒收起',
      topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
      messageType: ACTUATOR_CONTROL_TOPICS.cleanTools.type,
      payload: { tool_id: 2, operation: deploy ? 2 : 1 },
    },
  ]
}

export function buildServiceStep(label: string, serviceName: string, serviceType: string, payload = {}) {
  return {
    label,
    topicName: serviceName,
    messageType: serviceType,
    payload,
  }
}

export function buildStationControlStep(label: string, operation: number, status: boolean) {
  return {
    label,
    topicName: ACTUATOR_CONTROL_TOPICS.stationControl.name,
    messageType: ACTUATOR_CONTROL_TOPICS.stationControl.type,
    payload: { operation, status },
  }
}

export function buildChargeEnableStep(enabled: boolean) {
  return {
    label: enabled ? '车端充电允许打开' : '车端充电允许关闭',
    topicName: ACTUATOR_CONTROL_TOPICS.chargeEnable.name,
    messageType: ACTUATOR_CONTROL_TOPICS.chargeEnable.type,
    payload: { data: enabled },
  }
}

export function buildChargingSteps(enabled: boolean): CommandLogStep[] {
  return [
    buildChargeEnableStep(enabled),
    buildStationControlStep(enabled ? '桩端充电机打开' : '桩端充电机关闭', 1, enabled),
  ]
}

export function buildStationRefillSteps(enabled: boolean): CommandLogStep[] {
  return enabled
    ? [
        {
          label: '车端清水阀打开',
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 2, operation: 1 },
        },
        buildStationControlStep('桩端补水打开', 11, true),
      ]
    : [
        buildStationControlStep('桩端补水关闭', 11, false),
        {
          label: '车端清水阀关闭',
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 2, operation: 0 },
        },
      ]
}

export function buildStationDrainSteps(enabled: boolean): CommandLogStep[] {
  return enabled
    ? [
        {
          label: '车端污水阀打开',
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 3, operation: 1 },
        },
        buildStationControlStep('桩端排水打开', 3, true),
      ]
    : [
        buildStationControlStep('桩端排水关闭', 3, false),
        {
          label: '车端污水阀关闭',
          topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
          messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
          payload: { tap_id: 3, operation: 0 },
        },
      ]
}

export function getStepsForCommand(command: ActuatorCommand): CommandLogStep[] {
  switch (command.kind) {
    case 'waterSequence':
      return buildWaterSteps(command.enabled, normalizeLevel(command.level ?? WATER_DEFAULT_LEVEL))
    case 'vacuumChain':
      return buildVacuumSteps(command.enabled, normalizeLevel(command.level ?? VACUUM_DEFAULT_LEVEL))
    case 'brushWorkPosition':
      return buildBrushSteps(true)
    case 'brushRetract':
      return buildBrushSteps(false)
    case 'scraperDeploy':
      return buildScraperSteps(true)
    case 'scraperStow':
      return buildScraperSteps(false)
    case 'dockSupplyStart':
      return [buildServiceStep('启动自动补给/充电', '/dock_supply/start', 'std_srvs/Trigger')]
    case 'dockSupplyCancel':
      return [buildServiceStep('取消补给/充电流程', '/dock_supply/cancel', 'std_srvs/Trigger')]
    case 'dockSupplyDeferExit':
      return [
        buildServiceStep('设置完成后停留在桩上', '/dock_supply/set_defer_exit', 'std_srvs/SetBool', {
          data: command.enabled,
        }),
      ]
    case 'dockSupplyExit':
      return [buildServiceStep('执行离桩', '/dock_supply/exit', 'std_srvs/Trigger')]
    case 'chargingSequence':
      return buildChargingSteps(command.enabled)
    case 'stationRefillSequence':
      return buildStationRefillSteps(command.enabled)
    case 'stationDrainSequence':
      return buildStationDrainSteps(command.enabled)
    case 'stationRodConnect':
      return [buildStationControlStep('机械连接/伸出', 9, true)]
    case 'stationRodReset':
      return [buildStationControlStep('机械复位/收回', 8, true)]
    default: {
      const exhaustiveCheck: never = command
      return exhaustiveCheck
    }
  }
}

export function getStatusDisabledReason({
  hasCapability,
  rosConnected,
  status,
  statusLoading,
  pendingCommand,
}: {
  hasCapability: boolean
  rosConnected: boolean
  status: ActuatorStatus | null
  statusLoading: boolean
  pendingCommand: PendingCommand | null
}) {
  if (!hasCapability) {
    return '当前用户没有 actuatorControl 权限'
  }

  if (!rosConnected) {
    return 'ROS 未连接'
  }

  if (pendingCommand) {
    return `${pendingCommand.label} 正在下发`
  }

  if (statusLoading && !status) {
    return '等待执行机构状态'
  }

  if (!status) {
    return '执行机构状态不可用'
  }

  if (!status.mcoreConnected) {
    return 'M-core bridge 未连接'
  }

  if (!status.available && status.disabledReasons.length > 0) {
    return status.disabledReasons[0]
  }

  return ''
}

export async function copyText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  throw new Error('Clipboard API is not available.')
}
