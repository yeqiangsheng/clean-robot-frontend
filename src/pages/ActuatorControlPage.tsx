import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'

import {
  Button,
  Card,
  Descriptions,
  Progress,
  Slider,
  Space,
  Tag,
  Typography,
} from 'antd'

import {
  ACTUATOR_CONTROL_TOPICS,
  ACTUATOR_LEVEL_MAX,
  runActuatorCommand,
} from '../api/gateway/actuatorControlGateway'
import {
  formatChargeEnableCommand,
  formatCleanToolCommand,
  formatMotorCommand,
  formatStationChargeCommand,
  formatWaterTapCommand,
  type ActuatorPacketPreview,
  type PacketConfidence,
} from '../api/ros/actuatorPacketFormatter'
import { AppEmptyState } from '../components/feedback/AppEmptyState'
import { AppFeedbackBanner } from '../components/feedback/AppFeedbackBanner'
import { RosbridgeEndpointControl } from '../components/ros/RosbridgeEndpointControl'
import { useAppFeedback } from '../hooks/useAppFeedback'
import { useRosConnection } from '../hooks/useRosConnection'
import { useRuntimeMonitorStore } from '../stores/runtimeMonitorStore'
import type { RuntimeTopicHealth, RuntimeTopicSnapshot } from '../types/runtime'
import {
  STATION_STATUS_NON_BLOCKING_DESCRIPTION,
  STATION_STATUS_NON_BLOCKING_TITLE,
  getStationStatusTag,
  isStationStatusNonBlocking,
} from '../utils/stationStatus'
import './ActuatorControlPage.css'

const PRESET_LEVELS = [0, 16, 32, 48, 64]
const LEVEL_MARKS = { 0: '0', 64: '64' }
const COMMAND_LOG_LIMIT = 40
const BATTERY_POWER_SUPPLY_STATUS_LABELS: Record<number, string> = {
  0: 'Unknown',
  1: 'Charging',
  2: 'Discharging',
  3: 'Not charging',
  4: 'Full',
}
const AGV_DOCKED_STATUS_INDEX = 11
const STATION_ENABLED_STATUS_INDEX = 12
const STATION_FAULT_STATUS_INDEX = 13

type JsonRecord = Record<string, unknown>

interface PendingCommand {
  key: string
  label: string
}

interface CommandLogStep {
  label: string
  topicName: string
  payload: JsonRecord
  packet: ActuatorPacketPreview
}

interface CommandLogItem {
  id: string
  label: string
  sentAt: number
  steps: CommandLogStep[]
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0
  }

  return null
}

function normalizeActuatorLevel(value: number) {
  return Math.max(0, Math.min(ACTUATOR_LEVEL_MAX, Math.round(value)))
}

function levelToPercent(value: number) {
  return Math.round((normalizeActuatorLevel(value) / ACTUATOR_LEVEL_MAX) * 100)
}

function formatActuatorRaw(value: number | null) {
  if (value === null) {
    return '--'
  }

  return `${normalizeActuatorLevel(value)} / 64`
}

function formatActuatorPercent(value: number | null) {
  if (value === null) {
    return '--'
  }

  return `${levelToPercent(value)}%`
}

function normalizePercentValue(value: unknown) {
  const numericValue = getNumber(value)

  if (numericValue === null) {
    return null
  }

  return numericValue >= 0 && numericValue <= 1 ? numericValue * 100 : numericValue
}

function clampPercentValue(value: number | null) {
  if (value === null) {
    return 0
  }

  return Math.max(0, Math.min(100, value))
}

function formatPercentWithRaw(value: unknown) {
  const rawValue = getNumber(value)
  const normalizedValue = normalizePercentValue(value)

  if (rawValue === null || normalizedValue === null) {
    return '--'
  }

  return `${normalizedValue.toFixed(0)}% / 原始值 ${rawValue}`
}

function formatNumber(value: unknown, digits = 0) {
  const numericValue = getNumber(value)

  return numericValue === null ? '--' : numericValue.toFixed(digits)
}

function formatVoltage(value: unknown) {
  const numericValue = getNumber(value)

  return numericValue === null ? '--' : `${numericValue.toFixed(2)} V`
}

function formatCurrent(value: unknown) {
  const numericValue = getNumber(value)

  return numericValue === null ? '--' : `${numericValue.toFixed(2)} A`
}

function formatPowerSupplyStatus(value: unknown) {
  const numericValue = getNumber(value)

  if (numericValue === null) {
    return '--'
  }

  const statusCode = Math.round(numericValue)
  const statusLabel =
    BATTERY_POWER_SUPPLY_STATUS_LABELS[statusCode] || '未知状态'

  return `${statusCode} / ${statusLabel}`
}

function getPositionCode(value: unknown) {
  const numericValue = getNumber(value)

  return numericValue === null ? null : Math.round(numericValue)
}

function getPositionLabel(value: unknown) {
  const positionCode = getPositionCode(value)

  switch (positionCode) {
    case 0:
      return '原位'
    case 1:
      return '到位'
    case 2:
      return '运动中'
    case null:
      return '--'
    default:
      return `未知 (${positionCode})`
  }
}

