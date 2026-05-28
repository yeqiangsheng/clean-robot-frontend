import {
  requestManualDriveCommand,
  requestManualDriveStatus,
} from './siteGatewayRobotControlClient'
import { recordAuditEvent } from './auditTrail'
import { normalizeGatewayError } from './accessControl'
import {
  assertAnyCapabilityAllowed,
  USE_MOCK_DATA,
} from './gatewayShared'
import type {
  ManualDriveCommandInput,
  ManualDriveCommandResult,
  ManualDriveStatus,
} from '../../types/manualDrive'

export async function getManualDriveStatus(): Promise<ManualDriveStatus> {
  assertAnyCapabilityAllowed(
    ['overview', 'executionControl', 'actuatorControl'],
    '手动移动状态',
  )

  if (!USE_MOCK_DATA) {
    return requestManualDriveStatus()
  }

  return {
    enabled: true,
    active: false,
    allowed: true,
    blockedReasons: [],
    lastDirection: null,
    lastCommandAt: null,
    watchdogTimeoutMs: 500,
    linearMpsLimit: 0.15,
    angularRadpsLimit: 0.5,
    supportsStrafe: false,
    raw: {},
  }
}

export async function sendManualDriveCommand(
  command: ManualDriveCommandInput,
): Promise<ManualDriveCommandResult> {
  try {
    assertAnyCapabilityAllowed(
      ['overview', 'executionControl', 'actuatorControl'],
      '手动移动',
    )

    if (!USE_MOCK_DATA) {
      return await requestManualDriveCommand(command)
    }

    const result: ManualDriveCommandResult = {
      success: true,
      message: '',
      action: command.action,
      direction: command.direction,
      active: command.action === 'move',
      allowed: true,
      blockedReasons: [],
      raw: {},
    }

    recordAuditEvent({
      category: 'actuator',
      action: `manual-drive:${command.action}`,
      target: '/clean_robot_server/app/manual_drive_command',
      status: 'success',
      message: 'manual drive mock command completed',
      detail: { ...command },
    })

    return result
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'MANUAL_DRIVE_FAILED',
      source: 'site-gateway',
      message: '手动移动命令下发失败。',
      recoverable: true,
      requiresEngineer: false,
    })

    recordAuditEvent({
      category: 'actuator',
      action: `manual-drive:${command.action}`,
      target: '/clean_robot_server/app/manual_drive_command',
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
