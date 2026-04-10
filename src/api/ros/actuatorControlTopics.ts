import { Topic } from 'roslib'
import type { Ros } from 'roslib'

import { publishActuatorCommand } from '../gateway/robotGateway'
import { getRosConnectionManager } from './client'

interface WaterTapCommand {
  tap_id: number
  operation: number
}

interface MotorCommand {
  vel: number
}

interface CleanToolCommand {
  tool_id: number
  operation: number
}

interface StationChargeCommand {
  operation: number
  status: boolean
}

interface BoolMessage {
  data: boolean
}

export const ACTUATOR_LEVEL_MIN = 0
export const ACTUATOR_LEVEL_MAX = 64
const ACTUATOR_SEQUENCE_DELAY_MS = 150

export const ACTUATOR_CONTROL_TOPICS = {
  waterTap: {
    name: '/mcore/control_water_tap',
    type: 'my_msg_srv/ControlWaterTap',
  },
  motor: {
    name: '/mcore/control_motor',
    type: 'my_msg_srv/ControlMotor',
  },
  cleanTools: {
    name: '/mcore/control_clean_tools',
    type: 'my_msg_srv/ControlCleanTools',
  },
  stationControl: {
    name: '/station/control',
    type: 'my_msg_srv/ControlStation',
  },
  chargeEnable: {
    name: '/mcore/charge_enable',
    type: 'std_msgs/Bool',
  },
} as const

const publisherCache = new WeakMap<Ros, Map<string, Topic<unknown>>>()

function normalizeActuatorLevel(value: number) {
  return Math.max(
    ACTUATOR_LEVEL_MIN,
    Math.min(ACTUATOR_LEVEL_MAX, Math.round(value)),
  )
}

function getConnectedRos() {
  const manager = getRosConnectionManager()
  const ros = manager.getRos()

  if (!ros?.isConnected) {
    throw new Error('rosbridge is not connected.')
  }

  return ros
}

function getPublisher<TMessage extends object>(
  ros: Ros,
  topicName: string,
  messageType: string,
) {
  let topicMap = publisherCache.get(ros)

  if (!topicMap) {
    topicMap = new Map<string, Topic<unknown>>()
    publisherCache.set(ros, topicMap)
  }

  const existingTopic = topicMap.get(topicName)

  if (existingTopic) {
    return existingTopic as Topic<TMessage>
  }

  const topic = new Topic<TMessage>({
    ros,
    name: topicName,
    messageType,
    queue_size: 1,
    latch: false,
    reconnect_on_close: true,
  })

  topicMap.set(topicName, topic as Topic<unknown>)

  return topic
}

function publishTopicMessage<TMessage extends object>(
  topicName: string,
  messageType: string,
  payload: TMessage,
) {
  const ros = getConnectedRos()
  const topic = getPublisher<TMessage>(ros, topicName, messageType)

  topic.publish(payload)
}

function publishAuditedTopicMessage<TMessage extends object>(options: {
  capability: 'actuatorControl' | 'chargingControl'
  actionLabel: string
  topicName: string
  messageType: string
  payload: TMessage
}) {
  return publishActuatorCommand(
    options.capability,
    options.actionLabel,
    options.topicName,
    options.payload as Record<string, unknown>,
    () => publishTopicMessage(options.topicName, options.messageType, options.payload),
  )
}

async function publishWaterTap(payload: WaterTapCommand) {
  await publishAuditedTopicMessage({
    capability: 'actuatorControl',
    actionLabel: '水路/吸水控制',
    topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
    messageType: ACTUATOR_CONTROL_TOPICS.waterTap.type,
    payload,
  })
}