function getPositionTagColor(value: unknown) {
  const positionCode = getPositionCode(value)

  switch (positionCode) {
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

function formatPositionWithRaw(value: unknown) {
  const positionCode = getPositionCode(value)

  if (positionCode === null) {
    return '--'
  }

  return `${getPositionLabel(value)} / 原始值 ${positionCode}`
}

function formatLocalTimestamp(value: number | null) {
  if (value === null) {
    return '--'
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function formatLogTime(value: number) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
}

function formatAge(ageMs: number | null) {
  if (ageMs === null) {
    return '--'
  }

  if (ageMs < 1000) {
    return `${ageMs} ms 前`
  }

  return `${(ageMs / 1000).toFixed(1)} s 前`
}

function formatJson(value: JsonRecord) {
  return JSON.stringify(value)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown error'
}

function getConnectionTag(status: string) {
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

function getTopicHealthTag(health: RuntimeTopicHealth) {
  switch (health) {
    case 'live':
      return { color: 'green', label: '实时反馈' }
    case 'stale':
      return { color: 'orange', label: '反馈超时' }
    case 'waiting':
      return { color: 'blue', label: '等待首包' }
    case 'unavailable':
      return { color: 'default', label: 'Topic 不可用' }
    default:
      return { color: 'red', label: '未订阅' }
  }
}

function getCommandLogConfidenceTag(confidence: PacketConfidence) {
  switch (confidence) {
    case 'confirmed':
      return { color: 'green', label: '协议已确认' }
    case 'inferred':
      return { color: 'gold', label: '前端推导' }
    default:
      return { color: 'default', label: 'ROS 参数映射' }
  }
}

function getDraftTag(value: number, sentValue: number | null) {
  if (sentValue === null) {
    return <Tag>未下发</Tag>
  }

  return value === sentValue ? (
    <Tag color="green">已下发</Tag>
  ) : (
    <Tag color="gold">待下发</Tag>
  )
}

function getCombinedStatusValue(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

function getBatteryStateValue(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

function getStationStatusValue(topic: RuntimeTopicSnapshot) {
  return isRecord(topic.rawMessage) ? topic.rawMessage : null
}

function getStationStatusFlag(statusMessage: JsonRecord | null, index: number) {
  if (!statusMessage || !Array.isArray(statusMessage.status) || index < 0) {
    return null
  }

  return getBoolean(statusMessage.status[index])
}

function getBooleanLabel(
  value: boolean | null,
  trueLabel: string,
  falseLabel: string,
) {
  if (value === null) {
    return '--'
  }

  return value ? trueLabel : falseLabel
}

function getBooleanTagColor(
  value: boolean | null,
  trueColor = 'green',
  falseColor = 'default',
) {
  if (value === null) {
    return 'default'
  }

  return value ? trueColor : falseColor
}

function createCommandId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildWaterTapStep(label: string, tapId: number, operation: number): CommandLogStep {
  return {
    label,
    topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
    payload: { tap_id: tapId, operation },
    packet: formatWaterTapCommand(tapId, operation),
  }
}

function buildMotorStep(label: string, vel: number): CommandLogStep {
  return {
    label,
    topicName: ACTUATOR_CONTROL_TOPICS.motor.name,
    payload: { vel },
    packet: formatMotorCommand(vel),
  }
}

function buildCleanToolStep(label: string, toolId: number, operation: number): CommandLogStep {
  return {
    label,
    topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
    payload: { tool_id: toolId, operation },
    packet: formatCleanToolCommand(toolId, operation),
  }
}

function buildStationChargeStep(enabled: boolean): CommandLogStep {
  return {
    label: enabled ? '充电桩开始充电' : '充电桩停止充电',
    topicName: ACTUATOR_CONTROL_TOPICS.stationControl.name,
    payload: { operation: 1, status: enabled },
    packet: formatStationChargeCommand(enabled),
  }
}

function buildChargeEnableStep(enabled: boolean): CommandLogStep {
  return {
    label: enabled ? '小车充电使能' : '小车充电失能',
    topicName: ACTUATOR_CONTROL_TOPICS.chargeEnable.name,
    payload: { data: enabled },
    packet: formatChargeEnableCommand(enabled),
  }
}

function formatProtocolSummary(packet: ActuatorPacketPreview) {
  const baseText =
    packet.cmdIdHex === '--'
      ? `payload=${packet.payloadText}`
      : `cmd_id=${packet.cmdIdHex} payload=${packet.payloadText} 长度=${packet.lengthHex} checksum=${packet.checksumHex}`

  return packet.note ? `${baseText} | ${packet.note}` : baseText
}

function formatCommandLogText(log: CommandLogItem) {
  return [
    `时间：${formatLogTime(log.sentAt)}`,
    `功能：${log.label}`,
    ...log.steps.flatMap((step, index) => [
      `步骤 ${index + 1}：${step.label}`,
      `Topic：${step.topicName}`,
      `Payload：${formatJson(step.payload)}`,
      `协议：${formatProtocolSummary(step.packet)}`,
      `报文展示：${step.packet.txPreview}`,
    ]),
  ].join('\n')
}

async function copyText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  throw new Error('Clipboard API is not available.')
}

function FeedbackProgressRow({
  label,
  value,
  strokeColor,
}: {
  label: string
  value: unknown
  strokeColor: string
}) {
  const rawValue = getNumber(value)
  const normalizedValue = normalizePercentValue(value)

  return (
    <div className="actuator-progress-row">
      <div className="actuator-progress-head">
        <Typography.Text strong>{label}</Typography.Text>
        <Typography.Text type="secondary">
          {formatPercentWithRaw(value)}
        </Typography.Text>
      </div>
      {rawValue === null || normalizedValue === null ? (
        <Typography.Text type="secondary">等待 /combined_status 实时数据</Typography.Text>
      ) : (
        <Progress
          percent={clampPercentValue(normalizedValue)}
          strokeColor={strokeColor}
          showInfo={false}
        />
      )}
    </div>
  )
}

export function ActuatorControlPage() {
  const { snapshot, defaultUrl, connect } = useRosConnection()
  const batteryStateTopic = useRuntimeMonitorStore((state) => state.topicMap.batteryState)
  const combinedStatusTopic = useRuntimeMonitorStore((state) => state.topicMap.combinedStatus)
  const stationStatusTopic = useRuntimeMonitorStore((state) => state.topicMap.stationStatus)
  const batteryState = useMemo(() => getBatteryStateValue(batteryStateTopic), [batteryStateTopic])
  const combinedStatus = useMemo(
    () => getCombinedStatusValue(combinedStatusTopic),
    [combinedStatusTopic],
  )
  const stationStatus = useMemo(
    () => getStationStatusValue(stationStatusTopic),
    [stationStatusTopic],
  )
  const feedback = useAppFeedback()
  const [waterPumpLevel, setWaterPumpLevel] = useState(0)
  const [waterPumpSentLevel, setWaterPumpSentLevel] = useState<number | null>(null)
  const [vacuumMotorLevel, setVacuumMotorLevel] = useState(0)
  const [vacuumMotorSentLevel, setVacuumMotorSentLevel] = useState<number | null>(null)
  const [suctionLevel, setSuctionLevel] = useState(0)
  const [suctionSentLevel, setSuctionSentLevel] = useState<number | null>(null)
  const [waterValveCommandedOpen, setWaterValveCommandedOpen] = useState<boolean | null>(null)
  const [sewageValveCommandedOpen, setSewageValveCommandedOpen] = useState<boolean | null>(null)
  const [suctionCommandedOpen, setSuctionCommandedOpen] = useState<boolean | null>(null)
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null)
  const [commandLogs, setCommandLogs] = useState<CommandLogItem[]>([])
  const [publishError, setPublishError] = useState<string | null>(null)

  const connectionTag = getConnectionTag(snapshot.status)
  const batteryFeedbackTag = getTopicHealthTag(batteryStateTopic.health)
  const combinedFeedbackTag = getTopicHealthTag(combinedStatusTopic.health)
  const stationFeedbackTag = getStationStatusTag(stationStatusTopic)
  const rosConnected = snapshot.status === 'connected' && snapshot.isConnected
  const controlsDisabled = !rosConnected
  const controlsBusy = pendingCommand !== null
  const shouldWarnWaterValve = waterPumpLevel > 0 && waterValveCommandedOpen !== true
  const latestCommandLog = commandLogs[0] ?? null

  const agvDocked = getStationStatusFlag(stationStatus, AGV_DOCKED_STATUS_INDEX)
  const stationEnabled = getStationStatusFlag(stationStatus, STATION_ENABLED_STATUS_INDEX)
  const stationFault = getStationStatusFlag(stationStatus, STATION_FAULT_STATUS_INDEX)

  const handleReconnect = async (url?: string) => {
    await connect((url ?? snapshot.url) || defaultUrl)
  }

  const appendCommandLog = (label: string, steps: CommandLogStep[]) => {
    const logItem: CommandLogItem = {
      id: createCommandId(),
      label,
      sentAt: Date.now(),
      steps,
    }

    setCommandLogs((previousLogs) => [logItem, ...previousLogs].slice(0, COMMAND_LOG_LIMIT))
  }

  const executeCommand = async ({
    key,
    label,
    steps,
    publish,
    onSuccess,
  }: {
    key: string
    label: string
    steps: CommandLogStep[]
    publish: () => Promise<void>
    onSuccess?: () => void
  }) => {
    if (controlsDisabled) {
      feedback.warning('ROS 未连接', '连接恢复前，无法发送执行机构命令。')
      return
    }

    setPublishError(null)
    setPendingCommand({ key, label })

    try {
      await publish()
      onSuccess?.()
      appendCommandLog(label, steps)
      feedback.success(`${label}已下发`, '命令已经通过站点网关发往现场控制链。')
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      setPublishError(`${label}: ${errorMessage}`)
      feedback.error(`${label}下发失败`, errorMessage)
    } finally {
      setPendingCommand(null)
    }
  }

  const commitWaterPumpLevel = (value: number) => {
    const nextValue = normalizeActuatorLevel(value)
    setWaterPumpLevel(nextValue)

    if (nextValue === waterPumpSentLevel) {
      return
    }

    void executeCommand({
      key: 'water-pump',
      label: `出水量 ${nextValue}`,
      steps: [buildWaterTapStep(`清水泵速度 ${nextValue}`, 1, nextValue)],
      publish: () => runActuatorCommand({ kind: 'waterPump', level: nextValue }),
      onSuccess: () => {
        setWaterPumpSentLevel(nextValue)
      },
    })
  }

  const handleWaterValveCommand = (open: boolean) => {
    void executeCommand({
      key: open ? 'water-valve-open' : 'water-valve-close',
      label: open ? '清水阀开启' : '清水阀关闭',
      steps: [buildWaterTapStep(open ? '清水阀开启' : '清水阀关闭', 2, open ? 1 : 0)],
      publish: () => runActuatorCommand({ kind: 'waterValve', enabled: open }),
      onSuccess: () => {
        setWaterValveCommandedOpen(open)
      },
    })
  }

  const handleSewageValveCommand = (open: boolean) => {
    void executeCommand({
      key: open ? 'sewage-valve-open' : 'sewage-valve-close',
      label: open ? '污水阀开启' : '污水阀关闭',
      steps: [buildWaterTapStep(open ? '污水阀开启' : '污水阀关闭', 3, open ? 1 : 0)],
      publish: () => runActuatorCommand({ kind: 'sewageValve', enabled: open }),
      onSuccess: () => {
        setSewageValveCommandedOpen(open)
      },
    })
  }

  const handleWaterSequenceOn = () => {
    const nextLevel = normalizeActuatorLevel(waterPumpLevel)

    void executeCommand({
      key: 'water-sequence-on',
      label: '出水开启',
      steps: [
        buildWaterTapStep('清水阀开启', 2, 1),
        buildWaterTapStep(`清水泵速度 ${nextLevel}`, 1, nextLevel),
      ],
      publish: () =>
        runActuatorCommand({
          kind: 'waterSequence',
          enabled: true,
          level: nextLevel,
        }),
      onSuccess: () => {
        setWaterValveCommandedOpen(true)
        setWaterPumpSentLevel(nextLevel)
      },
    })
  }

  const handleWaterSequenceOff = () => {
    void executeCommand({
      key: 'water-sequence-off',
      label: '出水关闭',
      steps: [
        buildWaterTapStep('清水泵关闭', 1, 0),
        buildWaterTapStep('清水阀关闭', 2, 0),
      ],
      publish: () => runActuatorCommand({ kind: 'waterSequence', enabled: false }),
      onSuccess: () => {
        setWaterPumpSentLevel(0)
        setWaterValveCommandedOpen(false)
      },
    })
  }

  const commitSuctionLevel = (value: number) => {
    const nextValue = normalizeActuatorLevel(value)
    setSuctionLevel(nextValue)

    if (nextValue === suctionSentLevel) {
      return
    }

    void executeCommand({
      key: 'suction-level',
      label: `吸水机力度 ${nextValue}`,
      steps: [buildWaterTapStep(`吸水机力度 ${nextValue}`, 5, nextValue)],
      publish: () => runActuatorCommand({ kind: 'suctionLevel', level: nextValue }),
      onSuccess: () => {
        setSuctionSentLevel(nextValue)
        setSuctionCommandedOpen(nextValue > 0)
      },
    })
  }

  const handleSuctionCommand = (open: boolean) => {
    void executeCommand({
      key: open ? 'suction-open' : 'suction-close',
      label: open ? '开启吸水机' : '关闭吸水机',
      steps: [buildWaterTapStep(open ? '吸水机开启' : '吸水机关闭', 5, open ? 1 : 0)],
      publish: () => runActuatorCommand({ kind: 'suction', enabled: open }),
      onSuccess: () => {
        setSuctionCommandedOpen(open)
        setSuctionSentLevel(open ? 1 : 0)
      },
    })
  }

  const handleVacuumMotorLevel = (value: number) => {
    const nextValue = normalizeActuatorLevel(value)
    setVacuumMotorLevel(nextValue)

    if (nextValue === vacuumMotorSentLevel) {
      return
    }

    void executeCommand({
      key: 'vacuum-motor',
      label: `真空电机力度 ${nextValue}`,
      steps: [buildMotorStep(`真空电机力度 ${nextValue}`, nextValue)],
      publish: () => runActuatorCommand({ kind: 'vacuumMotor', level: nextValue }),
      onSuccess: () => {
        setVacuumMotorSentLevel(nextValue)
      },
    })
  }

  const handleVacuumPreset = (mode: 'max' | 'off') => {
    const targetLevel = mode === 'max' ? ACTUATOR_LEVEL_MAX : 0

    void executeCommand({
      key: `vacuum-${mode}`,
      label: mode === 'max' ? '真空电机最大' : '真空电机关闭',
      steps: [buildMotorStep(mode === 'max' ? '真空电机最大' : '真空电机关闭', targetLevel)],
      publish: () => runActuatorCommand({ kind: 'vacuumPreset', mode }),
      onSuccess: () => {
        setVacuumMotorSentLevel(targetLevel)
      },
    })
  }

  const handleVacuumRawPacketShortcut = () => {
    const targetLevel = ACTUATOR_LEVEL_MAX
    setVacuumMotorLevel(targetLevel)

    void executeCommand({
      key: 'vacuum-tx-5004-64',
      label: '发送 Tx 50 43 00 09 50 04 64 54 DA',
      steps: [buildMotorStep('真空电机满档原始报文', targetLevel)],
      publish: () => runActuatorCommand({ kind: 'vacuumPreset', mode: 'max' }),
      onSuccess: () => {
        setVacuumMotorSentLevel(targetLevel)
      },
    })
  }

  const handleVacuumChain = (enabled: boolean) => {
    const currentVacuumLevel = normalizeActuatorLevel(vacuumMotorLevel)

    void executeCommand({
      key: enabled ? 'vacuum-chain-on' : 'vacuum-chain-off',
      label: enabled ? '吸水链全开' : '吸水链全关',
      steps: enabled
        ? [
            buildWaterTapStep('吸水机开启', 5, 1),
            buildMotorStep(`真空电机力度 ${currentVacuumLevel}`, currentVacuumLevel),
          ]
        : [
            buildWaterTapStep('吸水机关闭', 5, 0),
            buildMotorStep('真空电机关闭', 0),
          ],
      publish: () =>
        runActuatorCommand({
          kind: 'vacuumChain',
          enabled,
          level: currentVacuumLevel,
        }),
      onSuccess: () => {
        setSuctionCommandedOpen(enabled)
        setSuctionSentLevel(enabled ? 1 : 0)
        setVacuumMotorSentLevel(enabled ? currentVacuumLevel : 0)
      },
    })
  }

  const handleChargingSequence = (enabled: boolean) => {
    void executeCommand({
      key: enabled ? 'charging-start' : 'charging-stop',
      label: enabled ? '开始充电' : '停止充电',
      steps: [buildStationChargeStep(enabled), buildChargeEnableStep(enabled)],
      publish: () => runActuatorCommand({ kind: 'chargingSequence', enabled }),
    })
  }

  const handleBrushCommand = (
    key: string,
    label: string,
    operation: number,
    publish: () => Promise<void>,
  ) => {
    void executeCommand({
      key,
      label,
      steps: [buildCleanToolStep(label, 1, operation)],
      publish,
    })
  }

  const handleBrushSequence = (
    key: string,
    label: string,
    publish: () => Promise<void>,
  ) => {
    const steps =
      key === 'brush-work'
        ? [
            buildCleanToolStep('刷盘下降', 1, 2),
            buildCleanToolStep('刷盘开启', 1, 3),
          ]
        : [
            buildCleanToolStep('刷盘关闭', 1, 4),
            buildCleanToolStep('刷盘上升', 1, 1),
          ]

    void executeCommand({ key, label, steps, publish })
  }

  const handleScraperCommand = (
    key: string,
    label: string,
    operation: number,
    publish: () => Promise<void>,
  ) => {
    void executeCommand({
      key,
      label,
      steps: [buildCleanToolStep(label, 2, operation)],
      publish,
    })
  }

  const handleCopyLog = async (log: CommandLogItem) => {
    try {
      await copyText(formatCommandLogText(log))
      feedback.success('日志已复制', '命令日志已经复制到剪贴板。')
    } catch (error) {
      feedback.error('复制失败', getErrorMessage(error))
    }
  }

  const renderTopicStateAlert = (
    topic: RuntimeTopicSnapshot,
    waitingDescription: string,
  ) => {
    if (topic.key === 'stationStatus' && isStationStatusNonBlocking(topic)) {
      return (
        <AppFeedbackBanner
          tone="warning"
          title={STATION_STATUS_NON_BLOCKING_TITLE}
          description={STATION_STATUS_NON_BLOCKING_DESCRIPTION}
        />
      )
    }

    if (topic.health === 'disconnected') {
      return (
        <AppFeedbackBanner
          tone="error"
          title="ROS 未连接"
          description="连接恢复前，无法获取该 topic 的实时反馈。"
        />
      )
    }

    if (topic.health === 'unavailable') {
      return (
        <AppFeedbackBanner
          tone="warning"
          title={`${topic.topicName} 不可用`}
          description={
            topic.metaError || 'rosapi 没有返回 live topic type，或者当前没有发布者。'
          }
        />
      )
    }

    if (topic.health === 'waiting') {
      return (
        <AppFeedbackBanner
          tone="info"
          title={`等待 ${topic.topicName} 首条消息`}
          description={waitingDescription}
        />
      )
    }

    if (topic.health === 'stale') {
      return (
        <AppFeedbackBanner
          tone="warning"
          title={`${topic.topicName} 反馈超时`}
          description="订阅仍然存在，但最近一条反馈已经超过预期刷新周期。"
        />
      )
    }

    return null
  }

  return (
    <>
      <div className="actuator-page">
        <header className="actuator-page-header">
          <div>
            <Typography.Title level={2}>执行机构调试</Typography.Title>
            <Typography.Paragraph>
              现场调试页，所有命令统一通过站点网关下发到 ROS topic，并同步展示 M 核协议说明与报文预览。
            </Typography.Paragraph>
          </div>
          <Space size="middle" wrap>
            <Tag color={connectionTag.color}>{connectionTag.label}</Tag>
            <Tag color={combinedFeedbackTag.color}>{combinedFeedbackTag.label}</Tag>
            <RosbridgeEndpointControl
              snapshot={snapshot}
              defaultUrl={defaultUrl}
              onConnect={handleReconnect}
            />
          </Space>
        </header>

        <AppFeedbackBanner
          tone="warning"
          title="任务执行中，手动下发的执行机构命令可能会被执行器重新覆盖。"
          className="actuator-banner"
        />

        {!rosConnected ? (
          <AppFeedbackBanner
            tone={snapshot.status === 'connecting' ? 'info' : 'error'}
            title={snapshot.status === 'connecting' ? 'ROS 连接中' : 'ROS 未连接'}
            description={
              snapshot.lastError ||
              'ROS 未连接，无法发送执行机构命令。连接恢复前，所有调试按钮都会保持禁用。'
            }
            className="actuator-banner"
          />
        ) : null}

        {snapshot.status === 'mock' ? (
          <AppFeedbackBanner
            tone="info"
            title="Mock 模式"
            description="Mock 模式不会真正下发 ROS topic，现场调试请切回真实站点网关。"
            className="actuator-banner"
          />
        ) : null}

        {publishError ? (
          <AppFeedbackBanner
            tone="error"
            title="命令下发失败"
            description={publishError}
            className="actuator-banner"
          />
        ) : null}

        <div className="actuator-grid">
          <main className="actuator-main">
            <div className="actuator-control-grid">
              <Card
                title="充电控制"
                className="actuator-card actuator-card-wide"
                extra={
                  <Space wrap>
                    <Tag color={stationFeedbackTag.color}>充电桩状态：{stationFeedbackTag.label}</Tag>
                    <Tag color={batteryFeedbackTag.color}>电池状态：{batteryFeedbackTag.label}</Tag>
                  </Space>
                }
              >
                <Space orientation="vertical" size="large" style={{ width: '100%' }}>
                  <AppFeedbackBanner
                    tone="warning"
                    title="该功能为现场调试功能，仅在机器人已停稳且确认对接安全时使用。"
                  />
                  <AppFeedbackBanner
                    tone="info"
                    title="按钮下发的是实时 ROS 控制命令，不代表一定已经物理起充，请以充电机状态、电池电流和电池状态回报为准。"
                  />

                  <div className="actuator-charge-layout">
                    <section className="actuator-charge-section">
                      <div className="actuator-section-head">
                        <Typography.Text strong>命令下发</Typography.Text>
                        <Typography.Text type="secondary">先充电桩，后小车</Typography.Text>
                      </div>

                      <div className="actuator-action-grid actuator-action-grid-slim">
                        <Button
                          type="primary"
                          className="actuator-action-button"
                          disabled={controlsDisabled || controlsBusy}
                          loading={pendingCommand?.key === 'charging-start'}
                          onClick={() => {
                            handleChargingSequence(true)
                          }}
                        >
                          开始充电
                        </Button>
                        <Button
                          danger
                          className="actuator-action-button"
                          disabled={controlsDisabled || controlsBusy}
                          loading={pendingCommand?.key === 'charging-stop'}
                          onClick={() => {
                            handleChargingSequence(false)
                          }}
                        >
                          停止充电
                        </Button>
                      </div>

                      <Descriptions column={1} size="small" colon={false}>
                        <Descriptions.Item label="充电桩控制">
                          <Typography.Text code>{ACTUATOR_CONTROL_TOPICS.stationControl.name}</Typography.Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="小车充电使能">
                          <Typography.Text code>{ACTUATOR_CONTROL_TOPICS.chargeEnable.name}</Typography.Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="动作顺序">
                          开始充电时先发充电桩开始，再发小车充电使能；停止时反向关闭。
                        </Descriptions.Item>
                      </Descriptions>
                    </section>

                    <section className="actuator-charge-section">
                      <div className="actuator-section-head">
                        <Typography.Text strong>实时状态</Typography.Text>
                        <Typography.Text type="secondary">
                          以 /station_status 和 /battery_state 为准
                        </Typography.Text>
                      </div>

                      <div className="actuator-charge-status-grid">
                        <div className="actuator-status-panel">
                          <div className="actuator-status-panel-head">
                            <Typography.Text strong>充电桩状态</Typography.Text>
                            <Tag color={stationFeedbackTag.color}>{stationFeedbackTag.label}</Tag>
                          </div>

                          {renderTopicStateAlert(
                            stationStatusTopic,
                            '页面已经挂上 /station_status 订阅，正在等待充电桩实时回报。',
                          ) || (
                            <Descriptions column={1} size="small" colon={false}>
                              <Descriptions.Item label="AGV 到位">
                                <Tag color={getBooleanTagColor(agvDocked, 'green', 'default')}>
                                  {getBooleanLabel(agvDocked, '已到位', '未到位')}
                                </Tag>
                              </Descriptions.Item>
                              <Descriptions.Item label="充电机状态">
                                <Tag color={getBooleanTagColor(stationEnabled, 'green', 'default')}>
                                  {getBooleanLabel(stationEnabled, '充电机已开启', '充电机未开启')}
                                </Tag>
                              </Descriptions.Item>
                              <Descriptions.Item label="充电机故障">
                                <Tag color={getBooleanTagColor(stationFault, 'red', 'green')}>
                                  {getBooleanLabel(stationFault, '充电机故障', '无故障')}
                                </Tag>
                              </Descriptions.Item>
                            </Descriptions>
                          )}
                        </div>

                        <div className="actuator-status-panel">
                          <div className="actuator-status-panel-head">
                            <Typography.Text strong>电池状态</Typography.Text>
                            <Tag color={batteryFeedbackTag.color}>{batteryFeedbackTag.label}</Tag>
                          </div>

                          {renderTopicStateAlert(
                            batteryStateTopic,
                            '页面已经挂上 /battery_state 订阅，正在等待电池实时回报。',
                          ) || (
                            <Descriptions column={1} size="small" colon={false}>
                              <Descriptions.Item label="电池电量">
                                {formatPercentWithRaw(batteryState?.percentage)}
                              </Descriptions.Item>
                              <Descriptions.Item label="当前电压">
                                {formatVoltage(batteryState?.voltage)}
                              </Descriptions.Item>
                              <Descriptions.Item label="当前电流">
                                {formatCurrent(batteryState?.current)}
                              </Descriptions.Item>
                              <Descriptions.Item label="供电状态">
                                {formatPowerSupplyStatus(batteryState?.power_supply_status)}
                              </Descriptions.Item>
                            </Descriptions>
                          )}
                        </div>
                      </div>
                    </section>
                  </div>
                </Space>
              </Card>

              <Card title="出水控制" className="actuator-card" extra={<Tag color="blue">tap_id=1 / 2 / 3</Tag>}>
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="当前泵速">
                      <Space wrap>
                        <Typography.Text>{formatActuatorRaw(waterPumpLevel)}</Typography.Text>
                        {getDraftTag(waterPumpLevel, waterPumpSentLevel)}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="百分比">{formatActuatorPercent(waterPumpLevel)}</Descriptions.Item>
                    <Descriptions.Item label="最近泵速下发">{formatActuatorRaw(waterPumpSentLevel)}</Descriptions.Item>
                    <Descriptions.Item label="清水量反馈">{formatPercentWithRaw(combinedStatus?.clean_level)}</Descriptions.Item>
                  </Descriptions>

                  <Slider
                    min={0}
                    max={ACTUATOR_LEVEL_MAX}
                    step={1}
                    marks={LEVEL_MARKS}
                    value={waterPumpLevel}
                    disabled={controlsDisabled || controlsBusy}
                    tooltip={{
                      formatter: (value) =>
                        typeof value === 'number'
                          ? `${formatActuatorRaw(value)} | ${formatActuatorPercent(value)}`
                          : '',
                    }}
                    onChange={(value) => {
                      setWaterPumpLevel(value)
                    }}
                    onChangeComplete={(value) => {
                      commitWaterPumpLevel(value)
                    }}
                  />

                  <div className="actuator-preset-grid">
                    {PRESET_LEVELS.map((level) => (
                      <Button
                        key={level}
                        size="small"
                        type={waterPumpLevel === level ? 'primary' : 'default'}
                        disabled={controlsDisabled || controlsBusy}
                        onClick={() => {
                          commitWaterPumpLevel(level)
                        }}
                      >
                        {level}
                      </Button>
                    ))}
                  </div>

                  <div className="actuator-status-chip-row">
                    <Tag color={waterValveCommandedOpen ? 'green' : 'default'}>
                      清水阀：
                      {waterValveCommandedOpen === null
                        ? '未下发'
                        : waterValveCommandedOpen
                          ? '最近开启'
                          : '最近关闭'}
                    </Tag>
                    <Tag color={sewageValveCommandedOpen ? 'green' : 'default'}>
                      污水阀：
                      {sewageValveCommandedOpen === null
                        ? '未下发'
                        : sewageValveCommandedOpen
                          ? '最近开启'
                          : '最近关闭'}
                    </Tag>
                  </div>

                  <div className="actuator-action-grid actuator-action-grid-triple">
                    <Button
                      type="primary"
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'water-sequence-on'}
                      onClick={handleWaterSequenceOn}
                    >
                      出水开启
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'water-sequence-off'}
                      onClick={handleWaterSequenceOff}
                    >
                      出水关闭
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'water-valve-open'}
                      onClick={() => {
                        handleWaterValveCommand(true)
                      }}
                    >
                      清水阀开启
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'water-valve-close'}
                      onClick={() => {
                        handleWaterValveCommand(false)
                      }}
                    >
                      清水阀关闭
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'sewage-valve-open'}
                      onClick={() => {
                        handleSewageValveCommand(true)
                      }}
                    >
                      污水阀开启
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'sewage-valve-close'}
                      onClick={() => {
                        handleSewageValveCommand(false)
                      }}
                    >
                      污水阀关闭
                    </Button>
                  </div>

                  {shouldWarnWaterValve ? (
                    <AppFeedbackBanner
                      tone="warning"
                      title="当前泵速大于 0"
                      description="现场出水通常还需要打开清水阀。当前页不会静默替你联动开阀，请按现场情况手动确认。"
                    />
                  ) : null}

                  <Typography.Paragraph className="actuator-footnote">
                    “出水开启”会按当前泵速滑条值下发清水泵；如果当前滑条还是 0，那么动作会只打开水路但不会形成有效流量。
                  </Typography.Paragraph>
                </Space>
              </Card>

              <Card title="吸水/吸尘控制" className="actuator-card" extra={<Tag color="geekblue">tap_id=5</Tag>}>
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="当前力度">
                      <Space wrap>
                        <Typography.Text>{formatActuatorRaw(suctionLevel)}</Typography.Text>
                        {getDraftTag(suctionLevel, suctionSentLevel)}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="百分比">{formatActuatorPercent(suctionLevel)}</Descriptions.Item>
                    <Descriptions.Item label="最近下发">{formatActuatorRaw(suctionSentLevel)}</Descriptions.Item>
                    <Descriptions.Item label="吸水机状态">
                      <Tag color={suctionCommandedOpen ? 'green' : 'default'}>
                        {suctionCommandedOpen === null
                          ? '未下发'
                          : suctionCommandedOpen
                            ? '最近开启'
                            : '最近关闭'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="污水量反馈">{formatPercentWithRaw(combinedStatus?.sewage_level)}</Descriptions.Item>
                  </Descriptions>

                  <Slider
                    min={0}
                    max={ACTUATOR_LEVEL_MAX}
                    step={1}
                    marks={LEVEL_MARKS}
                    value={suctionLevel}
                    disabled={controlsDisabled || controlsBusy}
                    tooltip={{
                      formatter: (value) =>
                        typeof value === 'number'
                          ? `${formatActuatorRaw(value)} | ${formatActuatorPercent(value)}`
                          : '',
                    }}
                    onChange={(value) => {
                      setSuctionLevel(value)
                    }}
                    onChangeComplete={(value) => {
                      commitSuctionLevel(value)
                    }}
                  />

                  <div className="actuator-preset-grid">
                    {PRESET_LEVELS.map((level) => (
                      <Button
                        key={level}
                        size="small"
                        type={suctionLevel === level ? 'primary' : 'default'}
                        disabled={controlsDisabled || controlsBusy}
                        onClick={() => {
                          commitSuctionLevel(level)
                        }}
                      >
                        {level}
                      </Button>
                    ))}
                  </div>

                  <div className="actuator-action-grid actuator-action-grid-triple">
                    <Button
                      type="primary"
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'suction-open'}
                      onClick={() => {
                        handleSuctionCommand(true)
                      }}
                    >
                      开启吸水机
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'suction-close'}
                      onClick={() => {
                        handleSuctionCommand(false)
                      }}
                    >
                      关闭吸水机
                    </Button>
                    <Button
                      type="primary"
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'vacuum-chain-on'}
                      onClick={() => {
                        handleVacuumChain(true)
                      }}
                    >
                      吸水链全开
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'vacuum-chain-off'}
                      onClick={() => {
                        handleVacuumChain(false)
                      }}
                    >
                      吸水链全关
                    </Button>
                  </div>

                  <AppFeedbackBanner
                    tone="info"
                    title="快捷入口"
                    description="“开启吸水机”对应 tap_id=5、operation=1，也就是现场确认的 Tx: 50 43 00 0A 50 03 05 01 F6 DA。"
                  />
                </Space>
              </Card>

              <Card title="真空电机控制" className="actuator-card" extra={<Tag color="cyan">vel</Tag>}>
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="当前值">
                      <Space wrap>
                        <Typography.Text>{formatActuatorRaw(vacuumMotorLevel)}</Typography.Text>
                        {getDraftTag(vacuumMotorLevel, vacuumMotorSentLevel)}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="百分比">{formatActuatorPercent(vacuumMotorLevel)}</Descriptions.Item>
                    <Descriptions.Item label="最近下发">{formatActuatorRaw(vacuumMotorSentLevel)}</Descriptions.Item>
                  </Descriptions>

                  <Slider
                    min={0}
                    max={ACTUATOR_LEVEL_MAX}
                    step={1}
                    marks={LEVEL_MARKS}
                    value={vacuumMotorLevel}
                    disabled={controlsDisabled || controlsBusy}
                    tooltip={{
                      formatter: (value) =>
                        typeof value === 'number'
                          ? `${formatActuatorRaw(value)} | ${formatActuatorPercent(value)}`
                          : '',
                    }}
                    onChange={(value) => {
                      setVacuumMotorLevel(value)
                    }}
                    onChangeComplete={(value) => {
                      handleVacuumMotorLevel(value)
                    }}
                  />

                  <div className="actuator-preset-grid">
                    {PRESET_LEVELS.map((level) => (
                      <Button
                        key={level}
                        size="small"
                        type={vacuumMotorLevel === level ? 'primary' : 'default'}
                        disabled={controlsDisabled || controlsBusy}
                        onClick={() => {
                          handleVacuumMotorLevel(level)
                        }}
                      >
                        {level}
                      </Button>
                    ))}
                  </div>

                  <div className="actuator-action-grid actuator-action-grid-triple">
                    <Button
                      type="primary"
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'vacuum-max'}
                      onClick={() => {
                        handleVacuumPreset('max')
                      }}
                    >
                      真空电机最大
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'vacuum-off'}
                      onClick={() => {
                        handleVacuumPreset('off')
                      }}
                    >
                      真空电机关闭
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'vacuum-tx-5004-64'}
                      onClick={() => {
                        handleVacuumRawPacketShortcut()
                      }}
                    >
                      发送 50 04 64
                    </Button>
                  </div>

                  <Typography.Paragraph className="actuator-footnote">
                    站点网关会把真空电机命令下发到 <Typography.Text code>{ACTUATOR_CONTROL_TOPICS.motor.name}</Typography.Text>，
                    payload 为 <Typography.Text code>{'{ vel: 0..64 }'}</Typography.Text>。
                  </Typography.Paragraph>
                </Space>
              </Card>

              <Card
                title="刷盘控制"
                className="actuator-card"
                extra={<Tag color={getPositionTagColor(combinedStatus?.brush_position)}>{getPositionLabel(combinedStatus?.brush_position)}</Tag>}
              >
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="当前位置">{formatPositionWithRaw(combinedStatus?.brush_position)}</Descriptions.Item>
                    <Descriptions.Item label="实时字段">/combined_status.brush_position</Descriptions.Item>
                  </Descriptions>

                  <div className="actuator-action-grid actuator-action-grid-triple">
                    <Button
                      type="primary"
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'brush-open'}
                      onClick={() => {
                        handleBrushCommand('brush-open', '刷盘开启', 3, () =>
                          runActuatorCommand({ kind: 'brushOpen' }),
                        )
                      }}
                    >
                      开启
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'brush-close'}
                      onClick={() => {
                        handleBrushCommand('brush-close', '刷盘关闭', 4, () =>
                          runActuatorCommand({ kind: 'brushClose' }),
                        )
                      }}
                    >
                      关闭
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'brush-raise'}
                      onClick={() => {
                        handleBrushCommand('brush-raise', '刷盘上升', 1, () =>
                          runActuatorCommand({ kind: 'brushRaise' }),
                        )
                      }}
                    >
                      上升
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'brush-lower'}
                      onClick={() => {
                        handleBrushCommand('brush-lower', '刷盘下降', 2, () =>
                          runActuatorCommand({ kind: 'brushLower' }),
                        )
                      }}
                    >
                      下降
                    </Button>
                    <Button
                      type="primary"
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'brush-work'}
                      onClick={() => {
                        handleBrushSequence('brush-work', '刷盘工作位', () =>
                          runActuatorCommand({ kind: 'brushWorkPosition' }),
                        )
                      }}
                    >
                      刷盘工作位
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'brush-retract'}
                      onClick={() => {
                        handleBrushSequence('brush-retract', '刷盘收回', () =>
                          runActuatorCommand({ kind: 'brushRetract' }),
                        )
                      }}
                    >
                      刷盘收回
                    </Button>
                  </div>
                </Space>
              </Card>

              <Card
                title="刮扒控制"
                className="actuator-card"
                extra={<Tag color={getPositionTagColor(combinedStatus?.scraper_position)}>{getPositionLabel(combinedStatus?.scraper_position)}</Tag>}
              >
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="当前位置">{formatPositionWithRaw(combinedStatus?.scraper_position)}</Descriptions.Item>
                    <Descriptions.Item label="实时字段">/combined_status.scraper_position</Descriptions.Item>
                  </Descriptions>

                  <div className="actuator-action-grid actuator-action-grid-triple">
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'scraper-raise'}
                      onClick={() => {
                        handleScraperCommand('scraper-raise', '刮扒上升', 1, () =>
                          runActuatorCommand({ kind: 'scraperRaise' }),
                        )
                      }}
                    >
                      上升
                    </Button>
                    <Button
                      type="primary"
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'scraper-lower'}
                      onClick={() => {
                        handleScraperCommand('scraper-lower', '刮扒下降', 2, () =>
                          runActuatorCommand({ kind: 'scraperLower' }),
                        )
                      }}
                    >
                      下降
                    </Button>
                    <Button
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'scraper-stow'}
                      onClick={() => {
                        handleScraperCommand('scraper-stow', '刮扒收回', 1, () =>
                          runActuatorCommand({ kind: 'scraperStow' }),
                        )
                      }}
                    >
                      刮扒收回
                    </Button>
                    <Button
                      type="primary"
                      className="actuator-action-button"
                      disabled={controlsDisabled || controlsBusy}
                      loading={pendingCommand?.key === 'scraper-deploy'}
                      onClick={() => {
                        handleScraperCommand('scraper-deploy', '刮扒下放', 2, () =>
                          runActuatorCommand({ kind: 'scraperDeploy' }),
                        )
                      }}
                    >
                      刮扒下放
                    </Button>
                  </div>
                </Space>
              </Card>
            </div>
            <Card
              title="发送报文日志"
              className="actuator-card actuator-log-card"
              extra={
                <Space wrap>
                  <Tag>{`${commandLogs.length} / ${COMMAND_LOG_LIMIT}`}</Tag>
                  <Button
                    size="small"
                    icon={<DeleteOutlined />}
                    disabled={commandLogs.length === 0}
                    onClick={() => {
                      setCommandLogs([])
                    }}
                  >
                    清空日志
                  </Button>
                </Space>
              }
            >
              {commandLogs.length > 0 ? (
                <div className="actuator-log-list">
                  {commandLogs.map((logItem) => (
                    <div key={logItem.id} className="actuator-log-item">
                      <div className="actuator-log-item-head">
                        <div className="actuator-log-item-title">
                          <Typography.Text strong>{logItem.label}</Typography.Text>
                          <Space wrap>
                            <Tag color="blue">{formatLogTime(logItem.sentAt)}</Tag>
                            <Tag>{`${logItem.steps.length} 步`}</Tag>
                          </Space>
                        </div>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => {
                            void handleCopyLog(logItem)
                          }}
                        >
                          复制
                        </Button>
                      </div>

                      <div className="actuator-log-step-list">
                        {logItem.steps.map((step, index) => {
                          const confidenceTag = getCommandLogConfidenceTag(step.packet.confidence)

                          return (
                            <div key={`${logItem.id}-${index}`} className="actuator-log-step">
                              <div className="actuator-log-step-head">
                                <Space wrap>
                                  <Tag color="processing">{`步骤 ${index + 1}`}</Tag>
                                  <Typography.Text strong>{step.label}</Typography.Text>
                                </Space>
                                <Tag color={confidenceTag.color}>{confidenceTag.label}</Tag>
                              </div>

                              <Descriptions column={1} size="small" colon={false}>
                                <Descriptions.Item label="Topic">
                                  <Typography.Text code>{step.topicName}</Typography.Text>
                                </Descriptions.Item>
                                <Descriptions.Item label="Payload">
                                  <Typography.Text className="actuator-payload-text">
                                    {formatJson(step.payload)}
                                  </Typography.Text>
                                </Descriptions.Item>
                                <Descriptions.Item label="协议说明">
                                  <Typography.Text className="actuator-payload-text">
                                    {formatProtocolSummary(step.packet)}
                                  </Typography.Text>
                                </Descriptions.Item>
                                <Descriptions.Item label="报文预览">
                                  <Typography.Text className="actuator-payload-text actuator-log-tx">
                                    {step.packet.txPreview}
                                  </Typography.Text>
                                </Descriptions.Item>
                              </Descriptions>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <AppEmptyState description="任意按钮或滑条真正下发成功后，这里会按时间倒序保留最近的发送报文日志。" />
              )}
            </Card>
          </main>

          <aside className="actuator-side">
            <Card
              title="实时反馈"
              className="actuator-card"
              extra={
                <Space wrap>
                  <Tag color={combinedFeedbackTag.color}>{combinedFeedbackTag.label}</Tag>
                  <Tag color={batteryFeedbackTag.color}>{batteryFeedbackTag.label}</Tag>
                  <Tag color={stationFeedbackTag.color}>{stationFeedbackTag.label}</Tag>
                </Space>
              }
            >
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                {renderTopicStateAlert(
                  combinedStatusTopic,
                  '站点网关正在等待 /combined_status 的首条实时反馈。',
                )}

                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="combined_status">{combinedStatusTopic.messageType || '--'}</Descriptions.Item>
                  <Descriptions.Item label="消息数">{combinedStatusTopic.messageCount}</Descriptions.Item>
                  <Descriptions.Item label="最近更新时间">{formatLocalTimestamp(combinedStatusTopic.lastMessageAt)}</Descriptions.Item>
                  <Descriptions.Item label="消息时效">{formatAge(combinedStatusTopic.ageMs)}</Descriptions.Item>
                </Descriptions>

                <FeedbackProgressRow label="清水量" value={combinedStatus?.clean_level} strokeColor="#1f7a68" />
                <FeedbackProgressRow label="污水量" value={combinedStatus?.sewage_level} strokeColor="#cf5a36" />
                <FeedbackProgressRow label="电池电量" value={combinedStatus?.battery_percentage} strokeColor="#d17721" />

                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="电池电压">{formatNumber(combinedStatus?.battery_voltage, 0)}</Descriptions.Item>
                  <Descriptions.Item label="刷盘位置">{formatPositionWithRaw(combinedStatus?.brush_position)}</Descriptions.Item>
                  <Descriptions.Item label="刮扒位置">{formatPositionWithRaw(combinedStatus?.scraper_position)}</Descriptions.Item>
                  <Descriptions.Item label="AGV 到位">{getBooleanLabel(agvDocked, '已到位', '未到位')}</Descriptions.Item>
                  <Descriptions.Item label="充电机状态">
                    {getBooleanLabel(stationEnabled, '充电机已开启', '充电机未开启')}
                  </Descriptions.Item>
                  <Descriptions.Item label="电池供电状态">
                    {formatPowerSupplyStatus(batteryState?.power_supply_status)}
                  </Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card
              title="最近发送"
              className="actuator-card"
              extra={pendingCommand ? <Tag color="processing">{pendingCommand.label}</Tag> : null}
            >
              {latestCommandLog ? (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Descriptions column={1} size="small" colon={false}>
                    <Descriptions.Item label="时间">{formatLocalTimestamp(latestCommandLog.sentAt)}</Descriptions.Item>
                    <Descriptions.Item label="功能">{latestCommandLog.label}</Descriptions.Item>
                    <Descriptions.Item label="步骤数">{latestCommandLog.steps.length}</Descriptions.Item>
                  </Descriptions>

                  {latestCommandLog.steps.map((step, index) => (
                    <div key={`${latestCommandLog.id}-summary-${index}`}>
                      <Typography.Text strong>{`步骤 ${index + 1}：${step.label}`}</Typography.Text>
                      <Typography.Paragraph className="actuator-footnote actuator-no-margin">
                        {step.topicName}
                      </Typography.Paragraph>
                      <Typography.Text className="actuator-payload-text">{step.packet.txPreview}</Typography.Text>
                    </div>
                  ))}
                </Space>
              ) : (
                <AppEmptyState description="第一条命令发出后，这里会显示最新的发送摘要。" />
              )}
            </Card>
          </aside>
        </div>
      </div>
    </>
  )
}


