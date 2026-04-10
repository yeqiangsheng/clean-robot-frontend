export type PacketConfidence = 'confirmed' | 'inferred' | 'ros'

export interface ActuatorPacketPreview {
  confidence: PacketConfidence
  protocolName: string
  cmdIdHex: string
  payloadHexList: string[]
  payloadText: string
  lengthHex: string
  lengthValue: number | null
  checksumHex: string
  txPreview: string
  note: string | null
}

const FRAME_HEAD = [0x50, 0x43]
const FRAME_TAIL = 0xda
const MOTOR_LEVEL_SOURCE_MAX = 64
const MOTOR_PACKET_MAX = 100

const CMD_IDS = {
  motor: 0x5004,
  cleanTools: 0x5002,
  waterTap: 0x5003,
} as const

function clampByte(value: number) {
  return Math.max(0, Math.min(0xff, Math.round(value)))
}

function toHexByte(value: number) {
  return `0x${clampByte(value).toString(16).toUpperCase().padStart(2, '0')}`
}

function toHexWord(value: number) {
  const normalized = Math.max(0, Math.min(0xffff, Math.round(value)))
  return `0x${normalized.toString(16).toUpperCase().padStart(4, '0')}`
}

function toFrameByteText(value: number) {
  return clampByte(value).toString(16).toUpperCase().padStart(2, '0')
}

function scaleMotorLevelToPacketValue(vel: number) {
  const normalizedLevel = Math.max(
    0,
    Math.min(MOTOR_LEVEL_SOURCE_MAX, Math.round(vel)),
  )

  return Math.round((normalizedLevel / MOTOR_LEVEL_SOURCE_MAX) * MOTOR_PACKET_MAX)
}

function buildPacketPreview({
  cmdId,
  payload,
  confidence,
  note,
}: {
  cmdId: number
  payload: number[]
  confidence: PacketConfidence
  note: string | null
}): ActuatorPacketPreview {
  const normalizedPayload = payload.map(clampByte)
  const lengthValue = normalizedPayload.length + 8
  const frameWithoutChecksum = [
    ...FRAME_HEAD,
    (lengthValue >> 8) & 0xff,
    lengthValue & 0xff,
    (cmdId >> 8) & 0xff,
    cmdId & 0xff,
    ...normalizedPayload,
  ]
  const checksum = frameWithoutChecksum.reduce((sum, item) => sum + item, 0) & 0xff
  const frame = [...frameWithoutChecksum, checksum, FRAME_TAIL]

  return {
    confidence,
    protocolName: 'M 核执行机构帧',
    cmdIdHex: toHexWord(cmdId),
    payloadHexList: normalizedPayload.map(toHexByte),
    payloadText: `[${normalizedPayload.map(toHexByte).join(', ')}]`,
    lengthHex: toHexWord(lengthValue),
    lengthValue,
    checksumHex: toHexByte(checksum),
    txPreview: `Tx: ${frame.map(toFrameByteText).join(' ')}`,
    note,
  }
}

function buildRosOnlyPreview(payload: number[], note: string): ActuatorPacketPreview {
  const normalizedPayload = payload.map(clampByte)

  return {
    confidence: 'ros',
    protocolName: 'ROS 参数映射',
    cmdIdHex: '--',
    payloadHexList: normalizedPayload.map(toHexByte),
    payloadText: `[${normalizedPayload.map(toHexByte).join(', ')}]`,
    lengthHex: '--',
    lengthValue: null,
    checksumHex: '--',
    txPreview: 'Tx 预览待确认',
    note,
  }
}

export function formatWaterTapCommand(tapId: number, operation: number) {
  const normalizedTapId = clampByte(tapId)
  const normalizedOperation = clampByte(operation)

  return buildPacketPreview({
    cmdId: CMD_IDS.waterTap,
    payload: [normalizedTapId, normalizedOperation],
    confidence: 'confirmed',
    note:
      normalizedTapId === 0x05 && normalizedOperation === 0x01
        ? '该映射已按现场确认帧校准：吸水机开启 -> 0x5003 [0x05, 0x01]。'
        : '当前 /mcore/control_water_tap 已按现场确认映射到 cmd_id 0x5003。',
  })
}

export function formatMotorCommand(vel: number) {
  const motorPacketValue = scaleMotorLevelToPacketValue(vel)

  return buildPacketPreview({
    cmdId: CMD_IDS.motor,
    payload: [motorPacketValue],
    confidence: motorPacketValue === 100 ? 'confirmed' : 'inferred',
    note:
      motorPacketValue === 100
        ? '现场已确认真空电机满档报文：vel=64 -> cmd_id 0x5004 payload [0x64]。'
        : '当前按现场满档报文推导：ROS vel 0..64 会换算为 M 核单字节 0..100。',
  })
}

export function formatCleanToolCommand(toolId: number, operation: number) {
  return buildPacketPreview({
    cmdId: CMD_IDS.cleanTools,
    payload: [clampByte(toolId), clampByte(operation)],
    confidence: 'inferred',
    note:
      '当前仓库未包含 /mcore/control_clean_tools 的现场原始帧，cmd_id 使用前端集中映射，可按现场协议校准。',
  })
}

export function formatChargeEnableCommand(enabled: boolean) {
  return buildRosOnlyPreview(
    [enabled ? 0x01 : 0x00],
    '当前仓库未包含 /mcore/charge_enable 的现场原始帧，页面仅展示 ROS Bool 参数到字节的映射。',
  )
}

export function formatStationChargeCommand(enabled: boolean) {
  return buildRosOnlyPreview(
    [0x01, enabled ? 0x01 : 0x00],
    '当前仓库未提供 /station/control 对应的底层站控帧，页面仅展示 operation/status 参数到字节的映射。',
  )
}
