import {
  requestDockCalibrationCommand,
  requestDockCalibrationStatus,
} from './siteGatewayRobotControlClient'
import { recordAuditEvent } from './auditTrail'
import { normalizeGatewayError } from './accessControl'
import {
  assertAnyCapabilityAllowed,
  USE_MOCK_DATA,
} from './gatewayShared'
import type {
  DockCalibrationCommandInput,
  DockCalibrationCommandResult,
  DockCalibrationStatusResult,
} from '../../types/dockCalibration'

function createMockDockCalibrationState(): DockCalibrationStatusResult {
  return {
    success: true,
    message: 'mock',
    state: {
      trackedPoseFresh: true,
      trackedPoseFrame: 'map',
      currentX: 1.24,
      currentY: 2.38,
      currentYaw: 1.57,
      stage1Set: true,
      stage1X: 1.05,
      stage1Y: 2.1,
      stage1Yaw: 1.57,
      stage2Set: false,
      stage2X: null,
      stage2Y: null,
      stage2Yaw: null,
      dockPoseFresh: true,
      dockPoseX: 0.18,
      dockPoseY: -0.02,
      dockPoseYaw: 0.01,
      dockScoreFresh: true,
      dockScore: 0.00008,
      dockScoreThreshold: 0.00012,
      dockScoreLowerIsBetter: true,
      dockPoseQualityOk: true,
      stage2SaveRecommended: true,
      warnings: [],
      storagePath: '/tmp/mock-dock-calibration.yaml',
      raw: {},
    },
    raw: {},
  }
}

export async function getDockCalibrationStatus(
  robotId?: string,
): Promise<DockCalibrationStatusResult> {
  assertAnyCapabilityAllowed(
    ['dockCalibration', 'chargingControl', 'actuatorControl'],
    '充电桩标定状态',
  )

  if (!USE_MOCK_DATA) {
    return requestDockCalibrationStatus(robotId)
  }

  return createMockDockCalibrationState()
}

export async function sendDockCalibrationCommand(
  command: DockCalibrationCommandInput,
): Promise<DockCalibrationCommandResult> {
  try {
    assertAnyCapabilityAllowed(
      ['dockCalibration', 'chargingControl', 'actuatorControl'],
      '充电桩标定命令',
    )

    if (!USE_MOCK_DATA) {
      return await requestDockCalibrationCommand(command)
    }

    const status = createMockDockCalibrationState()
    const result: DockCalibrationCommandResult = {
      ...status,
      operation: command.operation,
      message: 'mock command accepted',
    }

    recordAuditEvent({
      category: 'charging',
      action: `dock-calibration:${command.operation}`,
      target: '/clean_robot_server/app/dock_calibration_command',
      status: 'success',
      message: 'dock calibration mock command completed',
      detail: { ...command },
    })

    return result
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'DOCK_CALIBRATION_FAILED',
      source: 'site-gateway',
      message: '充电桩标定命令下发失败。',
      recoverable: true,
      requiresEngineer: true,
      missingDependency: '/clean_robot_server/app/dock_calibration_command',
    })

    recordAuditEvent({
      category: 'charging',
      action: `dock-calibration:${command.operation}`,
      target: '/clean_robot_server/app/dock_calibration_command',
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: {
        ...command,
        errorCode: normalizedError.code,
      },
    })

    throw normalizedError
  }
}
