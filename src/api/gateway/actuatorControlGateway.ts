import {
  ACTUATOR_CONTROL_TOPICS,
  ACTUATOR_LEVEL_MAX,
  disableChargingSequence,
  enableChargingSequence,
  publishBrushClose,
  publishBrushLower,
  publishBrushOpen,
  publishBrushRaise,
  publishBrushRetract,
  publishBrushWorkPosition,
  publishScraperDeploy,
  publishScraperLower,
  publishScraperRaise,
  publishScraperStow,
  publishSewageValve,
  publishSuctionClose,
  publishSuctionLevel,
  publishSuctionOpen,
  publishVacuumChainOff,
  publishVacuumChainOn,
  publishVacuumMax,
  publishVacuumMotor,
  publishVacuumOff,
  publishWaterPump,
  publishWaterSequenceOff,
  publishWaterSequenceOn,
  publishWaterValve,
} from '../ros/actuatorControlTopics'

export { ACTUATOR_CONTROL_TOPICS, ACTUATOR_LEVEL_MAX }

export type ActuatorGatewayCommand =
  | { kind: 'waterPump'; level: number }
  | { kind: 'waterValve'; enabled: boolean }
  | { kind: 'sewageValve'; enabled: boolean }
  | { kind: 'waterSequence'; enabled: boolean; level?: number }
  | { kind: 'suction'; enabled: boolean }
  | { kind: 'suctionLevel'; level: number }
  | { kind: 'vacuumMotor'; level: number }
  | { kind: 'vacuumPreset'; mode: 'max' | 'off' }
  | { kind: 'vacuumChain'; enabled: boolean; level?: number }
  | { kind: 'chargingSequence'; enabled: boolean }
  | {
      kind:
        | 'brushOpen'
        | 'brushClose'
        | 'brushRaise'
        | 'brushLower'
        | 'brushWorkPosition'
        | 'brushRetract'
        | 'scraperRaise'
        | 'scraperLower'
        | 'scraperStow'
        | 'scraperDeploy'
    }

export async function runActuatorCommand(command: ActuatorGatewayCommand) {
  switch (command.kind) {
    case 'waterPump':
      await publishWaterPump(command.level)
      return
    case 'waterValve':
      await publishWaterValve(command.enabled)
      return
    case 'sewageValve':
      await publishSewageValve(command.enabled)
      return
    case 'waterSequence':
      if (command.enabled) {
        await publishWaterSequenceOn(command.level ?? ACTUATOR_LEVEL_MAX)
        return
      }
      await publishWaterSequenceOff()
      return
    case 'suction':
      if (command.enabled) {
        await publishSuctionOpen()
        return
      }
      await publishSuctionClose()
      return
    case 'suctionLevel':
      await publishSuctionLevel(command.level)
      return
    case 'vacuumMotor':
      await publishVacuumMotor(command.level)
      return
    case 'vacuumPreset':
      if (command.mode === 'max') {
        await publishVacuumMax()
        return
      }
      await publishVacuumOff()
      return
    case 'vacuumChain':
      if (command.enabled) {
        await publishVacuumChainOn(command.level ?? ACTUATOR_LEVEL_MAX)
        return
      }
      await publishVacuumChainOff()
      return
    case 'chargingSequence':
      if (command.enabled) {
        await enableChargingSequence()
        return
      }
      await disableChargingSequence()
      return
    case 'brushOpen':
      await publishBrushOpen()
      return
    case 'brushClose':
      await publishBrushClose()
      return
    case 'brushRaise':
      await publishBrushRaise()
      return
    case 'brushLower':
      await publishBrushLower()
      return
    case 'brushWorkPosition':
      await publishBrushWorkPosition()
      return
    case 'brushRetract':
      await publishBrushRetract()
      return
    case 'scraperRaise':
      await publishScraperRaise()
      return
    case 'scraperLower':
      await publishScraperLower()
      return
    case 'scraperStow':
      await publishScraperStow()
      return
    case 'scraperDeploy':
      await publishScraperDeploy()
      return
    default: {
      const exhaustiveCheck: never = command
      throw new Error(`Unsupported actuator command: ${String(exhaustiveCheck)}`)
    }
  }
}
