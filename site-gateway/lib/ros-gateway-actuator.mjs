import {
  ACTUATOR_CONTROL_TOPICS,
  ACTUATOR_LEVEL_MAX,
  ACTUATOR_LEVEL_MIN,
  ACTUATOR_SEQUENCE_DELAY_MS,
} from './constants.mjs'
import { delay, pickString, toBoolean, toNumber } from './ros-helpers.mjs'

const DOCK_SUPPLY_START_SERVICE = '/dock_supply/start'
const DOCK_SUPPLY_CANCEL_SERVICE = '/dock_supply/cancel'
const DOCK_SUPPLY_DEFER_EXIT_SERVICE = '/dock_supply/set_defer_exit'
const DOCK_SUPPLY_EXIT_SERVICE = '/dock_supply/exit'
const WATER_SEQUENCE_DEFAULT_LEVEL = 30
const VACUUM_CHAIN_DEFAULT_LEVEL = 70
const STATION_SEQUENCE_DELAY_MS = 400
const DOCK_SUPPLY_STARTABLE_STATES = new Set(['IDLE', 'DONE', 'FAILED', 'CANCELED'])
const DOCK_SUPPLY_EXIT_STATE = 'READY_TO_EXIT'

function normalizeActuatorLevel(value) {
  const numericValue = toNumber(value) ?? ACTUATOR_LEVEL_MIN

  return Math.max(ACTUATOR_LEVEL_MIN, Math.min(ACTUATOR_LEVEL_MAX, Math.round(numericValue)))
}

function normalizeActuatorLevelWithDefault(value, fallback) {
  return normalizeActuatorLevel(toNumber(value) ?? fallback)
}

export function getActuatorCommandKind(command) {
  return typeof command?.kind === 'string' ? command.kind.trim() : ''
}

function createActuatorCommandError(code, message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  error.recoverable = true
  return error
}

async function publishWaterTap(gateway, tapId, operation) {
  await gateway.publish(
    ACTUATOR_CONTROL_TOPICS.waterTap.name,
    ACTUATOR_CONTROL_TOPICS.waterTap.type,
    { tap_id: tapId, operation },
  )
}

async function publishMotor(gateway, vel) {
  await gateway.publish(
    ACTUATOR_CONTROL_TOPICS.motor.name,
    ACTUATOR_CONTROL_TOPICS.motor.type,
    { vel },
  )
}

async function publishCleanTool(gateway, toolId, operation) {
  await gateway.publish(
    ACTUATOR_CONTROL_TOPICS.cleanTools.name,
    ACTUATOR_CONTROL_TOPICS.cleanTools.type,
    { tool_id: toolId, operation },
  )
}

async function publishStationControl(gateway, operation, status) {
  await gateway.publish(
    ACTUATOR_CONTROL_TOPICS.stationControl.name,
    ACTUATOR_CONTROL_TOPICS.stationControl.type,
    { operation, status },
  )
}

async function publishChargeEnable(gateway, enabled) {
  await gateway.publish(
    ACTUATOR_CONTROL_TOPICS.chargeEnable.name,
    ACTUATOR_CONTROL_TOPICS.chargeEnable.type,
    { data: enabled },
  )
}

async function callDockSupplyTrigger(gateway, serviceName) {
  const response = await gateway.callService({
    serviceName,
    serviceType: 'std_srvs/Trigger',
    request: {},
  })

  if (toBoolean(response?.success) === false) {
    throw createActuatorCommandError(
      'ROS_SERVICE_FAILED',
      pickString(response, ['message']) || `${serviceName} returned success=false.`,
      502,
    )
  }

  return pickString(response, ['message']) || ''
}

async function callDockSupplySetBool(gateway, serviceName, enabled) {
  const response = await gateway.callService({
    serviceName,
    serviceType: 'std_srvs/SetBool',
    request: { data: enabled },
  })

  if (toBoolean(response?.success) === false) {
    throw createActuatorCommandError(
      'ROS_SERVICE_FAILED',
      pickString(response, ['message']) || `${serviceName} returned success=false.`,
      502,
    )
  }

  return pickString(response, ['message']) || ''
}

async function assertDockSupplyCanStart(gateway) {
  const status = await gateway.getActuatorStatus()
  const state = status.dockSupplyState || 'UNKNOWN'

  if (!DOCK_SUPPLY_STARTABLE_STATES.has(state)) {
    throw createActuatorCommandError(
      'DOCK_SUPPLY_BUSY',
      `当前补给流程状态为 ${state}，不能重复启动。`,
    )
  }
}

async function assertDockSupplyCanExit(gateway) {
  const status = await gateway.getActuatorStatus()

  if (status.dockSupplyState !== DOCK_SUPPLY_EXIT_STATE) {
    throw createActuatorCommandError(
      'INVALID_STATE',
      `当前补给流程状态为 ${status.dockSupplyState || 'UNKNOWN'}，不能执行离桩。`,
    )
  }
}