async function publishCleanTool(payload: CleanToolCommand) {
  await publishAuditedTopicMessage({
    capability: 'actuatorControl',
    actionLabel: '清洁工具控制',
    topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
    messageType: ACTUATOR_CONTROL_TOPICS.cleanTools.type,
    payload,
  })
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

export async function publishWaterPump(level: number) {
  await publishWaterTap({
    tap_id: 1,
    operation: normalizeActuatorLevel(level),
  })
}

export async function publishWaterValve(open: boolean) {
  await publishWaterTap({
    tap_id: 2,
    operation: open ? 1 : 0,
  })
}

export async function publishSewageValve(open: boolean) {
  await publishWaterTap({
    tap_id: 3,
    operation: open ? 1 : 0,
  })
}

export async function publishSuctionOpen() {
  await publishWaterTap({
    tap_id: 5,
    operation: 1,
  })
}

export async function publishSuctionClose() {
  await publishWaterTap({
    tap_id: 5,
    operation: 0,
  })
}

export async function publishSuctionLevel(level: number) {
  await publishWaterTap({
    tap_id: 5,
    operation: normalizeActuatorLevel(level),
  })
}

export async function publishVacuumMotor(level: number) {
  await publishAuditedTopicMessage<MotorCommand>({
    capability: 'actuatorControl',
    actionLabel: '真空电机力度调整',
    topicName: ACTUATOR_CONTROL_TOPICS.motor.name,
    messageType: ACTUATOR_CONTROL_TOPICS.motor.type,
    payload: {
      vel: normalizeActuatorLevel(level),
    },
  })
}

export async function publishVacuumMax() {
  await publishVacuumMotor(ACTUATOR_LEVEL_MAX)
}

export async function publishVacuumOff() {
  await publishVacuumMotor(ACTUATOR_LEVEL_MIN)
}

export async function publishBrushOpen() {
  await publishCleanTool({
    tool_id: 1,
    operation: 3,
  })
}

export async function publishBrushClose() {
  await publishCleanTool({
    tool_id: 1,
    operation: 4,
  })
}

export async function publishBrushRaise() {
  await publishCleanTool({
    tool_id: 1,
    operation: 1,
  })
}

export async function publishBrushLower() {
  await publishCleanTool({
    tool_id: 1,
    operation: 2,
  })
}

export async function publishScraperRaise() {
  await publishCleanTool({
    tool_id: 2,
    operation: 1,
  })
}

export async function publishScraperLower() {
  await publishCleanTool({
    tool_id: 2,
    operation: 2,
  })
}

export async function publishWaterSequenceOn(level: number) {
  await publishWaterValve(true)
  await delay(ACTUATOR_SEQUENCE_DELAY_MS)
  await publishWaterPump(level)
}

export async function publishWaterSequenceOff() {
  await publishWaterPump(ACTUATOR_LEVEL_MIN)
  await delay(ACTUATOR_SEQUENCE_DELAY_MS)
  await publishWaterValve(false)
}

export async function publishVacuumChainOn(level = ACTUATOR_LEVEL_MAX) {
  await publishSuctionOpen()
  await delay(ACTUATOR_SEQUENCE_DELAY_MS)
  await publishVacuumMotor(level)
}

export async function publishVacuumChainOff() {
  await publishSuctionClose()
  await delay(ACTUATOR_SEQUENCE_DELAY_MS)
  await publishVacuumOff()
}

export async function publishBrushWorkPosition() {
  await publishBrushLower()
  await delay(ACTUATOR_SEQUENCE_DELAY_MS)
  await publishBrushOpen()
}

export async function publishBrushRetract() {
  await publishBrushClose()
  await delay(ACTUATOR_SEQUENCE_DELAY_MS)
  await publishBrushRaise()
}

export async function publishScraperStow() {
  await publishScraperRaise()
}

export async function publishScraperDeploy() {
  await publishScraperLower()
}

export async function publishStationCharge(enabled: boolean) {
  await publishAuditedTopicMessage<StationChargeCommand>({
    capability: 'chargingControl',
    actionLabel: enabled ? '开始充电桩' : '停止充电桩',
    topicName: ACTUATOR_CONTROL_TOPICS.stationControl.name,
    messageType: ACTUATOR_CONTROL_TOPICS.stationControl.type,
    payload: {
      operation: 1,
      status: enabled,
    },
  })
}

export async function publishRobotChargeEnable(enabled: boolean) {
  await publishAuditedTopicMessage<BoolMessage>({
    capability: 'chargingControl',
    actionLabel: enabled ? '小车充电使能' : '小车充电失能',
    topicName: ACTUATOR_CONTROL_TOPICS.chargeEnable.name,
    messageType: ACTUATOR_CONTROL_TOPICS.chargeEnable.type,
    payload: {
      data: enabled,
    },
  })
}

export async function enableChargingSequence() {
  await publishStationCharge(true)
  await delay(ACTUATOR_SEQUENCE_DELAY_MS)
  await publishRobotChargeEnable(true)
}

export async function disableChargingSequence() {
  await publishStationCharge(false)
  await delay(ACTUATOR_SEQUENCE_DELAY_MS)
  await publishRobotChargeEnable(false)
}
