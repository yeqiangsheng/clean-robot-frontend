import { assertCapabilityAllowed, normalizeGatewayError } from './accessControl'
import { recordAuditEvent } from './auditTrail'
import { requestSlamAction } from './siteGatewayRobotControlClient'
import { SLAM_SUBMIT_SERVICE } from '../contracts/serviceNames'

import type {
  SlamActionKind,
  SlamSubmitJobResponse,
  SubmitSlamWorkflowRequest,
} from '../../types/slam-workflow'

const SLAM_SUBMIT_TARGET = SLAM_SUBMIT_SERVICE.canonicalName

function normalizeSlamActionKind(actionKind: SlamActionKind) {
  return actionKind === 'restart_localization' ? 'relocalize' : actionKind
}

export async function runSlamAction(
  actionKind: SlamActionKind,
  payload?: SubmitSlamWorkflowRequest,
): Promise<SlamSubmitJobResponse> {
  const normalizedActionKind = normalizeSlamActionKind(actionKind)

  try {
    assertCapabilityAllowed('slamWorkbench', `SLAM 动作 ${normalizedActionKind}`)

    const result = (await requestSlamAction(normalizedActionKind, payload) as unknown) as SlamSubmitJobResponse & {
      raw?: Record<string, unknown>
    }

    recordAuditEvent({
      category: 'slam',
      action: normalizedActionKind,
      target: SLAM_SUBMIT_TARGET,
      status: result.accepted ? 'success' : 'failed',
      message: result.message || 'SLAM 动作已通过统一网关下发。',
      detail: {
        actionKind: normalizedActionKind,
        jobId: result.jobId,
        ...(payload ?? {}),
      } as Record<string, unknown>,
    })

    return result
  } catch (error) {
    const normalizedError = normalizeGatewayError(error, {
      code: 'SLAM_ACTION_FAILED',
      source: 'slam-gateway',
      message: 'SLAM 动作提交失败。',
      recoverable: true,
      requiresEngineer: true,
      missingDependency: SLAM_SUBMIT_TARGET,
    })

    recordAuditEvent({
      category: 'slam',
      action: normalizedActionKind,
      target: SLAM_SUBMIT_TARGET,
      status: normalizedError.requiresEngineer ? 'blocked' : 'failed',
      message: normalizedError.message,
      detail: {
        actionKind: normalizedActionKind,
        ...(payload ?? {}),
      } as Record<string, unknown>,
    })

    throw normalizedError
  }
}