async function assertStationIoReady(gateway, { requireMcore = false, requireAgv = false } = {}) {
  const status = await gateway.getActuatorStatus()

  if (!status.stationConnected) {
    throw createActuatorCommandError('STATION_DISCONNECTED', '补给站 TCP bridge 未连接。')
  }

  if (requireMcore && !status.mcoreConnected) {
    throw createActuatorCommandError('MCORE_DISCONNECTED', 'M-core bridge 未连接。')
  }

  if (requireAgv && status.station?.agvInPlace !== true) {
    throw createActuatorCommandError('STATION_NOT_READY', 'AGV 未到位，不能执行该补给站动作。')
  }
}

export async function publishActuatorCommand(gateway, command) {
  const kind = getActuatorCommandKind(command)

  switch (kind) {
    case 'waterSequence': {
      if (toBoolean(command.enabled) === true) {
        const level = normalizeActuatorLevelWithDefault(
          command.level,
          WATER_SEQUENCE_DEFAULT_LEVEL,
        )
        await publishWaterTap(gateway, 2, 1)
        await delay(ACTUATOR_SEQUENCE_DELAY_MS)
        await publishWaterTap(gateway, 1, level)
        return
      }

      await publishWaterTap(gateway, 1, 0)
      await delay(ACTUATOR_SEQUENCE_DELAY_MS)
      await publishWaterTap(gateway, 2, 0)
      return
    }
    case 'vacuumChain': {
      if (toBoolean(command.enabled) === true) {
        const level = normalizeActuatorLevelWithDefault(
          command.level,
          VACUUM_CHAIN_DEFAULT_LEVEL,
        )
        await publishWaterTap(gateway, 5, level)
        await delay(ACTUATOR_SEQUENCE_DELAY_MS)
        await publishMotor(gateway, level)
        return
      }

      await publishWaterTap(gateway, 5, 0)
      await delay(ACTUATOR_SEQUENCE_DELAY_MS)
      await publishMotor(gateway, 0)
      return
    }
    case 'brushWorkPosition':
      await publishCleanTool(gateway, 1, 2)
      await delay(ACTUATOR_SEQUENCE_DELAY_MS)
      await publishCleanTool(gateway, 1, 3)
      return
    case 'brushRetract':
      await publishCleanTool(gateway, 1, 4)
      await delay(ACTUATOR_SEQUENCE_DELAY_MS)
      await publishCleanTool(gateway, 1, 1)
      return
    case 'scraperDeploy':
      await publishCleanTool(gateway, 2, 2)
      return
    case 'scraperStow':
      await publishCleanTool(gateway, 2, 1)
      return
    case 'dockSupplyStart':
      await assertDockSupplyCanStart(gateway)
      return callDockSupplyTrigger(gateway, DOCK_SUPPLY_START_SERVICE)
    case 'dockSupplyCancel':
      return callDockSupplyTrigger(gateway, DOCK_SUPPLY_CANCEL_SERVICE)
    case 'dockSupplyDeferExit':
      return callDockSupplySetBool(
        gateway,
        DOCK_SUPPLY_DEFER_EXIT_SERVICE,
        toBoolean(command.enabled) === true,
      )
    case 'dockSupplyExit':
      await assertDockSupplyCanExit(gateway)
      return callDockSupplyTrigger(gateway, DOCK_SUPPLY_EXIT_SERVICE)
    case 'chargingSequence': {
      const enabled = toBoolean(command.enabled) === true
      await assertStationIoReady(gateway, { requireMcore: true, requireAgv: enabled })
      await publishChargeEnable(gateway, enabled)
      await delay(ACTUATOR_SEQUENCE_DELAY_MS)
      await publishStationControl(gateway, 1, enabled)
      return
    }
    case 'stationRefillSequence': {
      const enabled = toBoolean(command.enabled) === true
      await assertStationIoReady(gateway, { requireMcore: true, requireAgv: enabled })
      if (enabled) {
        await publishWaterTap(gateway, 2, 1)
        await delay(STATION_SEQUENCE_DELAY_MS)
        await publishStationControl(gateway, 11, true)
        return
      }

      await publishStationControl(gateway, 11, false)
      await delay(STATION_SEQUENCE_DELAY_MS)
      await publishWaterTap(gateway, 2, 0)
      return
    }
    case 'stationDrainSequence': {
      const enabled = toBoolean(command.enabled) === true
      await assertStationIoReady(gateway, { requireMcore: true, requireAgv: enabled })
      if (enabled) {
        await publishWaterTap(gateway, 3, 1)
        await delay(STATION_SEQUENCE_DELAY_MS)
        await publishStationControl(gateway, 3, true)
        return
      }

      await publishStationControl(gateway, 3, false)
      await delay(STATION_SEQUENCE_DELAY_MS)
      await publishWaterTap(gateway, 3, 0)
      return
    }
    case 'stationRodConnect':
      await assertStationIoReady(gateway, { requireAgv: true })
      await publishStationControl(gateway, 9, true)
      return
    case 'stationRodReset':
      await assertStationIoReady(gateway, { requireAgv: true })
      await publishStationControl(gateway, 8, true)
      return
    default:
      throw createBadRequestError(`Unsupported actuator command: ${String(kind)}`)
  }
}
