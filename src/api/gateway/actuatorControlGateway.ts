import {
  requestActuatorCommand,
  requestActuatorStatus,
} from './siteGatewayRobotControlClient'
import { USE_MOCK_DATA } from '../../config/runtimeMode'
import type { ActuatorCommand, ActuatorStatus } from '../../types/actuator'

export const ACTUATOR_LEVEL_MAX = 100

export const ACTUATOR_CONTROL_TOPICS = {
  waterTap: {
    name: '/mcore/control_water_tap',
    type: 'robot_platform_msgs/ControlWaterTap',
  },
  motor: {
    name: '/mcore/control_motor',
    type: 'robot_platform_msgs/ControlMotor',
  },
  cleanTools: {
    name: '/mcore/control_clean_tools',
    type: 'robot_platform_msgs/ControlCleanTools',
  },
  stationControl: {
    name: '/station/control',
    type: 'robot_platform_msgs/ControlStation',
  },
  chargeEnable: {
    name: '/mcore/charge_enable',
    type: 'std_msgs/Bool',
  },
} as const

export type { ActuatorCommand }

export async function getActuatorStatus(): Promise<ActuatorStatus> {
  if (USE_MOCK_DATA) {
    return {
      ok: true,
      success: true,
      rosbridge: 'mock',
      available: true,
      disabledReasons: [],
      mcoreConnected: true,
      stationConnected: true,
      dockSupplyState: 'IDLE',
      cleanLevel: 80,
      sewageLevel: 0,
      batteryPercentage: 90,
      batteryVoltage: 24000,
      batteryCurrent: -3.1,
      station: {
        agvInPlace: true,
        rodConnected: false,
        rodReset: true,
        rawStatus: [
          false,
          false,
          false,
          false,
          false,
          false,
          false,
          true,
          false,
          false,
          false,
          true,
          false,
          false,
        ],
      },
      battery: {
        percentage: 0.9,
        voltage: 24,
        current: -3.1,
      },
      levels: {
        cleanLevel: 80,
        sewageLevel: 0,
      },
      capabilities: {
        dockSupply: true,
        stationIo: true,
        mechanicalConnect: false,
      },
      brush: { position: 0, label: '原位' },
      scraper: { position: 1, label: '到位' },
      lastCommand: {
        kind: '',
        state: 'idle',
        startedAtMs: 0,
        sentAtMs: 0,
        failedAtMs: null,
        message: '',
      },
      topics: {
        combinedStatus: {
          topicName: '/combined_status',
          messageType: 'robot_platform_msgs/CombinedStatus',
          fresh: true,
          ageMs: 1000,
        },
        mcoreConnected: {
          topicName: '/mcore_tcp_bridge/connected',
          messageType: 'std_msgs/Bool',
          fresh: true,
          ageMs: 1000,
        },
        stationConnected: {
          topicName: '/station_tcp_bridge/connected',
          messageType: 'std_msgs/Bool',
          fresh: true,
          ageMs: 1000,
        },
        dockSupplyState: {
          topicName: '/dock_supply/state',
          messageType: 'std_msgs/String',
          fresh: true,
          ageMs: 1000,
        },
        stationStatus: {
          topicName: '/station_status',
          messageType: 'robot_platform_msgs/StationStatus',
          fresh: true,
          ageMs: 1000,
        },
        batteryState: {
          topicName: '/battery_state',
          messageType: 'sensor_msgs/BatteryState',
          fresh: true,
          ageMs: 1000,
        },
      },
    }
  }

  return requestActuatorStatus()
}

export async function runActuatorCommand(command: ActuatorCommand) {
  if (!USE_MOCK_DATA) {
    await requestActuatorCommand(command)
    return
  }

  switch (command.kind) {
    case 'waterSequence':
      return
    case 'vacuumChain':
      return
    case 'brushWorkPosition':
      return
    case 'brushRetract':
      return
    case 'scraperDeploy':
      return
    case 'scraperStow':
      return
    case 'dockSupplyStart':
    case 'dockSupplyCancel':
    case 'dockSupplyDeferExit':
    case 'dockSupplyExit':
      return
    case 'chargingSequence':
      return
    case 'stationRefillSequence':
      return
    case 'stationDrainSequence':
      return
    case 'stationRodConnect':
      return
    case 'stationRodReset':
      return
    default: {
      const exhaustiveCheck: never = command
      throw new Error(`Unsupported actuator command: ${String(exhaustiveCheck)}`)
    }
  }
}
