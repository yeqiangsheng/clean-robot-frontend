import { describe, expect, it } from 'vitest'

import { ACTUATOR_CONTROL_TOPICS } from './constants.mjs'
import { RosGateway } from './ros-gateway.mjs'

function createGateway() {
  const gateway = new RosGateway({
    rosbridgeUrl: 'ws://127.0.0.1:9090',
    robotId: 'local_robot',
  })
  const published = []
  const serviceCalls = []

  gateway.publish = async (topicName, messageType, payload) => {
    published.push({ topicName, messageType, payload })
  }

  gateway.callService = async (request) => {
    serviceCalls.push(request)
    return { success: true, message: 'ok' }
  }

  gateway.getActuatorStatus = async () => ({
    dockSupplyState: 'IDLE',
    stationConnected: true,
    mcoreConnected: true,
    station: {
      agvInPlace: true,
      rodConnected: false,
      rodReset: true,
      rawStatus: [],
    },
  })

  return { gateway, published, serviceCalls }
}

describe('RosGateway actuator commands', () => {
  it('publishes the commercial water sequence through valve then pump with 0..100 level', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({
      kind: 'waterSequence',
      enabled: true,
      level: 30,
    })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
        messageType: 'robot_platform_msgs/ControlWaterTap',
        payload: { tap_id: 2, operation: 1 },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
        messageType: 'robot_platform_msgs/ControlWaterTap',
        payload: { tap_id: 1, operation: 30 },
      },
    ])
  })

  it('turns water off through pump then valve', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({ kind: 'waterSequence', enabled: false })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
        messageType: 'robot_platform_msgs/ControlWaterTap',
        payload: { tap_id: 1, operation: 0 },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
        messageType: 'robot_platform_msgs/ControlWaterTap',
        payload: { tap_id: 2, operation: 0 },
      },
    ])
  })

  it('publishes vacuum chain as suction tap then vacuum motor', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({
      kind: 'vacuumChain',
      enabled: true,
      level: 70,
    })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
        messageType: 'robot_platform_msgs/ControlWaterTap',
        payload: { tap_id: 5, operation: 70 },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.motor.name,
        messageType: 'robot_platform_msgs/ControlMotor',
        payload: { vel: 70 },
      },
    ])
  })

  it('publishes brush work and retract sequences without exposing low-level commands', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({ kind: 'brushWorkPosition' })
    await gateway.runActuatorCommand({ kind: 'brushRetract' })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
        messageType: 'robot_platform_msgs/ControlCleanTools',
        payload: { tool_id: 1, operation: 2 },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
        messageType: 'robot_platform_msgs/ControlCleanTools',
        payload: { tool_id: 1, operation: 3 },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
        messageType: 'robot_platform_msgs/ControlCleanTools',
        payload: { tool_id: 1, operation: 4 },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
        messageType: 'robot_platform_msgs/ControlCleanTools',
        payload: { tool_id: 1, operation: 1 },
      },
    ])
  })

  it('publishes scraper deploy and stow as tool lift commands', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({ kind: 'scraperDeploy' })
    await gateway.runActuatorCommand({ kind: 'scraperStow' })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
        messageType: 'robot_platform_msgs/ControlCleanTools',
        payload: { tool_id: 2, operation: 2 },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.cleanTools.name,
        messageType: 'robot_platform_msgs/ControlCleanTools',
        payload: { tool_id: 2, operation: 1 },
      },
    ])
  })

  it('clamps actuator levels to the commercial 0..100 range', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({
      kind: 'vacuumChain',
      enabled: true,
      level: 180,
    })

    expect(published[0].payload).toEqual({ tap_id: 5, operation: 100 })
    expect(published[1].payload).toEqual({ vel: 100 })
  })

  it('publishes chargingSequence as robot charge enable then station charger command', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({ kind: 'chargingSequence', enabled: true })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.chargeEnable.name,
        messageType: 'std_msgs/Bool',
        payload: { data: true },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.stationControl.name,
        messageType: 'robot_platform_msgs/ControlStation',
        payload: { operation: 1, status: true },
      },
    ])
  })

  it('allows chargingSequence off to close both sides even when AGV is not in place', async () => {
    const { gateway, published } = createGateway()

    gateway.getActuatorStatus = async () => ({
      dockSupplyState: 'IDLE',
      stationConnected: true,
      mcoreConnected: true,
      station: {
        agvInPlace: false,
        rodConnected: false,
        rodReset: false,
        rawStatus: [],
      },
    })

    await gateway.runActuatorCommand({ kind: 'chargingSequence', enabled: false })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.chargeEnable.name,
        messageType: 'std_msgs/Bool',
        payload: { data: false },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.stationControl.name,
        messageType: 'robot_platform_msgs/ControlStation',
        payload: { operation: 1, status: false },
      },
    ])
  })

  it('stops station refill by closing station operation 11 then vehicle clean-water valve', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({ kind: 'stationRefillSequence', enabled: false })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.stationControl.name,
        messageType: 'robot_platform_msgs/ControlStation',
        payload: { operation: 11, status: false },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
        messageType: 'robot_platform_msgs/ControlWaterTap',
        payload: { tap_id: 2, operation: 0 },
      },
    ])
  })

  it('stops station drain by closing station operation 3 then vehicle sewage valve', async () => {
    const { gateway, published } = createGateway()

    await gateway.runActuatorCommand({ kind: 'stationDrainSequence', enabled: false })

    expect(published).toEqual([
      {
        topicName: ACTUATOR_CONTROL_TOPICS.stationControl.name,
        messageType: 'robot_platform_msgs/ControlStation',
        payload: { operation: 3, status: false },
      },
      {
        topicName: ACTUATOR_CONTROL_TOPICS.waterTap.name,
        messageType: 'robot_platform_msgs/ControlWaterTap',
        payload: { tap_id: 3, operation: 0 },
      },
    ])
  })

  it('maps dock supply commands to the expected ROS services', async () => {
    const { gateway, serviceCalls } = createGateway()

    await gateway.runActuatorCommand({ kind: 'dockSupplyStart' })
    await gateway.runActuatorCommand({ kind: 'dockSupplyCancel' })
    await gateway.runActuatorCommand({ kind: 'dockSupplyDeferExit', enabled: true })

    gateway.getActuatorStatus = async () => ({
      dockSupplyState: 'READY_TO_EXIT',
      stationConnected: true,
      mcoreConnected: true,
      station: {
        agvInPlace: true,
        rodConnected: false,
        rodReset: true,
        rawStatus: [],
      },
    })

    await gateway.runActuatorCommand({ kind: 'dockSupplyExit' })

    expect(serviceCalls).toEqual([
      {
        serviceName: '/dock_supply/start',
        serviceType: 'std_srvs/Trigger',
        request: {},
      },
      {
        serviceName: '/dock_supply/cancel',
        serviceType: 'std_srvs/Trigger',
        request: {},
      },
      {
        serviceName: '/dock_supply/set_defer_exit',
        serviceType: 'std_srvs/SetBool',
        request: { data: true },
      },
      {
        serviceName: '/dock_supply/exit',
        serviceType: 'std_srvs/Trigger',
        request: {},
      },
    ])
  })
})
