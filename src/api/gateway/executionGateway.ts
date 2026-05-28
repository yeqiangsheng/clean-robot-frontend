import { requestExecutionCommand } from './siteGatewayRobotControlClient'
import { recordAuditEvent } from './auditTrail'
import { normalizeGatewayError } from './accessControl'
import { assertAnyCapabilityAllowed } from './gatewayShared'
import { EXECUTION_SERVICE } from '../contracts/serviceNames'
import type { ExecutionCommandName } from '../../types/execution'

export async function executeTaskCommand(
  command: ExecutionCommandName,
  taskId: number,
) {
  try {
    assertAnyCapabilityAllowed(
      ['executionControl', 'overview'],
      `任务执行命令 ${command}`,
    )

    return await requestExecutionCommand(command, taskId)
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'TASK_EXECUTION_FAILED',
      source: 'site-gateway',
      message: '任务执行命令下发失败。',
      recoverable: true,
    })

    recordAuditEvent({
      category: 'task',
      action: command,
      target: `${EXECUTION_SERVICE.canonicalName} task_id=${taskId}`,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: {
        command,
        taskId,
        errorCode: normalizedError.code,
      },
    })

    throw normalizedError
  }
}
